const axios = require('axios');

module.exports = {
    name: 'blackcard',
    aliases: ['بطاقة', 'فيزا', 'عضوية'],
    execute: async ({ sock, msg, args, text, reply, from }) => {
        if (!text) return reply('❌ *يرجى كتابة اسمك لإصدار البطاقة.*\n*مثال:* `.بطاقة محمد`');

        try {
            await sock.sendMessage(from, { react: { text: '💳', key: msg.key } });
            await reply('⏳ *جاري إصدار بطاقة Tarzan VIP Black Card...*');

            // استخدام API يولد تصميم فخم
            const apiUrl = `https://api.popcat.xyz/biden?text=${encodeURIComponent('TARZAN VIP MEMBER: ' + text)}`;
            
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: `💳 *تـم إصـدار بـطـاقـتـك الـمـلـكـيـة يـا [ ${text} ]*\n*حـافـظ عـلـيـهـا.* \n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            reply('❌ *فشل إصدار البطاقة.*');
        }
    }
};
