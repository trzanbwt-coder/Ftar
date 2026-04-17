module.exports = {
    name: 'menu',
    aliases: ['الاوامر', 'أوامر', 'مهام', 'قائمة', 'help'],
    execute: async ({ sock, msg, reply, from, pushName, prefix }) => {
        
        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // 1. حماية وتجميل اسم المستخدم والبادئة (تجنب ظهور كلمة undefined)
            const userName = pushName || 'عضونا الكريم';
            const botPrefix = prefix || '.';

            // تصميم القائمة
            const menuText = `
*• ────── ❨ 👑 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑 ❩ ────── •*

👤 *مـرحـبـاً بـك :* [ ${userName} ]
🤖 *الــنــظــام :* طرزان الواقدي 𝑷𝑹𝑶
✨ *الإصــــدار :* 3.0 (النسخة الملكية)

*• ───── ❨ 🧠 الذكاء الاصطناعي ❩ ───── •*
✦ ${botPrefix}تخيل ↤ [ رسم خيالي بالذكاء ]
✦ ${botPrefix}apls ↤ [ إضافة مفتاح Gemini ]
✦ ${botPrefix}تفعيل الذكاء ↤ [ تشغيل الرد الآلي ]
✦ ${botPrefix}تعطيل الذكاء ↤ [ إيقاف الرد الآلي ]

*• ───── ❨ 🎨 التصميم والميديا ❩ ───── •*
✦ ${botPrefix}عزل ↤ [ إزالة الخلفية بدقة ]
✦ ${botPrefix}توضيح ↤ [ تحسين الصور لـ 4K ]
✦ ${botPrefix}لوجو ↤ [ صنع شعارات 3D (1-5) ]
✦ ${botPrefix}ستيكر ↤ [ تحويل الميديا لملصق ]
✦ ${botPrefix}ig ↤ [ تحميل مقاطع انستغرام ]

*• ───── ❨ ⚔️ الإدارة والجيوش ❩ ───── •*
✦ ${botPrefix}تفاعل ↤ [ إطلاق جيش القنوات ]
✦ ${botPrefix}طرد ↤ [ طرد العضو المزعج ]
✦ ${botPrefix}رفع ↤ [ ترقية عضو لمشرف ]
✦ ${botPrefix}تنزيل ↤ [ سحب رتبة الإشراف ]
✦ ${botPrefix}منشن ↤ [ نداء لجميع الأعضاء ]

*• ───── ❨ 🛠️ أدوات إضـافـيـة ❩ ───── •*
✦ ${botPrefix}انطق ↤ [ تحويل النص إلى صوت ]
✦ ${botPrefix}طقس ↤ [ معرفة الطقس بأي مدينة ]
✦ ${botPrefix}مزيف ↤ [ صنع اقتباس وهمي ]

*• ──────────────────────── •*
*— 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝑩𝒚 𝑻𝒂𝒓𝒛𝒂𝒏 𝑴𝒂𝒔𝒕𝒆𝒓 🚀*
`.trim();

            const imageUrl = 'https://i.pinimg.com/736x/8a/8d/6c/8a8d6c8b6b27d49de6517ba609fcdbb6.jpg';

            // 2. محاولة جلب الصورة وإرسالها بشكل آمن
            try {
                // نحاول تحميل الصورة أولاً للتأكد من أن الرابط يعمل
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error('فشل تحميل الصورة');
                
                const buffer = Buffer.from(await response.arrayBuffer());

                // إذا نجح التحميل، نرسل الصورة مع النص
                await sock.sendMessage(from, { 
                    image: buffer, 
                    caption: menuText 
                }, { quoted: msg });

            } catch (imageError) {
                console.log('⚠️ فشل جلب صورة القائمة، سيتم إرسال النص فقط.');
                // إذا فشل تحميل الصورة (بسبب حماية بنترست)، نرسل النص فقط حتى لا يتعطل البوت
                await sock.sendMessage(from, { 
                    text: menuText 
                }, { quoted: msg });
            }

            // تفاعل إتمام المهمة
            await sock.sendMessage(from, { react: { text: '👑', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في إرسال القائمة:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *عذراً، حدث خطأ داخلي أثناء عرض القائمة الملكية.*');
        }
    }
};
