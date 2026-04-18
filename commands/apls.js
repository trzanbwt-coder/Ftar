const { createCanvas } = require('canvas');

module.exports = {
    name: 'receipt',
    aliases: ['حواله', 'حوالة', 'سند', 'صرف'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        // المتوقع: .حواله طارق الواقدي | 7737996293 | 50000
        const input = args.join(' ');
        const details = input.split('|').map(item => item.trim());

        if (details.length < 3) {
            return reply('❌ *طـريـقـة الاسـتـخـدام:* `.حواله الاسم | الهاتف | المبلغ`\n*مـثـال:* `.حواله طارق الواقدي | 7737996293 | 50000`');
        }

        const name = details[0];
        const phone = details[1];
        
        // تنظيف المبلغ وإضافة الفواصل (مثال: 50000 تصبح 50,000 ريال)
        const rawAmount = details[2].replace(/[^\d]/g, '');
        const amount = rawAmount ? parseInt(rawAmount).toLocaleString('en-US') + ' ريال' : details[2] + ' ريال';
        
        // ضبط التاريخ والوقت
        const dateObj = new Date();
        const date = dateObj.toLocaleDateString('en-GB'); // صيغة DD/MM/YYYY
        
        // توليد أرقام بنكية واقعية
        const receiptNumber = 'WQ-' + Math.floor(Math.random() * 90000 + 10000);
        const transferNumber = 'TRN-' + Math.floor(Math.random() * 90000000 + 10000000);

        try {
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جـاري طـبـاعـة الـسـنـد مـن الـنـظـام الـمـركـزي (بـدون أخـطـاء)...*');

            // 1. أبعاد دقيقة للسند (1000 عرض × 750 طول - يشبه ورقة A5)
            const width = 1000;
            const height = 750;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // 2. الخلفية البيضاء النقية
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // إطار خارجي مزدوج وفخم
            ctx.strokeStyle = '#1a3a5c'; // أزرق كحلي
            ctx.lineWidth = 6;
            ctx.strokeRect(20, 20, width - 40, height - 40);
            ctx.lineWidth = 2;
            ctx.strokeRect(30, 30, width - 60, height - 60);

            // 3. الترويسة (Header)
            ctx.fillStyle = '#1a3a5c'; 
            ctx.fillRect(30, 30, width - 60, 110);

            // نص الترويسة باللون الأبيض (بدون تشكيل لتجنب الخبيص)
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 45px Arial';
            ctx.fillText('شركة الواقدي للصرافة والتحويلات', width / 2, 70);

            ctx.fillStyle = '#ecf0f1';
            ctx.font = '22px Arial';
            ctx.fillText('Al-Waqdi Exchange & Remittances - License No. 4059', width / 2, 115);

            // 4. عنوان المستند
            ctx.fillStyle = '#c0392b'; // لون أحمر
            ctx.font = 'bold 35px Arial';
            ctx.fillText('سند صرف حوالة مالية', width / 2, 180);

            // 5. الجدول (هندسة دقيقة جداً بالبيكسل لمنع التداخل)
            const tableY = 230;
            const rowH = 60;
            
            // دالة لرسم خلايا الجدول باحترافية
            const drawBox = (x, y, w, h, text, isTitle = false, isAmount = false) => {
                // الخلفية
                if (isTitle) ctx.fillStyle = '#f0f3f4'; // رمادي فاتح جداً للعنوان
                else if (isAmount) ctx.fillStyle = '#e8f8f5'; // أخضر فاتح للمبلغ
                else ctx.fillStyle = '#ffffff'; // أبيض للبيانات
                
                ctx.fillRect(x, y, w, h);
                
                // الإطار
                ctx.strokeStyle = '#7f8c8d';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);

                // النص (توسيط مثالي)
                if (isAmount && !isTitle) {
                    ctx.fillStyle = '#27ae60'; // أخضر غامق
                    ctx.font = 'bold 28px Arial';
                } else {
                    ctx.fillStyle = isTitle ? '#2c3e50' : '#000000';
                    ctx.font = isTitle ? 'bold 24px Arial' : '24px Arial';
                }
                
                ctx.fillText(text, x + (w / 2), y + (h / 2));
            };

            // بناء الجدول (العرض الكلي 900، يبدأ من 50)
            // الصف الأول (رقم السند والتاريخ)
            drawBox(750, tableY, 200, rowH, 'رقم السند', true);
            drawBox(500, tableY, 250, rowH, receiptNumber, false);
            drawBox(300, tableY, 200, rowH, 'التاريخ', true);
            drawBox(50,  tableY, 250, rowH, date, false);

            // الصف الثاني (رقم الحوالة)
            drawBox(750, tableY + rowH, 200, rowH, 'رقم الحوالة', true);
            drawBox(50,  tableY + rowH, 700, rowH, transferNumber, false);

            // الصف الثالث (اسم المستفيد)
            drawBox(750, tableY + (rowH*2), 200, rowH, 'اسم المستفيد', true);
            drawBox(50,  tableY + (rowH*2), 700, rowH, name, false);

            // الصف الرابع (الهاتف والمبلغ)
            drawBox(750, tableY + (rowH*3), 200, rowH, 'رقم الهاتف', true);
            drawBox(500, tableY + (rowH*3), 250, rowH, phone, false);
            drawBox(300, tableY + (rowH*3), 200, rowH, 'المبلغ', true);
            drawBox(50,  tableY + (rowH*3), 250, rowH, amount, false, true); // خلية خضراء


            // 6. التوقيعات (أسفل الجدول)
            const signY = 530;
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('توقيع المستلم', 800, signY);
            ctx.fillText('توقيع المدير العام', 200, signY);

            // خطوط التوقيع
            ctx.strokeStyle = '#bdc3c7';
            ctx.setLineDash([5, 5]); // خط متقطع
            ctx.beginPath(); ctx.moveTo(700, signY + 40); ctx.lineTo(900, signY + 40); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(100, signY + 40); ctx.lineTo(300, signY + 40); ctx.stroke();
            ctx.setLineDash([]); // إعادة الخط لمتصل


            // 7. الختم الدائري الفخم (طرزان الواقدي)
            ctx.save();
            ctx.translate(width / 2, 590); // وضع الختم في منتصف الورقة من الأسفل
            ctx.rotate(-0.15); // إمالة واقعية
            
            const stampColor = 'rgba(192, 57, 43, 0.9)'; // أحمر حبر
            ctx.strokeStyle = stampColor;
            ctx.fillStyle = stampColor;
            
            // دوائر الختم
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.stroke();

            // رسم النص الإنجليزي الدائري في الإطار الخارجي (لأنه لا يتشوه)
            const engText = " AL-WAQDI EXCHANGE - APPROVED -";
            ctx.font = 'bold 16px Arial';
            const radius = 75;
            for (let i = 0; i < engText.length; i++) {
                ctx.save();
                ctx.rotate(i * (Math.PI * 2 / engText.length));
                ctx.fillText(engText[i], 0, -radius);
                ctx.restore();
            }

            // النص العربي (طرزان الواقدي) في مركز الختم بشكل أفقي عريض ومترابط
            ctx.font = 'bold 26px Arial';
            ctx.fillText('طرزان الواقدي', 0, 0);
            
            // نصوص علوية وسفلية داخل الختم
            ctx.font = 'bold 16px Arial';
            ctx.fillText('مُـعـتـمـد', 0, -30);
            ctx.font = 'bold 20px Arial';
            ctx.fillText('PAID', 0, 35);
            
            // نجوم تجميلية
            ctx.font = '14px Arial';
            ctx.fillText('★', -60, 0);
            ctx.fillText('★', 60, 0);

            ctx.restore(); // إنهاء رسم الختم

            // 8. تجهيز الصورة وإرسالها
            const buffer = canvas.toBuffer('image/png');

            const captionMsg = `
*• ───── ❨ 🏦 نـظـام الـصـرافـة ❩ ───── •*

✅ *تـم إصـدار الـسـنـد وتـوثـيـقـه بـنـجـاح*
🔖 *رقـم الـحـوالـة:* ${transferNumber}
👤 *الـمـسـتـلـم:* ${name}

*— الإدارة | 𝑻𝑨𝑹𝒁𝑨𝑵 👑*
`.trim();

            await sock.sendMessage(from, { 
                image: buffer, 
                caption: captionMsg 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في السند النهائي:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ فـي الـنـظـام الـمـركـزي.*');
        }
    }
};
