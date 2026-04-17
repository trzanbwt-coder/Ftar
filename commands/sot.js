module.exports = {
    name: 'tts',
    aliases: ['انطق', 'صوت', 'قول'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        if (!text) {
            return reply('❌ *يرجى كتابة النص الذي تريدني أن أنطقه.*\n*مثال:* `.انطق أهلاً بكم في مجموعة طرزان`');
        }

        if (text.length > 200) {
            return reply('❌ *النص طويل جداً! يرجى كتابة نص لا يتجاوز 200 حرف.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎙️', key: msg.key } });

            // استخدام API جوجل للترجمة لتحويل النص إلى صوت عربي
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ar&client=tw-ob`;

            // إرسال الصوت كـ PTT (تسجيل صوتي كأنه مسجل من المايك)
            await sock.sendMessage(from, { 
                audio: { url: ttsUrl }, 
                mimetype: 'audio/mp4', 
                ptt: true 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر النطق:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء توليد الصوت.*');
        }
    }
};
