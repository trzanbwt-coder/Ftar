const delay = ms => new Promise(res => setTimeout(res, ms));

module.exports = {
    name: 'type',
    aliases: ['اكتب', 'شبح', 'طباعة'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        // فصل الرقم عن الرسالة المراد كتابتها
        // المتوقع: .اكتب 966500000000 الرسالة
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
            await reply(`⏳ *جاري الاتصال بالهدف (+${targetNumber}) وبدء الطباعة الصاروخية...*`);

            let currentText = ''; 
            
            // إرسال أول حرف للرقم المستهدف مع مؤشر الكتابة
            currentText += secretMessage[0];
            const sentMsg = await sock.sendMessage(targetJid, { text: currentText + ' █' }); 
            const msgKey = sentMsg.key;

            // 🚀 تم التعديل إلى 350 ملي ثانية
            await delay(350);

            // طباعة باقي الحروف للرقم المستهدف
            for (let i = 1; i < secretMessage.length; i++) {
                currentText += secretMessage[i];
                
                // إظهار المؤشر (█) وإخفائه عند الحرف الأخير
                const displayIndicator = (i === secretMessage.length - 1) ? '' : ' █';
                
                // تعديل الرسالة
                await sock.sendMessage(targetJid, { text: currentText + displayIndicator, edit: msgKey });

                // 🚀 تم التعديل إلى 350 ملي ثانية بين كل حرف
                await delay(350);
            }

            // تقرير النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            await reply('✅ *تـمـت عـمـلـيـة الـطـبـاعـة لـلـهـدف بـنـجـاح بـسـرعـة صـاروخـيـة.*');

        } catch (error) {
            console.error('❌ خطأ في أمر الآلة الكاتبة:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشلت العملية! تأكد من أن الرقم صحيح ومسجل في الواتساب.*');
        }
    }
};
