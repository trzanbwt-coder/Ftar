const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

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
            await reply(`⏳ *جـاري الـبـحـث عـن [ ${text} ] فـي يـوتـيـوب...*`);

            // 1. البحث في يوتيوب
            const searchResults = await yts(text);
            const video = searchResults.videos[0]; // نأخذ أول نتيجة دائمًا لأنها الأقرب للبحث

            if (!video) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('❌ *عـذراً، لـم أعـثـر عـلـى أي فـيـديـو بـهـذا الاسـم.*');
            }

            // 2. التحقق من مدة الفيديو (منع الفيديوهات الطويلة جداً لحماية السيرفر والواتساب)
            // 900 ثانية = 15 دقيقة
            if (video.seconds > 900) {
                return reply('⚠️ *عـذراً! الـفـيـديـو طـويـل جـداً (أكـثـر مـن 15 دقـيـقـة). يـرجـى اخـتـيـار مـقـطـع أقـصـر.*');
            }

            // تفاعل يدل على بدء التحميل
            await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

            // 3. إعداد مسار مؤقت لحفظ الفيديو قبل إرساله
            // نستخدم رقم عشوائي لمنع تداخل الملفات إذا طلب شخصان فيديو في نفس الوقت
            const tempFileName = path.join(__dirname, `temp_video_${Date.now()}.mp4`);

            // 4. تحميل الفيديو بأفضل جودة مدمجة (صوت + صورة)
            const stream = ytdl(video.url, { filter: 'audioandvideo' });

            // حفظ الفيديو في الملف المؤقت
            const fileWriteStream = fs.createWriteStream(tempFileName);
            stream.pipe(fileWriteStream);

            // 5. انتظار انتهاء التحميل
            await new Promise((resolve, reject) => {
                fileWriteStream.on('finish', resolve);
                fileWriteStream.on('error', reject);
                stream.on('error', reject);
            });

            // إعداد رسالة الوصف الفخمة
            const videoCaption = `
*• ───── ❨ 🎬 يـوتـيـوب ❩ ───── •*

📌 *الـعـنـوان:* ${video.title}
⏱️ *الـمـدة:* ${video.timestamp}
👁️ *الـمـشـاهـدات:* ${video.views.toLocaleString()}
📅 *الـنـشـر:* ${video.ago}

*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*
`.trim();

            // 6. إرسال الفيديو للمستخدم
            await sock.sendMessage(from, { 
                video: { url: tempFileName }, 
                caption: videoCaption,
                mimetype: 'video/mp4'
            }, { quoted: msg });

            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            // 7. حذف الملف المؤقت من السيرفر لتوفير المساحة
            if (fs.existsSync(tempFileName)) {
                fs.unlinkSync(tempFileName);
            }

        } catch (error) {
            console.error('❌ خطأ في تحميل يوتيوب:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ أثـنـاء الـتـحـمـيـل. قـد يـكـون الـفـيـديـو مـحـمـيـاً بـحـقـوق أو أنـه مـقـيـد بـالـعـمـر.*');
        }
    }
};
