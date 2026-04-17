const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');

module.exports = {
    name: 'rmbg',
    aliases: ['عزل', 'تفريغ', 'قص'],
    execute: async ({ sock, msg, reply, from }) => {
        
        // التحقق من وجود صورة (سواء مرفقة أو تم الرد عليها)
        const isImage = msg.message?.imageMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedImage = quotedMsg?.imageMessage;

        if (!isImage && !isQuotedImage) {
            return reply('❌ *يرجى إرسال صورة مع الأمر، أو الرد على صورة بكلمة .عزل*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '✂️', key: msg.key } });
            await reply('⏳ *جاري تفريغ الصورة بدقة عالية، يرجى الانتظار قليلاً...*');

            // 1. تحميل الصورة من الواتساب
            const messageToDownload = isImage ? msg : { message: quotedMsg };
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            // 2. رفع الصورة مؤقتاً لسيرفر Catbox لكي يقرأها الذكاء الاصطناعي
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', buffer, 'image.jpg');

            const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: form.getHeaders()
            });
            const imageUrl = uploadRes.data;

            // 3. رابط سيرفر العزل
            const removeBgApi = `https://api.ryzendesu.vip/api/image/remove-bg?url=${encodeURIComponent(imageUrl)}`;
            
            // 4. [الإصلاح الجذري] تحميل الصورة المفرغة كـ Buffer لمنع تلفها في الواتساب
            const bgResponse = await axios.get(removeBgApi, { responseType: 'arraybuffer' });
            const finalImageBuffer = Buffer.from(bgResponse.data, 'binary');

            // 5. إرسال النتيجة كـ "ملف" (Document) للحفاظ على الخلفية الشفافة والدقة العالية
            await sock.sendMessage(from, { 
                document: finalImageBuffer, 
                mimetype: 'image/png',
                fileName: 'Tarzan_RemoveBG.png', // اسم الملف
                caption: '✂️ *تم تفريغ الصورة بنجاح!*\n💡 *ملاحظة:* تم إرسالها كملف للحفاظ على دقتها العالية وخلفيتها الشفافة.\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*'
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر العزل:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشل تفريغ الصورة! قد يكون السيرفر عليه ضغط، أو أن الصورة لا تحتوي على عنصر واضح لعزله.*');
        }
    }
};
