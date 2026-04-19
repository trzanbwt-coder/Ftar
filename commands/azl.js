const { createCanvas, loadImage } = require('@napi-rs/canvas');
const QRCode = require('qrcode');

module.exports = {
    name: 'invoice',
    aliases: ['فاتورة', 'فاتوره', 'مبيعات', 'اصدار_فاتورة', 'فواتير'],
    execute: async ({ sock, msg, args, reply, from, text }) => {
        
        const command = text ? text.split(' ')[0].replace('.', '') : '';

        // ==========================================
        // الخطوة 1: طلب الفاتورة (إرسال النموذج المطور)
        // ==========================================
        if (['فاتورة', 'فاتوره', 'مبيعات', 'فواتير'].includes(command)) {
            const templateMsg = `
*• ───── ❨ 🧾 نـظـام الـفـواتـيـر VIP ❩ ───── •*

📌 *انـسـخ الـنـمـوذج بـالأسـفـل، عـبـئـه، ثـم أرسـلـه:*

.اصدار_فاتورة
اسم العميل: 
رقم الجوال: 
نوع البيع: [جملة أو تجزئة]
المنتجات:
- المنتج | السعر | الكمية | شرح تفصيلي للمنتج (اختياري)
- المنتج | السعر | الكمية
- المنتج | السعر

*💡 أمـثـلـة لـكـتـابـة الـمـنـتـجـات:*
- ايفون 15 برو | 4500 | 2 | هاتف ذكي سعة 256 جيجا لون تيتانيوم
- شاحن انكر | 150 | 5
- كفر حماية | 50
*(افـصـل بـيـن الـبـيـانـات بـعـلامـة | )*
`.trim();

            return reply(templateMsg);
        }

        // ==========================================
        // الخطوة 2: استلام النموذج وإنشاء الفاتورة
        // ==========================================
        if (command === 'اصدار_فاتورة') {
            
            const fullText = text;
            
            // استخراج البيانات الأساسية
            const nameMatch = fullText.match(/اسم العميل:\s*(.+)/);
            const customerName = nameMatch ? nameMatch[1].trim() : 'عميل نقدي';

            const phoneMatch = fullText.match(/رقم الجوال:\s*(.+)/);
            const customerPhone = phoneMatch ? phoneMatch[1].trim() : 'غير مسجل';

            const typeMatch = fullText.match(/نوع البيع:\s*(.+)/);
            let saleType = typeMatch ? typeMatch[1].trim() : 'تجزئة';

            // استخراج المنتجات بذكاء عالي
            const products = [];
            const lines = fullText.split('\n');
            
            for (let line of lines) {
                line = line.trim();
                // نبحث عن الأسطر التي تبدأ بـ - أو * وتحتوي على علامة |
                if ((line.startsWith('-') || line.startsWith('*')) && line.includes('|')) {
                    let cleanLine = line.substring(1).trim();
                    let parts = cleanLine.split('|').map(p => p.trim());
                    
                    if (parts.length >= 2) {
                        const name = parts[0];
                        const price = parseInt(parts[1].replace(/[^\d]/g, '')) || 0;
                        const qty = parts.length >= 3 ? (parseInt(parts[2].replace(/[^\d]/g, '')) || 1) : 1;
                        const desc = parts.length >= 4 ? parts[3] : '';
                        
                        if (name && price > 0) {
                            products.push({ 
                                name, 
                                price, 
                                qty, 
                                desc,
                                totalLine: price * qty 
                            });
                        }
                    }
                }
            }

            if (products.length === 0) {
                return reply('❌ *لـم يـتـم الـتـعـرف عـلـى الـمـنـتـجـات! تـأكـد مـن اسـتـخـدام عـلامـة ( | ) بـيـن الاسـم والـسـعـر.*');
            }

            // إعدادات الفاتورة
            const invoiceNum = 'WQ-' + Math.floor(Math.random() * 900000 + 100000);
            const dateObj = new Date();
            const date = dateObj.toLocaleDateString('en-GB'); 
            const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' });

            try {
                await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
                await reply('⏳ *جـاري صـنـاعـة الـفـاتـورة الـمـلـكـيـة بـأدق الـتـفـاصـيـل...*');

                // حساب الارتفاع الديناميكي للورقة
                let tableHeightNeeded = 0;
                products.forEach(p => { tableHeightNeeded += p.desc ? 90 : 60; }); // مساحة أكبر إذا كان هناك وصف
                
                const width = 1200;
                const baseHeight = 1000; // المساحة الأساسية للترويسة والفوتر
                const height = baseHeight + Math.max(tableHeightNeeded, 400); // 400 كحد أدنى للجدول
                
                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                // الألوان الفخمة
                const bgColor = '#ffffff';
                const primaryColor = '#101820'; // كحلي/أسود ليلي فخم
                const goldColor = '#D4AF37'; // ذهبي ملكي
                const accentColor = saleType.includes('جملة') ? '#8B0000' : '#003366'; // أحمر غامق للجملة، أزرق غامق للتجزئة
                const tableHeaderColor = '#F2AA4C'; // لون ذهبي/برتقالي لعناوين الجدول

                // 1. الخلفية
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, width, height);

                // إطار خارجي فخم مزدوج
                ctx.strokeStyle = primaryColor;
                ctx.lineWidth = 4;
                ctx.strokeRect(30, 30, width - 60, height - 60);
                ctx.strokeStyle = goldColor;
                ctx.lineWidth = 1;
                ctx.strokeRect(38, 38, width - 76, height - 76);

                // 2. الترويسة العليا (Header)
                ctx.fillStyle = primaryColor;
                ctx.fillRect(38, 38, width - 76, 140);
                
                ctx.fillStyle = goldColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 60px Tahoma';
                ctx.fillText('شــركــة الــواقــدي لـلإلـكـتـرونـيـات', width / 2, 90);
                
                ctx.fillStyle = '#ffffff';
                ctx.font = '24px Tahoma';
                ctx.fillText('AL-WAQDI ELECTRONICS CO. | Commercial Reg: 1010123456 | VAT: 300123456780003', width / 2, 145);

                // 3. قسم بيانات الفاتورة والعميل (مربعات أنيقة)
                const infoY = 220;
                ctx.strokeStyle = '#ecf0f1';
                ctx.lineWidth = 2;
                
                // مربع العميل (يمين)
                ctx.fillStyle = '#fdfdfd';
                ctx.fillRect(620, infoY, 520, 160);
                ctx.strokeRect(620, infoY, 520, 160);
                
                // مربع الفاتورة (يسار)
                ctx.fillRect(60, infoY, 520, 160);
                ctx.strokeRect(60, infoY, 520, 160);

                ctx.textAlign = 'right';
                ctx.fillStyle = primaryColor;
                ctx.font = 'bold 28px Tahoma';
                
                // تفاصيل العميل
                ctx.fillStyle = accentColor;
                ctx.fillText('بـيـانـات الـعـمـيـل (Customer Info)', 1110, infoY + 40);
                ctx.fillStyle = primaryColor;
                ctx.font = '26px Tahoma';
                ctx.fillText(`الاسـم : ${customerName}`, 1110, infoY + 90);
                ctx.fillText(`الـجـوال : ${customerPhone}`, 1110, infoY + 130);

                // تفاصيل الفاتورة
                ctx.fillStyle = accentColor;
                ctx.font = 'bold 28px Tahoma';
                ctx.fillText('بـيـانـات الـفـاتـورة (Invoice Info)', 550, infoY + 40);
                ctx.fillStyle = primaryColor;
                ctx.font = '26px Tahoma';
                ctx.fillText(`رقم الفاتورة : ${invoiceNum}`, 550, infoY + 90);
                ctx.fillText(`التاريخ : ${date}   ${time}`, 550, infoY + 130);
                ctx.fillStyle = goldColor;
                ctx.fillText(`نوع البيع : ${saleType}`, 200, infoY + 90);

                // 4. الجدول الاحترافي الدقيق
                let currentY = 430;
                
                // إعدادات أعمدة الجدول (الإحداثيات)
                const cols = {
                    index: { x: 1080, w: 60, title: 'م' },
                    desc: { x: 500, w: 580, title: 'الـبـيـان والـتـفـاصـيـل' },
                    qty: { x: 380, w: 120, title: 'الكمية' },
                    price: { x: 200, w: 180, title: 'سعر الوحدة' },
                    total: { x: 60, w: 140, title: 'الإجمالي' }
                };

                // رسم رأس الجدول
                ctx.fillStyle = primaryColor;
                ctx.fillRect(60, currentY, width - 120, 60);
                
                ctx.fillStyle = goldColor;
                ctx.font = 'bold 24px Tahoma';
                ctx.textAlign = 'center';
                
                for (let key in cols) {
                    ctx.fillText(cols[key].title, cols[key].x + (cols[key].w / 2), currentY + 35);
                }
                currentY += 60;

                // رسم المنتجات
                let subTotal = 0;
                let isGray = false; // لتبادل الألوان (Zebra striping)

                products.forEach((item, index) => {
                    subTotal += item.totalLine;
                    const rowH = item.desc ? 90 : 60; // ارتفاع الصف يعتمد على وجود الوصف

                    // تلوين خلفية الصف بالتبادل
                    ctx.fillStyle = isGray ? '#f9f9f9' : '#ffffff';
                    ctx.fillRect(60, currentY, width - 120, rowH);
                    isGray = !isGray;

                    // رسم الخطوط العمودية للفواصل
                    ctx.strokeStyle = '#ecf0f1';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(60, currentY, width - 120, rowH);
                    for (let key in cols) {
                        if(key !== 'total') {
                            ctx.beginPath();
                            ctx.moveTo(cols[key].x, currentY);
                            ctx.lineTo(cols[key].x, currentY + rowH);
                            ctx.stroke();
                        }
                    }

                    // طباعة بيانات المنتج
                    ctx.fillStyle = primaryColor;
                    ctx.textAlign = 'center';
                    
                    // الرقم والكمية
                    ctx.font = 'bold 24px Tahoma';
                    ctx.fillText((index + 1).toString(), cols.index.x + (cols.index.w / 2), currentY + (rowH / 2));
                    ctx.fillText(item.qty.toString(), cols.qty.x + (cols.qty.w / 2), currentY + (rowH / 2));

                    // السعر والإجمالي (باللون الأخضر الغامق للتمييز)
                    ctx.fillStyle = '#27ae60';
                    ctx.fillText(item.price.toLocaleString(), cols.price.x + (cols.price.w / 2), currentY + (rowH / 2));
                    ctx.fillText(item.totalLine.toLocaleString(), cols.total.x + (cols.total.w / 2), currentY + (rowH / 2));

                    // اسم المنتج والوصف (محاذاة لليمين)
                    ctx.fillStyle = primaryColor;
                    ctx.textAlign = 'right';
                    
                    if (item.desc) {
                        ctx.font = 'bold 24px Tahoma';
                        ctx.fillText(item.name, cols.desc.x + cols.desc.w - 20, currentY + 35);
                        ctx.fillStyle = '#7f8c8d'; // لون رمادي للوصف
                        ctx.font = '18px Tahoma';
                        ctx.fillText(item.desc, cols.desc.x + cols.desc.w - 20, currentY + 70);
                    } else {
                        ctx.font = 'bold 24px Tahoma';
                        ctx.fillText(item.name, cols.desc.x + cols.desc.w - 20, currentY + 35);
                    }

                    currentY += rowH;
                });

                // إغلاق الجدول من الأسفل
                ctx.beginPath(); ctx.moveTo(60, currentY); ctx.lineTo(width - 60, currentY); ctx.stroke();
                
                // 5. حسابات الإجمالي والضريبة
                const taxRate = 0.15;
                const taxAmount = subTotal * taxRate;
                const grandTotal = subTotal + taxAmount;

                currentY += 40;

                // صندوق الإجماليات (يسار الفاتورة أسفل الجدول)
                const totalW = 450;
                const totalX = 60;
                
                const drawSummaryRow = (label, value, isGrand = false) => {
                    ctx.fillStyle = isGrand ? primaryColor : '#fdfdfd';
                    ctx.fillRect(totalX, currentY, totalW, 50);
                    ctx.strokeRect(totalX, currentY, totalW, 50);

                    ctx.fillStyle = isGrand ? goldColor : primaryColor;
                    ctx.textAlign = 'right';
                    ctx.font = isGrand ? 'bold 26px Tahoma' : 'bold 22px Tahoma';
                    ctx.fillText(label, totalX + totalW - 20, currentY + 32);
                    
                    ctx.textAlign = 'left';
                    ctx.fillStyle = isGrand ? '#ffffff' : '#27ae60';
                    ctx.fillText(value + ' ر.ي', totalX + 20, currentY + 32);
                    
                    currentY += 50;
                };

                drawSummaryRow('الإجمالي الفرعي (بدون ضريبة):', subTotal.toLocaleString());
                drawSummaryRow('ضريبة القيمة المضافة (15%):', taxAmount.toLocaleString());
                drawSummaryRow('الإجمالي المستحق الدفع:', grandTotal.toLocaleString(), true);

                // 6. توليد الباركود (QR Code) الذكي
                const qrData = `
شركة الواقدي للإلكترونيات
الرقم الضريبي: 300123456780003
التاريخ: ${date} ${time}
العميل: ${customerName}
المبلغ الإجمالي: ${grandTotal.toLocaleString()} ريال
رقم الفاتورة: ${invoiceNum}
                `.trim();
                
                const qrDataUrl = await QRCode.toDataURL(qrData, {
                    errorCorrectionLevel: 'H', margin: 1, color: { dark: primaryColor, light: '#ffffff' }
                });

                const qrImage = await loadImage(qrDataUrl);
                const qrSize = 180;
                // رسم الباركود يمين الفاتورة مقابل صندوق الإجماليات
                ctx.drawImage(qrImage, width - qrSize - 100, currentY - 150, qrSize, qrSize);

                // 7. التوقيعات والشروط في الأسفل
                currentY += 80;
                ctx.fillStyle = primaryColor;
                ctx.textAlign = 'center';
                ctx.font = 'bold 22px Tahoma';
                
                ctx.fillText('توقيع المحاسب', width - 250, currentY);
                ctx.fillText('توقيع أو ختم العميل', 250, currentY);

                ctx.strokeStyle = '#bdc3c7'; ctx.setLineDash([5, 5]);
                ctx.beginPath(); ctx.moveTo(width - 350, currentY + 40); ctx.lineTo(width - 150, currentY + 40); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(150, currentY + 40); ctx.lineTo(350, currentY + 40); ctx.stroke();
                ctx.setLineDash([]); // إعادة الخط لمتصل

                // الشروط
                ctx.fillStyle = '#7f8c8d';
                ctx.font = '18px Tahoma';
                ctx.fillText('شروط وأحكام البيع: البضاعة المباعة تستبدل خلال 3 أيام فقط بشرط سلامة الكرتون والملحقات.', width / 2, height - 70);
                ctx.fillText('الضمان للأجهزة الإلكترونية سنتان عبر الوكيل المعتمد ولا يشمل سوء الاستخدام.', width / 2, height - 45);

                // 8. إرسال التحفة الفنية
                const buffer = await canvas.encode('png');

                const captionMsg = `
*• ───── ❨ 🧾 فـاتـورة VIP ❩ ───── •*

👤 *الـعـمـيـل:* ${customerName}
📦 *عـدد الـمـنـتـجـات:* ${products.length}
💰 *الإجـمـالـي:* ${grandTotal.toLocaleString()} ر.ي

*— نـظـام الـواقـدي الـمـحـاسـبـي 👑*
`.trim();

                await sock.sendMessage(from, { 
                    image: buffer, 
                    caption: captionMsg 
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (error) {
                console.error('❌ خطأ في أمر الفاتورة المطور:', error);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply('❌ *حـدث خـطـأ فـي تـولـيـد الـفـاتـورة.*');
            }
        }
    }
};
