const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
    name: 'sticker',
    aliases: ['s', 'ملصق', 'ستيكر'],
    execute: async ({ sock, msg, reply, from }) => {
        // البحث عن رسالة الصورة (سواء تم إرسالها مع الأمر أو الرد عليها)
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgMsg = quotedMsg?.imageMessage || msg.message?.imageMessage;

        if (!imgMsg) {
            await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
            return reply('❌ يرجى إرسال صورة أو الرد على صورة مع كتابة الأمر.');
        }

        try {
            // سحب الصورة
            const stream = await downloadMediaMessage(
                quotedMsg ? { key: msg.message.extendedTextMessage.contextInfo, message: quotedMsg } : msg, 
                'buffer', {}, { logger: console }
            );

            // تحويلها لملصق فخم
            const sticker = new Sticker(stream, { 
                pack: 'TARZAN VIP 👑', 
                author: 'طرزان الواقدي', 
                type: StickerTypes.FULL, 
                quality: 100 
            });

            // إرسال الملصق
            await sock.sendMessage(from, { sticker: await sticker.build() }, { quoted: msg });
            
            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            
        } catch (error) {
            console.error(error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ فشل تحويل الصورة لملصق.');
        }
    }
};
