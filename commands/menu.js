const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

module.exports = {
    name: 'couplepro',
    aliases: ['تصميم', 'حب', 'عشاق', 'اسماء', 'صمم'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
        // المتوقع: .تصميم عبودي شهد [العدد اختياري]
        if (args.length < 2) {
            return reply('❌ *يـرجـى كـتـابـة الاسـمـيـن.*\n*مـثـال:* `.تصميم عبودي شهد`\n*لـطـلـب أكـثـر مـن صـورة:* `.تصميم عبودي شهد 3`');
        }

        const name1 = args[0];
        const name2 = args[1];
        
        let count = 1;
        if (args[2] && !isNaN(args[2])) {
            count = parseInt(args[2]);
            if (count > 5) count = 5; 
            if (count < 1) count = 1;
        }

        // مكتبة عبارات فخمة (أكثر من 50 عبارة متنوعة)
        const quotes = [
            "أنتِ الوجهة وأنتِ الطريق.",
            "في عيونك أرى وطني الذي لا يضيع.",
            "بعض الصدف شعورها يبقى للأبد.",
            "ولنا في بعضنا حياة، وفي عناقنا نجاة.",
            "أنتِ النور الذي أضاء عتمة أيامي.",
            "لا أرى في الوجود شيئاً يضاهي جمالك.",
            "أحبك حباً لو يفيض يسيره على الخلق ماتوا شدة العشق.",
            "أنتِ النبض الذي يحيي قلبي في كل ثانية.",
            "يا أجمل أقداري، ويا أعظم انتصاراتي.",
            "كل شيء فيكِ يدعوني لأحبكِ أكثر.",
            "أنتِ البداية التي لا نهاية لها في قلبي.",
            "سأكتفي بكِ حلماً وواقعاً وحياة.",
            "معكِ فقط، أشعر أنني أملك العالم بأسره.",
            "أنتِ لستِ فقط حبيبتي، أنتِ روحي التي أتنفس بها.",
            "لو أن الحب كلمات تكتب لانتهت أقلامي، لكن الحب أرواح توهب.",
            "في ابتسامتكِ أجد السلام الذي أبحث عنه.",
            "أنتِ القصيدة التي لم أستطع كتابتها بعد.",
            "عناقكِ هو المكان الوحيد الذي أود البقاء فيه للأبد.",
            "أنتِ المعجزة التي غيرت مجرى حياتي.",
            "لا شيء يشبهكِ، ولا أحد يعوض مكانكِ.",
            "حبكِ هو النور الذي يهديني في أصعب أوقاتي.",
            "أنتِ الأمل الذي يتجدد في قلبي كل صباح.",
            "كل لغات الحب تقف عاجزة أمام وصف مشاعري تجاهكِ.",
            "أنتِ الحلم الذي أصبح حقيقة، والواقع الذي فاق الخيال.",
            "سأبقى أحبكِ حتى يتوقف قلبي عن النبض.",
            "أنتِ الملاذ الآمن لروحي المتععبة.",
            "أنتِ السر الجميل الذي يختبئ بين طيات قلبي.",
            "في عينيكِ أجد الكون بأكمله.",
            "أنتِ النجمة التي تضيء سماء حياتي.",
            "حبكِ هو القوة التي تدفعني لمواجهة كل التحديات.",
            "أنتِ الابتسامة التي ترتسم على وجهي دون سبب.",
            "أنتِ الفرح الذي يغمر قلبي في كل لحظة.",
            "أدمنا الله معاً للأبد، يا أجمل أشيائي.",
            "أنتِ النبضة التي لا أريدها أن تتوقف.",
            "كل الأغاني الجميلة تذكرني بكِ.",
            "أنتِ الرواية التي أقرأها كل يوم ولا أمل منها.",
            "أنتِ الدفء الذي يحيط بقلبي في ليالي الشتاء الباردة.",
            "أنتِ القطعة الناقصة التي اكتملت بها روحي.",
            "أنتِ السعادة التي لطالما بحثت عنها.",
            "أنتِ العمر الذي أود أن أعيشه مرتين.",
            "أنتِ الحكاية التي لا أود أن تنتهي أبداً.",
            "أنتِ الحب الذي لا يعرف حدوداً ولا قيوداً.",
            "أنتِ السماء التي تحلق فيها طموحاتي.",
            "أنتِ البحر الذي أغرق فيه دون خوف.",
            "أنتِ المطر الذي يروي عطش قلبي.",
            "أنتِ الوردة التي لا تذبل في بستان حياتي.",
            "أنتِ النسمة العليلة التي تنعش روحي.",
            "أنتِ القمر الذي ينير ظلمة ليالي.",
            "أنتِ الشمس التي تشرق لتضيء يومي.",
            "أنتِ كل شيء وأكثر مما تمنيت."
        ];

        try {
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            await reply(`⏳ *جـاري تـولـيـد [ ${count} ] صـور حـصـريـة بـاسـتـخـدام الذكاء الاصطناعي...*`);

            // دالة مساعدة لإنشاء صورة واحدة
            const generateImage = async () => {
                
                // 1. جلب صورة عشوائية عالية الدقة من API مجاني (Unsplash Source)
                // نستخدم كلمات مفتاحية (romantic, love, couple, dark) لضمان صور مناسبة
                const randomTopic = ['romantic', 'love', 'dark+nature', 'stars', 'neon+hearts'][Math.floor(Math.random() * 5)];
                // نضيف رقم عشوائي في الرابط لمنع الكاش (Cache) وضمان صورة جديدة في كل مرة
                const imageUrl = `https://source.unsplash.com/1080x1080/?${randomTopic}&sig=${Math.random()}`;

                let bgImage;
                try {
                    bgImage = await loadImage(imageUrl);
                } catch (e) {
                    // في حال فشل الـ API، نستخدم صورة احتياطية قوية
                    bgImage = await loadImage('https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=1080');
                }

                const width = 1080;
                const height = 1080;
                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                // 2. رسم الخلفية
                const scale = Math.max(width / bgImage.width, height / bgImage.height);
                const x = (width / 2) - (bgImage.width / 2) * scale;
                const y = (height / 2) - (bgImage.height / 2) * scale;
                ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);

                // 3. فلتر التعتيم السينمائي المتدرج (Gradient Overlay)
                // يجعل الأسفل داكناً أكثر لتبرز العبارات
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');   // تعتيم خفيف في الأعلى
                gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)'); // تعتيم متوسط في الوسط
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');   // تعتيم قوي في الأسفل
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);

                // 4. كتابة الأسماء المركزية
                const text = `${name1} ❤️ ${name2}`;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;

                ctx.font = 'bold 95px Arial'; // خط ضخم
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // إضافة لون متدرج ذهبي للأسماء
                const textGradient = ctx.createLinearGradient(0, height/2 - 50, 0, height/2 + 50);
                textGradient.addColorStop(0, '#ffffff'); // أبيض
                textGradient.addColorStop(1, '#f1c40f'); // ذهبي
                
                ctx.fillStyle = textGradient;
                ctx.fillText(text, width / 2, height / 2 - 50);

                // 5. كتابة العبارة الفخمة (اختيار عشوائي من الـ 50 عبارة)
                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                
                ctx.font = 'italic 45px Arial';
                ctx.shadowBlur = 15;
                ctx.fillStyle = '#ecf0f1'; // أبيض رمادي ناعم
                ctx.fillText(randomQuote, width / 2, height / 2 + 60);

                // 6. حقوق البوت (VIP)
                ctx.shadowColor = 'transparent';
                ctx.font = '22px Arial';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillText('DESIGNED BY 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑', width / 2, height - 40);

                return canvas.toBuffer('image/png');
            };

            // إنشاء الصور حسب العدد
            const buffers = [];
            for (let i = 0; i < count; i++) {
                const buffer = await generateImage();
                buffers.push(buffer);
            }

            // إرسال الصور للجروب
            for (let i = 0; i < buffers.length; i++) {
                await sock.sendMessage(from, { 
                    image: buffers[i],
                    caption: `*• ───── ❨ 💍 إبـداع طـرزان ❩ ───── •*\n*📸 الـصـورة: ${i + 1}/${count}*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`
                });
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر التصميم المطور:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ فـي سـيـرفـر الـتـصـمـيـم.*');
        }
    }
};
