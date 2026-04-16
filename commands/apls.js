module.exports = {
    name: 'apls',
    aliases: ['مفتاح', 'gemini'],
    execute: async ({ sock, msg, text, reply, from, isFromMe, botSettings, saveSettings }) => {
        
        // يعمل لك أنت فقط
        if (!isFromMe) return;

        if (!text) {
            return reply(`❌ *الاستخدام الصحيح:*\nأرسل الأمر مع مفتاح Gemini الخاص بك.\n\n*مثال:*\n\`.apls AIzaSyBxxxxxxx...\`\n\n🔗 *للحصول على مفتاح من جوجل مجاناً:*\nhttps://aistudio.google.com/app/apikey`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } });

            // حفظ المفتاح في الإعدادات العامة ليعمل على جميع الجلسات
            botSettings.GLOBAL_CONFIG.geminiApiKey = text.trim();
            saveSettings();
            
            await reply(`✅ *تم حفظ مفتاح الذكاء الاصطناعي بنجاح!*\n\n🤖 البوت الآن يتصل رسمياً بخوادم جوجل (Gemini 1.5 Flash) الموثوقة والسريعة جداً.\n\n*ملاحظة:* تأكد من تفعيل (الذكاء الاصطناعي) من لوحة تحكم الموقع.`);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في حفظ المفتاح:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await reply('❌ حدث خطأ أثناء محاولة حفظ المفتاح.');
        }
    }
};
