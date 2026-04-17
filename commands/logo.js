const delay = ms => new Promise(res => setTimeout(res, ms));

module.exports = {
    name: 'type',
    aliases: ['اكتب', 'شبح', 'طباعة'],
    execute: async ({ sock, msg, text, reply, from, isOwner }) => {
        
        // 1. التحقق من الصلاحيات (يُفضل للمطور فقط لأنها عملية مكثفة)
        if (!isOwner) {
            return reply('❌ *هذا الأمر السيبراني مخصص لمطور البوت فقط.*');
        }

        // 2. فصل الرقم عن الرسالة المراد كتابتها
        // المتوقع من المستخدم كتابة: .اكتب 966500000000 مرحباً بك في عالم طرزان
        const firstSpaceIndex = text.indexOf(' ');
        
        if (firstSpaceIndex === -1) {
            return reply('❌ *طريقة الاستخدام خاطئة!*\n*اكتب:* `.اكتب [الرقم] [الرسالة]`\n*مثال:* `.اكتب 966500000000 أهلاً بك`');
        }

        const rawNumber = text.substring(0, firstSpaceIndex).trim();
        const secretMessage = text.substring(firstSpaceIndex + 1).trim();

        if (!rawNumber || !secretMessage) {
            return reply('❌ *تأكد من كتابة الرقم والرسالة بشكل صحيح.*');
        }

        // تنظيف الرقم وتجهيزه بصيغة الواتساب
        const targetNumber = rawNumber.replace(/\D/g, '');
        const targetJid = `${targetNumber}@s.whatsapp.net`;

        try {
            await sock.sendMessage(from, { react: { text: '⌨️', key: msg.key } });
            await reply(`⏳ *جاري الاتصال بالهدف (+${targetNumber}) وبدء الطباعة الشبحية...*`);

            let currentText = ''; // النص الذي سيكبر تدريجياً
            
            // 3. إرسال أول حرف (لتوليد مفتاح الرسالة الذي سنعدل عليه)
            currentText += secretMessage[0];
            const sentMsg = await sock.sendMessage(targetJid, { text: currentText + ' █' }); // وضعنا مؤشر (█) لإعطاء شكل الآلة الكاتبة
            const msgKey = sentMsg.key;

            // الانتظار للسرعة المطلوبة
            await delay(750);

            // 4. حلقة تكرارية لكتابة باقي الحروف (من الحرف الثاني إلى الأخير)
            for (let i = 1; i < secretMessage.length; i++) {
                currentText += secretMessage[i];
                
                // إضافة المؤشر الوامض (█) في النهاية لإعطاء واقعية، وإزالته في الحرف الأخير
                const displayIndicator = (i === secretMessage.length - 1) ? '' : ' █';
                
                // تعديل الرسالة لتشمل الحروف الجديدة
                await sock.sendMessage(targetJid, { text: currentText + displayIndicator, edit: msgKey });

                // الانتظار ثانية إلا ربع (750 ملي ثانية) بين كل حرف
                await delay(750);
            }

            // 5. تقرير نجاح العملية للمطور
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            await reply('✅ *تـمـت عـمـلـيـة الـطـبـاعـة لـلـهـدف بـنـجـاح.*');

        } catch (error) {
            console.error('❌ خطأ في أمر الآلة الكاتبة:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشلت العملية! تأكد من أن الرقم صحيح ومسجل في الواتساب.*');
        }
    }
};
