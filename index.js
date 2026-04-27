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

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};
const msgStore = new Map(); 

// 🌟 ذواكر المراقبة والحماية الجبارة
const activeMonitors = new Map();
const globalContacts = new Map();
const spamStore = new Map();
const groupAdminsCache = new Map(); // تمنع تعليق البوت أثناء الطرد

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

const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) { 
    botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); 
} else { 
    botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings)); 
}

function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2)); }
function generateSessionPassword() { return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

setInterval(() => { 
    if (msgStore.size > 5000) msgStore.clear(); 
    spamStore.clear();
}, 15 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// 🚀 4. معالج الأوامر (نفس كودك الأصلي)
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
        } catch (err) {}
    }
}
loadCommands();

// ==========================================
// ⚙️ 5. تشغيل الجلسات وإعدادات الـ 20 ميزة
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(), botEnabled: true, commandsEnabled: true, aiEnabled: false, autoReact: false, reactEmoji: '❤️', welcomeSent: false,
            // 🛡️ الترسانة الـ 20
            antiCall: false, antiLink: false, antiSpam: false, antiBadWords: false, antiBot: false, 
            autoStatusSave: false, antiForeign: false, allowedCountry: '966', antiForward: false, 
            antiDocument: false, antiAudio: false, antiMedia: false, autoWelcome: false, badWordsList: []
        };
        saveSettings();
    }

    // تفعيل القيم الافتراضية للجلسات
    ['antiSpam', 'antiBadWords', 'antiBot', 'antiCall', 'antiLink', 'autoStatusSave', 'antiForeign', 'antiForward', 'antiDocument', 'antiAudio', 'antiMedia', 'autoWelcome'].forEach(key => {
        if (botSettings[sessionId][key] === undefined) botSettings[sessionId][key] = false;
    });
    if (!botSettings[sessionId].allowedCountry) botSettings[sessionId].allowedCountry = '966';
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
        syncFullHistory: false,
        generateHighQualityLinkPreviews: false,
        getMessage: async (key) => {
            const msg = msgStore.get(`${key.remoteJid}_${key.id}`);
            return msg?.message || undefined;
        }
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('contacts.upsert', (contacts) => {
        for (const contact of contacts) {
            globalContacts.set(contact.id, contact);
            if (contact.lid) globalContacts.set(contact.lid, contact);
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
            try { await sock.updateProfileStatus(`🤖 طرزان السفاح | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان السفاح* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك:*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *الترسانة الـ 20 مفعلة*`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 🛡️ الترحيب والوداع التلقائي (جديد)
    // ==========================================
    sock.ev.on('group-participants.update', async (update) => {
        const currentSettings = botSettings[sessionId] || {};
        if (!currentSettings.autoWelcome) return;
        try {
            for (let participant of update.participants) {
                if (update.action === 'add') {
                    await sock.sendMessage(update.id, { text: `👋 أهلاً بك @${participant.split('@')[0]} في المجموعة! 🌹`, mentions: [participant] });
                } else if (update.action === 'remove') {
                    await sock.sendMessage(update.id, { text: `🚶‍♂️ وداعاً @${participant.split('@')[0]}...`, mentions: [participant] });
                }
            }
        } catch (e) {}
    });

    // ==========================================
    // 📞 مضاد المكالمات
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
    // 🛡️ مضاد الحذف
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
                    
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *المرسل:* ${senderInfo.name}\n📱 *الرقم:* wa.me/${senderInfo.number}\n👇 *الرسالة الأصلية:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 7. استقبال الرسائل (قلب البوت)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        // 🟢 متغيراتك الأصلية كما أرسلتها بدون تعديل
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
        const actualType = getContentType(msg.message); 
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) viewOnceIncoming = { message: msg.message };

        // استخراج النص من أي نوع رسالة
        let body = '';
        if (msg.message.conversation) body = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
        else if (msg.message.imageMessage?.caption) body = msg.message.imageMessage.caption;
        else if (msg.message.videoMessage?.caption) body = msg.message.videoMessage.caption;

        const reply = async (text) => {
            await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        // ==========================================
        // 🛑 [غرفة الإعدام - الترسانة الـ 20 معزولة تماماً] 🛑
        // ==========================================
        if (isGroup && !isFromMe) {
            let isViolator = false;
            let actionType = '';
            let penalty = 'delete'; // delete, kick

            const isForwarded = msg.message.extendedTextMessage?.contextInfo?.isForwarded;
            const rawSenderNum = sender.split('@')[0];

            // 1. مضاد الأرقام الأجنبية
            if (currentSettings.antiForeign && currentSettings.allowedCountry) {
                if (!rawSenderNum.startsWith(currentSettings.allowedCountry)) {
                    isViolator = true; actionType = 'foreign'; penalty = 'kick';
                }
            }
            // 2. مضاد التوجيه
            if (!isViolator && currentSettings.antiForward && isForwarded) {
                isViolator = true; actionType = 'forward'; penalty = 'delete';
            }
            // 3. مضاد الملفات (الفايروسات)
            if (!isViolator && currentSettings.antiDocument && actualType === 'documentMessage') {
                isViolator = true; actionType = 'document'; penalty = 'delete';
            }
            // 4. مضاد الصوتيات
            if (!isViolator && currentSettings.antiAudio && actualType === 'audioMessage') {
                isViolator = true; actionType = 'audio'; penalty = 'delete';
            }
            // 5. مضاد الميديا (الصور والفيديو)
            if (!isViolator && currentSettings.antiMedia && (actualType === 'imageMessage' || actualType === 'videoMessage')) {
                isViolator = true; actionType = 'media'; penalty = 'delete';
            }
            // 6. مضاد الروابط
            if (!isViolator && currentSettings.antiLink && body && /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|youtube\.com|tiktok\.com|instagram\.com)/i.test(body)) {
                isViolator = true; actionType = 'link'; penalty = 'kick';
            }
            // 7. مضاد الكلمات
            if (!isViolator && currentSettings.antiBadWords && currentSettings.badWordsList.length > 0 && body) {
                if (currentSettings.badWordsList.some(w => body.toLowerCase().includes(w.toLowerCase().trim()))) {
                    isViolator = true; actionType = 'badword'; penalty = 'delete';
                }
            }
            // 8. مضاد البوتات
            if (!isViolator && currentSettings.antiBot && msg.key.id && (msg.key.id.startsWith('BAE5') || msg.key.id.length === 22 || msg.key.id.startsWith('3EB0'))) {
                isViolator = true; actionType = 'bot'; penalty = 'kick';
            }
            // 9. مضاد السبام
            if (!isViolator && currentSettings.antiSpam) {
                const spamKey = `${sessionId}_${from}_${sender}`;
                const now = Date.now();
                let userMsgs = spamStore.get(spamKey) || [];
                userMsgs = userMsgs.filter(time => now - time < 4000); // 4 ثواني فقط! (سفاح)
                userMsgs.push(now);
                spamStore.set(spamKey, userMsgs);
                if (userMsgs.length >= 5) { isViolator = true; actionType = 'spam'; penalty = 'kick'; }
            }

            // ⚡ تنفيذ العقاب ⚡
            if (isViolator) {
                try {
                    let admins = groupAdminsCache.get(from);
                    if (!admins) {
                        const groupMeta = await sock.groupMetadata(from);
                        admins = groupMeta.participants.filter(p => p.admin).map(p => jidNormalizedUser(p.id));
                        groupAdminsCache.set(from, admins);
                        setTimeout(() => groupAdminsCache.delete(from), 60000); 
                    }

                    const isBotAdmin = admins.includes(jidNormalizedUser(selfId));
                    const isSenderAdmin = admins.includes(jidNormalizedUser(sender));

                    if (isBotAdmin && !isSenderAdmin) {
                        const senderNorm = jidNormalizedUser(sender);
                        
                        if (penalty === 'delete' || penalty === 'kick') {
                            await sock.sendMessage(from, { delete: msg.key });
                        }

                        if (penalty === 'kick') {
                            await sock.groupParticipantsUpdate(from, [senderNorm], 'remove');
                            let reason = '';
                            if(actionType === 'link') reason = 'ممنوع نشر الروابط!';
                            else if(actionType === 'bot') reason = 'تم اصطياد بوت دخيل.';
                            else if(actionType === 'spam') reason = 'يمنع الإزعاج (Spam)!';
                            else if(actionType === 'foreign') reason = 'الرقم الأجنبي غير مسموح به هنا!';
                            await sock.sendMessage(from, { text: `🚫 @${senderNorm.split('@')[0]} ${reason}`, mentions: [senderNorm] });
                        } else {
                            // تحذير فقط مع الحذف
                            if(actionType === 'badword') await sock.sendMessage(from, { text: `⚠️ @${senderNorm.split('@')[0]} يمنع الألفاظ الممنوعة!`, mentions: [senderNorm] });
                            else if(actionType === 'forward') await sock.sendMessage(from, { text: `⚠️ @${senderNorm.split('@')[0]} يمنع التوجيه!`, mentions: [senderNorm] });
                            else if(actionType === 'document' || actionType === 'audio' || actionType === 'media') {
                                await sock.sendMessage(from, { text: `⚠️ @${senderNorm.split('@')[0]} هذا النوع من الملفات ممنوع!`, mentions: [senderNorm] });
                            }
                        }
                        return; // 🛑 إيقاف الأوامر والذكاء تماماً إذا تم العقاب
                    }
                } catch (e) { console.error('⚠️ خطأ تنفيذ العقاب:', e.message); }
            }
        }
        // ==========================================

        // 👁️ قناص الحالات 
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

        // 🎯 كاشف التعديل
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

        // 👻 المراقبة الشبحية (كودك الأصلي)
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

        // 👁️‍🗨️ صائد الميديا المخفية 
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const senderInfo = getContactInfo(sender, pushName);
                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${senderInfo.number}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[صائد الميديا المخفية]* 🚨\n👤 *المرسل:* ${senderInfo.name}\n📱 *الرقم:* wa.me/${senderInfo.number}`;
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) {}
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming && !isStatus) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        // ==========================================
        // 🟢🟢 كودك الأساسي للأوامر والذكاء يعمل هنا بسلام 🟢🟢
        // ==========================================
        const isCmd = body.startsWith('.');

        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming && !isStatus && !isGroup) {
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
                }
            } catch (error) {}
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
                if (commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
            }
        }
    });

    return sock;
}

// ==========================================
// 🌐 10. API Endpoints (مدعومة بأزرار الويب الـ 20)
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
    const { sessionId, password, ...newSettings } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });

    // تحديث كافة المتغيرات بضغطة زر
    Object.assign(botSettings[sessionId], newSettings);

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
    console.log(`🚀 سيرفر TARZAN VIP السفاح يعمل بقوة على منفذ ${PORT}`);
    console.log(`=========================================\n`);
});
