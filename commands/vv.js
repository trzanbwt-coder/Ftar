/**
 * 👑 أمر استخراج الميديا الفوري (VIP)
 * ⚙️ الوظيفة: الرد على أي ميديا بـ نقطة (.) متبوعة بأي شيء لسحبها فوراً
 */
const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

const allowedMediaTypes = [
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
];

module.exports = async ({ sock, msg, text, from }) => {
  // 1. التفعيل الذكي: التحقق من أن الرسالة تبدأ بنقطة (.) فقط
  // سواء كانت (.) أو (.سحب) أو (.😂) سيعمل الكود
  if (!text || !text.startsWith('.')) return;

  // 2. حماية قصوى: يجب أن تكون أنت (صاحب البوت) من أرسل الأمر
  const sessionOwnerJid = jidNormalizedUser(sock.user.id);
  const sender = msg.key.participant || msg.key.remoteJid;
  const isFromMe = msg.key.fromMe || sender === sessionOwnerJid;
  
  if (!isFromMe) return; 

  // 3. التحقق من وجود رسالة مقتبسة (رد على رسالة)
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  let quoted = contextInfo?.quotedMessage;

  // إذا لم يكن رداً على شيء، نخرج بصمت (حتى لا يتعارض مع أوامرك الأخرى)
  if (!quoted) return;

  // 4. فك تشفير رسائل العرض لمرة واحدة (View Once)
  const isViewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
  if (isViewOnce) {
      quoted = isViewOnce.message;
  }

  // 5. التحقق من نوع الوسائط المقتبسة
  const mediaType = Object.keys(quoted).find(type => allowedMediaTypes.includes(type));
  
  // إذا لم تكن ميديا (مثلاً رد على نص عادي)، نخرج بصمت وبدون أخطاء
  if (!mediaType) return;

  try {
    // تفاعل لإثبات أن البوت استلم الأمر وبدأ السحب
    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

    // 6. بناء مفتاح الرسالة الوهمي بشكل صحيح لمكتبة Baileys
    const fakeMessage = {
        key: {
            remoteJid: from,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
        },
        message: quoted
    };

    // 7. سحب وتحميل الميديا من سيرفرات واتساب
    const mediaBuffer = await downloadMediaMessage(
      fakeMessage,
      'buffer',
      {},
      { logger: console }
    );

    // 8. تحضير الرسالة مع توقيع فخم
    const captionText = '✅ *تم سحب الوسائط بنجاح*\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 👑*';
    let sendMsg = {};

    switch (mediaType) {
      case 'imageMessage':
        sendMsg = { image: mediaBuffer, caption: captionText };
        break;
      case 'videoMessage':
        sendMsg = { video: mediaBuffer, caption: captionText };
        break;
      case 'audioMessage':
        sendMsg = { audio: mediaBuffer, mimetype: 'audio/mpeg', ptt: true };
        break;
      case 'documentMessage':
        sendMsg = {
          document: mediaBuffer,
          mimetype: quoted.documentMessage.mimetype,
          fileName: quoted.documentMessage.fileName || 'Tarzan_VIP_File',
          caption: captionText
        };
        break;
      case 'stickerMessage':
        sendMsg = { sticker: mediaBuffer };
        break;
    }

    // 9. إرسال الوسائط إلى رقم الجلسة فقط (في الخاص بك)
    await sock.sendMessage(sessionOwnerJid, sendMsg);

    // تفاعل بالنجاح في المحادثة الأصلية
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('❌ خطأ في استعادة الوسائط:', error.message);
    // تفاعل بالخطأ في حال فشل السحب
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
  }
};
