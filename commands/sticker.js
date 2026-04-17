const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, createSticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
    name: 'sticker',
    aliases: ['s', 'ستيكر', 'ملصق'],
    execute: async ({ sock, msg, reply, from }) => {
        
        // التحقق مما إذا كانت الرسالة الحالية تحتوي على ميديا، أو إذا تم الرد على رسالة بها ميديا
        const isMedia = msg.message?.imageMessage || msg.message?.videoMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedMedia = quotedMsg?.imageMessage || quotedMsg?.videoMessage;

        if (!isMedia && !isQuotedMedia) {
            return reply('❌ *يرجى إرسال صورة أو فيديو مع الأمر، أو الرد على صورة/فيديو بالأمر.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // تحديد الرسالة التي سيتم تحميل الميديا منها
            const messageToDownload = isMedia ? msg : { message: quotedMsg };
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            // تحويل الميديا إلى ملصق باستخدام حزمة wa-sticker-formatter
            const sticker = new Sticker(buffer, {
                pack: 'Tarzan VIP 👑', // اسم الحزمة
                author: 'طرزان بوت', // اسم الصانع
                type: StickerTypes.FULL, // نوع الملصق (كامل)
                quality: 50 // جودة الملصق
            });

            await sticker.build();
            const stickerBuffer = await sticker.get();

            // إرسال الملصق
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في صانع الملصقات:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء صنع الملصق. قد يكون حجم الفيديو كبيراً جداً.*');
        }
    }
};
