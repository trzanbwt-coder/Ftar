const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    name: 'yt',
    aliases: ['تحميل', 'فيديو', 'صوت', 'play', 'video', 'song'],
    async execute({ sock, msg, text, reply, from, commandName }) {
        // التأكد من وجود نص للبحث
        if (!text) {
            return await reply('⚠️ يرجى كتابة اسم المقطع أو رابط اليوتيوب.\n\nمثال:\n```.صوت قران كريم```\n```.فيديو اغنية حزينة```');
        }

        try {
            // التفاعل لبدء البحث
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            const search = await yts(text);
            if (!search.videos || search.videos.length === 0) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return await reply(`❌ لم يتم العثور على نتائج لـ: ${text}`);
            }

            const video = search.videos[0];
            const ytUrl = video.url;
            const title = video.title;
            const thumb = video.thumbnail;

            // تحديد هل المستخدم يريد فيديو أم صوت بناءً على الأمر المستخدم
            const isVideo = commandName === 'فيديو' || commandName === 'video';
            
            await sock.sendMessage(from, { react: { text: '📥', key: msg.key } });

            // إرسال صورة المقطع وتفاصيله
            const infoText = `🚀 *جاري التحميل من اليوتيوب* 🚀\n\n📝 *العنوان:* ${title}\n⏳ *المدة:* ${video.timestamp}\n👀 *المشاهدات:* ${video.views}\n🎬 *النوع:* ${isVideo ? 'فيديو (MP4)' : 'صوت (MP3)'}\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
            await sock.sendMessage(from, { image: { url: thumb }, caption: infoText }, { quoted: msg });

            // استخدام API لجلب روابط التحميل المباشرة (الملفات الفعلية)
            // ملاحظة: هذا الـ API يقوم بتحويل الفيديو إلى ملف فعلي للتحميل
            const apiType = isVideo ? 'mp4' : 'mp3';
            const apiUrl = `https://api.aggelos-007.xyz/yt${apiType}?url=${encodeURIComponent(ytUrl)}`;
            
            const response = await axios.get(apiUrl);

            if (!response.data || !response.data.status) {
                throw new Error('فشل جلب الملف من السيرفر');
            }

            const fileUrl = response.data.download_url;

            await sock.sendMessage(from, { react: { text: isVideo ? '🎬' : '🎶', key: msg.key } });

            if (isVideo) {
                // إرسال فيديو فعلي (MP4)
                await sock.sendMessage(from, {
                    video: { url: fileUrl },
                    caption: `✅ تم تحميل الفيديو بنجاح: ${title}`,
                    mimetype: 'video/mp4',
                    fileName: `${title}.mp4`
                }, { quoted: msg });
            } else {
                // إرسال ملف صوتي فعلي (MP3)
                await sock.sendMessage(from, {
                    audio: { url: fileUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false,
                    contextInfo: {
                        externalAdReply: {
                            title: title,
                            body: `طرزان VIP | جودة عالية ✨`,
                            thumbnailUrl: thumb,
                            sourceUrl: ytUrl,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg });
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('YT Download Error:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await reply('❌ حدث خطأ أثناء تحميل الملف. السيرفر قد يكون مشغولاً، حاول لاحقاً.');
        }
    }
};
