const { createCanvas } = require('canvas');

module.exports = {
    name: 'receipt3',
    aliases: ['حواله', 'حوالة', 'سند', 'صرف'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        // المتوقع: .حواله أحمد محمد | 771234567 | 150000
        const input = args.join(' ');
        const details = input.split('|').map(item => item.trim());

        if (details.length < 3) {
            return reply('❌ *طـريـقـة الاسـتـخـدام:* `.حواله الاسم | الهاتف | المبلغ`\n*مـثـال:* `.حواله طارق | 7737996293 | 50,000`');
        }

        const name = details[0];
        const phone = details[1];
        // تنسيق المبلغ لإضافة الفواصل إذا كان رقماً
        const rawAmount = details[2].replace(/[^\d]/g, '');
        const amount = rawAmount ? parseInt(rawAmount).toLocaleString() + ' ر.ي' : details[2] + ' ر.ي';
        
        const dateObj = new Date();
        const date = dateObj.toLocaleDateString('ar-EG');
        const time = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute:'2-digit' });
        
        // أرقام عشوائية واقعية
        const receiptNumber = 'WQ-' + Math.floor(Math.random() * 900000 + 100000);
        const transferNumber = 'TRN-' + Math.floor(Math.random() * 90000000 + 10000000); // رقم الحوالة

        try {
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جـاري اسـتـخـراج سـنـد الـحـوالـة مـن نـظـام الـواقـدي لـلـصـرافـة...*');

            // 1. إعداد أبعاد الكانفاس (السند - حجم مناسب للطباعة A5 تقريباً)
            const width = 900;
            const height = 650;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // 2. الخلفية والورق الرسمي
            // لون أبيض كريمي مريح للعين
            ctx.fillStyle = '#fdfdfd';
            ctx.fillRect(0, 0, width, height);

            // إضافة علامة مائية (Watermark) فخمة
            ctx.fillStyle = 'rgba(230, 230, 230, 0.4)'; 
            ctx.font = 'bold 120px Arial';
            ctx.save();
            ctx.translate(width / 2, height / 2 + 50);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'center';
            ctx.fillText('AL-WAQDI', 0, -40);
            ctx.fillText('EXCHANGE', 0, 80);
            ctx.restore();

            // إطار خارجي أمني
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 8;
            ctx.strokeRect(15, 15, width - 30, height - 30);
            ctx.lineWidth = 1;
            ctx.strokeRect(26, 26, width - 52, height - 52);

            // 3. الترويسة البنكية (الهيدر)
            // شريط أزرق ملكي
            ctx.fillStyle = '#1a3a5c'; 
            ctx.fillRect(26, 26, width - 52, 110);

            // نصوص الهيدر
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 45px Tahoma';
            ctx.textAlign = 'center';
            ctx.fillText('شــركــة الــواقــدي لـلـصـرافـة والـتـحـويـلات', width / 2, 75);

            ctx.fillStyle = '#bdc3c7';
            ctx.font = '22px Arial';
            ctx.fillText('Al-Waqdi Exchange & Remittances Co. - Licensed No. 4059', width / 2, 115);

            // 4. عنوان السند
            ctx.fillStyle = '#c0392b';
            ctx.font = 'bold 32px Tahoma';
            ctx.fillText('ســنــد صــرف حــوالــة', width / 2, 185);

            // 5. الجدول الاحترافي الدقيق
            const startY = 220;
            const rowH = 65;
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#7f8c8d';

            // دالة رسم الخلايا
            const drawCell = (x, y, w, h, text, isHeader, isAmount = false) => {
                // تلوين الخلفية
                if (isHeader) {
                    ctx.fillStyle = '#ecf0f1'; // رمادي فاتح للعناوين
                } else if (isAmount) {
                    ctx.fillStyle = '#e8f8f5'; // أخضر فاتح للمبلغ
                } else {
                    ctx.fillStyle = '#ffffff'; // أبيض للبيانات
                }
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h); // رسم الإطار

                // كتابة النص
                if (isAmount && !isHeader) {
                    ctx.fillStyle = '#27ae60'; // أخضر غامق لقمية المبلغ
                    ctx.font = 'bold 28px Arial';
                } else {
                    ctx.fillStyle = '#2c3e50';
                    ctx.font = isHeader ? 'bold 24px Tahoma' : '26px Arial';
                }
                
                // حساب موقع النص ليكون في المنتصف
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, x + (w / 2), y + (h / 2));
            };

            // هندسة الجدول (العرض الكلي = 800، يبدأ من X=50)
            const marginX = 50;
            const colTitleW = 180; // عرض خلية العنوان
            const colDataW = 220;  // عرض خلية البيانات

            // الصف الأول (رقم السند والتاريخ)
            drawCell(width - marginX - colTitleW, startY, colTitleW, rowH, 'رقـم الـسـنـد', true);
            drawCell(width - marginX - colTitleW - colDataW, startY, colDataW, rowH, receiptNumber, false);
            
            drawCell(width - marginX - (colTitleW*2) - colDataW, startY, colTitleW, rowH, 'الـتـاريـخ', true);
            drawCell(marginX, startY, colDataW, rowH, `${date}  ${time}`, false);

            // الصف الثاني (رقم الحوالة - ميزة جديدة)
            drawCell(width - marginX - colTitleW, startY + rowH, colTitleW, rowH, 'رقـم الـحـوالـة', true);
            drawCell(marginX, startY + rowH, colDataW + colTitleW + colDataW, rowH, transferNumber, false);

            // الصف الثالث (الاسم)
            drawCell(width - marginX - colTitleW, startY + (rowH*2), colTitleW, rowH, 'اسـم الـمـسـتـلـم', true);
            drawCell(marginX, startY + (rowH*2), colDataW + colTitleW + colDataW, rowH, name, false);

            // الصف الرابع (الهاتف والمبلغ)
            drawCell(width - marginX - colTitleW, startY + (rowH*3), colTitleW, rowH, 'رقـم الـهـاتـف', true);
            drawCell(width - marginX - colTitleW - colDataW, startY + (rowH*3), colDataW, rowH, phone, false);
            
            drawCell(width - marginX - (colTitleW*2) - colDataW, startY + (rowH*3), colTitleW, rowH, 'الـمـبـلـغ', true);
            drawCell(marginX, startY + (rowH*3), colDataW, rowH, amount, false, true); // خلية المبلغ مظللة


            // 6. التوقيعات
            const signY = 530;
            ctx.textBaseline = 'alphabetic'; // إعادة الضبط
            ctx.fillStyle = '#34495e';
            ctx.font = 'bold 22px Tahoma';
            ctx.textAlign = 'center';
            ctx.fillText('تـوقـيـع الـمـسـتـلـم', width - 200, signY);
            ctx.fillText('الـمـديـر الـعـام', 200, signY);

            // خطوط التوقيع
            ctx.strokeStyle = '#95a5a6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]); // خط متقطع
            ctx.beginPath(); ctx.moveTo(width - 300, signY + 50); ctx.lineTo(width - 100, signY + 50); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(100, signY + 50); ctx.lineTo(300, signY + 50); ctx.stroke();
            ctx.setLineDash([]); // إعادة الخط المتصل


            // 7. الختم الملكي الدائري (طرزان الواقدي)
            ctx.save();
            ctx.translate(width / 2, signY + 10); // موقع الختم
            ctx.rotate(-0.15); // إمالة خفيفة
            
            const stampColor = 'rgba(192, 57, 43, 0.85)'; // أحمر واقعي شفاف قليلاً
            ctx.strokeStyle = stampColor;
            ctx.fillStyle = stampColor;
            ctx.lineWidth = 4;
            
            // دوائر الختم
            ctx.beginPath(); ctx.arc(0, 0, 85, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 75, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2); ctx.stroke();

            // النص الدائري الملتف (طرزان الواقدي)
            const stampText = "★ طــرزان الــواقــدي ★";
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // رسم النص بشكل دائري في المساحة بين الدائرتين (45 و 75)
            const radiusForText = 60;
            const angleStep = Math.PI / (stampText.length / 1.5);
            let currentAngle = -Math.PI; // البدء من اليسار
            
            for (let i = 0; i < stampText.length; i++) {
                ctx.save();
                ctx.rotate(currentAngle);
                ctx.translate(0, -radiusForText);
                ctx.rotate(Math.PI / 2); // تدوير الحرف ليكون عمودياً على المركز
                ctx.fillText(stampText[i], 0, 0);
                ctx.restore();
                currentAngle += angleStep;
            }

            // النص في مركز الختم
            ctx.font = 'bold 18px Arial';
            ctx.fillText('مُـعـتـمـد', 0, -10);
            ctx.font = 'bold 20px Arial';
            ctx.fillText('PAID', 0, 15);
            
            ctx.restore();

            // 8. تحويل وإرسال الصورة
            const buffer = canvas.toBuffer('image/png');

            const captionMsg = `
*• ───── ❨ 🏦 نـظـام صـرافـة طـرزان ❩ ───── •*

✅ *تـم اعـتـمـاد الـحـوالـة وصـرفـهـا*
🔖 *رقـم الـحـوالـة:* ${transferNumber}
👤 *الـمـسـتـلـم:* ${name}
💰 *الـمـبـلـغ:* ${amount}

*— الإدارة الـعـامـة | 𝑻𝑨𝑹𝒁𝑨𝑵 👑*
`.trim();

            await sock.sendMessage(from, { 
                image: buffer, 
                caption: captionMsg 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في السند V3:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ فـي نـظـام الـطـبـاعـة الـمـركـزي.*');
        }
    }
};
