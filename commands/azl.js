const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = {
    name: 'invoice',
    aliases: ['فاتورة', 'فاتوره', 'مبيعات', 'اصدار_فاتورة', 'فواتير'],
    execute: async ({ sock, msg, reply, from, text }) => {
        
        // ==========================================
        // 1. نظام التعرف الذكي على طلب المستخدم
        // ==========================================
        
        // إذا كان النص فارغاً أو لا يحتوي على "اسم العميل"، نرسل له النموذج
        if (!text || !text.includes('اسم العميل')) {
            const templateMsg = `
*• ───── ❨ 🧾 نـظـام الـفـواتـيـر VIP ❩ ───── •*

📌 *انـسـخ الـنـمـوذج بـالأسـفـل، عـبـئـه، ثـم أرسـلـه:*

.اصدار_فاتورة
اسم العميل: 
رقم الجوال: 
نوع البيع: [جملة أو تجزئة]
المنتجات:
- المنتج | السعر | الكمية | شرح تفصيلي (اختياري)
- المنتج | السعر | الكمية
- المنتج | السعر

*💡 مـثـال لـكـتـابـة الـمـنـتـج:*
- شاشة سامسونج | 120000 | 2 | شاشة سمارت 55 بوصة
`.trim();

            return reply(templateMsg);
        }

        // ==========================================
        // 2. معالجة النموذج وبناء الفاتورة
        // ==========================================
        
        // استخراج البيانات من الرسالة
        const fullText = text;
        
        const nameMatch = fullText.match(/اسم العميل:\s*(.+)/);
        const customerName = nameMatch ? nameMatch[1].trim() : 'عميل نقدي';

        const phoneMatch = fullText.match(/رقم الجوال:\s*(.+)/);
        const customerPhone = phoneMatch ? phoneMatch[1].trim() : 'غير مسجل';

        const typeMatch = fullText.match(/نوع البيع:\s*(.+)/);
        let saleType = typeMatch ? typeMatch[1].trim() : 'تجزئة';

        // استخراج المنتجات بدقة عالية
        const products = [];
        const lines = fullText.split('\n');
        
        for (let line of lines) {
            line = line.trim();
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
                            name, price, qty, desc, totalLine: price * qty 
                        });
                    }
                }
            }
        }

        if (products.length === 0) {
            return reply('❌ *لـم يـتـم الـتـعـرف عـلـى أي مـنـتـج! تـأكـد مـن وضـع عـلامـة ( | ) بـيـن الاسـم والـسـعـر كـمـا فـي الـنـمـوذج.*');
        }

        const invoiceNum = 'WQ-' + Math.floor(Math.random() * 900000 + 100000);
        const dateObj = new Date();
        const date = dateObj.toLocaleDateString('en-GB'); 
        const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' });

        try {
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جـاري طـبـاعـة الـفـاتـورة الـمـلـكـيـة وإصـدار الـبـاركـود...*');

            // 3. تحميل خط عربي فخم تلقائياً لضمان عدم حدوث خبيص
            const fontPath = path.join(__dirname, 'Cairo-Bold.ttf');
            if (!fs.existsSync(fontPath)) {
                const fontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo-Bold.ttf';
                const response = await axios({ url: fontUrl, responseType: 'stream' });
                const writer = fs.createWriteStream(fontPath);
                response.data.pipe(writer);
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
            }
            GlobalFonts.registerFromPath(fontPath, 'Cairo');

            // 4. أبعاد الرسم والتصميم
            let tableHeightNeeded = 0;
            products.forEach(p => { tableHeightNeeded += p.desc ? 100 : 70; });
            
            const width = 1200;
            const baseHeight = 1000; 
            const height = baseHeight + Math.max(tableHeightNeeded, 400); 
            
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            const primaryColor = '#101820'; 
            const goldColor = '#D4AF37'; 
            const accentColor = saleType.includes('جملة') ? '#8B0000' : '#003366'; 
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 4;
            ctx.strokeRect(30, 30, width - 60, height - 60);

            // الترويسة
            ctx.fillStyle = primaryColor;
            ctx.fillRect(38, 38, width - 76, 140);
            
            ctx.fillStyle = goldColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 60px "Cairo", sans-serif';
            ctx.fillText('شــركــة الــواقــدي لـلإلـكـتـرونـيـات', width / 2, 90);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px "Cairo", sans-serif';
            ctx.fillText('AL-WAQDI ELECTRONICS CO. | Commercial Reg: 1010123456 | VAT: 300123456780003', width / 2, 145);

            // مربعات بيانات العميل والفاتورة
            const infoY = 220;
            ctx.fillStyle = '#fdfdfd';
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 2;
            
            ctx.fillRect(620, infoY, 520, 160); ctx.strokeRect(620, infoY, 520, 160);
            ctx.fillRect(60, infoY, 520, 160); ctx.strokeRect(60, infoY, 520, 160);

            ctx.textAlign = 'right';
            ctx.fillStyle = accentColor;
            ctx.font = 'bold 28px "Cairo", sans-serif';
            ctx.fillText('بـيـانـات الـعـمـيـل', 1110, infoY + 40);
            
            ctx.fillStyle = primaryColor;
            ctx.font = '26px "Cairo", sans-serif';
            ctx.fillText(`الاسـم : ${customerName}`, 1110, infoY + 90);
            ctx.fillText(`الـجـوال : ${customerPhone}`, 1110, infoY + 130);

            ctx.fillStyle = accentColor;
            ctx.font = 'bold 28px "Cairo", sans-serif';
            ctx.fillText('بـيـانـات الـفـاتـورة', 550, infoY + 40);
            
            ctx.fillStyle = primaryColor;
            ctx.font = '26px "Cairo", sans-serif';
            ctx.fillText(`رقم الفاتورة : ${invoiceNum}`, 550, infoY + 90);
            ctx.fillText(`التاريخ : ${date}   ${time}`, 550, infoY + 130);
            
            ctx.fillStyle = goldColor;
            ctx.textAlign = 'left';
            ctx.fillText(`نوع البيع : ${saleType}`, 80, infoY + 90);

            // الجدول
            let currentY = 430;
            const cols = {
                index: { x: 1080, w: 60, title: 'م' },
                desc: { x: 500, w: 580, title: 'الـبـيـان' },
                qty: { x: 380, w: 120, title: 'الكمية' },
                price: { x: 200, w: 180, title: 'السعر' },
                total: { x: 60, w: 140, title: 'الإجمالي' }
            };

            ctx.fillStyle = primaryColor;
            ctx.fillRect(60, currentY, width - 120, 60);
            ctx.fillStyle = goldColor;
            ctx.font = 'bold 24px "Cairo", sans-serif';
            ctx.textAlign = 'center';
            for (let key in cols) {
                ctx.fillText(cols[key].title, cols[key].x + (cols[key].w / 2), currentY + 30);
            }
            currentY += 60;

            let subTotal = 0;
            let isGray = false;

            products.forEach((item, index) => {
                subTotal += item.totalLine;
                const rowH = item.desc ? 95 : 65;

                ctx.fillStyle = isGray ? '#f9f9f9' : '#ffffff';
                ctx.fillRect(60, currentY, width - 120, rowH);
                isGray = !isGray;

                ctx.strokeStyle = '#ecf0f1';
                ctx.lineWidth = 1;
                ctx.strokeRect(60, currentY, width - 120, rowH);
                for (let key in cols) {
                    if(key !== 'total') {
                        ctx.beginPath(); ctx.moveTo(cols[key].x, currentY); ctx.lineTo(cols[key].x, currentY + rowH); ctx.stroke();
                    }
                }

                ctx.fillStyle = primaryColor;
                ctx.textAlign = 'center';
                ctx.font = 'bold 24px "Cairo", sans-serif';
                
                ctx.fillText((index + 1).toString(), cols.index.x + (cols.index.w / 2), currentY + (rowH / 2));
                ctx.fillText(item.qty.toString(), cols.qty.x + (cols.qty.w / 2), currentY + (rowH / 2));

                ctx.fillStyle = '#27ae60';
                ctx.fillText(item.price.toLocaleString(), cols.price.x + (cols.price.w / 2), currentY + (rowH / 2));
                ctx.fillText(item.totalLine.toLocaleString(), cols.total.x + (cols.total.w / 2), currentY + (rowH / 2));

                ctx.fillStyle = primaryColor;
                ctx.textAlign = 'right';
                ctx.fillText(item.name, cols.desc.x + cols.desc.w - 20, currentY + 35);
                
                if (item.desc) {
                    ctx.fillStyle = '#7f8c8d';
                    ctx.font = '18px "Cairo", sans-serif';
                    ctx.fillText(item.desc, cols.desc.x + cols.desc.w - 20, currentY + 70);
                }
                currentY += rowH;
            });

            ctx.beginPath(); ctx.moveTo(60, currentY); ctx.lineTo(width - 60, currentY); ctx.stroke();
            
            // الحسابات
            const taxRate = 0.15;
            const taxAmount = subTotal * taxRate;
            const grandTotal = subTotal + taxAmount;

            currentY += 40;
            const totalW = 450;
            const totalX = 60;
            
            const drawSummaryRow = (label, value, isGrand = false) => {
                ctx.fillStyle = isGrand ? primaryColor : '#fdfdfd';
                ctx.fillRect(totalX, currentY, totalW, 55);
                ctx.strokeRect(totalX, currentY, totalW, 55);

                ctx.fillStyle = isGrand ? goldColor : primaryColor;
                ctx.textAlign = 'right';
                ctx.font = isGrand ? 'bold 26px "Cairo", sans-serif' : 'bold 22px "Cairo", sans-serif';
                ctx.fillText(label, totalX + totalW - 20, currentY + 35);
                
                ctx.textAlign = 'left';
                ctx.fillStyle = isGrand ? '#ffffff' : '#27ae60';
                ctx.fillText(value + ' ر.ي', totalX + 20, currentY + 35);
                currentY += 55;
            };

            drawSummaryRow('المجموع قبل الضريبة:', subTotal.toLocaleString());
            drawSummaryRow('ضريبة القيمة المضافة (15%):', taxAmount.toLocaleString());
            drawSummaryRow('الإجمالي المستحق الدفع:', grandTotal.toLocaleString(), true);

            // الباركود المضمون (Buffer)
            const qrData = `شركة الواقدي للإلكترونيات\nالعميل: ${customerName}\nالإجمالي: ${grandTotal.toLocaleString()} ريال\nرقم: ${invoiceNum}`;
            const qrBuffer = await QRCode.toBuffer(qrData, { errorCorrectionLevel: 'H', margin: 1, color: { dark: primaryColor, light: '#ffffff' } });
            
            const qrImage = await loadImage(qrBuffer);
            const qrSize = 180;
            ctx.drawImage(qrImage, width - qrSize - 100, currentY - 150, qrSize, qrSize);

            // التوقيعات
            currentY += 100;
            ctx.fillStyle = primaryColor;
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px "Cairo", sans-serif';
            
            ctx.fillText('توقيع المحاسب', width - 250, currentY);
            ctx.fillText('توقيع العميل', 250, currentY);

            ctx.strokeStyle = '#bdc3c7'; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(width - 350, currentY + 40); ctx.lineTo(width - 150, currentY + 40); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(150, currentY + 40); ctx.lineTo(350, currentY + 40); ctx.stroke();
            ctx.setLineDash([]);

            // استخراج وإرسال الفاتورة
            const finalBuffer = await canvas.encode('png');

            const captionMsg = `
*• ───── ❨ 🧾 فـاتـورة VIP ❩ ───── •*

👤 *الـعـمـيـل:* ${customerName}
📦 *عـدد الـمـنـتـجـات:* ${products.length}
💰 *الإجـمـالـي:* ${grandTotal.toLocaleString()} ر.ي

*— نـظـام الـواقـدي الـمـحـاسـبـي 👑*
`.trim();

            await sock.sendMessage(from, { 
                image: finalBuffer, 
                caption: captionMsg 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الفاتورة المطور:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ داخـلـي فـي الـسـيـرفـر أثـنـاء الـمـعـالـجـة.*');
        }
    }
};
