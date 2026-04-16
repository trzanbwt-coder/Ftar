const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    proto,
    generateWAMessageFromContent,
    Browsers // 🌟 [إصلاح هام]: استدعاء المتصفحات الرسمية لكي يقبل واتساب الربط
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};
const msgStore = new Map(); 

// ✅ نظام حفظ الإعدادات لكل جلسة
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) {
    botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} else {
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings));
}

function saveSettings() {
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2));
}

// ✅ توليد باسورد عشوائي للجلسات الجديدة
function generateSessionPassword() {
    return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ✅ تنظيف الذاكرة المؤقتة كل ساعتين لمنع الانهيار
setInterval(() => {
    msgStore.clear();
    console.log('🧹 [نظام الحماية]: تم تنظيف الذاكرة المؤقتة بنجاح.');
}, 2 * 60 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ✅ تحميل الأوامر بطريقة آمنة
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

fs.readdirSync(commandsPath).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const command = require(`./commands/${file}`);
            if (typeof command === 'function' || typeof command.execute === 'function') {
                commands.push(command);
            }
        } catch (err) {
            console.error(`❌ خطأ في تحميل الأمر ${file}:`, err.message);
        }
    }
});

// ✅ دالة تشغيل الجلسة (مدمج معها نظام الربط بالكود)
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    // إعدادات افتراضية فخمة للجلسة الجديدة
    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(),
            botEnabled: true,      
            commandsEnabled: true, 
            autoReact: false,      
            reactEmoji: '❤️',
            welcomeSent: false     
        };
        saveSettings();
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        // 🌟 [الإصلاح الجذري]: استخدام متصفح رسمي لكي يصل إشعار كود الاقتران فوراً
        browser: Browsers.ubuntu('Chrome') 
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // 🌟 [نظام طلب كود الاقتران السريع]
    if (pairingNumber && !sock.authState.creds.registered) {
        console.log(`⏳ جاري طلب كود الاقتران للرقم: ${pairingNumber}...`);
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                // تنسيق الكود ليكون 1234-5678 (للفخامة)
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`🔑 كود الاقتران: ${formattedCode}`);
                if (res && !res.headersSent) {
                    res.json({ pairingCode: formattedCode });
                }
            } catch (err) {
                console.error('❌ خطأ في طلب الكود:', err.message);
                if (res && !res.headersSent) {
                    res.status(500).json({ error: 'تعذر طلب الكود. تأكد من الرقم وافتح واتساب ثم حاول مجدداً.' });
                }
            }
        }, 3000); // ننتظر 3 ثواني لتكتمل تهيئة الاتصال
    }

    // 🌟 متابعة حالة الاتصال والـ QR
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // إذا كان الطلب للباركود (QR) وليس كود اقتران
        if (qr && res && !pairingNumber) {
            try {
                const qrData = await qrCode.toDataURL(qr);
                if(!res.headersSent) res.json({ qr: qrData });
            } catch(e){}
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log(`🔄 جاري إعادة الاتصال بالجلسة ${sessionId}...`);
                setTimeout(() => startSession(sessionId), 3000);
            } else {
                console.log(`❌ تم تسجيل الخروج من الجلسة ${sessionId}`);
                delete sessions[sessionId];
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة بامتياز!`);
            const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | متصل ✨`); } catch (e) {}

            // إرسال رسالة الترحيب لمرة واحدة فقط للرقم المربوط
            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح! البوت يعمل الآن.*\n\n🔐 *بيانات الجلسة السرية الخاصة بك:*\n👤 *معرف الجلسة:* ${sessionId}\n🔑 *كلمة المرور:* ${botSettings[sessionId].password}\n\n⚠️ *ملاحظة هامة:* احتفظ بكلمة المرور للدخول إلى لوحة التحكم لتفعيل وإيقاف البوت أو تغيير الإعدادات.\n\n🛡️ _تم تفعيل نظام الحماية ومنع الحذف_\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                
                await sock.sendMessage(selfId, { 
                    image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, 
                    caption: welcomeText 
                });

                botSettings[sessionId].welcomeSent = true;
                saveSettings();
            }
        }
    });

    // 🌟 نظام منع الحذف الجبار (Anti-Delete V2)
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 

                    const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const number = senderJid.split('@')[0];
                    const name = storedMsg.pushName || 'غير معروف';
                    const time = moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss");

                    const alertText = `🚫 *[نظام المراقبة - رسالة محذوفة]* 🚫\n\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n\n👇 *محتوى الرسالة المحذوفة بالأسفل:*`;
                    
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return; 

        const from = msg.key.remoteJid;
        msgStore.set(`${from}_${msg.key.id}`, msg);

        const currentSettings = botSettings[sessionId];
        
        // 🛑 التحقق من أزرار الإيقاف والتشغيل
        if (!currentSettings || !currentSettings.botEnabled) return;

        if (currentSettings.autoReact) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

        const reply = async (messageText) => {
            await sock.sendPresenceUpdate('composing', from);
            await new Promise(resolve => setTimeout(resolve, 1000)); 
            return await sock.sendMessage(from, { text: messageText }, { quoted: msg });
        };

        if (!currentSettings.commandsEnabled) return;

        // القائمة المنسدلة
        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';

        if (text.toLowerCase() === 'tarzan' || text === 'الاوامر' || text === '.menu') {
            const listMessage = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({ text: "✨ *قائمة خدمات طرزان VIP* ✨\nيرجى اختيار القسم الذي تريده 👇" }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: "🤖 طرزان الواقدي" }),
                            header: proto.Message.InteractiveMessage.Header.create({ title: "📋 *القائمة الرئيسية*", subtitle: "التحكم الكامل", hasMediaAttachment: false }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [{
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "📋 عرض الأقسام",
                                        sections: [
                                            { title: "🌟 الأقسام الرئيسية", rows: [
                                                { header: "الذكاء الاصطناعي", title: "🤖 قسم الذكاء الاصطناعي", id: "menu_ai" },
                                                { header: "التحميلات", title: "📥 قسم التحميلات", id: "menu_downloads" },
                                                { header: "الأدوات", title: "🛠️ أدوات النظام", id: "menu_tools" }
                                            ]}
                                        ]
                                    })
                                }]
                            })
                        })
                    }
                }
            };
            const interactiveMsg = generateWAMessageFromContent(from, listMessage, { quoted: msg });
            await sock.relayMessage(from, interactiveMsg.message, { messageId: interactiveMsg.key.id });
            return;
        }

        if (selectedId === 'menu_ai') await reply("🤖 *قسم الذكاء الاصطناعي*\nقريباً...");
        else if (selectedId === 'menu_downloads') await reply("📥 *قسم التحميلات*\nقريباً...");
        else if (selectedId === 'menu_tools') await reply("🛠️ *أدوات النظام*\nلدمج إيموجيين أرسل: `mix 🐢 🚀`");

        for (const command of commands) {
            try {
                if (typeof command === 'function') await command({ sock, msg, text, reply, from });
                else if (typeof command.execute === 'function') await command.execute({ sock, msg, text, reply, from });
            } catch (err) {}
        }
    });

    return sock;
}

