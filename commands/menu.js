module.exports = {
    name: 'menu',
    aliases: ['الاوامر', 'أوامر', 'مهام', 'قائمة', 'help'],
    execute: async ({ sock, msg, reply, from, pushName, prefix }) => {
        
        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // تصميم القائمة الجديد (دقيق جداً، متناسق، ولا ينكسر في شاشات الجوال)
            const menuText = `
*• ────── ❨ 👑 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑 ❩ ────── •*

👤 *مـرحـبـاً بـك :* [ ${pushName} ]
🤖 *الــنــظــام :* طرزان الواقدي 𝑷𝑹𝑶
✨ *الإصــــدار :* 3.0 (النسخة الملكية)

*• ───── ❨ 🧠 الذكاء الاصطناعي ❩ ───── •*
✦ ${prefix}تخيل ↤ [ رسم خيالي بالذكاء ]
✦ ${prefix}apls ↤ [ إضافة مفتاح Gemini ]
✦ .تفعيل الذكاء ↤ [ تشغيل الرد الآلي ]
✦ .تعطيل الذكاء ↤ [ إيقاف الرد الآلي ]

*• ───── ❨ 🎨 التصميم والميديا ❩ ───── •*
✦ ${prefix}عزل ↤ [ إزالة الخلفية بدقة ]
✦ ${prefix}توضيح ↤ [ تحسين الصور لـ 4K ]
✦ ${prefix}لوجو ↤ [ صنع شعارات 3D (1-5) ]
✦ ${prefix}ستيكر ↤ [ تحويل الميديا لملصق ]
✦ ${prefix}ig ↤ [ تحميل مقاطع انستغرام ]

*• ───── ❨ ⚔️ الإدارة والجيوش ❩ ───── •*
✦ ${prefix}تفاعل ↤ [ إطلاق جيش القنوات ]
✦ ${prefix}طرد ↤ [ طرد العضو المزعج ]
✦ ${prefix}رفع ↤ [ ترقية عضو لمشرف ]
✦ ${prefix}تنزيل ↤ [ سحب رتبة الإشراف ]
✦ ${prefix}منشن ↤ [ نداء لجميع الأعضاء ]

*• ───── ❨ 🛠️ أدوات إضـافـيـة ❩ ───── •*
✦ ${prefix}انطق ↤ [ تحويل النص إلى صوت ]
✦ ${prefix}طقس ↤ [ معرفة الطقس بأي مدينة ]
✦ ${prefix}مزيف ↤ [ صنع اقتباس وهمي ]

*• ──────────────────────── •*
*— 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝑩𝒚 𝑻𝒂𝒓𝒛𝒂𝒏 𝑴𝒂𝒔𝒕𝒆𝒓 🚀*
`.trim();

            // صورة فخمة جداً للواجهة
            const imageUrl = 'https://i.pinimg.com/736x/8a/8d/6c/8a8d6c8b6b27d49de6517ba609fcdbb6.jpg';

            // إرسال الصورة مع القائمة بدقة عالية
            await sock.sendMessage(from, { 
                image: { url: imageUrl }, 
                caption: menuText 
            }, { quoted: msg });

            // تفاعل إتمام المهمة
            await sock.sendMessage(from, { react: { text: '👑', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في إرسال القائمة:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *عذراً، حدث خطأ أثناء جلب القائمة الملكية.*');
        }
    }
};
