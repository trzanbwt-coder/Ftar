require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const pino = require('pino'); // مكتبة ضرورية لتسجيل أخطاء Baileys
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = process.env.BOT_PASSWORD || 'tarzanbot';

// ✅ نظام تخزين ذكي لمنع الحذف
const msgStore = new Map();
// تنظيف الذاكرة كل ساعة لمنع انهيار السيرفر
setInterval(() => {
    msgStore.clear();
    console.log('🧹 تم تنظيف ذاكرة التخزين المؤقت للرسائل (Cache Cleared)');
}, 60 * 60 * 1000);

const sessions = {};

// ✅ تحميل الواجهة
app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ✅ تحميل الأوامر بشكل ديناميكي
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const command = require(`./commands/${file}`);
    if (command.name) {
        commands.set(command.name, command);
        console.log(`✅ تم تحميل الأمر: ${command.name}`);
    }
  }
});

// ✅ تشغيل جلسة جديدة
async function startSession(sessionId, res = null) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`استخدام إصدار WA v${version.join('.')}, الأحدث: ${isLatest}`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }), // إخفاء السجلات المزعجة
    printQRInTerminal: false,
    auth: state,
    browser: ['Tarzan Bot', 'Safari', '1.0.0'],
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
        return { conversation: 'رسالة غير متوفرة' };
    }
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // ✅ متابعة حالة الاتصال
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      try {
        const qrData = await qrCode.toDataURL(qr);
        res.json({ qr: qrData });
        res = null; // تفريغ الاستجابة لمنع إرسالها مرتين
      } catch (err) {
        console.error("خطأ في توليد الباركود", err);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ انقطع الاتصال لجلسة ${sessionId}، السبب:`, statusCode);
      
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
          console.log('🔄 جاري إعادة الاتصال...');
          setTimeout(() => startSession(sessionId), 3000);
      } else {
          console.log('🚪 تم تسجيل الخروج. يجب مسح الجلسة وبدء جلسة جديدة.');
          delete sessions[sessionId];
          fs.rmSync(sessionPath, { recursive: true, force: true });
      }
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة بنجاح!`);
      const selfId = jidNormalizedUser(sock.user.id);
      
      await sock.sendMessage(selfId, {
          image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
          caption: `✨ *مرحباً بك في بوت طرزان الواقدي* ✨\n\n✅ تم ربط الرقم وتفعيل البوت بنجاح.\n\n🤖 *البوت الآن يعمل ومستعد لتلقي الأوامر.*\nأرسل *اوامر* لرؤية القائمة.`
      });
    }
  });

  // ✅ نظام الترحيب والمغادرة في الجروبات (ميزة جبارة)
  sock.ev.on('group-participants.update', async (update) => {
      try {
          const { id, participants, action } = update;
          const groupMetadata = await sock.groupMetadata(id);
          const groupName = groupMetadata.subject;

          for (let participant of participants) {
              if (action === 'add') {
                  const welcomeText = `أهلاً بك يا @${participant.split('@')[0]} في مجموعة *${groupName}*! 🎉\nنتمنى لك وقتاً ممتعاً.`;
                  await sock.sendMessage(id, { text: welcomeText, mentions: [participant] });
              } else if (action === 'remove') {
                  const goodbyeText = `وداعاً @${participant.split('@')[0]} 👋\nلقد غادر مجموعة *${groupName}*.`;
                  await sock.sendMessage(id, { text: goodbyeText, mentions: [participant] });
              }
          }
      } catch (err) {
          console.log("خطأ في نظام الترحيب:", err);
      }
  });

  // ✅ منع الحذف المطور (يدعم النصوص والميديا)
  sock.ev.on('messages.update', async updates => {
    for (const { key, update } of updates) {
      if (update?.message === null && key?.remoteJid && !key.fromMe) {
        try {
          const stored = msgStore.get(`${key.remoteJid}_${key.id}`);
          if (!stored?.message) return;

          const selfId = jidNormalizedUser(sock.user.id);
          const senderJid = key.participant || key.remoteJid;
          const number = senderJid?.split('@')[0] || 'مجهول';
          const name = stored.pushName || 'غير معروف';
          const time = moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss");

          const alertMsg = `🚫 *تم اكتشاف رسالة محذوفة!*\n\n👤 *المرسل:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}`;
          
          await sock.sendMessage(selfId, { text: alertMsg });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في نظام منع الحذف:', err.message);
        }
      }
    }
  });

  // ✅ استقبال الرسائل وتنفيذ الأوامر (قلب البوت)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant : from;
    const msgId = msg.key.id;
    
    // حفظ الرسالة في الذاكرة لمنع الحذف
    msgStore.set(`${from}_${msgId}`, msg);

    // استخراج النص بجميع أشكاله
    const text = msg.message.conversation ||
                 msg.message.extendedTextMessage?.text ||
                 msg.message.imageMessage?.caption ||
                 msg.message.videoMessage?.caption || '';

    if (!text) return;

    // قراءة الرسالة تلقائياً (الصحين الأزرق)
    await sock.readMessages([msg.key]);

    const args = text.trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // البحث عن الأمر في الملفات المحملة
    const command = commands.get(commandName);

    if (command) {
        try {
            // محاكاة حالة "يكتب..."
            await sock.sendPresenceUpdate('composing', from);

            // دالة رد سهلة للاستخدام داخل الأوامر
            const reply = async (response) => {
                await sock.sendMessage(from, { text: response }, { quoted: msg });
            };

            // جلب معلومات الجروب إذا كان في جروب
            let groupMetadata = null;
            let groupAdmins = [];
            let isBotAdmin = false;
            let isSenderAdmin = false;

            if (isGroup) {
                groupMetadata = await sock.groupMetadata(from);
                groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);
                isBotAdmin = groupAdmins.includes(jidNormalizedUser(sock.user.id));
                isSenderAdmin = groupAdmins.includes(sender);
            }

            // تنفيذ الأمر مع تمرير كافة المعلومات الهامة
            await command.execute({ 
                sock, msg, from, sender, args, text, reply, 
                isGroup, groupMetadata, isBotAdmin, isSenderAdmin 
            });

        } catch (err) {
            console.error(`❌ خطأ في تنفيذ الأمر ${commandName}:`, err);
            await sock.sendMessage(from, { text: '❌ حدث خطأ أثناء تنفيذ الأمر.' }, { quoted: msg });
        } finally {
            // إيقاف حالة "يكتب..."
            await sock.sendPresenceUpdate('paused', from);
        }
    }
  });

  return sock;
}