// ==========================================
// 🌐 API Endpoints
// ==========================================

// ✅ طلب الباركود
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    if (sessions[sessionId]) return res.status(400).json({ error: 'الجلسة متصلة بالفعل' });
    startSession(sessionId, res);
});

// ✅ طلب كود الاقتران (تمت إعادة بناء النظام بالكامل هنا)
app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل اسم الجلسة والرقم' });
    
    let formattedNumber = number.replace(/[^0-9]/g, '');

    // إذا كانت الجلسة موجودة مسبقاً يجب حذفها لبدء عملية ربط نظيفة
    if (sessions[sessionId] || fs.existsSync(path.join(__dirname, 'sessions', sessionId))) {
        if(sessions[sessionId]) sessions[sessionId].logout();
        delete sessions[sessionId];
        fs.rmSync(path.join(__dirname, 'sessions', sessionId), { recursive: true, force: true });
    }

    // تشغيل الجلسة مع إرسال الرقم المخصص للربط
    startSession(sessionId, res, formattedNumber);
});

// بقية مسارات الـ API (لم تتغير، وتعمل بامتياز)
app.post('/api/settings/get', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور الجلسة غير صحيحة ❌' });
    res.json(settings);
});

app.post('/api/settings/save', (req, res) => {
    const { sessionId, password, botEnabled, commandsEnabled, autoReact, reactEmoji } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور الجلسة غير صحيحة ❌' });
    
    botSettings[sessionId].botEnabled = !!botEnabled;
    botSettings[sessionId].commandsEnabled = !!commandsEnabled;
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
    saveSettings();
    res.json({ success: true, message: '✅ تم حفظ التعديلات بنجاح' });
});

app.get('/sessions', (req, res) => {
    res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) });
});

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة المرور الرئيسية غير صحيحة' });
    
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) {
        sessions[sessionId].logout();
        delete sessions[sessionId];
    }
    if (botSettings[sessionId]) {
        delete botSettings[sessionId];
        saveSettings();
    }
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        res.json({ message: `✅ تم حذف ${sessionId} بنجاح` });
    } else {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر شغال بامتياز على المنفذ: ${PORT}`);
});
