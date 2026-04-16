const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: '🌚', 
    aliases: ['vv', 'فك', 'استخراج'], 
    execute: async ({ sock, msg, from, isFromMe }) => {
        
        // 1. الحماية: يعمل فقط من رقمك أنت
        if (!isFromMe) return;

        // 2. التحقق من الرد على رسالة (بصمت)
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo || !contextInfo.quotedMessage) return;

        const quotedMsg = contextInfo.quotedMessage;

        // 3. البحث العميق عن الميديا (Deep Scan)
        let innerMessage = quotedMsg;
        let isViewOnce = false;

        if (quotedMsg.viewOnceMessage) {
            innerMessage = quotedMsg.viewOnceMessage.message;
            isViewOnce = true;
        } else if (quotedMsg.viewOnceMessageV2) {
            innerMessage = quotedMsg.viewOnceMessageV2.message;
            isViewOnce = true;
        } else if (quotedMsg.viewOnceMessageV2Extension) {
            innerMessage = quotedMsg.viewOnceMessageV2Extension.message;
            isViewOnce = true;
        }

        const mediaType = Object.keys(innerMessage)[0];

        if (innerMessage[mediaType]?.viewOnce === true) {
            isViewOnce = true;
        }

        // خروج بصمت تام إذا لم تكن الرسالة عرض لمرة واحدة (بدون أي رسالة تحذير)
        if (!isViewOnce) return;

        try {
            // 4. بناء كائن التحميل بشكل يطابق بروتوكول واتساب
            const fakeMsg = {
                key: {
                    remoteJid: from,
                    id: contextInfo.stanzaId, 
                    participant: contextInfo.participant 
                },
                message: innerMessage 
            };

            // 5. سحب الميديا من سيرفرات واتساب
            const mediaBuffer = await downloadMediaMessage(
                fakeMsg,
                'buffer',
                {},
                { logger: console }
            );

            // 6. تحديد وجهة الإرسال (رقمك الخاص فقط للسرية)
            const selfId = jidNormalizedUser(sock.user.id);
            const captionText = '🕵️‍♂️ *تم سحب الميديا بسرية تامة*\n*— TARZAN VIP 👑*';

            // 7. الإرسال السري لخاصك (دون أي تفاعل أو علامة صح في المحادثة الأصلية)
            if (mediaType === 'imageMessage') {
                await sock.sendMessage(selfId, { image: mediaBuffer, caption: captionText });
            } else if (mediaType === 'videoMessage') {
                await sock.sendMessage(selfId, { video: mediaBuffer, caption: captionText });
            } else if (mediaType === 'audioMessage') {
                await sock.sendMessage(selfId, { audio: mediaBuffer, mimetype: 'audio/mpeg', ptt: true });
            }

        } catch (err) {
            console.error('❌ خطأ في السحب اليدوي:', err);
            // خروج بصمت تام عند الخطأ لعدم لفت الانتباه في المجموعة
        }
    }
};
