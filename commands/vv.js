/**
 * 👑 استخراج الميديا والوسائط المخفية (Anti-View Once)
 * 💻 تطوير وتصميم: طرزان الواقدي
 * ⚙️ الوظيفة: يعمل بمجرد ردك على الميديا بأي كلمة، بدون الحاجة لأمر محدد
 */
const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

const allowedMediaTypes = [
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
];

module.exports = async ({ sock, msg }) => {
  // 1. تحديد رقم الجلسة (المالك / طرزان)
  const sessionOwnerJid = jidNormalizedUser(sock.user.id);
  const sender = msg.key.participant || msg.key.remoteJid;

  // 2. حماية فخمة: يعمل فقط إذا كان الرد صادر منك شخصياً، لتجنب الإزعاج من الأعضاء
  if (sender !== sessionOwnerJid && !msg.key.fromMe) return;

  // 3. جلب الرسالة المقتبسة (التي تم الرد عليها)
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo || !contextInfo.quotedMessage) return; // نخرج بصمت إذا لم يكن هناك رد

  let quoted = contextInfo.quotedMessage;

  // 4. دعم رسائل "العرض لمرة واحدة" (View Once) واختراقها
  const isViewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
  if (isViewOnce) {
      quoted = isViewOnce.message;
  }

  // 5. التحقق من نوع الوسائط المقتبسة
  const mediaType = Object.keys(quoted).find(type => allowedMediaTypes.includes(type));
  
  // إذا كان الرد على رسالة نصية، نخرج بصمت (بدون رسائل خطأ مزعجة)
  if (!mediaType) return;

  try {
    // إعطاء تفاعل قيد التنفيذ للرسالة لإشعارك ببدء العمل
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });

    // 6. تحميل الوسائط
    const mediaBuffer = await downloadMediaMessage(
      { key: contextInfo, message: contextInfo.quotedMessage },
      'buffer',
      {},
      { logger: console }
    );

    // 7. تحضير الرسالة مع توقيع طرزان الواقدي 👑
    const signature = `\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
    let sendMsg = {};

    switch (mediaType) {
      case 'imageMessage':
        sendMsg = { image: mediaBuffer, caption: `*📸 تم سحب الصورة بنجاح*${signature}` };
        break;
      case 'videoMessage':
        sendMsg = { video: mediaBuffer, caption: `*🎥 تم سحب الفيديو بنجاح*${signature}` };
        break;
      case 'audioMessage':
        // تحويل الصوت إلى بصمة صوتية (Voice Note) لزيادة الفخامة
        sendMsg = { audio: mediaBuffer, mimetype: 'audio/mpeg', ptt: true }; 
        break;
      case 'documentMessage':
        sendMsg = {
          document: mediaBuffer,
          mimetype: quoted.documentMessage.mimetype,
          fileName: quoted.documentMessage.fileName || 'Tarzan_Document',
          caption: `*📂 تم سحب الملف*${signature}`
        };
        break;
      case 'stickerMessage':
        sendMsg = { sticker: mediaBuffer }; // الملصقات لا تقبل نصاً وصفياً (Caption)
        break;
    }

    // 8. إرسال الوسائط المستخرجة إلى رقمك فقط
    await sock.sendMessage(sessionOwnerJid, sendMsg);

    // تفاعل بالنجاح لتأكيد الإرسال
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('❌ خطأ في استعادة الوسائط:', error);
    // إشعار بالخطأ في حال فشل التحميل
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
  }
};
