const axios = require('axios');

module.exports = {
    name: 'ytmp3',
    aliases: ['يوتيوب', 'صوتيات', 'mp3', 'اغنية'],
    execute: async ({ sock, msg, args, text, reply, from }) => {
        
        if (!text || !text.includes('youtu')) {
            return reply('❌ *يرجى إرسال رابط صحيح من اليوتيوب.*\n*مثال:* `.يوتيوب https://youtu.be/...`');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } });
            await reply('⏳ *جاري جلب الملف الصوتي بدقة عالية، يرجى الانتظار...*');

            // استخراج الرابط الأول من النص
            const url = args[0];

            // استخدام API سريع للتحميل (bk9)
            const apiUrl = `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl);

            if (!response.data || !response.data.status || !response.data.BK9 || !response.data.BK9.url) {
                throw new Error('فشل جلب الرابط من السيرفر');
            }

            const downloadUrl = response.data.BK9.url;
            const title = response.data.BK9.title || 'مقطع صوتي';

            // إرسال الملف الصوتي كـ Document (أو Audio)
            await sock.sendMessage(from, { 
                audio: { url: downloadUrl }, 
                mimetype: 'audio/mpeg',
                contextInfo: {
                    externalAdReply: {
                        title: title,
                        body: '𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑 - محمل الصوتيات',
                        mediaType: 1,
                        sourceUrl: url
                    }
                }
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر اليوتيوب:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *عذراً، فشل تحميل المقطع! قد يكون السيرفر مضغوطاً أو الرابط غير مدعوم.*');
        }
    }
};
