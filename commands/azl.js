const axios = require('axios');

module.exports = {
    name: 'search',
    aliases: ['بحث', 'دقدق', 'معلومة', 'ddg'],
    execute: async ({ sock, msg, text, reply, from }) => {
        
        // التحقق من وجود كلمة للبحث
        if (!text) {
            return reply('❌ *يـرجـى كـتـابـة مـا تـريـد الـبـحـث عـنـه.*\n*مـثـال:* `.بحث ثقب أسود` أو `.بحث جافا سكريبت`');
        }

        try {
            // تفاعل يدل على أن البوت يبحث
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            // إرسال الطلب إلى DuckDuckGo API
            // أضفنا no_html=1 لإزالة الأكواد البرمجية من النص، و skip_disambig=1 لتخطي صفحات التوجيه
            const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(text)}&format=json&no_html=1&skip_disambig=1`;
            
            const response = await axios.get(apiUrl);
            const data = response.data;

            // استخراج البيانات من الـ JSON
            const heading = data.Heading || text;
            const abstract = data.AbstractText;
            const source = data.AbstractSource || 'DuckDuckGo';
            const url = data.AbstractURL || '';

            // 1. إذا وجد إجابة مباشرة (خلاصة الموضوع)
            if (abstract) {
                const resultMsg = `
*• ───── ❨ 🔍 نـتـيـجـة الـبـحـث ❩ ───── •*

📌 *الـعـنـوان:* ${heading}

📖 *الـخـلاصـة:*
${abstract}

🔗 *الـمـصـدر (${source}):*
${url}

*— مـحـرك 𝑻𝑨𝑹𝒁𝑨𝑵 الـسـري 👑*
`.trim();

                await reply(resultMsg);
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } 
            // 2. إذا لم يجد خلاصة مباشرة، لكن وجد نتائج مقترحة (Related Topics)
            else if (data.RelatedTopics && data.RelatedTopics.length > 0 && data.RelatedTopics[0].Text) {
                const fallbackText = data.RelatedTopics[0].Text;
                const fallbackUrl = data.RelatedTopics[0].FirstURL || '';
                
                const suggestedMsg = `
*• ───── ❨ 🔍 نـتـيـجـة مـقـتـرحـة ❩ ───── •*

📌 *مـوضـوع ذو صـلـة بـبـحـثـك:*
${fallbackText}

${fallbackUrl ? `🔗 *الـرابـط:*\n${fallbackUrl}\n` : ''}
*— مـحـرك 𝑻𝑨𝑹𝒁𝑨𝑵 الـسـري 👑*
`.trim();

                await reply(suggestedMsg);
                await sock.sendMessage(from, { react: { text: '☑️', key: msg.key } });

            } 
            // 3. إذا لم يجد أي شيء إطلاقاً
            else {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply('❌ *لـم أعـثـر عـلـى أي إجـابـات مـبـاشـرة حـول هـذا الـمـوضـوع.*');
            }

        } catch (error) {
            console.error('❌ خطأ في محرك البحث:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ أثـنـاء الاتـصـال بـمـحـرك الـبـحـث (DuckDuckGo).*');
        }
    }
};
