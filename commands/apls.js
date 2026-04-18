const { createCanvas } = require('canvas');

module.exports = {
    name: 'receipt2',
    aliases: ['صرف', 'سند_فخم', 'حوالة'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        const input = args.join(' ');
        const details = input.split('|').map(item => item.trim());

        if (details.length < 3) {
            return reply('❌ *طـريـقـة الاسـتـخـدام:* `.صرف الاسم | رقم الهاتف | المبلغ`\n*مـثـال:* `.صرف أحمد | 771234567 | 50,000 ريال`');
        }

        const name = details[0];
        const phone = details[1];
        const amount = details[2];
        const date = new Date().toLocaleDateString('ar-EG');
        const time = new Date().toLocaleTimeString('ar-EG');
        const receiptNumber = 'WQ-' + Math.floor(Math.random() * 900000 + 100000);

        try {
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جـاري طـبـاعـة الـسـنـد الـمـالـي...*');

            // إعداد أبعاد الكانفاس (السند)
            const width = 850;
            const height = 550;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // 1. الخلفية (لون كريمي فاتح جداً)
            ctx.fillStyle = '#Fdfdfd';
            ctx.fillRect(0, 0, width, height);

            // إضافة نقش/علامة مائية خفيفة
            ctx.fillStyle = 'rgba(41, 128, 185, 0.03)'; // لون أزرق شفاف جداً
            ctx.font = 'bold 150px Arial';
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'center';
            ctx.fillText('AL-WAQDI', 0, 0);
            ctx.restore();

            // إطار خارجي مزدوج
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 4;
            ctx.strokeRect(15, 15, width - 30, height - 30);
            ctx.lineWidth = 1;
            ctx.strokeRect(22, 22, width - 44, height - 44);

            // 2. ترويسة الشركة (الهيدر)
            // شريط علوي ملون
            ctx.fillStyle = '#2980b9'; // أزرق بنكي
            ctx.fillRect(22, 22, width - 44, 90);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 45px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('شــركــة الــواقــدي لـلـصـرافـة', width / 2, 70);

            ctx.font = '20px Arial';
            ctx.fillText('Al-Waqdi Exchange & Remittances Co.', width / 2, 100);

            // 3. عنوان السند
            ctx.fillStyle = '#c0392b'; // أحمر للعنوان
            ctx.font = 'bold 30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('سـنـد صـرف حـوالـة مـالـيـة', width / 2, 155);

            // 4. رسم الجداول
            const tableY = 190;
            const rowHeight = 60;
            ctx.strokeStyle = '#bdc3c7'; // رمادي للحدود
            ctx.lineWidth = 2;

            // دالة مساعدة لرسم صف في الجدول
            const drawRow = (y, title, value, title2, value2) => {
                ctx.fillStyle = '#ecf0f1'; // لون خلفية خلايا العناوين
                ctx.fillRect(width - 200, y, 150, rowHeight); // عنوان 1 (يمين)
                if (title2) ctx.fillRect(200, y, 150, rowHeight); // عنوان 2 (يسار)

                ctx.strokeRect(50, y, width - 100, rowHeight); // الإطار الخارجي للصف

                // الخطوط العمودية
                ctx.beginPath();
                ctx.moveTo(width - 200, y); ctx.lineTo(width - 200, y + rowHeight);
                ctx.moveTo(width - 500, y); ctx.lineTo(width - 500, y + rowHeight);
                if (title2) {
                    ctx.moveTo(350, y); ctx.lineTo(350, y + rowHeight);
                    ctx.moveTo(200, y); ctx.lineTo(200, y + rowHeight);
                }
                ctx.stroke();

                // النصوص
                ctx.fillStyle = '#2c3e50';
                ctx.textAlign = 'center';
                ctx.font = 'bold 22px Arial';
                
                // العنوان الأول وقيمته
                ctx.fillText(title, width - 125, y + 38);
                ctx.font = '22px Arial';
                ctx.fillText(value, width - 350, y + 38);

                // العنوان الثاني وقيمته (إن وجد)
                if (title2) {
                    ctx.font = 'bold 22px Arial';
                    ctx.fillText(title2, 275, y + 38);
                    ctx.font = '22px Arial';
                    ctx.fillText(value2, 125, y + 38);
                }
            };

            // رسم الصفوف
            drawRow(tableY, 'رقـم الـسـنـد:', receiptNumber, 'الـتـاريـخ:', `${date} ${time}`);
            drawRow(tableY + rowHeight, 'اسـم الـمـسـتـفـيـد:', name, '', ''); // صف طويل للاسم
            drawRow(tableY + (rowHeight * 2), 'رقـم الـهـاتـف:', phone, 'الـمـبـلـغ:', amount);

            // تظليل خلية المبلغ بلون مميز
            ctx.fillStyle = '#e8f8f5'; // أخضر فاتح
            ctx.fillRect(50, tableY + (rowHeight * 2), 150, rowHeight);
            ctx.fillStyle = '#27ae60'; // أخضر غامق
            ctx.font = 'bold 24px Arial';
            ctx.fillText(amount, 125, tableY + (rowHeight * 2) + 38);


            // 5. قسم التوقيعات والختم
            const signY = 440;
            ctx.fillStyle = '#34495e';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('تـوقـيـع الـمـسـتـلـم', width - 150, signY);
            ctx.fillText('تـوقـيـع أمـيـن الـصـنـدوق', 150, signY);

            ctx.beginPath();
            ctx.moveTo(width - 250, signY + 40); ctx.lineTo(width - 50, signY + 40);
            ctx.moveTo(50, signY + 40); ctx.lineTo(250, signY + 40);
            ctx.strokeStyle = '#7f8c8d';
            ctx.stroke();

            // 6. الختم الرسمي (أحمر، دائري، مائل)
            ctx.save();
            ctx.translate(width / 2, signY + 20); // الختم في المنتصف أسفل الجدول
            ctx.rotate(-0.25); // إمالة واقعية
            
            ctx.strokeStyle = '#c0392b';
            ctx.lineWidth = 3;
            
            // الدائرة الخارجية والداخلية
            ctx.beginPath(); ctx.arc(0, 0, 75, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, 65, 0, Math.PI * 2); ctx.stroke();

            // نصوص الختم
            ctx.fillStyle = '#c0392b';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('شـركـة الـواقـدي', 0, -15);
            ctx.font = 'bold 18px Arial';
            ctx.fillText('لـلـصـرافـة', 0, 10);
            
            // خطوط تجميلية داخل الختم
            ctx.beginPath(); ctx.moveTo(-40, 20); ctx.lineTo(40, 20); ctx.stroke();
            
            ctx.font = 'bold 16px Arial';
            ctx.fillText('P A I D - صُــرف', 0, 40);
            ctx.font = '12px Arial';
            ctx.fillText(date, 0, 55);
            
            ctx.restore();

            // تحويل إلى صورة
            const buffer = canvas.toBuffer('image/png');

            const captionMsg = `
*• ───── ❨ 🏦 نـظـام الـصـرافـة الآلـي ❩ ───── •*

✅ *تـم إصـدار الـسـنـد بـنـجـاح*
👤 *الـمـسـتـفـيـد:* ${name}
💰 *الـمـبـلـغ:* ${amount}

*— شـركـة الـواقـدي | 𝑻𝑨𝑹𝒁𝑨𝑵 👑*
`.trim();

            await sock.sendMessage(from, { 
                image: buffer, 
                caption: captionMsg 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في السند المطور:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ فـي نـظـام الـطـبـاعـة.*');
        }
    }
};
