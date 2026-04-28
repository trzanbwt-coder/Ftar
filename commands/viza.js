const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core'); // المكتبة المحلية للتحميل المباشر

module.exports = {
    name: 'yt',
    aliases: ['تحميل', 'فيديو', 'صوت', 'song', 'video', 'شغل'],
    async execute({ sock, msg, text, reply, from, commandName }) {
        // 1. التحقق من المدخلات
        if (!text) {
            return await reply('⚠️ يرجى كتابة اسم المقطع أو رابط اليوتيوب.\n\nمثال:\n```.صوت عبدالله ال فروان```\n```.فيديو شيلة حماسية```');
        }

        try {
            // 🔍 2. البحث عن المقطع
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });
            const search = await yts(text);
            
            if (!search.videos || search.videos.length === 0) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return await reply(`❌ لم يتم العثور على أي نتائج لـ: ${text}`);
            }

            const video = search.videos[0];
            const ytUrl = video.url;
            const title = video.title;
            const thumb = video.thumbnail;
            const isVideo = (commandName === 'فيديو' || commandName === 'video');

            // 📥 3. إرسال تفاصيل المقطع الملكية
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
            const infoText = `🚀 *جاري التحميل المباشر (بدون API)* 🚀\n\n📝 *العنوان:* ${title}\n⏳ *المدة:* ${video.timestamp}\n🎬 *النوع:* ${isVideo ? 'فيديو (MP4)' : 'صوت (MP3)'}\n\n*يتم الآن سحب البيانات من خوادم يوتيوب مباشرة...* ⚔️`;
            
            await sock.sendMessage(from, { 
                image: { url: thumb }, 
                caption: infoText 
            }, { quoted: msg });

            // 🛠️ 4. المعالجة المحلية (سحب المقطع مباشرة)
            await sock.sendMessage(from, { react: { text: '📥', key: msg.key } });

            // خيارات التحميل لضمان الجودة والسرعة
            const downloadOptions = {
                filter: isVideo ? 'audioandvideo' : 'audioonly',
                quality: isVideo ? 'highest' : 'highestaudio',
            };

            // إنشاء تيار البيانات (Stream)
            const stream = ytdl(ytUrl, downloadOptions);

            // 🎶 5. الإرسال النهائي للملف
            await sock.sendMessage(from, { react: { text: isVideo ? '🎬' : '🎶', key: msg.key } });

            if (isVideo) {
                // إرسال الفيديو كتيار بيانات (Stream)
                await sock.sendMessage(from, {
                    video: { stream: stream },
                    caption: `✅ تم التحميل بنجاح بواسطة طرزان VIP\n\n🎵 *العنوان:* ${title}`,
                    mimetype: 'video/mp4',
                    fileName: `${title}.mp4`
                }, { quoted: msg });
            } else {
                // إرسال الصوت كتيار بيانات (Stream)
                await sock.sendMessage(from, {
                    audio: { stream: stream },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false,
                    contextInfo: {
                        externalAdReply: {
                            title: title,
                            body: `𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 | نسخة السيرفر المحلية ✨`,
                            thumbnailUrl: thumb,
                            sourceUrl: ytUrl,
                            mediaType: 1,
                            showAdAttribution: true,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg });
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('Local YT Download Error:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            
            // في حالة وجود خطأ "Sign in" من يوتيوب (نادر الحدوث مع distube)
            if (error.message.includes('403') || error.message.includes('Sign in')) {
                 await reply('❌ يوتيوب قام بحظر الـ IP الخاص بالسيرفر مؤقتاً. حاول استخدام رابط مباشر أو انتظر قليلاً.');
            } else {
                 await reply('❌ حدث خطأ في معالجة الملف محلياً. تأكد من تثبيت المكتبات المطلوبة.');
            }
        }
    }
};
