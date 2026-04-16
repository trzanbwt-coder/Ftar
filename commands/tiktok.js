const axios = require('axios');

module.exports = {
    name: 'tiktok',
    aliases: ['تيك', 'tt', 'تيكتوك'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        if (!args[0]) {
            return reply('❌ *يرجى إرسال رابط الفيديو مع الأمر.*\n*مثال:* `.tt https://vm.tiktok.com/...`');
        }

        const url = args[0];

        if (!url.includes('tiktok.com')) {
            return reply('❌ *الرابط غير صحيح!* يرجى إرسال رابط تيك توك صالح.');
        }

        try {
            // تفاعل قيد التحميل
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // الاتصال بـ API تيك توك
            const apiUrl = 'https://www.tikwm.com/api/';
            const response = await axios.post(apiUrl, { url: url });
            const data = response.data.data;

            if (!data || !data.play) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('❌ *عذراً!* لم أتمكن من تحميل الفيديو. قد يكون الحساب خاصاً أو الفيديو محذوفاً.');
            }

            // استخراج وتنسيق المعلومات
            const videoUrl = data.play; 
            const title = data.title || 'لا يوجد وصف';
            const author = data.author?.nickname || 'مجهول';
            const authorId = data.author?.unique_id || 'مجهول';
            
            // إحصائيات مع فواصل للأرقام (مثل: 1,000,000)
            const views = (data.play_count || 0).toLocaleString();
            const likes = (data.digg_count || 0).toLocaleString();
            const comments = (data.comment_count || 0).toLocaleString();
            const shares = (data.share_count || 0).toLocaleString();
            
            const musicTitle = data.music_info?.title || 'صوت أصلي';
            const musicAuthor = data.music_info?.author || 'غير معروف';

            // 🌟 تصميم الرسالة الأسطوري (VIP Layout)
            const captionText = `
╭━━━━━━━[ 𝐓 𝐈 𝐊 𝐓 𝐎 𝐊 ]━━━━━━━╮
┃
┃ 👤 *الـحـسـاب:* ${author} (@${authorId})
┃ 📝 *الـوصـف:* ${title}
┃
┣━━━━━━[ 📊 الإحـصـائـيـات ]━━━━━━┫
┃
┃ 👁️ *المشاهدات:* ${views}
┃ ❤️ *الإعجابات:* ${likes}
┃ 💬 *التعليقات:* ${comments}
┃ 🔗 *المشاركات:* ${shares}
┃
┣━━━━━━[ 🎵 مـعـلـومـات الـصـوت ]━━━━━━┫
┃
┃ 🎶 *الاســـم:* ${musicTitle}
┃ 🎤 *الـمـؤدي:* ${musicAuthor}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━╯
*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 👑*
`.trim();

            // إرسال الفيديو بالوصف الفخم
            await sock.sendMessage(from, {
                video: { url: videoUrl },
                caption: captionText
            }, { quoted: msg });

            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في تحميل تيك توك:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ في السيرفر!* يرجى المحاولة مرة أخرى لاحقاً.');
        }
    }
};
