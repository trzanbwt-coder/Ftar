const axios = require('axios');

module.exports = {
    name: 'logo',
    aliases: ['لوجو', 'شعار', '3d'],
    execute: async ({ sock, msg, args, text, reply, from }) => {
        
        // التحقق من المدخلات
        if (!text || args.length < 2) {
            const helpText = `🎨 *صانع الشعارات الملكي 3D* 🎨
يرجى اختيار رقم التصميم ثم كتابة الاسم:

1️⃣ نيون لامع (Neon)
2️⃣ جلاكسي فضاء (Galaxy)
3️⃣ نار مشتعلة (Fire)
4️⃣ زجاج مكسور (Broken Glass)
5️⃣ نص معدني (Metallic)

*مثال للاستخدام:*
\`.لوجو 1 طرزان\`
\`.لوجو 3 محمد\``;
            return reply(helpText);
        }

        const style = args[0];
        const name = args.slice(1).join(' ');

        // تحديد مسار الـ API المفتوح بناءً على الرقم
        // استخدمت APIs قوية ومجانية من PopCat و api.xfarr وغيرها
        let apiUrl = '';
        if (style === '1') apiUrl = `https://api.popcat.xyz/neon?text=${encodeURIComponent(name)}`;
        else if (style === '2') apiUrl = `https://api.xfarr.com/api/textpro/space?text=${encodeURIComponent(name)}`;
        else if (style === '3') apiUrl = `https://api.xfarr.com/api/textpro/firework?text=${encodeURIComponent(name)}`;
        else if (style === '4') apiUrl = `https://api.xfarr.com/api/textpro/broken-glass?text=${encodeURIComponent(name)}`;
        else if (style === '5') apiUrl = `https://api.xfarr.com/api/textpro/metallic?text=${encodeURIComponent(name)}`;
        else {
            return reply('❌ *رقم التصميم غير صحيح! اختر من 1 إلى 5.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            
            // استخدمنا Axios لتحميل الصورة كبيانات (Buffer) لضمان عدم تعطل الواتساب
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            // إرسال الصورة الجاهزة مباشرة
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: `🎨 *شعارك الفخم جاهز يا [ ${name} ]*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في صانع الشعارات:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ في سيرفر التصميم. ملاحظة: بعض التصاميم لا تدعم اللغة العربية، جرب كتابة الاسم باللغة الإنجليزية.*');
        }
    }
};
