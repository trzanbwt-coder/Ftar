// استدعاء مكتبة axios لإرسال الطلبات (إذا لم تكن مثبتة لديك، اكتب في الموجه: npm install axios)
const axios = require('axios');

module.exports = {
    name: 'ذكاء',
    aliases: ['سؤال', 'بوت', 'ai', 'chat'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        // 1. التحقق من كتابة السؤال
        if (args.length === 0) {
            return reply('❌ *يـرجـى كـتـابـة سـؤالـك بـعـد الأمـر.*\n*مـثـال:* `.ذكاء من هو مخترع الكهرباء؟`');
        }

        // جمع الكلمات لتكوين السؤال الكامل
        const prompt = args.join(' ');

        try {
            // 2. وضع تفاعل (تفكير) للرسالة
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // 3. إعدادات الاتصال بـ API الذكاء الاصطناعي الخاص بك
            const API_KEY = 'AI_73f9dacf7c424976'; // 🔑 المفتاح الجديد الخاص بك
            
            // ⚠️ تنبيه: ضع الـ IP الخاص بالاستضافة التي يعمل عليها بوت التليجرام (البايثون) هنا
            // إذا كان بوت الواتساب وبوت البايثون يعملان على نفس الاستضافة، اتركها 127.0.0.1
            const API_URL = 'http://127.0.0.1:8080/api/chat'; 

            // 4. إرسال الطلب إلى سيرفر الذكاء الاصطناعي
            const response = await axios.post(API_URL, {
                api_key: API_KEY,
                prompt: prompt
            });

            // 5. التحقق من نجاح الرد
            if (response.data && response.data.status === 'success') {
                const aiReply = response.data.response;

                // وضع تفاعل (نجاح)
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

                // إرسال رد الذكاء الاصطناعي للمستخدم في الواتساب بلمسة جمالية
                const finalMessage = `*🧠 𝑻𝑨𝑹𝒁𝑨𝑵 𝑨𝑰 🧠*\n\n${aiReply}`;
                await reply(finalMessage);

            } else {
                // في حال رفض السيرفر الطلب (مثلاً المفتاح خطأ)
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await reply('❌ *عـذراً، هـنـاك مـشـكـلـة فـي الاتـصـال بـالـسـيـرفـر (تأكد من المفتاح).*');
            }

        } catch (error) {
            // 6. التقاط الأخطاء لمنع توقف البوت
            console.error('❌ خطأ في أمر الذكاء الاصطناعي:', error.message);
            await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
            
            // رسالة خطأ للمستخدم
            reply('❌ *عـذراً، سـيـرفـر الـذكـاء الاصـطـنـاعـي لا يـسـتـجـيـب حـالـيـاً. حـاول لاحـقـاً.*');
        }
    }
};
