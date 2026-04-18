const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    name: 'video',
    aliases: ['فيديو', 'يوتيوب', 'yt', 'ytv', 'شيلة', 'شيله'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        // التحقق من وجود كلمة للبحث
        if (!text) {
            return reply('❌ *مـاذا تـريـد أن تـحـمـل؟*\n*مـثـال:* `.فيديو شيله حزينه` أو `.فيديو ملخص ريال مدريد`');
        }

        try {
            // تفاعل يدل على بدء البحث
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });
            await reply(`⏳ *جـاري الـبـحـث والـتـخـطـي الأكـاديـمـي لـحـمـايـة يـوتـيـوب...*`);

            // 1. البحث في يوتيوب للحصول على الرابط
            const searchResults = await yts(text);
            const video = searchResults.videos[0]; // نأخذ أول نتيجة

            if (!video) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('❌ *عـذراً، لـم أعـثـر عـلـى أي فـيـديـو بـهـذا الاسـم.*');
            }

            // 2. التحقق من مدة الفيديو (منع الفيديوهات الطويلة جداً - 20 دقيقة كحد أقصى)
            if (video.seconds > 1200) {
                return reply('⚠️ *عـذراً! الـفـيـديـو طـويـل جـداً. يـرجـى اخـتـيـار مـقـطـع أقـصـر لـتـجـنـب ضـغـط الـواتـسـاب.*');
            }

            // تفاعل يدل على بدء التحميل
            await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

            // 3. استخدام API خارجي قوي لتخطي حماية يوتيوب وجلب رابط التحميل المباشر
            const apiUrl = `https://api.davidcyriltech.my.id/download/ytmp4?url=${video.url}`;
            
            const response = await axios.get(apiUrl);
            
            if (!response.data || !response.data.success || !response.data.result || !response.data.result.download_url) {
                throw new Error('API لم يرجع رابط التحميل');
            }

            const downloadUrl = response.data.result.download_url;

            // إعداد رسالة الوصف الفخمة
            const videoCaption = `
*• ───── ❨ 🎬 يـوتـيـوب VIP ❩ ───── •*

📌 *الـعـنـوان:* ${video.title}
⏱️ *الـمـدة:* ${video.timestamp}
👁️ *الـمـشـاهـدات:* ${video.views.toLocaleString()}

*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*
`.trim();

            // 4. إرسال الفيديو للمستخدم مباشرة من الرابط (دون الحاجة لتخزينه في السيرفر)
            await sock.sendMessage(from, { 
                video: { url: downloadUrl }, 
                caption: videoCaption,
                mimetype: 'video/mp4'
            }, { quoted: msg });

            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في تحميل يوتيوب المطور:', error.message || error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ عـنـيـد فـي الـسـيـرفـر. حـاول مـع فـيـديـو آخـر بـعـد قـلـيـل.*');
        }
    }
};
