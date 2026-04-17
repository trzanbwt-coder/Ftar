const axios = require('axios');

module.exports = {
    name: 'tweet',
    aliases: ['تغريدة', 'تويتر', 'غرد'],
    execute: async ({ sock, msg, text, reply, from, pushName, sender }) => {
        
        if (!text) {
            return reply('❌ *يرجى كتابة النص الذي تريد التغريد به.*\n*مثال:* `.تغريدة أنا ملك الجروب`');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🐦', key: msg.key } });

            const userName = pushName || 'Tarzan User';
            const userHandle = userName.replace(/\s+/g, '_').toLowerCase() + '123'; // صنع يوزر وهمي

            // محاولة جلب الصورة الشخصية
            let profilePicUrl;
            try {
                profilePicUrl = await sock.profilePictureUrl(sender, 'image');
            } catch (err) {
                profilePicUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png'; 
            }

            // استخدام API لتوليد صورة تغريدة احترافية
            const apiUrl = `https://some-random-api.com/canvas/misc/tweet?avatar=${encodeURIComponent(profilePicUrl)}&displayname=${encodeURIComponent(userName)}&username=${encodeURIComponent(userHandle)}&comment=${encodeURIComponent(text)}`;

            // تحميل الصورة
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: `🐦 *تـم نـشـر الـتـغـريـدة بـنـجـاح!*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*` 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر التغريدة:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء تصميم التغريدة، حاول بكلمات أقصر.*');
        }
    }
};
