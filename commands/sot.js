module.exports = {
    name: 'tts',
    aliases: ['انطق', 'صوت', 'قول'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        let targetText = text;

        // استخراج النص إذا كان المستخدم يرد على رسالة
        if (!targetText) {
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
                targetText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
            }
        }

        if (!targetText || targetText.trim() === '') {
            return reply('❌ *يرجى كتابة النص الذي تريدني أن أنطقه، أو الرد على رسالة نصية.*');
        }

        if (targetText.length > 200) {
            return reply('❌ *النص طويل جداً! يرجى اختيار نص لا يتجاوز 200 حرف.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎙️', key: msg.key } });

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(targetText)}&tl=ar&client=tw-ob`;

            const response = await fetch(ttsUrl);
            if (!response.ok) throw new Error('فشل جلب الصوت من جوجل');
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);

            // تم إزالة ptt: true لإرسال الملف كمقطع صوتي عادي مدعوم من الواتساب
            await sock.sendMessage(from, { 
                audio: audioBuffer, 
                mimetype: 'audio/mpeg'
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر النطق:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء توليد الصوت.*');
        }
    }
};
