const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    name: 'yt',
    aliases: ['تحميل', 'فيديو', 'صوت', 'song', 'video', 'شغل'],
    async execute({ sock, msg, text, reply, from, commandName }) {
        // التحقق من المدخلات
        if (!text) {
            return await reply('⚠️ يرجى كتابة اسم المقطع أو رابط اليوتيوب.\n\nمثال:\n```.صوت عبدالله ال فروان```\n```.فيديو شيلة حماسية```');
        }

        try {
            // 🔍 خطوة 1: البحث عن المقطع
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

            // 📥 خطوة 2: إرسال تفاصيل المقطع الملكية
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
            const infoText = `🚀 *جاري التحضير من طرزان VIP* 🚀\n\n📝 *العنوان:* ${title}\n⏳ *المدة:* ${video.timestamp}\n👀 *المشاهدات:* ${video.views.toLocaleString()}\n🎬 *النوع:* ${isVideo ? 'فيديو (MP4)' : 'صوت (MP3)'}\n\n*انتظر قليلاً جاري الرفع...* ⚔️`;
            
            await sock.sendMessage(from, { 
                image: { url: thumb }, 
                caption: infoText 
            }, { quoted: msg });

            // 🛠️ خطوة 3: جلب رابط التحميل (نظام السيرفرات الاحتياطية)
            await sock.sendMessage(from, { react: { text: '📥', key: msg.key } });
            
            let downloadUrl = null;
            // قائمة بسيرفرات التحميل لضمان الاستمرارية
            const apis = [
                `https://api.boxi.my.id/api/yt${isVideo ? 'v' : 'a'}?url=${encodeURIComponent(ytUrl)}`,
                `https://api.vreden.my.id/api/ytmp${isVideo ? '4' : '3'}?url=${encodeURIComponent(ytUrl)}`,
                `https://api.aggelos-007.xyz/ytmp${isVideo ? '4' : '3'}?url=${encodeURIComponent(ytUrl)}`
            ];

            for (const api of apis) {
                try {
                    const res = await axios.get(api, { timeout: 15000 });
                    // التحقق من هيكل الرد بناءً على الـ API المستخدم
                    downloadUrl = res.data?.result?.url || res.data?.download_url || res.data?.result?.download || res.data?.url;
                    if (downloadUrl) break; // توقف عند العثور على أول رابط يعمل
                } catch (e) {
                    continue; // فشل هذا السيرفر، جرب التالي
                }
            }

            if (!downloadUrl) {
                throw new Error('جميع السيرفرات مشغولة حالياً');
            }

            // 🎶 خطوة 4: الإرسال النهائي للملف
            await sock.sendMessage(from, { react: { text: isVideo ? '🎬' : '🎶', key: msg.key } });

            if (isVideo) {
                await sock.sendMessage(from, {
                    video: { url: downloadUrl },
                    caption: `✅ تم التحميل بنجاح بواسطة طرزان VIP\n\n🎵 *العنوان:* ${title}`,
                    mimetype: 'video/mp4',
                    fileName: `${title}.mp4`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(from, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false,
                    contextInfo: {
                        externalAdReply: {
                            title: title,
                            body: `𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 | جودة ملكية ✨`,
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
            console.error('YT Error:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await reply('❌ عذراً، تعذر التحميل حالياً بسبب ضغط على سيرفرات اليوتيوب العالمية. يرجى المحاولة مرة أخرى بعد دقيقة.');
        }
    }
};
