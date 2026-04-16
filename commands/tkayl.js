module.exports = {
    name: 'تخيل',
    aliases: ['imagine', 'ارسم', 'رسم'],
    execute: async ({ sock, msg, text, reply, from }) => {
        if (!text) {
            return reply('❌ *يرجى كتابة وصف للصورة!*\n*مثال:* `.تخيل سيارة رياضية في شوارع طوكيو ليلاً`');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            await reply('⏳ *جاري رسم خيالك...*');

            // استخدام API مجاني وسريع جداً (Pollinations AI)
            const prompt = encodeURIComponent(text);
            const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true`;

            const caption = `🎨 *الوصف:* ${text}\n\n*— TARZAN VIP AI 🤖*`;

            // إرسال الصورة بجودة عالية
            await sock.sendMessage(from, { 
                image: { url: imageUrl }, 
                caption: caption 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        } catch (error) {
            console.error('❌ خطأ في أمر التخيل:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء توليد الصورة.*');
        }
    }
};
