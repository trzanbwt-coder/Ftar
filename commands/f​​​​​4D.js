const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');

module.exports = {
    name: 'ocr',
    aliases: ['استخراج', 'سحب_النص', 'نص', 'اقرأ'],
    execute: async ({ sock, msg, reply, from }) => {
        
        const isImage = msg.message?.imageMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedImage = quotedMsg?.imageMessage;

        if (!isImage && !isQuotedImage) {
            return reply('❌ *يرجى الرد على صورة تحتوي على كتابة بكلمة .استخراج*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '👁️', key: msg.key } });
            await reply('⏳ *جاري المسح الضوئي (Scanning) للصورة...*');

            // 1. تحميل الصورة
            const messageToDownload = isImage ? msg : { message: quotedMsg };
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            // 2. رفع الصورة مؤقتاً
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', buffer, 'image.jpg');
            const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders() });
            const imageUrl = uploadRes.data;

            // 3. استخدام API التعرف البصري على الحروف (OCR)
            const ocrApiUrl = `https://api.ocr.space/parse/imageurl?apikey=helloworld&url=${encodeURIComponent(imageUrl)}&language=ara`;
            const response = await axios.get(ocrApiUrl);

            if (!response.data || response.data.IsErroredOnProcessing || !response.data.ParsedResults[0]) {
                throw new Error('لم يتم العثور على نص');
            }

            const extractedText = response.data.ParsedResults[0].ParsedText;

            if (!extractedText || extractedText.trim() === '') {
                return reply('⚠️ *لم أتمكن من قراءة أي نص في هذه الصورة، تأكد من وضوح الخط.*');
            }

            const finalText = `
*• ───── ❨ 👁️ الـمـاسـح الـضـوئـي ❩ ───── •*

📝 *الـنـص الـمـسـتـخـرج:*
${extractedText}

*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*
`.trim();

            await reply(finalText);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الاستخراج:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء فحص الصورة.*');
        }
    }
};
