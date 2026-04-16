const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};
const msgStore = new Map(); 

// ✅ 1. نظام حفظ الإعدادات
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) { botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } 
else { fs.writeFileSync(settingsPath, JSON.stringify(botSettings)); }

function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2)); }
function generateSessionPassword() { return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ✅ 2. إنشاء مجلد الخزنة السرية للميديا (ViewOnce Vault)
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// تنظيف الذاكرة المؤقتة كل ساعتين لمنع ثقل السيرفر
setInterval(() => { msgStore.clear(); console.log('🧹 تم تنظيف الذاكرة المؤقتة للرسائل'); }, 2 * 60 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// 🚀 3. نظام تحميل الأوامر الدقيق (Command Handler)
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
// ⚙️ 4. تشغيل الجلسة والقلب النابض
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    // تهيئة الإعدادات الخاصة بالجلسة الجديدة (مع إضافة مصفوفة الذكاء الاصطناعي)
    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(), 
            botEnabled: true, 
            commandsEnabled: true, 
            autoReact: false, 
            reactEmoji: '❤️', 
            welcomeSent: false,
            aiChats: [] 
        };
        saveSettings();
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, console) },
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        browser: ['Windows', 'Edge', '10.0'], // متصفح مايكروسوفت لتخطي الحظر
        syncFullHistory: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // طلب كود الاقتران الفوري
    if (pairingNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode });
            } catch (err) {
                console.log('❌ خطأ في كود الاقتران:', err);
                if (res && !res.headersSent) res.status(500).json({ error: 'تعذر طلب الكود. تأكد من الرقم وحاول مجدداً.' });
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
            if (shouldReconnect) setTimeout(() => startSession(sessionId), 3000);
            else { delete sessions[sessionId]; fs.rmSync(sessionPath, { recursive: true, force: true }); }
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة!`);
            const selfId = jidNormalizedUser(sock.user.id);
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك (لإعدادات الموقع):*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 🛡️ 5. مضاد الحذف الجبار (Anti-Delete) كامل بدون نقص
    // ==========================================
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 
                    const selfId = jidNormalizedUser(sock.user.id);
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const number = senderJid.split('@')[0];
                    const name = storedMsg.pushName || 'مجهول';
                    const time = moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD");
                    
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n👇 *المحتوى:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {
                    console.error('خطأ في مضاد الحذف:', err);
                }
            }
        }
    });

    // ==========================================
    // 🔥 6. استقبال الرسائل (رادار + ذكاء اصطناعي + أوامر)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = isGroup ? msg.key.participant : from;
        const pushName = msg.pushName || 'مجهول';
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;

        // حفظ الرسالة في الذاكرة لكي يعمل مضاد الحذف
        msgStore.set(`${from}_${msg.key.id}`, msg);

        const currentSettings = botSettings[sessionId] || {};
        if (!currentSettings.botEnabled) return; // توقف تام إذا كان البوت معطل من اللوحة

        // 👁️‍🗨️ [الرادار]: صائد العرض لمرة واحدة التلقائي (كامل بدون نقص)
        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) {
            viewOnceIncoming = { message: msg.message };
        }
        
        if (viewOnceIncoming && !isFromMe) {
            try {
                console.log('👁️‍🗨️ [رادار طرزان]: تم رصد ميديا مخفية! جاري الحفظ...');
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console });

                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`;
                const filePath = path.join(vaultPath, fileName);
                fs.writeFileSync(filePath, buffer);

                const reportTxt = `🚨 *[رادار الميديا المخفية]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* wa.me/${sender.split('@')[0]}\n📁 *حُفظت بالسيرفر باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
                
                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
                }
            } catch (err) {
                console.error('❌ خطأ في الرادار التلقائي:', err);
            }
        }

        // التفاعل التلقائي مع الرسائل (إذا كان مفعلاً)
        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        
        const reply = async (text) => {
            await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        // 🧠 7. نظام الذكاء الاصطناعي التلقائي
        if (!currentSettings.aiChats) currentSettings.aiChats = [];

        // تفعيل وإلغاء الذكاء الاصطناعي
        if (isFromMe) {
            if (body.trim() === '.تفعيل الذكاء') {
                if (!currentSettings.aiChats.includes(from)) {
                    currentSettings.aiChats.push(from);
                    saveSettings();
                }
                return reply('🧠 *تم تفعيل وضع الذكاء الاصطناعي التلقائي!*\nسأقوم الآن بالرد على أي رسالة تُكتب في هذه المحادثة.');
            }
            if (body.trim() === '.تعطيل الذكاء') {
                if (currentSettings.aiChats.includes(from)) {
                    currentSettings.aiChats = currentSettings.aiChats.filter(jid => jid !== from);
                    saveSettings();
                }
                return reply('🛑 *تم تعطيل الذكاء الاصطناعي.* سأعود للاستجابة للأوامر العادية فقط.');
            }
        }

        const isCmd = body.startsWith('.');
        const isAiActive = currentSettings.aiChats.includes(from);

        // إذا كان الذكاء مفعل، سيرد على الرسائل التي ليست أوامر
        if (isAiActive && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming) {
            try {
                await sock.sendPresenceUpdate('composing', from);
                const apiUrl = `https://bk9.fun/ai/gemini?q=${encodeURIComponent(body)}`;
                const aiRes = await axios.get(apiUrl);

                if (aiRes.data && aiRes.data.BK9) {
                    await reply(aiRes.data.BK9);
                } else {
                    const altRes = await axios.get(`https://api.simsimi.net/v2/?text=${encodeURIComponent(body)}&lc=ar`);
                    await reply(altRes.data.success || 'عقلي مشوش قليلاً الآن...');
                }
            } catch (error) {
                console.error('❌ خطأ في الرد التلقائي للذكاء الاصطناعي:', error.message);
            }
            return; // إيقاف البحث عن أوامر أخرى بعد رد الذكاء الاصطناعي
        }

        // 🎯 8. معالجة الأوامر الخارجية (إذا كانت مفعلة)
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
                // إرسال تفاعل التحميل فقط إذا لم تكن الرسالة عرض لمرة واحدة (لمنع الفضح)
                if (!viewOnceIncoming && commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                }
                
                // تمرير كل المتغيرات (مهم جداً لأمر reactwa)
                await commandData.execute({
                    sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix: '.', commandName, sessions
                });
            } catch (error) {
                console.error(`❌ خطأ في تنفيذ الأمر ${commandName}:`, error);
                if (commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
            }
        }
    });

    return sock;
}

// ==========================================
// 🌐 9. API Endpoints (لوحة التحكم بالموقع)
// ==========================================
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    if (sessions[sessionId]) return res.status(400).json({ error: 'الجلسة متصلة بالفعل' });
    startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل اسم الجلسة والرقم' });
    let formattedNumber = number.replace(/[^0-9]/g, '');
    
    // إزالة الجلسة العالقة قبل طلب كود جديد
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
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور الجلسة غير صحيحة' });
    res.json(settings);
});

app.post('/api/settings/save', (req, res) => {
    const { sessionId, password, botEnabled, commandsEnabled, autoReact, reactEmoji } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور غير صحيحة' });
    
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
    saveSettings();
    res.json({ success: true, message: '✅ تم حفظ التعديلات' });
});

app.get('/sessions', (req, res) => { res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) }); });

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة المرور الرئيسية غير صحيحة' });
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; }
    if (botSettings[sessionId]) { delete botSettings[sessionId]; saveSettings(); }
    if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); res.json({ message: `تم حذف ${sessionId}` }); } 
    else { res.status(404).json({ error: 'الجلسة غير موجودة' }); }
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🌐 محرك المتصفح المستخدم: Microsoft Edge (Windows)`);
    console.log(`=========================================\n`);
});