// ================= API ENDPOINTS =================

app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

// ✅ طلب كود الاقتران السريع (بدون باركود)
app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  // تنظيف الرقم من أي رموز
  const cleanNumber = number.replace(/[^0-9]/g, '');

  if (!sessions[sessionId]) {
      startSession(sessionId); // بدء جلسة في الخلفية إذا لم تكن موجودة
  }

  setTimeout(async () => {
      try {
        const sock = sessions[sessionId];
        if (!sock) return res.json({ error: 'فشل تهيئة الجلسة' });
        
        const code = await sock.requestPairingCode(cleanNumber);
        res.json({ pairingCode: code });
      } catch (err) {
        console.error('❌ خطأ في رمز الاقتران:', err.message);
        res.json({ error: 'تأكد من الرقم وحاول مجدداً' });
      }
  }, 3000); // الانتظار قليلاً حتى تتهيا الجلسة
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId] && !fs.existsSync(path.join(__dirname, 'sessions', sessionId))) {
      return res.json({ error: 'الجلسة غير موجودة' });
  }

  if (sessions[sessionId]) {
      sessions[sessionId].logout();
      delete sessions[sessionId];
  }
  
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.listen(PORT, () => {
  console.log(`🚀 سيرفر طرزان شغال بنجاح على http://localhost:${PORT}`);
});