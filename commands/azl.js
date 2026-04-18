const axios = require('axios');

module.exports = {
    name: 'instagram',
    aliases: ['انستا', 'انستجرام', 'ig', 'igdl'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        if (!text || !text.includes('instagram.com')) {
            return reply('❌ *يرجى إرسال رابط صحيح من انستجرام.*\n*مثال:* `.انستا https://www.instagram.com/reel/...`');
        }

        try {
            await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
            await reply('⏳ *جاري جلب الوسائط من انستجرام...*');

            const url = text.match(/(https?:\/\/[^\s]+)/)[0];

            // استخدام API تحميل انستجرام
            const apiUrl = `https://api.popcat.xyz/instagram?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl);

            if (!response.data || !response.data.video) throw new Error('فشل التحميل');

            const mediaUrl = response.data.video; // يسحب الفيديو أو الصورة

            await sock.sendMessage(from, { 
                video: { url: mediaUrl }, 
                caption: `*• ───── ❨ 📸 إنـسـتـجـرام ❩ ───── •*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*` 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر انستجرام:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *عذراً، فشل التحميل. قد يكون الحساب خاصاً (Private).*');
        }
    }
};
