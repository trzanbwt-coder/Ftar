const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // كودك الأصلي

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
    getContentType,
    proto
} = require('@whiskeysockets/baileys');

// 🛡️ درع حماية بيئة Node.js
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};

// ==========================================
// 🧠 ذواكر البوت (كودك + الميزات الجديدة)
// ==========================================
const msgStore = new Map(); // لمضاد الحذف والتعديل
const activeMonitors = new Map(); // للمراقبة الشبحية
const globalContacts = new Map(); // لجلب الأسماء الحقيقية
const spamStore = new Map(); // لمضاد الإزعاج
const DIVIDER = '━━━━━━━━━━━━━━━';

// ==========================================
// 🎯 دالة الاستخبارات (ترجمة الأرقام المخفية والأسماء)
// ==========================================
function getContactInfo(jid, pushName) {
    if (!jid) return { name: pushName || 'مجهول', number: 'مجهول', isLid: false };
    
    let cleanJid = jidNormalizedUser(jid);
    let realJid = cleanJid;
    let isLid = cleanJid.includes('@lid');
    
    if (isLid) {
        for (const [id, contact] of globalContacts.entries()) {
            if (contact.lid === cleanJid || contact.id === cleanJid) {
                if (contact.id && !contact.id.includes('@lid')) { realJid = contact.id; isLid = false; break; }
            }
        }
    }

    const rawNumber = realJid.split('@')[0].split(':')[0];
    let name = 'غير معروف';
    const contact = globalContacts.get(realJid) || globalContacts.get(cleanJid);
    
    if (contact && contact.name) name = contact.name; 
    else if (contact && contact.notify) name = contact.notify; 
    else if (pushName) name = pushName; 
    
    return { name, number: rawNumber, isLid };
}

// ==========================================
// ✅ نظام حفظ الإعدادات (مرتبط بلوحة الويب)
// ==========================================
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) { 
    botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); 
} else { 
    botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings)); 
}

if (!botSettings.GLOBAL_CONFIG) {
    botSettings.GLOBAL_CONFIG = { geminiApiKey: "" };
    saveSettings();
}

