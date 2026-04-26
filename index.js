const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino'); // 🛡️ كتم السجلات لمنع اختناق المعالج
const { GoogleGenerativeAI } = require('@google/generative-ai'); // 🧠 مكتبة جوجل

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
    getContentType, // تم إضافتها للمراقبة الدقيقة
    proto
} = require('@whiskeysockets/baileys');

// 🛡️ درع حماية بيئة Node.js من الانطفاء المفاجئ
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};
const msgStore = new Map(); 

// 👁️ [جديد]: خريطة الذاكرة لنظام المراقبة الشبحية
const activeMonitors = new Map();
// 📇 [جديد]: مستودع جهات الاتصال للأسماء والأرقام الدقيقة
const globalContacts = new Map();
// 🚨 [جديد]: مستودع الحماية (سبام)
const spamStore = new Map();

const badWordsList = ['كذاب', 'نصاب', 'حمار', 'كلب', 'غبي', 'قحبه', 'شرموط', 'ورع'];
const DIVIDER = '━━━━━━━━━━━━━━━';

// ==========================================
// 🎯 دوال مساعدة استخباراتية (لا تؤثر على كودك الأساسي)
// ==========================================
function getContactInfo(jid, pushName) {
    if (!jid) return { name: pushName || 'مجهول', number: 'مجهول', isLid: false };
    
    let cleanJid = jidNormalizedUser(jid);
    let realJid = cleanJid;
    let isLid = cleanJid.includes('@lid');
    
    if (isLid) {
        for (const [id, contact] of globalContacts.entries()) {
            if (contact.lid === cleanJid || contact.id === cleanJid) {
                if (contact.id && !contact.id.includes('@lid')) {
                    realJid = contact.id; 
                    isLid = false; 
                    break;
                }
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

// ✅ 1. نظام حفظ الإعدادات
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

// ✅ 2. مجلد الخزنة للميديا المخفية
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// 🛡️ 3. نظام تفريغ الذاكرة الذكي
setInterval(() => { 
    if (msgStore.size > 5000) {
        msgStore.clear(); 
        console.log('🧹 [حماية السيرفر] تم تفريغ الذاكرة المؤقتة للرسائل');
    }
    spamStore.clear(); // تنظيف سبام ستور للميزات الجديدة
}, 30 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// 🚀 4. معالج الأوامر (الكود الأصلي الخاص بك)
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
// ⚙️ 5. تشغيل الجلسات (الكود الأصلي + ميزات الويب الجديدة)
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(), 
            botEnabled: true, 
            commandsEnabled: true, 
            aiEnabled: false, 
            autoReact: false, 
            reactEmoji: '❤️', 
            welcomeSent: false,
            // الميزات الجديدة (لا تؤثر على الأصلية)
            antiCall: false, 
            antiLink: false, 
            antiSpam: false, 
            antiBadWords: false, 
            antiBot: false, 
            autoStatusSave: false
        };
        saveSettings();
    }

    // تفعيل القيم الافتراضية
    ['antiSpam', 'antiBadWords', 'antiBot', 'antiCall', 'antiLink', 'autoStatusSave'].forEach(key => {
        if (botSettings[sessionId][key] === undefined) botSettings[sessionId][key] = false;
    });
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
        syncFullHistory: true, // مُحدثة لجهات الاتصال
        generateHighQualityLinkPreviews: false,
        getMessage: async (key) => { // مهمة لمضاد الحذف والتعديل
            const msg = msgStore.get(`${key.remoteJid}_${key.id}`);
            return msg?.message || undefined;
        }
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // 📇 [إضافة] مزامنة جهات الاتصال للدقة
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
            } catch (err) {
                if (res && !res.headersSent) res.status(500).json({ error: 'تعذر طلب الكود. حاول بعد ثوانٍ.' });
            }
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
            console.log(`✅ الجلسة ${sessionId} متصلة بنجاح!`);
            const selfId = jidNormalizedUser(sock.user.id);
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *نـظـام طـرزان ULTRA VIP* 👑\n\n✅ *تـم الـربـط بـنـجـاح!*\n\n🔐 *بـيـانـات جـلـسـتـك:*\n👤 *الـجـلـسـة:* ${sessionId}\n🔑 *الـبـاسـورد:* ${botSettings[sessionId].password}\n${DIVIDER}\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 📞 [إضافة] رادار ومضاد المكالمات
    // ==========================================
    sock.ev.on('call', async (calls) => {
        const currentSettings = botSettings[sessionId] || {};
        for (const call of calls) {
            if (call.status === 'offer') {
                const callerInfo = getContactInfo(call.from, null);
                const callerDisplay = callerInfo.isLid ? `[مخفي] ${callerInfo.number}` : `wa.me/${callerInfo.number}`;
                const callType = call.isVideo ? '📹 مـكـالـمـة فـيـديـو' : '📞 مـكـالـمـة صـوتـيـة';
                const time = moment().tz("Asia/Riyadh").format("hh:mm:ss A | YYYY-MM-DD");
                
                if (currentSettings.antiCall) {
                    try {
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, { text: `🚫 *عـذراً! نـظـام الـحـمـايـة مـفـعـل.*\nيـمـنـع الاتـصـال بـهـذا الـرقـم نـهـائـيـاً.` });
                    } catch (e) {}
                }

                if (activeMonitors.has(sessionId)) {
                    const monitorInfo = activeMonitors.get(sessionId);
                    const monitorSock = sessions[monitorInfo.monitorSocketId];
                    if (monitorSock) {
                        const alertText = `🚨 *[ رادار الـمـكـالـمـات ]* 🚨\n\n📤 *الـمـتـصـل:* ${callerInfo.name}\n📱 *الـرقـم:* ${callerDisplay}\n${DIVIDER}\n📞 *الـنـوع:* ${callType}\n🕒 *الـوقـت:* ${time}\n${DIVIDER}\n⚠️ *الـحـالـة:* ${currentSettings.antiCall ? '✅ تـم طـرد الـمـتـصـل' : '❌ مـسـمـوح بـالاتـصـال'}`;
                        try { await monitorSock.sendMessage(monitorInfo.monitorJid, { text: alertText }); } catch(e) {}
                    }
                }
            }
        }
    });

    // ==========================================
    // 🛡️ 6. مضاد الحذف الجبار (مُحدث بالأسماء والتنسيق)
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
                    const time = moment().tz("Asia/Riyadh").format("hh:mm:ss A");
                    
                    const alertText = `🚫 *[ رِسـالـة مـحـذوفـة ]* 🚫\n\n👤 *الـمـرسـل:* ${senderInfo.name}\n📱 *الـرقـم:* ${senderDisplay}\n🕒 *الـوقـت:* ${time}\n${DIVIDER}\n👇 *الـمـحـتـوى الأصـلـي بـالأسـفـل:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 7. استقبال الرسائل المركزية (الكود الأصلي)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        // [تعديل لكي لا يُخرب أوامرك]: تم إضافة isStatus
        const isStatus = from === 'status@broadcast';
        
        const sender = isGroup || isStatus ? msg.key.participant : from;
        const pushName = msg.pushName || 'مجهول';
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;

        if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg);

        const currentSettings = botSettings[sessionId] || {};
        if (!currentSettings.botEnabled) return;

        // 🎯 معلومات المراقبة
        const myInfo = getContactInfo(selfId, sock.user.name || 'الحساب المراقب');
        let senderInfo, receiverInfo;

        if (isFromMe) {
            senderInfo = myInfo;
            const targetInfo = getContactInfo(from, 'الطرف الآخر');
            receiverInfo = isGroup ? { name: 'مجموعة', number: targetInfo.number, isLid: targetInfo.isLid } : targetInfo;
        } else {
            senderInfo = getContactInfo(sender, pushName);
            receiverInfo = myInfo;
        }

        const senderDisplay = senderInfo.isLid ? `[مخفي] ${senderInfo.number}` : `wa.me/${senderInfo.number}`;
        const receiverDisplay = receiverInfo.isLid ? `[مخفي] ${receiverInfo.number}` : `wa.me/${receiverInfo.number}`;

        // (الكود الأصلي لكاشف العرض لمرة واحدة)
        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const actualType = getContentType(msg.message); // [تم إضافة هذه لحل مشاكل الـ ViewOnce في Baileys]
        if (msg.message[actualType]?.viewOnce === true) viewOnceIncoming = { message: msg.message };
        
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

        const reply = async (text) => {
            await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        // ==========================================
        // 💀 [إضافة] أنظمة حماية الجروبات
        // ==========================================
        if (isGroup && !isFromMe) {
            let groupAdmins = [];
            let isBotAdmin = false;
            let isSenderAdmin = false;

            const checkAdminStatus = async () => {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);
                    isBotAdmin = groupAdmins.includes(selfId);
                    isSenderAdmin = groupAdmins.includes(sender);
                } catch (e) {}
            };

            if (currentSettings.antiBot && msg.key.id && (msg.key.id.startsWith('BAE5') || msg.key.id.length === 22 || msg.key.id.startsWith('3EB0'))) {
                await checkAdminStatus();
                if (isBotAdmin && !isSenderAdmin) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { text: `🤖 *[ جـهـاز الاسـتـخـبـارات ]*\n${DIVIDER}\nتـم رصـد بـوت دخـيـل! جـاري الـتـدمـيـر ⚔️` });
                    await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    return; 
                }
            }

            if (currentSettings.antiLink && body.match(/(https?:\/\/)?(www\.)?(chat\.whatsapp\.com|wa\.me|t\.me|youtube\.com|tiktok\.com)\S*/i)) {
                await checkAdminStatus();
                if (isBotAdmin && !isSenderAdmin) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]}\n${DIVIDER}\n*مـمـنـوع نـشـر الـروابـط!* وداعـاً 👋`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    return;
                }
            }

            if (currentSettings.antiBadWords) {
                const isBadWord = badWordsList.some(word => body.includes(word));
                if (isBadWord) {
                    await checkAdminStatus();
                    if (isBotAdmin && !isSenderAdmin) {
                        await sock.sendMessage(from, { delete: msg.key });
                        await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]}\n${DIVIDER}\n*تـحـذيـر!* يـرجـى احـتـرام الـمـجـمـوعـة والابـتـعـاد عـن الألـفـاظ الـسـيـئـة.`, mentions: [sender] });
                        return;
                    }
                }
            }

            if (currentSettings.antiSpam) {
                await checkAdminStatus();
                if (!isSenderAdmin) { 
                    const spamKey = `${sessionId}_${from}_${sender}`;
                    const now = Date.now();
                    let userMsgs = spamStore.get(spamKey) || [];
                    
                    userMsgs = userMsgs.filter(time => now - time < 5000);
                    userMsgs.push(now);
                    spamStore.set(spamKey, userMsgs);

                    if (userMsgs.length >= 5) {
                        if (isBotAdmin) {
                            await sock.sendMessage(from, { text: `🚨 @${sender.split('@')[0]}\n${DIVIDER}\n*تـم رصـد إزعـاج (Spam)!* جـاري الـطـرد حـمـايـةً لـلـجـروب.`, mentions: [sender] });
                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                            spamStore.delete(spamKey); 
                            return;
                        }
                    }
                }
            }
        }

        // ==========================================
        // 👁️ [إضافة] قناص الحالات (Status Saver)
        // ==========================================
        if (isStatus && !isFromMe) {
            await sock.readMessages([msg.key]); 
            if (currentSettings.autoStatusSave && (actualType === 'imageMessage' || actualType === 'videoMessage' || actualType === 'extendedTextMessage')) {
                try {
                    const time = moment().tz("Asia/Riyadh").format("hh:mm A");
                    let caption = `👁️ *[ قـنـاص الـحـالات ]* 👁️\n\n👤 *الـهـدف:* ${senderInfo.name}\n📱 *الـرقـم:* ${senderDisplay}\n🕒 *الـوقـت:* ${time}\n${DIVIDER}`;

                    if (actualType === 'extendedTextMessage') {
                        await sock.sendMessage(selfId, { text: `${caption}\n\n📝 *الـنـص:*\n${body}` });
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
        // 🎯 [إضافة] كاشف التعديل (مُنسق)
        // ==========================================
        if (actualType === 'protocolMessage' && msg.message.protocolMessage.type === 14) {
            const originalKey = msg.message.protocolMessage.key;
            const oldMsg = msgStore.get(`${originalKey.remoteJid}_${originalKey.id}`);
            if (oldMsg && !isFromMe) {
                const newText = msg.message.protocolMessage.editedMessage?.conversation || msg.message.protocolMessage.editedMessage?.extendedTextMessage?.text || "مجهول";
                const oldText = oldMsg.message?.conversation || oldMsg.message?.extendedTextMessage?.text || "ميديا/أخرى";
                
                const alertEdit = `✍️ *[ رِسـالـة مُـعـدلـة ]*\n\n👤 *الـمـرسـل:* ${senderInfo.name}\n📱 *الـرقـم:* ${senderDisplay}\n${DIVIDER}\n❌ *الـقـديـم:* ${oldText}\n✅ *الـجـديـد:* ${newText}`;
                try { await sock.sendMessage(selfId, { text: alertEdit }, { quoted: oldMsg }); } catch(e){}
            }
            return;
        }

        // ==========================================
        // 👻 أوامر تفعيل/إيقاف المراقبة الشبحية (كودك الأصلي + التنسيق)
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
        // 🚨 تنفيذ المراقبة الشبحية (منسقة 100%)
        // ==========================================
        if (activeMonitors.has(sessionId)) {
            const monitorInfo = activeMonitors.get(sessionId);
            const monitorSock = sessions[monitorInfo.monitorSocketId];

            // منع الحلقة المفرغة
            if (monitorSock && from !== monitorInfo.monitorJid && sender !== monitorInfo.monitorJid) {
                try {
                    const time = moment().tz("Asia/Riyadh").format("hh:mm:ss A | YYYY-MM-DD");
                    let contentDesc = body || 'نص / محتوى غير معروف';

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
                } catch (e) {
                    console.error('❌ خطأ في إرسال تقرير المراقبة:', e.message);
                }
            }
        }

        // ==========================================
        // 👁️‍🗨️ الرادار: صائد العرض لمرة واحدة (منسق 100%)
        // ==========================================
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${senderInfo.number}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[ صـائـد الـمـيـديـا الـمـخـفـيـة ]* 🚨\n\n` +
                                  `📤 *الـمـرسـل:* ${senderInfo.name}\n` +
                                  `📱 *الـرقـم:* ${senderDisplay}\n` +
                                  `${DIVIDER}\n` +
                                  `📥 *الـمـسـتـلـم:* ${receiverInfo.name}\n` +
                                  `📱 *الـرقـم:* ${receiverDisplay}\n` +
                                  `${DIVIDER}`;
                
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) { console.error('❌ خطأ في الرادار التلقائي:', err); }
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming && !isStatus) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        if (isStatus) return; // لعدم تشغيل الأوامر والذكاء على الحالات

        const isCmd = body.startsWith('.');

        // ==========================================
        // 🧠 8. الذكاء الاصطناعي (كودك الأصلي 100%)
        // ==========================================
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming && !isGroup) {
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
        // 🎯 9. معالجة الأوامر الخارجية (كودك الأصلي 100%)
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
// 🌐 10. API Endpoints (لوحة التحكم - الكود الأصلي + ميزات الويب الجديدة)
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

// 🎯 تحديث نقطة الحفظ لتشمل الترسانة الجديدة دون كسر القديم
app.post('/api/settings/save', (req, res) => {
    const { sessionId, password, botEnabled, commandsEnabled, aiEnabled, autoReact, reactEmoji, antiCall, antiLink, antiSpam, antiBadWords, antiBot, autoStatusSave } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].aiEnabled = !!aiEnabled; 
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
    
    // الميزات العسكرية الجديدة للوحة الويب
    botSettings[sessionId].antiCall = !!antiCall;
    botSettings[sessionId].antiLink = !!antiLink;
    botSettings[sessionId].antiSpam = !!antiSpam;
    botSettings[sessionId].antiBadWords = !!antiBadWords;
    botSettings[sessionId].antiBot = !!antiBot;
    botSettings[sessionId].autoStatusSave = !!autoStatusSave;

    saveSettings();
    res.json({ success: true, message: '✅ تم الحفظ بنجاح' });
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
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ وضع الحماية من الانهيار مفعل بنجاح`);
    console.log(`🧠 نظام الذكاء الاصطناعي (TARZAN AI) مدمج وجاهز`);
    console.log(`👻 أنظمة المراقبة والحماية منسقة وجاهزة`);
    console.log(`=========================================\n`);
});
