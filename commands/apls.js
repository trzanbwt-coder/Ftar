const axios = require('axios');

// 🔑 مفتاح الـ API الرسمي الخاص بك
const OPENAI_API_KEY = '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';

module.exports = {
    name: 'tarzan',
    aliases: ['طرزان', 'اسال', 'بوت', 'ai'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        // التحقق من أنك كتبت سؤالاً بعد الأمر
        if (!text) {
            return reply('❌ *أهـلاً بـك يـا صـديـقـي!*\n*لـلـتـحـدث مـعـي، اكـتـب سـؤالـك بـعـد اسـمـي.*\n*مـثـال:* `.طرزان اشرح لي كيف يعمل الذكاء الاصطناعي`');
        }

        try {
            // تفاعل "جاري الكتابة" والتفكير
            await sock.sendPresenceUpdate('composing', from);
            await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

            // الاتصال بسيرفرات OpenAI مباشرة
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'أنت شخصية فخمة، ذكية، وصاحب كاريزما. اسمك "طرزان". تتحدث باللغة العربية بأسلوب راقٍ ومباشر كأنك إنسان حقيقي.'
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // استخراج الرد
            const aiReply = response.data.choices[0].message.content.trim();

            // إيقاف حالة الكتابة
            await sock.sendPresenceUpdate('paused', from);

            // إرسال الرد الفخم
            const finalMessage = `*• ───── ❨ 🧠 𝑻𝑨𝑹𝒁𝑨𝑵 𝑨𝑰 ❩ ───── •*\n\n${aiReply}\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`;
            
            await reply(finalMessage);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في الذكاء الاصطناعي:', error.response ? error.response.data : error.message);
            await sock.sendPresenceUpdate('paused', from);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            
            // تحديد سبب المشكلة بدقة إذا فشل
            if (error.response && error.response.status === 401) {
                reply('❌ *مـفـتـاح OpenAI خـاطـئ أو تـم إيـقـافـه مـن قـبـل الـشـركـة.*');
            } else if (error.response && error.response.status === 429) {
                reply('⚠️ *عـذراً، رصـيـد مـفـتـاحـك (API) قـد نـفـد، أو هـنـاك ضـغـط كـبـيـر.*');
            } else {
                reply('❌ *حـدث خـطـأ فـي الاتـصـال بـالـسـيـرفـر الـرئـيـسـي.*');
            }
        }
    }
};