function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2)); }
function generateSessionPassword() { return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ✅ مجلد الخزنة
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// تنظيف الذاكرة الذكي
setInterval(() => { 
    if (msgStore.size > 5000) msgStore.clear(); 
    spamStore.clear();
}, 15 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// 🚀 معالج الأوامر (نسخ لصق من كودك الأصلي)
// ==========================================
const commandsMap = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

function loadCommands() {
    commandsMap.clear();
    const files = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of files) {
        try {
            delete require.cache[require.resolve(`./commands/${file}`)];
            const command = require(`./commands/${file}`);
            if (command.name && command.execute) {
                commandsMap.set(command.name.toLowerCase(), command);
                if (command.aliases && Array.isArray(command.aliases)) {
                    command.aliases.forEach(alias => commandsMap.set(alias.toLowerCase(), command));
                }
            }
        } catch (err) {
            console.error(`❌ خطأ في تحميل الأمر ${file}:`, err.message);
        }
    }
}
loadCommands();

// ==========================================
// ⚙️ تشغيل الجلسات
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(), botEnabled: true, commandsEnabled: true, aiEnabled: false, autoReact: false, reactEmoji: '❤️', welcomeSent: false,
            antiCall: false, antiLink: false, antiSpam: false, antiBadWords: false, antiBot: false, autoStatusSave: false, badWordsList: []
        };
        saveSettings();
    }

    ['antiSpam', 'antiBadWords', 'antiBot', 'antiCall', 'antiLink', 'autoStatusSave'].forEach(key => {
        if (botSettings[sessionId][key] === undefined) botSettings[sessionId][key] = false;
    });
    if (!Array.isArray(botSettings[sessionId].badWordsList)) botSettings[sessionId].badWordsList = [];
    saveSettings();

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        browser: ['Windows', 'Edge', '10.0'],
        syncFullHistory: true, // ضروري لجلب جهات الاتصال القديمة للأسماء
        generateHighQualityLinkPreviews: false,
        getMessage: async (key) => { 
            const msg = msgStore.get(`${key.remoteJid}_${key.id}`);
            return msg?.message || undefined;
        }
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // سحب جهات الاتصال للذاكرة للترجمة العكسية (LID)
    sock.ev.on('contacts.upsert', (contacts) => {
        for (const contact of contacts) {
            globalContacts.set(contact.id, contact);
            if (contact.lid) globalContacts.set(contact.lid, contact);
        }
    });
    sock.ev.on('contacts.update', (contacts) => {
        for (const contact of contacts) {
            if (globalContacts.has(contact.id)) Object.assign(globalContacts.get(contact.id), contact);
            else globalContacts.set(contact.id, contact);
            if (contact.lid) globalContacts.set(contact.lid, globalContacts.get(contact.id));
        }
    });

    if (pairingNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode });
            } catch (err) {}
        }, 3000); 
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr && res && !pairingNumber && !res.headersSent) {
            try { const qrData = await qrCode.toDataURL(qr); res.json({ qr: qrData }); } catch(e){}
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startSession(sessionId), 5000);
            else { delete sessions[sessionId]; fs.rmSync(sessionPath, { recursive: true, force: true }); }
        }

        if (connection === 'open') {
            const selfId = jidNormalizedUser(sock.user.id);
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 📞 رادار ومضاد المكالمات
    // ==========================================
    sock.ev.on('call', async (calls) => {
        const currentSettings = botSettings[sessionId] || {};
        for (const call of calls) {
            if (call.status === 'offer') {
                const callerInfo = getContactInfo(call.from, null);
                const callerDisplay = callerInfo.isLid ? `[مخفي] ${callerInfo.number}` : `wa.me/${callerInfo.number}`;
                const callType = call.isVideo ? '📹 فيديو' : '📞 صوتية';
                
                if (currentSettings.antiCall) {
                    try {
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, { text: `🚫 *عذراً! نظام الحماية مفعل.*\nيمنع الاتصال بهذا الرقم نهائياً.` });
                    } catch (e) {}
                }

                if (activeMonitors.has(sessionId)) {
                    const monitorInfo = activeMonitors.get(sessionId);
                    const monitorSock = sessions[monitorInfo.monitorSocketId];
                    if (monitorSock) {
                        const alertText = `🚨 *[ رادار الـمـكـالـمـات ]* 🚨\n\n📤 *الـمـتـصـل:* ${callerInfo.name}\n📱 *الـرقـم:* ${callerDisplay}\n${DIVIDER}\n📞 *الـنـوع:* ${callType}\n⚠️ *الـحـالـة:* ${currentSettings.antiCall ? '✅ تـم طـرد الـمـتـصـل' : '❌ مـسـمـوح بـالاتـصـال'}`;
                        try { await monitorSock.sendMessage(monitorInfo.monitorJid, { text: alertText }); } catch(e) {}
                    }
                }
            }
        }
    });

    // ==========================================
    // 🛡️ 6. مضاد الحذف وكاشف التعديل (بالتقارير الملكية)
    // ==========================================
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 
                    const selfId = jidNormalizedUser(sock.user.id);
                    
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const senderInfo = getContactInfo(senderJid, storedMsg.pushName);
                    const senderDisplay = senderInfo.isLid ? `[مخفي] ${senderInfo.number}` : `wa.me/${senderInfo.number}`;
                    const time = moment().tz("Asia/Riyadh").format("hh:mm:ss A | YYYY-MM-DD");
                    
                    const alertText = `🚫 *[ رِسـالـة مـحـذوفـة ]* 🚫\n\n👤 *الـمـرسـل:* ${senderInfo.name}\n📱 *الـرقـم:* ${senderDisplay}\n🕒 *الـوقـت:* ${time}\n${DIVIDER}\n👇 *الـمـحـتـوى الأصـلـي:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 7. استقبال الرسائل المركزية (كودك الأصلي هو الأساس هنا)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        // ------------ كودك الأصلي 100% ------------
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const isStatus = from === 'status@broadcast'; // (إضافة فقط لعدم الرد على الحالات)
        const sender = isGroup || isStatus ? msg.key.participant : from;
        const pushName = msg.pushName || 'مجهول';
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;

        if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg);

        const currentSettings = botSettings[sessionId] || {};
        if (!currentSettings.botEnabled) return;

        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) viewOnceIncoming = { message: msg.message };
        
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

        const reply = async (text) => {
            await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };
        // ------------------------------------------

        // استخراج نوع الرسالة الفعلي (يستخدم للحماية والمراقبة)
        const actualType = getContentType(msg.message);

        // ==========================================
        // 💀 درع حماية الجروبات (تم عزله لكي لا يعرقل أوامرك)
        // ==========================================
        if (isGroup && !isFromMe) {
            let isViolationDetected = false;
            let violationType = '';
            
            // 1. فحص البوتات
            if (currentSettings.antiBot && msg.key.id && (msg.key.id.startsWith('BAE5') || msg.key.id.length === 22 || msg.key.id.startsWith('3EB0'))) {
                isViolationDetected = true; violationType = 'bot';
            }
            // 2. فحص الروابط
            else if (currentSettings.antiLink && body.match(/(https?:\/\/)?(www\.)?(chat\.whatsapp\.com|wa\.me|t\.me|youtube\.com|tiktok\.com|instagram\.com)\S*/i)) {
                isViolationDetected = true; violationType = 'link';
            }
            // 3. فحص الكلمات الممنوعة (من لوحة الويب)
            else if (currentSettings.antiBadWords && currentSettings.badWordsList && currentSettings.badWordsList.length > 0) {
                const isBadWord = currentSettings.badWordsList.some(word => body.toLowerCase().includes(word.toLowerCase().trim()));
                if (isBadWord) { isViolationDetected = true; violationType = 'badword'; }
            }

            // إذا اكتشف مخالفة، يتحقق من الإشراف ويعاقب!
            if (isViolationDetected) {
                try {
                    const groupMeta = await sock.groupMetadata(from);
                    const admins = groupMeta.participants.filter(p => p.admin).map(p => jidNormalizedUser(p.id));
                    const isBotAdmin = admins.includes(jidNormalizedUser(selfId));
                    const isSenderAdmin = admins.includes(jidNormalizedUser(sender));

                    if (isBotAdmin && !isSenderAdmin) {
                        await sock.sendMessage(from, { delete: msg.key }); // مسح الرسالة
                        
                        if (violationType === 'bot') {
                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                            await sock.sendMessage(from, { text: `🤖 *تم رصد بوت دخيل وتدميره.*` });
                        } 
                        else if (violationType === 'link') {
                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                            await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} *ممنوع نشر الروابط!* تم الطرد.`, mentions: [sender] });
                        } 
                        else if (violationType === 'badword') {
                            await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} *تـحـذيـر! يـمـنـع اسـتـخـدام هـذه الألـفـاظ!*`, mentions: [sender] });
                        }
                        return; // يوقف الكود هنا لأن العضو خالف وانطرد
                    }
                } catch (e) { /* تجاهل الأخطاء الصامتة */ }
            }

            // 4. مضاد السبام (منفصل لكي لا يمسح كل رسالة)
            if (currentSettings.antiSpam) {
                try {
                    const groupMeta = await sock.groupMetadata(from);
                    const admins = groupMeta.participants.filter(p => p.admin).map(p => jidNormalizedUser(p.id));
                    
                    if (!admins.includes(jidNormalizedUser(sender))) { // إذا لم يكن المرسل مشرفاً
                        const spamKey = `${sessionId}_${from}_${sender}`;
                        const now = Date.now();
                        let userMsgs = spamStore.get(spamKey) || [];
                        userMsgs = userMsgs.filter(time => now - time < 5000); // آخر 5 ثواني
                        userMsgs.push(now);
                        spamStore.set(spamKey, userMsgs);

                        if (userMsgs.length >= 6) { // 6 رسائل سريعة
                            if (admins.includes(jidNormalizedUser(selfId))) { // إذا كان البوت مشرف
                                await sock.sendMessage(from, { text: `🚨 @${sender.split('@')[0]} *تم الطرد بسبب الإزعاج (Spam)!*`, mentions: [sender] });
                                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                                spamStore.delete(spamKey); 
                                return;
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        // ==========================================
        // 👁️ قناص الحالات المخفي
        // ==========================================
        if (isStatus && !isFromMe && currentSettings.autoStatusSave) {
            await sock.readMessages([msg.key]); 
            if (actualType === 'imageMessage' || actualType === 'videoMessage' || actualType === 'extendedTextMessage') {
                try {
                    const senderInfo = getContactInfo(sender, pushName);
                    const senderDisplay = senderInfo.isLid ? `[مخفي] ${senderInfo.number}` : `wa.me/${senderInfo.number}`;
                    let caption = `👁️ *[ قـنـاص الـحـالات ]* 👁️\n\n👤 *الهدف:* ${senderInfo.name}\n📱 *الرقم:* ${senderDisplay}\n${DIVIDER}`;

                    if (actualType === 'extendedTextMessage') {
                        await sock.sendMessage(selfId, { text: `${caption}\n\n📝 *النص:* ${body}` });
                    } else {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        if (actualType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption });
                        if (actualType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption });
                    }
                } catch(e) {}
            }
            return; 
        }

        // ==========================================
        // 🎯 كاشف التعديل (Edit Tracker)
        // ==========================================
        if (actualType === 'protocolMessage' && msg.message.protocolMessage.type === 14) {
            const originalKey = msg.message.protocolMessage.key;
            const oldMsg = msgStore.get(`${originalKey.remoteJid}_${originalKey.id}`);
            if (oldMsg && !isFromMe) {
                const senderInfo = getContactInfo(sender, pushName);
                const senderDisplay = senderInfo.isLid ? `[مخفي] ${senderInfo.number}` : `wa.me/${senderInfo.number}`;
                const newText = msg.message.protocolMessage.editedMessage?.conversation || msg.message.protocolMessage.editedMessage?.extendedTextMessage?.text || "مجهول";
                const oldText = oldMsg.message?.conversation || oldMsg.message?.extendedTextMessage?.text || "ميديا/أخرى";
                
                const alertEdit = `✍️ *[ رِسـالـة مُـعـدلـة ]*\n\n👤 *الـمـرسـل:* ${senderInfo.name}\n📱 *الـرقـم:* ${senderDisplay}\n${DIVIDER}\n❌ *الـقـديـم:* ${oldText}\n✅ *الـجـديـد:* ${newText}`;
                try { await sock.sendMessage(selfId, { text: alertEdit }, { quoted: oldMsg }); } catch(e){}
            }
            return;
        }

        // ==========================================
        // 👻 أوامر وتفعيل المراقبة الشبحية (كودك الأصلي)
        // ==========================================
        if (body.startsWith('.مراقبه ')) {
            const targetSession = body.replace('.مراقبه ', '').trim();
            if (!sessions[targetSession]) return reply('❌ *عـذراً، هـذه الـجـلـسـة غـيـر مـتـصـلـة أو الاسـم خـاطـئ.*');
            if (targetSession === sessionId) return reply('❌ *لا يـمـكـنـك مـراقـبـة الـجـلـسـة الـتـي تـسـتـخـدمـهـا حـالـيـاً.*');

            activeMonitors.set(targetSession, { monitorJid: sender, monitorSocketId: sessionId });
            return reply(`✅ *تـم تـفـعـيـل الـمـراقـبـة الـسـريـة بـنـجـاح.*\n\n👁️‍🗨️ الـهـدف: [ ${targetSession} ]\n📥 *سـيـتـم تـحـويـل جـمـيـع الـرسـائـل هـنـا بـشـكـل مـخـفـي.*`);
        }
        
        if (body === '.ايقاف_المراقبه') {
            for (let [key, val] of activeMonitors.entries()) {
                if (val.monitorJid === sender) activeMonitors.delete(key);
            }
            return reply('✅ *تـم إيـقـاف جـمـيـع عـمـلـيـات الـمـراقـبـة.*');
        }

        // ==========================================
        // 🚨 تنفيذ المراقبة الشبحية (دقيقة بالأسماء الحقيقية)
        // ==========================================
        if (activeMonitors.has(sessionId)) {
            const monitorInfo = activeMonitors.get(sessionId);
            const monitorSock = sessions[monitorInfo.monitorSocketId];

            if (monitorSock && from !== monitorInfo.monitorJid && sender !== monitorInfo.monitorJid) {
                try {
                    const senderInfo = getContactInfo(sender, pushName);
                    const receiverInfo = getContactInfo(selfId, sock.user.name || 'الحساب المراقب');
                    const senderDisplay = senderInfo.isLid ? `[مخفي] ${senderInfo.number}` : `wa.me/${senderInfo.number}`;
                    const receiverDisplay = receiverInfo.isLid ? `[مخفي] ${receiverInfo.number}` : `wa.me/${receiverInfo.number}`;
                    const time = moment().tz("Asia/Riyadh").format("hh:mm:ss A | YYYY-MM-DD");
                    
                    let contentDesc = body || 'نص / ميديا';
                    if (actualType === 'imageMessage') contentDesc = '📷 صـورة';
                    else if (actualType === 'videoMessage') contentDesc = '🎥 فـيـديـو';
                    else if (actualType === 'audioMessage') contentDesc = msg.message.audioMessage?.ptt ? '🎤 بـصـمـة صـوتـيـة (PTT)' : '🎵 مـقـطـع صـوتـي';
                    else if (actualType === 'documentMessage') contentDesc = '📄 مـلـف';
                    else if (actualType === 'stickerMessage') contentDesc = '🌠 مـلـصـق';
                    if (viewOnceIncoming) contentDesc = '👁️‍🗨️ رسـالـة عـرض لـمـرة واحـدة';

                    let reportText = `🚨 *[ رادار الـمـراقـبـة - ${sessionId} ]* 🚨\n\n`;
                    reportText += `📤 *الـمـرسـل:* ${senderInfo.name}\n`;
                    reportText += `📱 *الـرقـم:* ${senderDisplay}\n`;
                    reportText += `${DIVIDER}\n`;
                    reportText += `📥 *الـمـسـتـلـم:* ${receiverInfo.name}\n`;
                    reportText += `📱 *الـرقـم:* ${receiverDisplay}\n`;

                    if (isGroup && !isStatus) {
                        const groupInfo = getContactInfo(from, null);
                        reportText += `${DIVIDER}\n👥 *الـمـجـمـوعـة:* ${groupInfo.name !== 'غير معروف' ? groupInfo.name : groupInfo.number}\n`;
                    }

                    reportText += `${DIVIDER}\n🕒 *الـوقـت:* ${time}\n\n📄 *الـمـحـتـوى:*\n${contentDesc}`;

                    await monitorSock.sendMessage(monitorInfo.monitorJid, { text: reportText });

                    if (actualType !== 'conversation' && actualType !== 'extendedTextMessage') {
                        await monitorSock.sendMessage(monitorInfo.monitorJid, { forward: msg });
                    }
                } catch (e) {}
            }
        }

        // ==========================================
        // 👁️‍🗨️ الرادار: صائد العرض لمرة واحدة
        // ==========================================
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const senderInfo = getContactInfo(sender, pushName);
                const senderDisplay = senderInfo.isLid ? `[مخفي] ${senderInfo.number}` : `wa.me/${senderInfo.number}`;
                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${senderInfo.number}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[ صائد الميديا المخفية ]* 🚨\n\n👤 *المرسل:* ${senderInfo.name}\n📱 *الرقم:* ${senderDisplay}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
                
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) {}
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming && !isStatus) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const isCmd = body.startsWith('.');

        // ==========================================
        // 🧠 8. الذكاء الاصطناعي (كودك الأصلي 100% بالمسافات)
        // ==========================================
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming && !isStatus) {
            try {
                await sock.sendPresenceUpdate('composing', from); 
                
                const query = body.trim();
                const API_KEY = 'AI_1d21219cc3914971'; 
                const API_URL = 'http://Fi5.bot-hosting.net:22214/api/chat';

                const response = await axios.post(API_URL, {
                    api_key: API_KEY,
                    prompt: query
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 25000 
                });

                if (response.data && response.data.status === 'success') {
                    const aiReply = response.data.response;
                    await reply(aiReply);
                } else {
                    console.error('⚠️ تم رفض الطلب من سيرفر الذكاء الاصطناعي');
                }

            } catch (error) {
                console.error('❌ خطأ في الاتصال بسيرفر الذكاء الاصطناعي:', error.message);
            }
            return; 
        }

        // ==========================================
        // 🎯 9. معالجة الأوامر الخارجية (كودك الأصلي 100% بالمسافات والمتغيرات)
        // ==========================================
        if (!currentSettings.commandsEnabled) return;

        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';
        let commandName = '';
        let args = [];
        let textArgs = '';

        if (selectedId) {
            commandName = selectedId.toLowerCase();
        } else if (isCmd) {
            args = body.slice(1).trim().split(/ +/);
            commandName = args.shift().toLowerCase();
            textArgs = args.join(' ');
        }

        if (!commandName) return;

        const commandData = commandsMap.get(commandName);

        if (commandData) {
            try {
                if (commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                }
                
                await commandData.execute({
                    sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix: '.', commandName, sessions, botSettings, saveSettings
                });
            } catch (error) {
                console.error(`❌ خطأ في الأمر ${commandName}:`, error);
                if (commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
            }
        }
    });

    return sock;
}

// ==========================================
// 🌐 10. API Endpoints (كودك الأصلي + دعم الميزات الجديدة للويب)
// ==========================================
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل الجلسة والرقم' });
    let formattedNumber = number.replace(/[^0-9]/g, '');
    
    if (sessions[sessionId] || fs.existsSync(path.join(__dirname, 'sessions', sessionId))) {
        if(sessions[sessionId]) sessions[sessionId].logout();
        delete sessions[sessionId];
        fs.rmSync(path.join(__dirname, 'sessions', sessionId), { recursive: true, force: true });
    }
    startSession(sessionId, res, formattedNumber);
});

app.post('/api/settings/get', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    res.json(settings);
});

app.post('/api/settings/save', (req, res) => {
    const { sessionId, password, botEnabled, commandsEnabled, aiEnabled, autoReact, reactEmoji, antiCall, antiLink, antiSpam, antiBadWords, antiBot, autoStatusSave, badWordsList } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    
    // إعداداتك الأساسية
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].aiEnabled = !!aiEnabled; 
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
    
    // إعدادات الترسانة من لوحة الويب
    botSettings[sessionId].antiCall = !!antiCall;
    botSettings[sessionId].antiLink = !!antiLink;
    botSettings[sessionId].antiSpam = !!antiSpam;
    botSettings[sessionId].antiBadWords = !!antiBadWords;
    botSettings[sessionId].antiBot = !!antiBot;
    botSettings[sessionId].autoStatusSave = !!autoStatusSave;

    // استقبال الكلمات الممنوعة من الويب
    if (Array.isArray(badWordsList)) {
        botSettings[sessionId].badWordsList = badWordsList;
    }

    saveSettings();
    res.json({ success: true, message: '✅ تم حفظ التعديلات' });
});

app.get('/sessions', (req, res) => { res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) }); });

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور السيرفر خاطئة' });
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; }
    if (botSettings[sessionId]) { delete botSettings[sessionId]; saveSettings(); }
    if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); res.json({ message: `تم حذف ${sessionId}` }); } 
    else { res.status(404).json({ error: 'الجلسة غير موجودة' }); }
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP 20 يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ وضع الحماية من الانهيار مفعل بنجاح`);
    console.log(`🧠 نظام الذكاء الاصطناعي (TARZAN AI) مدمج وجاهز`);
    console.log(`👻 نظام المراقبة الشبحية والترسانة العسكرية يعملان معاً`);
    console.log(`=========================================\n`);
});
