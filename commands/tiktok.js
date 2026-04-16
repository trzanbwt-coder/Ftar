const axios = require('axios');

module.exports = {
    name: 'tiktok',
    aliases: ['تيك', 'tt', 'تيكتوك'], // يمكنك تشغيله بـ .tiktok أو .تيك أو .tt
    execute: async ({ sock, msg, args, reply, from }) => {
        
        // 1. التحقق من وجود الرابط
        if (!args[0]) {
            return reply('❌ *يرجى إرسال رابط الفيديو مع الأمر.*\n*مثال:* `.tt https://vm.tiktok.com/...`');
        }

        const url = args[0];

        // 2. التحقق من أن الرابط يخص تيك توك
        if (!url.includes('tiktok.com')) {
            return reply('❌ *الرابط غير صحيح!* يرجى التأكد من أنه رابط تيك توك صالح.');
        }

        try {
            // إعطاء تفاعل قيد التحميل
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // 3. الاتصال بـ API مجاني ومستقر جداً (بدون مفاتيح) لتحميل الفيديو بدون علامة مائية
            const apiUrl = 'https://www.tikwm.com/api/';
            const response = await axios.post(apiUrl, { url: url });

            const data = response.data.data;

            // التحقق من نجاح جلب البيانات (الفيديو ليس خاصاً أو محذوفاً)
            if (!data || !data.play) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('❌ *عذراً!* لم أتمكن من تحميل الفيديو. قد يكون الحساب خاصاً أو الفيديو محذوفاً.');
            }

            // 4. استخراج معلومات الفيديو
            const videoUrl = data.play; // رابط الفيديو بدون علامة مائية
            const title = data.title || 'لا يوجد وصف';
            const author = data.author?.nickname || 'مجهول';

            // 5. تجهيز رسالة الـ VIP
            const captionText = `📥 *تحميل تيك توك (بدون علامة مائية)* 📥\n\n👤 *الحساب:* ${author}\n📝 *الوصف:* ${title}\n\n*— TARZAN VIP 👑*`;

            // 6. إرسال الفيديو للمستخدم
            await sock.sendMessage(from, {
                video: { url: videoUrl },
                caption: captionText
            }, { quoted: msg });

            // إعطاء تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في تحميل تيك توك:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ في سيرفر التحميل!* يرجى المحاولة مرة أخرى لاحقاً.');
        }
    }
};
