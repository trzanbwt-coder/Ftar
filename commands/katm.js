const axios = require('axios');

module.exports = {
    name: 'ذكاء',
    aliases: ['سؤال', 'بوت', 'ai', 'chat'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        if (args.length === 0) {
            return reply('❌ *يـرجـى كـتـابـة سـؤالـك بـعـد الأمـر.*\n*مـثـال:* `.ذكاء من هو مخترع الكهرباء؟`');
        }

        const prompt = args.join(' ');

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // 🔑 المفتاح الخاص بك
            const API_KEY = 'AI_1d21219cc3914971'; 
            
            // ✅ الرابط العام الذي سيصل إليه سيرفر رندر
            const API_URL = 'http://Fi5.bot-hosting.net:22214/api/chat'; 

            // إرسال الطلب من رندر إلى Bot-Hosting
            const response = await axios.post(API_URL, {
                api_key: API_KEY,
                prompt: prompt
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.status === 'success') {
                const aiReply = response.data.response;
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                await reply(`*🧠 𝑻𝑨𝑹𝒁𝑨𝑵 𝑨𝑰 🧠*\n\n${aiReply}`);
            } else {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await reply('❌ *عـذراً، تـم رفـض الـطـلـب مـن الـسـيـرفـر.*');
            }

        } catch (error) {
            console.error('❌ تفاصيل خطأ الذكاء الاصطناعي:');
            if (error.response) {
                console.error('السيرفر رد بخطأ:', error.response.data);
                reply(`❌ *خطأ من السيرفر:* ${error.response.data.error || 'تأكد من المفتاح'}`);
            } else if (error.request) {
                console.error('لم يتمكن من الوصول للسيرفر:', error.message);
                reply('❌ *لا يمكن الوصول لسيرفر الذكاء الاصطناعي. تأكد أن بوت البايثون يعمل.*');
            } else {
                console.error('خطأ في الكود:', error.message);
            }

            await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
        }
    }
};
