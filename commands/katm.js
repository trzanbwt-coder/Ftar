const { createCanvas, loadImage } = require('@napi-rs/canvas');

module.exports = {
    name: 'stamp',
    aliases: ['ختم', 'توقيع', 'ختمي', 'شعار'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        if (args.length === 0) {
            return reply('❌ *يـرجـى كـتـابـة الاسـم الـذي تـريـده عـلـى الـخـتـم.*\n*مـثـال:* `.ختم طرزان`');
        }

        const name = args.join(' ');

        try {
            await sock.sendMessage(from, { react: { text: '🔥', key: msg.key } });
            await reply('⏳ *جـاري صـب الـمـعـدن وصـنـاعـة الـخـتـم الـمـلـكـي ثـلاثـي الأبـعـاد (3D)...*');

            const width = 1080;
            const height = 1080;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            const cx = width / 2;
            const cy = height / 2;

            // 1. خلفية جلدية داكنة جداً (لإبراز الذهب)
            const bgGradient = ctx.createRadialGradient(cx, cy, 100, cx, cy, 800);
            bgGradient.addColorStop(0, '#1a1a1a'); // رمادي داكن في المنتصف
            bgGradient.addColorStop(1, '#050505'); // أسود حالك في الأطراف
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, width, height);

            // 2. تدرجات الذهب الخرافية (للمعدن)
            // التدرج الأساسي لمعان الذهب
            const goldGradient = ctx.createLinearGradient(100, 100, 980, 980);
            goldGradient.addColorStop(0, '#BF953F');
            goldGradient.addColorStop(0.25, '#FCF6BA');
            goldGradient.addColorStop(0.5, '#b38728');
            goldGradient.addColorStop(0.75, '#FBF5B7');
            goldGradient.addColorStop(1, '#AA771C');

            // تدرج معكوس لصناعة الحواف البارزة (Bevel Illusion)
            const goldReverse = ctx.createLinearGradient(980, 980, 100, 100);
            goldReverse.addColorStop(0, '#BF953F');
            goldReverse.addColorStop(0.25, '#FCF6BA');
            goldReverse.addColorStop(0.5, '#b38728');
            goldReverse.addColorStop(0.75, '#FBF5B7');
            goldReverse.addColorStop(1, '#AA771C');

            // 3. رسم الظل العميق الساقط للختم (كأنه جسم ثقيل 3D)
            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 60;
            ctx.shadowOffsetX = 15;
            ctx.shadowOffsetY = 25;

            // 4. قاعدة الختم (القرص الذهبي الأكبر)
            ctx.beginPath();
            ctx.arc(cx, cy, 400, 0, Math.PI * 2);
            ctx.fillStyle = goldGradient;
            ctx.fill();

            // إلغاء الظل الخارجي لكي لا يؤثر على النقوش الداخلية
            ctx.shadowColor = 'transparent';

            // 5. حواف الختم الداخلية (محفورة وبارزة)
            const drawRing = (radius, thickness, gradient, isEngraved) => {
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.lineWidth = thickness;
                ctx.strokeStyle = gradient;
                
                // إضافة ظل داخلي خفيف لصناعة العمق 3D
                if (isEngraved) {
                    ctx.shadowColor = 'rgba(0,0,0,0.6)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 3;
                    ctx.shadowOffsetY = 3;
                } else {
                    ctx.shadowColor = 'rgba(255,255,255,0.4)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = -2;
                    ctx.shadowOffsetY = -2;
                }
                ctx.stroke();
                ctx.shadowColor = 'transparent'; // إعادة الضبط
            };

            // رسم حلقات متعددة ليعطي شكل العملة أو الختم الملكي
            drawRing(380, 15, goldReverse, true); // حلقة محفورة
            drawRing(350, 4, goldGradient, false); // خط بارز رفيع
            drawRing(230, 8, goldReverse, true); // حلقة محفورة داخلية

            // 6. نصوص وزخارف دائرية (باللغة الإنجليزية لضمان عدم تشوهها بالدوران)
            // دالة لرسم النص الدائري
            const drawCircularText = (text, radius, angleOffset) => {
                ctx.font = 'bold 38px Arial';
                ctx.fillStyle = '#6b4e0b'; // لون ذهبي داكن محفور
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // ظل النقش المحفور (Engraved Text 3D Effect)
                ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = -1;
                ctx.shadowOffsetY = -1;

                const step = (Math.PI * 2) / text.length;
                for (let i = 0; i < text.length; i++) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(i * step + angleOffset);
                    ctx.translate(0, -radius);
                    ctx.fillText(text[i], 0, 0);
                    // لون غامق للحفر
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
                    ctx.fillText(text[i], 0, 0);
                    ctx.restore();
                }
                ctx.shadowColor = 'transparent';
            };

            // رسم النص الدائري (OFFICIAL VIP SEAL) مرتين لملئ الدائرة
            drawCircularText(" ★ OFFICIAL VIP SEAL ★ APPROVED ", 290, 0);
            
            // 7. النجوم الزخرفية
            ctx.font = '50px Arial';
            ctx.fillStyle = '#6b4e0b';
            ctx.fillText('★', cx - 140, cy);
            ctx.fillText('★', cx + 140, cy);

            // 8. السحر الحقيقي: رسم الاسم الثلاثي الأبعاد (3D Embossed Text) في المركز
            // نقوم بطباعة النص 3 مرات بطبقات مختلفة
            
            ctx.font = 'bold 110px Tahoma, Arial Black, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // الطبقة 1: الظل الداكن (العمق) - تحت النص
            ctx.fillStyle = '#3a270b'; // بني/أسود معدني
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 8;
            ctx.shadowOffsetY = 12;
            ctx.fillText(name, cx + 5, cy + 5);
            ctx.fillText(name, cx + 4, cy + 4);
            ctx.fillText(name, cx + 3, cy + 3);

            // الطبقة 2: لمعة الضوء (الإضاءة العلوية) - فوق الظل
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = '#ffffe0'; // أصفر فاتح جداً / أبيض
            ctx.fillText(name, cx - 2, cy - 2);

            // الطبقة 3: واجهة النص (المعدن الأساسي)
            ctx.fillStyle = goldGradient;
            ctx.fillText(name, cx, cy);

            // كتابة صغيرة أسفل الاسم
            ctx.font = 'bold 28px Arial';
            
            // تأثير 3D للكلمة الصغيرة
            ctx.fillStyle = '#3a270b';
            ctx.fillText('SIGNATURE', cx + 2, cy + 92);
            ctx.fillStyle = goldGradient;
            ctx.fillText('SIGNATURE', cx, cy + 90);


            // 9. تصدير التحفة الفنية
            const buffer = await canvas.encode('png');

            const captionMsg = `
*• ───── ❨ ⚜️ الـخـتـم الـمـلـكـي ❩ ───── •*

👑 *الاسـم:* ${name}
✨ *الـنـوع:* خـتـم ذهـبـي ثـلاثـي الأبـعـاد (3D)

*— صـُنـع بـفـخـامـة بـواسـطـة 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*
`.trim();

            await sock.sendMessage(from, { 
                image: buffer, 
                caption: captionMsg 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الختم 3D:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ أثـنـاء صـب الـمـعـدن وتـشـكـيـل الـخـتـم.*');
        }
    }
};
