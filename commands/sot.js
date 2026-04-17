module.exports = {
    name: 'tts',
    aliases: ['انطق', 'صوت', 'قول'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        // 1. تحديد النص المطلوب نطقه (سواء من الأمر المباشر أو من الرسالة المُرد عليها)
        let targetText = text;

        if (!targetText) {
            // محاولة استخراج النص من الرسالة المقتبسة (المرد عليها)
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
                // قد يكون النص في conversation (رسالة عادية) أو extendedTextMessage.text (رسالة طويلة/بها رابط)
                targetText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
            }
        }

        // 2. التحقق مما إذا كان هناك نص في النهاية
        if (!targetText || targetText.trim() === '') {
            return reply('❌ *يرجى كتابة النص الذي تريدني أن أنطقه، أو الرد على رسالة نصية.*\n*مثال:* `.انطق أهلاً بكم في المجموعة`');
        }

        if (targetText.length > 200) {
            return reply('❌ *النص طويل جداً! يرجى اختيار نص لا يتجاوز 200 حرف.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎙️', key: msg.key } });

            // استخدام API جوجل للترجمة لتحويل النص إلى صوت عربي
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(targetText)}&tl=ar&client=tw-ob`;

            const response = await fetch(ttsUrl);
            if (!response.ok) throw new Error('فشل في جلب الصوت من جوجل');
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);

            // إرسال الصوت كـ PTT (تسجيل صوتي)
            await sock.sendMessage(from, { 
                audio: audioBuffer, 
                mimetype: 'audio/mpeg', 
                ptt: true 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر النطق:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء توليد الصوت. قد تكون المشكلة من الاتصال أو من سيرفرات جوجل.*');
        }
    }
};
