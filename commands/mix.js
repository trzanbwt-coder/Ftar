/**
 * 🎨 أمر دمج الإيموجيات (Emoji Kitchen)
 * 💻 تطوير وتصميم: طرزان الواقدي
 */
const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
    name: 'mix',
    description: 'دمج إيموجيين وتحويلهما إلى ملصق فخم',
    async execute({ sock, msg, text, reply, from }) {
        // 1. إزالة كلمة الأمر واستخراج الإيموجيات فقط (حتى لو كانت بدون مسافات)
        const input = text.replace(/^(mix|دمج)/i, '').trim();
        
        // تعبير رياضي (Regex) ذكي لاستخراج الإيموجيات فقط
        const emojis = input.match(/\p{Emoji}/gu);

        // 2. التحقق من وجود إيموجيين على الأقل
        if (!emojis || emojis.length < 2) {
            return reply('❌ *يجب إدخال إيموجيين للدمج.*\n📌 *مثال:* mix 😋 😎\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*');
        }

        const emoji1 = emojis[0];
        const emoji2 = emojis[1];

        try {
            // تفاعل جاري العمل
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

            let imageUrl = null;
            
            // دالة مساعدة للبحث في الـ API
            const fetchFusion = async (e1, e2) => {
                const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyB-YaVwM&client_key=emoji_kitchen&collection=emoji_kitchen_v6&q=${encodeURIComponent(e1)}_${encodeURIComponent(e2)}`;
                const res = await axios.get(url);
                return (res.data && res.data.results && res.data.results.length > 0) ? res.data.results[0].url : null;
            };

            // 3. المحاولة الأولى (الترتيب الطبيعي)
            imageUrl = await fetchFusion(emoji1, emoji2);

            // 4. المحاولة الثانية (إذا فشل، نقوم بعكس الإيموجيات لأن الـ API أحياناً يطلب الترتيب العكسي)
            if (!imageUrl) {
                imageUrl = await fetchFusion(emoji2, emoji1);
            }

            // 5. إذا لم يتم العثور على دمج أبداً
            if (!imageUrl) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('⚠️ *لا يوجد دمج متاح لهذين الإيموجيين من شركة جوجل حتى الآن.*\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*');
            }

            // 6. تحميل الصورة من الـ URL
            const { data: imgBuffer } = await axios.get(imageUrl, { responseType: 'arraybuffer' });

            // 7. صناعة الملصق بحقوق فخمة
            const sticker = new Sticker(imgBuffer, {
                pack: '𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️', // اسم الحزمة
                author: 'طرزان الواقدي 👑', // صانع الملصق
                type: StickerTypes.FULL,  // ملصق كامل بدون قص
                categories: [emoji1, emoji2], // تصنيف الملصق (يساعد عند البحث في الواتساب)
                quality: 100 // أعلى جودة
            });

            const stickerBuffer = await sticker.build();

            // 8. إرسال الملصق وإضافة تفاعل النجاح
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (err) {
            console.error('❌ خطأ في أمر mix:', err.message);
            await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
            await reply('❌ *حدث خطأ أثناء جلب دمج الإيموجي أو المفتاح السري للـ API غير صالح.*\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*');
        }
    }
};
