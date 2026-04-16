const axios = require('axios');
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

module.exports = {
    name: 'emix',
    aliases: ['دمج', 'مكس'], // يمكنك استخدامه بـ .emix أو .دمج
    execute: async ({ sock, msg, text, reply, from }) => {
        
        // التحقق من أن المستخدم أدخل الإيموجيات وبينهما فاصلة
        if (!text || !text.includes(",")) {
            return reply("❌ *الاستخدام الصحيح:*\nأرسل الأمر متبوعاً بإيموجيين بينهما فاصلة (,)\n*مثال:* `.emix 😂,🙂`");
        }

        // تقسيم النص واستخراج الإيموجيين
        const [emoji1, emoji2] = text.split(",").map(e => e.trim());

        if (!emoji1 || !emoji2) {
            return reply("❌ يرجى التأكد من وضع إيموجيين اثنين بشكل صحيح.");
        }

        try {
            // تفاعل قيد التنفيذ للسرية والفخامة
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // 1. جلب رابط الصورة المدمجة من الـ API الذي طلبته
            const apiUrl = `https://levanter.onrender.com/emix?q=${encodeURIComponent(emoji1)},${encodeURIComponent(emoji2)}`;
            const res = await axios.get(apiUrl);

            if (!res.data || !res.data.result) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply("❌ لم أستطع إنشاء الإيموجي المدمج. شركة جوجل لا تدعم دمج هذين الرمزين معاً، جرب غيرها.");
            }

            const imageUrl = res.data.result;

            // 2. تنزيل الصورة كـ Buffer باستخدام axios بدلاً من getBuffer المفقودة
            const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(imgResponse.data, 'utf-8');

            // 3. تحويل الصورة إلى ملصق فخم
            const sticker = new Sticker(buffer, {
                pack: "TARZAN VIP 👑", // اسم حزمة الملصق
                author: "طرزان الواقدي", // صانع الملصق
                type: StickerTypes.FULL,
                quality: 100, // أعلى جودة ممكنة
                background: "transparent"
            });

            const stickerBuffer = await sticker.build();

            // 4. إرسال الملصق
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
            
            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (err) {
            console.error('❌ خطأ في أمر emix:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply("❌ حدث خطأ داخلي أثناء إنشاء الملصق. قد يكون الـ API متوقفاً مؤقتاً.");
        }
    }
};
