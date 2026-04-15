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
    proto, // تم استدعاء هذه الميزة لصنع القوائم المنسدلة
    generateWAMessageFromContent // لتوليد رسائل تفاعلية فخمة
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = 'tarzanbot';
const sessions = {};
const msgStore = new Map(); 

// ✅ تنظيف الذاكرة المؤقتة كل ساعتين لمنع انهيار السيرفر
setInterval(() => {
    msgStore.clear();
    console.log('🧹 [نظام الحماية]: تم تنظيف ذاكرة الرسائل المؤقتة بنجاح.');
}, 2 * 60 * 60 * 1000);

// ✅ إعداد واجهة الويب
app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ✅ تحميل الأوامر
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
            console.error(`❌ خطأ في تحميل الملف ${file}:`, err.message);
        }
    }
});

// ✅ دالة تشغيل الجلسة
async function startSession(sessionId, res = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

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
        browser: ['Tarzan Bot VIP', 'Safari', '3.0'] 
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // ✅ متابعة حالة الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr && res) {
            const qrData = await qrCode.toDataURL(qr);
            res.json({ qr: qrData });
            res = null; 
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(() => startSession(sessionId), 3000);
            } else {
                delete sessions[sessionId];
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }

        if (connection === 'open') {
            console.log(`✅ [نجاح]: الجلسة ${sessionId} متصلة الآن وجاهزة!`);
            const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي | يعمل الآن ✨`); } catch (e) {}

            const welcomeMsg = `✨ *مرحباً بك في بوت طرزان الواقدي VIP* ✨\n\n✅ *حالة النظام:* متصل بنجاح\n⚡ *لإظهار القائمة المنسدلة:* أرسل كلمة *tarzan*\n\n🤖 *طرزان الواقدي - الذكاء الاصطناعي* ⚔️`;
            await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeMsg });
        }
    });

    // ✅ ميزة منع الحذف
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 

                    const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
                    const number = (key.participant || storedMsg.key?.participant || key.remoteJid).split('@')[0];
                    const name = storedMsg.pushName || 'غير معروف';
                    const time = moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss");

                    await sock.sendMessage(selfId, { text: `🚫 *[رسالة محذوفة]* 🚫\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}` });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ✅ استقبال الرسائل وتنفيذ الأوامر والقوائم المنسدلة
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return; 

        const from = msg.key.remoteJid;
        msgStore.set(`${from}_${msg.key.id}`, msg);

        // استخراج النص أو معرف القائمة المنسدلة
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        let selectedId = '';

        // التقاط استجابة المستخدم من القائمة المنسدلة (إذا اختار شيء)
        if (msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
            const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            selectedId = params.id;
        }

        const reply = async (messageText) => {
            await sock.sendPresenceUpdate('composing', from);
            await new Promise(resolve => setTimeout(resolve, 1000)); 
            await sock.sendMessage(from, { text: messageText }, { quoted: msg });
        };

        // 🌟 بناء القائمة المنسدلة الفخمة (تعمل عند إرسال tarzan)
        if (text.toLowerCase() === 'tarzan' || text === 'الاوامر' || text === 'القائمة') {
            const listMessage = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({
                                text: "✨ *مرحباً بك في قائمة خدمات طرزان VIP* ✨\n\nيُرجى الضغط على الزر بالأسفل لفتح القائمة المنسدلة واختيار الخدمة التي تريدها بكل سهولة 👇"
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️"
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: "📋 *القائمة الرئيسية للخدمات*",
                                subtitle: "اختر قسمك",
                                hasMediaAttachment: false
                            }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [{
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "📋 افتح القائمة من هنا",
                                        sections: [
                                            {
                                                title: "🌟 الأقسام الرئيسية المتاحة",
                                                highlight_label: "موصى به 🔥",
                                                rows: [
                                                    { header: "الذكاء الاصطناعي", title: "🤖 قسم الذكاء الاصطناعي", description: "محادثة، توليد صور، وتعديل نصوص", id: "menu_ai" },
                                                    { header: "التحميلات", title: "📥 قسم التحميلات", description: "تحميل من يوتيوب، تيك توك، إنستغرام", id: "menu_downloads" },
                                                    { header: "الألعاب", title: "🎮 قسم الألعاب", description: "ألعاب تفاعلية ومسابقات ذكية", id: "menu_games" },
                                                    { header: "الأدوات", title: "🛠️ أدوات النظام", description: "حماية المجموعات وأدوات إضافية", id: "menu_tools" },
                                                    { header: "الدعم الفني", title: "📞 تواصل مع المطور", description: "لتقديم شكوى أو اقتراح للمطور", id: "menu_support" }
                                                ]
                                            }
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

        // 🌟 التعامل مع اختيارات القائمة المنسدلة
        if (selectedId) {
            if (selectedId === 'menu_ai') {
                await reply("🤖 *قسم الذكاء الاصطناعي*\n\nللتحدث مع الذكاء الاصطناعي أرسل:\n`.ai مرحبا`\n\nلتوليد صورة أرسل:\n`.image سيارة تطير`");
            } else if (selectedId === 'menu_downloads') {
                await reply("📥 *قسم التحميلات*\n\nلتحميل فيديو أرسل الرابط هكذا:\n`.dl [الرابط]`");
            } else if (selectedId === 'menu_games') {
                await reply("🎮 *قسم الألعاب*\n\nالقسم قيد التطوير حالياً، انتظر التحديثات القادمة!");
            } else if (selectedId === 'menu_tools') {
                await reply("🛠️ *أدوات النظام*\n\nلتحويل صورة إلى ملصق أرسل الصورة مع كتابة:\n`.sticker`");
            } else if (selectedId === 'menu_support') {
                await reply("📞 *الدعم الفني*\n\nللتواصل مع المطور (طرزان الواقدي)، يرجى إرسال رسالتك متبوعة بكلمة `.dev` وسيقوم بالرد عليك بأقرب وقت.");
            }
            // يمكنك تمرير selectedId إلى ملفات commands أيضاً إذا أردت مستقبلاً
            return;
        }

        // تنفيذ الأوامر العادية الموجودة في مجلد commands
        for (const command of commands) {
            try {
                if (typeof command === 'function') await command({ text, reply, sock, msg, from });
                else if (typeof command.execute === 'function') await command.execute({ text, reply, sock, msg, from });
            } catch (err) {
                console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
            }
        }
    });

    return sock;
}

// ==========================================
// 🌐 API Endpoints (لا تغيير عليها لتظل متوافقة)
// ==========================================

app.post('/create-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
    if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
    if (sessions[sessionId]) return res.json({ error: 'الجلسة متصلة بالفعل' });
    startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });
    let sock = sessions[sessionId];
    if (!sock) sock = await startSession(sessionId);

    try {
        setTimeout(async () => {
            try {
                let formattedNumber = number.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(formattedNumber);
                res.json({ pairingCode: code });
            } catch (err) {
                res.json({ error: 'تعذر توليد كود الاقتران، تأكد من الرقم وافتح واتساب.' });
            }
        }, 3000);
    } catch (err) {
        res.json({ error: 'فشل في توليد رمز الاقتران' });
    }
});

app.get('/sessions', (req, res) => {
    res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) });
});

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
    
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) {
        sessions[sessionId].logout();
        delete sessions[sessionId];
    }
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        res.json({ message: `✅ تم حذف الجلسة ${sessionId} بنجاح` });
    } else {
        res.json({ error: 'الجلسة غير موجودة' });
    }
});

app.listen(PORT, () => {
    console.log('\n=========================================');
    console.log(`🚀 السيرفر شغال بامتياز على المنفذ: ${PORT}`);
    console.log('=========================================\n');
});
