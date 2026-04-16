module.exports = {
    name: 'apls',
    aliases: ['مفتاح', 'gemini'],
    execute: async ({ sock, msg, text, reply, from, isFromMe, botSettings, saveSettings }) => {
        
        // 1. حماية قصوى: يعمل لك أنت فقط (صاحب البوت)
        if (!isFromMe) return;

        // 2. التحقق من وجود النص (المفتاح)
        if (!text) {
            return reply(`❌ *الاستخدام الصحيح:*\nأرسل الأمر مع مفتاح Gemini الخاص بك.\n\n*مثال:*\n\`.apls AQ.Ab8RNxxxxxxx...\`\n\n🔗 *للحصول على مفتاح من جوجل مجاناً:*\nhttps://aistudio.google.com/app/apikey`);
        }

        const key = text.trim();

        // 3. التحقق من طول المفتاح (مفاتيح جوجل طويلة دائماً، هذا يمنع وضع نصوص عشوائية قصيرة)
        if (key.length < 30) {
            return reply('❌ *مفتاح غير صالح!*\nالمفتاح قصير جداً، تأكد من نسخه بالكامل من منصة Google AI Studio.');
        }

        try {
            // تفاعل قيد المعالجة
            await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } });

            // 4. حفظ المفتاح في الإعدادات العامة ليعمل على جميع الجلسات بقوة
            botSettings.GLOBAL_CONFIG.geminiApiKey = key;
            saveSettings();
            
            const successMsg = `✅ *تم حفظ مفتاح الذكاء الاصطناعي بنجاح!*\n\n🤖 البوت الآن متصل رسمياً بخوادم جوجل الموثوقة والسريعة جداً.\n\n*ملاحظة هامة:* تأكد من تشغيل زر (الذكاء الاصطناعي) من لوحة التحكم في موقعك لكي يبدأ بالرد التلقائي.`;
            
            await reply(successMsg);
            
            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في حفظ المفتاح:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await reply('❌ حدث خطأ أثناء محاولة حفظ المفتاح في السيرفر.');
        }
    }
};
