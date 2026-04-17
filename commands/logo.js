const axios = require('axios');

module.exports = {
    name: 'logo',
    aliases: ['لوجو', 'شعار', '3d'],
    execute: async ({ sock, msg, args, text, reply, from }) => {
        
        // التحقق من المدخلات
        if (!text || args.length < 2) {
            const helpText = `🎨 *صانع الشعارات الملكي 3D* 🎨
يرجى اختيار رقم التصميم ثم كتابة الاسم:

1️⃣ ذهب 3D (Gold)
2️⃣ فضة معدني (Silver)
3️⃣ نيون مضيء (Neon)
4️⃣ نار مشتعلة (Fire)
5️⃣ ماتركس (Matrix)

*مثال للاستخدام:*
\`.لوجو 1 طرزان\`
\`.لوجو 3 محمد\``;
            return reply(helpText);
        }

        const style = args[0];
        const name = args.slice(1).join(' ');

        // تحديد مسار الـ API المفتوح بناءً على الرقم
        let apiUrl = '';
        if (style === '1') apiUrl = `https://bk9.fun/maker/3dgold?text=${encodeURIComponent(name)}`;
        else if (style === '2') apiUrl = `https://bk9.fun/maker/silver3d?text=${encodeURIComponent(name)}`;
        else if (style === '3') apiUrl = `https://bk9.fun/maker/neonlight?text=${encodeURIComponent(name)}`;
        else if (style === '4') apiUrl = `https://bk9.fun/maker/fire?text=${encodeURIComponent(name)}`;
        else if (style === '5') apiUrl = `https://bk9.fun/maker/matrix?text=${encodeURIComponent(name)}`;
        else {
            return reply('❌ *رقم التصميم غير صحيح! اختر من 1 إلى 5.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            await reply('⏳ *جاري نحت الشعار، ثواني فقط...*');

            // إرسال الصورة الجاهزة مباشرة
            await sock.sendMessage(from, { 
                image: { url: apiUrl }, 
                caption: `🎨 *شعارك الفخم جاهز يا [ ${name} ]*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في صانع الشعارات:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ في سيرفر التصميم، حاول بكلمة إنجليزية إذا فشل العربي.*');
        }
    }
};
