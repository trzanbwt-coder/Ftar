const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: '🌚', 
    aliases: ['vv', 'فك', 'استخراج'], // يمكن تشغيله بأي من هذه الكلمات
    execute: async ({ sock, msg, reply, from, isFromMe }) => {
        
        // 1. حماية قصوى: الأمر لن يعمل إلا إذا كنت أنت (صاحب البوت) من أرسله
        if (!isFromMe) return;

        // 2. التحقق من أنك قمت بالرد على رسالة
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo || !contextInfo.quotedMessage) return;

        const quotedMsg = contextInfo.quotedMessage;

        // 3. التحقق من أن الرسالة هي "عرض لمرة واحدة" بجميع إصدارات واتساب الجديدة
        const viewOnce = quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2 || quotedMsg.viewOnceMessageV2Extension;
        
        if (!viewOnce) {
            return reply('⚠️ هذه الرسالة عادية وليست "عرض لمرة واحدة".');
        }

        try {
            // 5. استخراج الرسالة الحقيقية من داخل غلاف ViewOnce
            const actualMessage = viewOnce.message;
            const mediaType = Object.keys(actualMessage)[0];

            // 6. [الخطوة الأهم] بناء كائن الرسالة بشكل صحيح لتجاوز حظر التحميل
            const fakeMsg = {
                key: {
                    remoteJid: from,
                    id: contextInfo.stanzaId, 
                    participant: contextInfo.participant 
                },
                message: actualMessage
            };

            // 7. سحب الميديا من سيرفرات واتساب
            const mediaBuffer = await downloadMediaMessage(
                fakeMsg,
                'buffer',
                {},
                { logger: console }
            );

            // 8. تحديد وجهة الإرسال (رقمك أنت فقط لضمان السرية)
            const selfId = jidNormalizedUser(sock.user.id);
            const captionText = '🕵️‍♂️ *تم سحب الميديا يدوياً بنجاح*\n*— TARZAN VIP 👑*';

            // 9. إرسال الوسائط إلى رسائلك المحفوظة
            if (mediaType === 'imageMessage') {
                await sock.sendMessage(selfId, { image: mediaBuffer, caption: captionText });
            } else if (mediaType === 'videoMessage') {
                await sock.sendMessage(selfId, { video: mediaBuffer, caption: captionText });
            } else if (mediaType === 'audioMessage') {
                await sock.sendMessage(selfId, { audio: mediaBuffer, mimetype: 'audio/mpeg', ptt: true });
            }

        } catch (err) {
            console.error('❌ خطأ في السحب اليدوي:', err);
        }
    }
};
