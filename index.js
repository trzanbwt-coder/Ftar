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
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = 'tarzanbot';
const sessions = {};
const msgStore = new Map(); 

// ✅ نظام حفظ الإعدادات لكل جلسة (التفاعل التلقائي والإيموجي)
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

// تنظيف الذاكرة المؤقتة كل ساعتين
setInterval(() => {
    msgStore.clear();
    console.log('🧹 [نظام الحماية]: تم تنظيف الذاكرة المؤقتة.');
}, 2 * 60 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

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
        } catch (err) {}
    }
});

// ✅ دالة تشغيل الجلسة
async function startSession(sessionId, res = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    // إعدادات افتراضية للجلسة الجديدة إذا لم تكن موجودة
    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { autoReact: false, reactEmoji: '❤️' };
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
        browser: ['Tarzan VIP', 'Safari', '3.0']
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr && res) {
            try {
                const qrData = await qrCode.toDataURL(qr);
                if(!res.headersSent) res.json({ qr: qrData });
            } catch(e){}
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
            console.log(`✅ الجلسة ${sessionId} متصلة!`);
            const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | متصل ✨`); } catch (e) {}
        }
    });

    // ميزة منع الحذف
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 
                    const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
                    const number = (key.participant || storedMsg.key?.participant || key.remoteJid).split('@')[0];
                    const name = storedMsg.pushName || 'غير معروف';
                    await sock.sendMessage(selfId, { text: `🚫 *[رسالة محذوفة]*\n👤 *من:* ${name} (${number})` });
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

        // 🌟 ميزة التفاعل التلقائي (Auto-React)
        const sessionSettings = botSettings[sessionId];
        if (sessionSettings && sessionSettings.autoReact) {
            try {
                await sock.sendMessage(from, { 
                    react: { text: sessionSettings.reactEmoji || '❤️', key: msg.key } 
                });
            } catch(e) { console.log('خطأ في التفاعل التلقائي'); }
        }

        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';

        const reply = async (messageText) => {
            await sock.sendPresenceUpdate('composing', from);
            await new Promise(resolve => setTimeout(resolve, 1000)); 
            await sock.sendMessage(from, { text: messageText }, { quoted: msg });
        };

        // القائمة المنسدلة
        if (text.toLowerCase() === 'tarzan' || text === 'الاوامر') {
            const listMessage = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({ text: "✨ *قائمة خدمات طرزان VIP* ✨" }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: "🤖 طرزان الواقدي" }),
                            header: proto.Message.InteractiveMessage.Header.create({ title: "📋 *القائمة الرئيسية*", subtitle: "اختر قسمك", hasMediaAttachment: false }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [{
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "📋 افتح القائمة",
                                        sections: [
                                            { title: "🌟 الأقسام", rows: [
                                                { header: "الذكاء الاصطناعي", title: "🤖 الذكاء الاصطناعي", id: "menu_ai" },
                                                { header: "التحميلات", title: "📥 التحميلات", id: "menu_downloads" }
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

        if (selectedId === 'menu_ai') await reply("🤖 *قسم الذكاء الاصطناعي*\nأرسل `.ai مرحبا`");
        else if (selectedId === 'menu_downloads') await reply("📥 *قسم التحميلات*\nأرسل `.dl [الرابط]`");

        for (const command of commands) {
            try {
                if (typeof command === 'function') await command({ text, reply, sock, msg, from });
                else if (typeof command.execute === 'function') await command.execute({ text, reply, sock, msg, from });
            } catch (err) {}
        }
    });

    return sock;
}

// ==========================================
// 🌐 API Endpoints
// ==========================================

// إنشاء جلسة (بدون باسورد للواجهة)
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    if (sessions[sessionId]) return res.status(400).json({ error: 'الجلسة متصلة بالفعل' });
    startSession(sessionId, res);
});

// ✅ كود الاقتران المحسن
app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل اسم الجلسة والرقم' });
    
    let sock = sessions[sessionId];
    if (!sock) {
        sock = await startSession(sessionId);
    }

    // الانتظار قليلاً حتى يتم تهيئة البوت ثم طلب الكود
    setTimeout(async () => {
        try {
            let formattedNumber = number.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(formattedNumber);
            res.json({ pairingCode: code });
        } catch (err) {
            console.error('Pairing Error:', err);
            res.status(500).json({ error: 'فشل توليد الكود. تأكد من الرقم.' });
        }
    }, 4000);
});

// إدارة الإعدادات للجلسات
app.get('/api/settings/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    res.json(botSettings[sessionId] || { autoReact: false, reactEmoji: '❤️' });
});

app.post('/api/settings/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { autoReact, reactEmoji } = req.body;
    
    if (!botSettings[sessionId]) botSettings[sessionId] = {};
    botSettings[sessionId].autoReact = !!autoReact;
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️';
    
    saveSettings();
    res.json({ success: true, message: '✅ تم حفظ الإعدادات بنجاح' });
});

app.get('/sessions', (req, res) => {
    res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) });
});

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== PASSWORD) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    
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
