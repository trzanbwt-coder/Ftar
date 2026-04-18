const axios = require('axios');

// خريطة لتخزين المحادثات التي تم تفعيل الذكاء الاصطناعي فيها
const activeChats = new Map();

// 🔑 مفتاح الـ API الرسمي الخاص بك (OpenAI)
// قمت بتعديل الحرف الأول ليكون sk- (حرف صغير) لأن سيرفرات OpenAI تطلب ذلك
const OPENAI_API_KEY = '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';

module.exports = {
    name: 'auto_ai',
    aliases: ['تفعيل', 'الغا', 'تفعيل_الذكاء', 'الغاء_الذكاء'],
    execute: async ({ sock, msg, text, reply, from, isOwner }) => {
        
        const command = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const isActivationCommand = command.includes('تفعيل');

        // 1. نظام التفعيل والإلغاء (للمطور فقط)
        if (command.startsWith('.تفعيل') || command.startsWith('.الغا')) {
            if (!isOwner) return reply('❌ *هذا الأمر السيبراني مخصص للمطور فقط 👑.*');

            if (isActivationCommand) {
                if (activeChats.has(from)) {
                    return reply('⚠️ *نـظـام الـذكـاء الاصـطـنـاعـي مـفـعـل بـالـفـعـل هـنـا.*');
                }
                activeChats.set(from, true);
                return reply('✅ *تـم تـفـعـيـل نـظـام OpenAI الـرسـمـي (طـرزان 𝑽𝑰𝑷) هـنـا 👑.*\n*الـبـوت الآن يـتـمـتـع بـذكـاء خـارق وسـيـرد عـلـى أي شـخـص يـكـلـمـه.*');
            } else {
                if (!activeChats.has(from)) {
                    return reply('⚠️ *الـنـظـام غـيـر مـفـعـل مـن الأسـاس فـي هـذه الـمـحـادثـة.*');
                }
                activeChats.delete(from);
                return reply('🛑 *تـم فـصـل الاتـصـال بـسـيـرفـرات OpenAI وإيـقـاف الـنـظـام.*');
            }
        }

        // 2. التحقق من التفعيل
        if (!activeChats.get(from)) return; 

        // التحقق مما إذا كان المستخدم يكلم البوت 
        const isReplyingToBot = msg.message?.extendedTextMessage?.contextInfo?.participant === sock.user.id;
        const isMentioningBot = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id);
        const isPrivate = !from.endsWith('@g.us');

        // الرد فقط في الخاص، أو عند المنشن/الرد في الجروب
        if (isPrivate || isReplyingToBot || isMentioningBot) {
            
            let userMessage = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            userMessage = userMessage.replace(/@\d+/g, '').trim(); // تنظيف المنشن

            if (!userMessage) return; 

            try {
                // تفاعل "جاري الكتابة..." الحقيقي من الواتساب
                await sock.sendPresenceUpdate('composing', from);
                await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

                // 3. الاتصال المباشر بسيرفرات OpenAI الرسمية (ChatGPT)
                const response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-3.5-turbo', // الموديل السريع والمستقر
                        messages: [
                            {
                                role: 'system',
                                content: 'أنت شخصية فخمة، ذكية، وصاحب كاريزما. اسمك "طرزان". تتحدث باللغة العربية بأسلوب راقٍ ومباشر كأنك إنسان حقيقي، ولا تذكر أبداً أنك ذكاء اصطناعي أو بوت. ردودك دائماً تكون مبهرة، قصيرة ومفيدة.'
                            },
                            {
                                role: 'user',
                                content: userMessage
                            }
                        ],
                        max_tokens: 800, // لتجنب الرسائل الطويلة جداً
                        temperature: 0.7 // نسبة الإبداع في الرد
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${OPENAI_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // استخراج الرد من السيرفر
                const aiReply = response.data.choices[0].message.content.trim();

                // إيقاف تفاعل "جاري الكتابة"
                await sock.sendPresenceUpdate('paused', from);

                // إرسال الرد
                await sock.sendMessage(from, { text: aiReply }, { quoted: msg });

            } catch (error) {
                console.error('❌ خطأ في OpenAI API:', error.response ? error.response.data : error.message);
                
                // رسالة خطأ ذكية في حال نفاد الرصيد من المفتاح
                if (error.response && error.response.status === 429) {
                    await sock.sendMessage(from, { text: '⚠️ *عذراً، يبدو أن هناك ضغطاً على شبكتي العصبية أو أن رصيد الـ API قد انتهى.*' }, { quoted: msg });
                }
            }
        }
    }
};
