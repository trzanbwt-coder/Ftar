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
            // المتغيرات المطلوبة للوحة الويب
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
        syncFullHistory: true, 
        generateHighQualityLinkPreviews: false,
        getMessage: async (key) => {
            const msg = msgStore.get(`${key.remoteJid}_${key.id}`);
            return msg?.message || undefined;
        }
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // تحديث الأسماء والأرقام المخفية
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
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n👤 *الجلسة:* ${sessionId}`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 🌟 [إضافة التطوير]: مضاد المكالمات
    // ==========================================
    sock.ev.on('call', async (calls) => {
        const currentSettings = botSettings[sessionId] || {};
        if (!currentSettings.antiCall) return;
        for (const call of calls) {
            if (call.status === 'offer') {
                try {
                    await sock.rejectCall(call.id, call.from);
                    await sock.sendMessage(call.from, { text: `🚫 *عـذراً! نـظـام الـحـمـايـة مـفـعـل.*\nيـمـنـع الاتـصـال بـهـذا الـرقـم نـهـائـيـاً.` });
                } catch (e) {}
            }
        }
    });

    // ==========================================
    // 🌟 [إضافة التطوير]: مضاد الحذف
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
                    
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *المرسل:* ${senderInfo.name}\n📱 *الرقم:* ${senderDisplay}\n🕒 *الوقت:* ${time}\n👇 *الرسالة الأصلية:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 7. استقبال الرسائل المركزية (هنا كودك الأصلي تماماً)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        // 🟢 كودك الأصلي كما كتبته أنت 🟢
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const isStatus = from === 'status@broadcast';
        
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
        // 🟢 نهاية كودك الأساسي هنا 🟢

        // نحتاج هذا السطر البسيط للميزات العسكرية لتعمل بدقة
        const actualType = getContentType(msg.message);

        // ==========================================
        // ⚔️ [صندوق الحماية العسكري المعزول] ⚔️
        // هذا الصندوق يعمل دون إحداث أي ضرر بكودك
        // ==========================================
        if (isGroup && !isFromMe) {
            let isViolator = false;
            let action = '';

            // الفحص الدقيق للمخالفات
            if (currentSettings.antiLink && body.match(/(https?:\/\/)?(www\.)?(chat\.whatsapp\.com|wa\.me|t\.me|youtube\.com|tiktok\.com|instagram\.com)\S*/i)) {
                isViolator = true; action = 'link';
            } 
            else if (currentSettings.antiBadWords && currentSettings.badWordsList && currentSettings.badWordsList.length > 0) {
                if (currentSettings.badWordsList.some(word => body.toLowerCase().includes(word.toLowerCase().trim()))) {
                    isViolator = true; action = 'badword';
                }
            } 
            else if (currentSettings.antiBot && msg.key.id && (msg.key.id.startsWith('BAE5') || msg.key.id.length === 22 || msg.key.id.startsWith('3EB0'))) {
                isViolator = true; action = 'bot';
            }

            // فحص الإزعاج (السبام)
            if (currentSettings.antiSpam && !isViolator) {
                const spamKey = `${sessionId}_${from}_${sender}`;
                const now = Date.now();
                let userMsgs = spamStore.get(spamKey) || [];
                userMsgs = userMsgs.filter(time => now - time < 5000); // 5 ثواني
                userMsgs.push(now);
                spamStore.set(spamKey, userMsgs);
                if (userMsgs.length >= 6) { isViolator = true; action = 'spam'; }
            }

            // إذا اكتشف أي مخالفة، سيقوم بتنفيذ العقاب!
            if (isViolator) {
                try {
                    const groupMeta = await sock.groupMetadata(from);
                    const admins = groupMeta.participants.filter(p => p.admin).map(p => jidNormalizedUser(p.id));
                    const isBotAdmin = admins.includes(jidNormalizedUser(selfId)); // هل البوت مشرف؟
                    const isSenderAdmin = admins.includes(jidNormalizedUser(sender)); // هل المخالف مشرف؟

                    // العقاب يتم فقط إذا كان البوت مشرف والمخالف شخص عادي (ليس مشرفاً)
                    if (isBotAdmin && !isSenderAdmin) {
                        const delObj = { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender };
                        const senderNorm = jidNormalizedUser(sender);
                        
                        if (action === 'link') {
                            await sock.sendMessage(from, { delete: delObj });
                            await sock.sendMessage(from, { text: `🚫 @${senderNorm.split('@')[0]} *ممنوع نشر الروابط!* تم الطرد.`, mentions: [senderNorm] });
                            await sock.groupParticipantsUpdate(from, [senderNorm], 'remove');
                        } 
                        else if (action === 'badword') {
                            await sock.sendMessage(from, { delete: delObj });
                            await sock.sendMessage(from, { text: `⚠️ @${senderNorm.split('@')[0]} *يمنع استخدام هذه الألفاظ!*`, mentions: [senderNorm] });
                        } 
                        else if (action === 'bot') {
                            await sock.sendMessage(from, { delete: delObj });
                            await sock.sendMessage(from, { text: `🤖 *تم طرد بوت دخيل بنجاح.*` });
                            await sock.groupParticipantsUpdate(from, [senderNorm], 'remove');
                        } 
                        else if (action === 'spam') {
                            await sock.sendMessage(from, { text: `🚨 @${senderNorm.split('@')[0]} *تم الطرد بسبب الإزعاج (Spam)!*`, mentions: [senderNorm] });
                            await sock.groupParticipantsUpdate(from, [senderNorm], 'remove');
                            spamStore.delete(`${sessionId}_${from}_${sender}`);
                        }
                        return; // 🛑 إيقاف الكود هنا! لكي لا يرد الذكاء الاصطناعي أو الأوامر على الشخص المطرود.
                    }
                } catch (e) {
                    console.log('⚠️ خطأ في تنفيذ الحماية:', e.message);
                }
            }
        }
        // نهاية الصندوق المعزول ===================================

        // ==========================================
        // 🌟 [إضافات الاستخبارات الشبحية وقناص الحالات]
        // ==========================================
        if (isStatus && !isFromMe && currentSettings.autoStatusSave) {
            await sock.readMessages([msg.key]); 
            if (actualType === 'imageMessage' || actualType === 'videoMessage' || actualType === 'extendedTextMessage') {
                try {
                    const senderInfo = getContactInfo(sender, pushName);
                    let caption = `👁️ *[ قـنـاص الـحـالات ]*\n👤 *الهدف:* ${senderInfo.name}`;

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

        if (actualType === 'protocolMessage' && msg.message.protocolMessage.type === 14) {
            const originalKey = msg.message.protocolMessage.key;
            const oldMsg = msgStore.get(`${originalKey.remoteJid}_${originalKey.id}`);
            if (oldMsg && !isFromMe) {
                const senderInfo = getContactInfo(sender, pushName);
                const newText = msg.message.protocolMessage.editedMessage?.conversation || msg.message.protocolMessage.editedMessage?.extendedTextMessage?.text || "مجهول";
                const oldText = oldMsg.message?.conversation || oldMsg.message?.extendedTextMessage?.text || "ميديا/أخرى";
                const alertEdit = `✍️ *[ رسالة معدلة ]*\n👤 *المرسل:* ${senderInfo.name}\n❌ *القديم:* ${oldText}\n✅ *الجديد:* ${newText}`;
                try { await sock.sendMessage(selfId, { text: alertEdit }, { quoted: oldMsg }); } catch(e){}
            }
            return;
        }

        if (body.startsWith('.مراقبه ')) {
            const targetSession = body.replace('.مراقبه ', '').trim();
            if (!sessions[targetSession]) return reply('❌ *عـذراً، هـذه الـجـلـسـة غـيـر مـتـصـلـة أو الاسـم خـاطـئ.*');
            if (targetSession === sessionId) return reply('❌ *لا يـمـكـنـك مـراقـبـة الـجـلـسـة الـتـي تـسـتـخـدمـهـا حـالـيـاً.*');
            activeMonitors.set(targetSession, { monitorJid: sender, monitorSocketId: sessionId });
            return reply(`✅ *تـم تـفـعـيـل الـمـراقـبـة الـسـريـة بـنـجـاح.*\n👁️‍🗨️ الـهـدف: [ ${targetSession} ]`);
        }
        
        if (body === '.ايقاف_المراقبه') {
            for (let [key, val] of activeMonitors.entries()) { if (val.monitorJid === sender) activeMonitors.delete(key); }
            return reply('✅ *تـم إيـقـاف جـمـيـع عـمـلـيـات الـمـراقـبـة.*');
        }

        if (activeMonitors.has(sessionId)) {
            const monitorInfo = activeMonitors.get(sessionId);
            const monitorSock = sessions[monitorInfo.monitorSocketId];

            if (monitorSock && from !== monitorInfo.monitorJid && sender !== monitorInfo.monitorJid) {
                try {
                    const senderInfo = getContactInfo(sender, pushName);
                    const time = moment().tz("Asia/Riyadh").format("hh:mm:ss A");
                    let contentDesc = body || 'ميديا/أخرى';
                    const reportText = `🚨 *[ مراقبة شبحية - ${sessionId} ]* 🚨\n📤 *المرسل:* ${senderInfo.name}\n🕒 *الوقت:* ${time}\n📄 *المحتوى:*\n${contentDesc}`;
                    await monitorSock.sendMessage(monitorInfo.monitorJid, { text: reportText });
                    if (actualType !== 'conversation' && actualType !== 'extendedTextMessage') {
                        await monitorSock.sendMessage(monitorInfo.monitorJid, { forward: msg });
                    }
                } catch (e) {}
            }
        }

        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const senderInfo = getContactInfo(sender, pushName);
                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${senderInfo.number}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[صائد الميديا المخفية]* 🚨\n👤 *المرسل:* ${senderInfo.name}`;
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) {}
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming && !isStatus) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        // ==========================================
        // 🟢 من هنا يستأنف كودك الأصلي للذكاء والأوامر 🟢
        // لم يتم تغيير أو مسح أي حرف من هذا القسم
        // ==========================================
        const isCmd = body.startsWith('.');

        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming) {
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
// 🌐 10. API Endpoints (مدعمة بحفظ الترسانة)
// ==========================================
app.post('/create-session', (req, res) => { startSession(req.body.sessionId, res); });

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    let formattedNumber = number.replace(/[^0-9]/g, '');
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; fs.rmSync(path.join(__dirname, 'sessions', sessionId), { recursive: true, force: true }); }
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
    
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].aiEnabled = !!aiEnabled; 
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
    
    // حفظ إعدادات لوحة الويب الجديدة
    botSettings[sessionId].antiCall = !!antiCall;
    botSettings[sessionId].antiLink = !!antiLink;
    botSettings[sessionId].antiSpam = !!antiSpam;
    botSettings[sessionId].antiBadWords = !!antiBadWords;
    botSettings[sessionId].antiBot = !!antiBot;
    botSettings[sessionId].autoStatusSave = !!autoStatusSave;
    if (Array.isArray(badWordsList)) botSettings[sessionId].badWordsList = badWordsList;

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
    console.log(`🚀 سيرفر TARZAN VIP Ultimate يعمل الآن 🚀`);
    console.log(`=========================================\n`);
});
