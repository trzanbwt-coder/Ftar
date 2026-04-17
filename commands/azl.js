const axios = require('axios');

module.exports = {
    name: 'quote',
    aliases: ['اقتباس', 'مقولة', 'مزيف'],
    execute: async ({ sock, msg, text, reply, from, pushName, sender }) => {
        
        if (!text) {
            return reply('❌ *يرجى كتابة المقولة أو النص.*\n*مثال:* `.اقتباس الحياة جميلة يا صديقي`');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🖋️', key: msg.key } });

            const userName = pushName || 'مجهول';
            
            // محاولة جلب الصورة الشخصية للمستخدم (إذا لم يضع صورة، نستخدم صورة افتراضية)
            let profilePicUrl;
            try {
                profilePicUrl = await sock.profilePictureUrl(sender, 'image');
            } catch (err) {
                profilePicUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png'; // صورة شخصية فارغة
            }

            // استخدام API قوي لصنع الاقتباس (يعتمد على تصميم جميل)
            // نمرر النص واسم المستخدم وصورته
            const apiUrl = `https://api.popcat.xyz/quote?font=Cairo&text=${encodeURIComponent(text)}&name=${encodeURIComponent(userName)}&avatar=${encodeURIComponent(profilePicUrl)}`;

            // تحميل الصورة كـ Buffer لضمان الاستقرار
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            // إرسال صورة الاقتباس
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: '*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*'
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في صانع الاقتباسات:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء تصميم الاقتباس، يرجى المحاولة لاحقاً.*');
        }
    }
};
