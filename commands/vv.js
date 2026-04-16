const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: '🌚', // الأمر الأساسي هو الإيموجي
    aliases: ['vv', 'فك'], // يمكن تشغيله أيضاً باستخدام .vv أو .فك
    execute: async ({ sock, msg, reply, from, isFromMe }) => {
        
        // 1. حماية قصوى: يجب أن تكون أنت (صاحب الرقم) من أرسل الأمر
        // إذا قام عضو آخر بكتابة الأمر، سيتجاهله البوت تماماً
        if (!isFromMe) return;

        // 2. التحقق من وجود رسالة مقتبسة (رد على رسالة)
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;

        // إذا لم يكن رداً على شيء، نخرج بصمت تام
        if (!quotedMsg) return; 

        // 3. التحقق من أن الرسالة هي "عرض لمرة واحدة" (View Once)
        const viewOnceMsg = quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2 || quotedMsg.viewOnceMessageV2Extension;
        
        // إذا كانت رسالة عادية، نخرج بصمت
        if (!viewOnceMsg) return; 

        try {
            // 4. وضع تفاعل "قيد التحميل" بصمت في المجموعة
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // 5. فك تشفير الرسالة
            const actualMessage = viewOnceMsg.message;
            const mediaType = Object.keys(actualMessage)[0];
            
            const fakeMsg = { 
                key: { 
                    remoteJid: from, 
                    id: contextInfo.stanzaId, 
                    participant: contextInfo.participant 
                }, 
                message: actualMessage 
            };
            
            const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, { logger: console });
            
            // 6. تحديد رقمك الخاص (الرسائل المحفوظة)
            const selfId = jidNormalizedUser(sock.user.id);
            const captionTxt = '🕵️‍♂️ *تم سحب الميديا بسرية تامة*\n*— TARZAN VIP 👑*';

            // 7. إرسال الوسائط إلى رقمك الخاص فقط
            if (mediaType === 'imageMessage') {
                await sock.sendMessage(selfId, { image: buffer, caption: captionTxt });
            } else if (mediaType === 'videoMessage') {
                await sock.sendMessage(selfId, { video: buffer, caption: captionTxt });
            } else if (mediaType === 'audioMessage') {
                await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            }

            // 8. وضع علامة (صح) في المجموعة لإعلامك بنجاح السحب
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في سحب الميديا:', error);
            // في حال فشل السحب (مثلاً الصورة محذوفة من السيرفر)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        }
    }
};
