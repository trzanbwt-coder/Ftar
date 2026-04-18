const { createCanvas, loadImage } = require('canvas');

module.exports = {
    name: 'couple',
    aliases: ['تصميم', 'حب', 'عشاق', 'اسماء', 'صمم'],
    execute: async ({ sock, msg, args, reply, from }) => {
        
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

        // 1. مكتبة ضخمة جداً من روابط الصور المباشرة (HD) (بدون API لتجنب الأعطال)
        const premiumBackgrounds = [
            'https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=1080', // قلوب نيون
            'https://images.unsplash.com/photo-1518599904199-0ca897819ddb?q=80&w=1080', // ورود حمراء داكنة
            'https://images.unsplash.com/photo-1494972308805-463bc619d34e?q=80&w=1080', // ورد ناعم
            'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=1080', // أضواء ليلية
            'https://images.unsplash.com/photo-1505909182942-e2f09aee3e89?q=80&w=1080', // سماء ونجوم
            'https://images.unsplash.com/photo-1606214815144-8d488e0b6b80?q=80&w=1080', // ورود بيضاء فخمة
            'https://images.unsplash.com/photo-1474552226712-ac0f0961a954?q=80&w=1080', // أضواء ذهبية
            'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?q=80&w=1080', // طبيعة رومانسية
            'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?q=80&w=1080', // خواتم زفاف
            'https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=1080', // خلفية خيالية
            'https://images.unsplash.com/photo-1518895949257-76eb0f6bf3ee?q=80&w=1080', // غروب الشمس
            'https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?q=80&w=1080', // شموع رومانسية
            'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1080', // موسيقى داكنة
            'https://images.unsplash.com/photo-1500628028294-607a3c7ed147?q=80&w=1080', // أزهار متوهجة
            'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?q=80&w=1080', // قلب مضيء
            'https://images.unsplash.com/photo-1520052205864-92d242b3a4e4?q=80&w=1080', // سماء فخمة
            'https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=1080', // أضواء بوكيه
            'https://images.unsplash.com/photo-1510074377623-8cf13fb86c08?q=80&w=1080', // ورود وردية
            'https://images.unsplash.com/photo-1493690283958-32df2c86326e?q=80&w=1080', // لمسات داكنة
            'https://images.unsplash.com/photo-1533038590840-1c56cb709798?q=80&w=1080', // خلفية زفاف
            'https://images.unsplash.com/photo-1495954380655-01609180eda3?q=80&w=1080', // رومانسي دافئ
            'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=1080', // أضواء شتوية
            'https://images.unsplash.com/photo-1507679622822-6b6a37882fb9?q=80&w=1080', // قلب لامع
            'https://images.unsplash.com/photo-1481016570479-9eab6349fde7?q=80&w=1080', // ألوان ليلية
            'https://images.unsplash.com/photo-1501162946741-4960f91ab1ec?q=80&w=1080', // غابة رومانسية
            'https://images.unsplash.com/photo-1513624954087-cca71150f70c?q=80&w=1080', // أضواء خافتة
            'https://images.unsplash.com/photo-1541818221617-66a7b7a15a81?q=80&w=1080', // كوب قهوة وورد
            'https://images.unsplash.com/photo-1508610048659-a06b669e3321?q=80&w=1080', // شجرة حب
            'https://images.unsplash.com/photo-1532054921136-12c8233f2a55?q=80&w=1080', // رسائل رومانسية
            'https://images.unsplash.com/photo-1496060169243-453fde45943b?q=80&w=1080'  // ألوان خيالية
            // (الروابط هنا مختارة بعناية من أقوى سيرفرات Unsplash لتكون مضمونة 100% ولا تتوقف أبداً)
        ];

        // 2. مكتبة العبارات الفخمة (100+ عبارة)
        const quotes = [
            "أنتِ الوجهة وأنتِ الطريق.", "في عيونك أرى وطني الذي لا يضيع.", "ولنا في بعضنا حياة، وفي عناقنا نجاة.",
            "أنتِ النور الذي أضاء عتمة أيامي.", "يا أجمل أقداري، ويا أعظم انتصاراتي.", "أنتِ البداية التي لا نهاية لها في قلبي.",
            "سأكتفي بكِ حلماً وواقعاً وحياة.", "أنتِ لستِ فقط حبيبتي، أنتِ روحي التي أتنفس بها.", "في ابتسامتكِ أجد السلام.",
            "عناقكِ هو المكان الوحيد الذي أود البقاء فيه للأبد.", "كأنكِ خُلقتِ من ضلعي لتبقي بجانبي.",
            "أحبكِ كأنكِ أمانتي الوحيدة في هذه الأرض.", "أنتِ عيدي وقبلة روحي.", "لو كان لي أن أختار، لاخترتكِ في كل مرة.",
            "أنتِ النبض الذي يحيي قلبي الميت.", "في ملامحكِ أقرأ أجمل قصائدي.", "لا شيء يشبهكِ، ولا أحد يعوض مكانكِ.",
            "سأبقى أحبكِ حتى يتوقف قلبي عن النبض.", "أنتِ الملاذ الآمن لروحي المتعبة.", "أنتِ السر الجميل الذي يختبئ في قلبي.",
            "في عينيكِ أجد الكون بأكمله.", "أنتِ النجمة التي تضيء سماء حياتي.", "حبكِ هو القوة التي تدفعني للحياة.",
            "أنتِ الابتسامة التي ترتسم على وجهي دون سبب.", "أنتِ الفرح الذي يغمر قلبي في كل لحظة.",
            "أدمنا الله معاً للأبد، يا أجمل أشيائي.", "كل الأغاني الجميلة تذكرني بكِ.", "أنتِ الرواية التي أقرأها كل يوم ولا أمل منها.",
            "أنتِ الدفء الذي يحيط بقلبي في ليالي الشتاء.", "أنتِ القطعة الناقصة التي اكتملت بها روحي.",
            "أنتِ السعادة التي لطالما بحثت عنها.", "أنتِ العمر الذي أود أن أعيشه مرتين.", "أنتِ الحكاية التي لا أود أن تنتهي أبداً.",
            "أنتِ الحب الذي لا يعرف حدوداً ولا قيوداً.", "أنتِ السماء التي تحلق فيها طموحاتي.", "أنتِ البحر الذي أغرق فيه دون خوف.",
            "أنتِ المطر الذي يروي عطش قلبي.", "أنتِ الوردة التي لا تذبل في بستان حياتي.", "أنتِ النسمة العليلة التي تنعش روحي.",
            "أنتِ القمر الذي ينير ظلمة ليالي.", "أنتِ الشمس التي تشرق لتضيء يومي.", "أنتِ كل شيء وأكثر مما تمنيت.",
            "بكِ أكتفي عن العالمين.", "أنتِ عالمي الصغير الذي يغنيني عن الكون.", "يا سيدة قلبي وأميرة روحي.",
            "بين ذراعيكِ أجد وطني المفقود.", "أنتِ طمأنينتي في عالم مليء بالفوضى.", "أحبكِ بحجم الكون وأكثر.",
            "أنتِ قصيدتي التي لم تُكتب بعد.", "أنتِ لحني المفضل الذي أعزفه كل يوم.", "يا زهرة عمري وربيع أيامي.",
            "أنتِ الأمان الذي أبحث عنه في عيون البشر.", "معكِ أجد نفسي وأنسى أحزاني.", "أنتِ أمنيتي التي تحققت.",
            "يا نبض الوريد وسر الوجود.", "أنتِ وتيني الذي يضخ الحب في عروقي.", "أحبكِ اليوم وغداً وإلى الأبد.",
            "أنتِ قدري الأجمل الذي ساقه الله لي.", "أنتِ جنتي على الأرض.", "يا أجمل عطايا الرب وأعظم نعمائه.",
            "في قلبكِ وطني، وفي عينيكِ مسكني.", "أنتِ حلمي المحقق وواقعي الجميل.", "يا ضياء عيني ونور دربي.",
            "أنتِ الروح التي تسكن جسدي.", "أحبكِ فوق الحب حباً، وفوق العشق عشقاً.", "أنتِ سر سعادتي ومصدر إلهامي.",
            "يا غيمتي الماطرة بالحب والفرح.", "أنتِ نجمتي المضيئة في سماء العتمة.", "يا عطر حياتي وأريج أيامي.",
            "أنتِ المأوى الذي ألجأ إليه من قسوة الأيام.", "بكِ أستظل من شمس الأحزان.", "أنتِ النعمة التي أشكر الله عليها كل يوم.",
            "يا بهجة القلب وسرور الخاطر.", "أنتِ شمس الشتاء الدافئة.", "أنتِ قمر الليالي الصافية.",
            "يا وردة الروح وريحانة القلب.", "أنتِ البسمة التي تمحو كل همومي.", "أحبكِ بلا حدود ولا نهايات.",
            "أنتِ حكايتي الأجمل التي أرويها بفخر.", "يا أجمل تفاصيلي وأروع ذكرياتي.", "أنتِ نبض الخفوق وسر النبض.",
            "يا دواء جرحي وبلسم أوجاعي.", "أنتِ بلسم روحي وشفاء قلبي.", "يا نور دربي ومصباح حياتي.",
            "أنتِ شريكي في الحلم والواقع.", "أحبكِ بصدق لا تشوبه شائبة.", "أنتِ كل أشيائي الجميلة.",
            "يا فرحة سنيني وأجمل أيامي.", "أنتِ حظي الحلو من هذه الدنيا.", "يا مسك الختام وأجمل البدايات.",
            "أنتِ أملي الذي لا يخيب.", "يا شطر روحي ونصف قلبي.", "أنتِ النصف الآخر الذي يكملني.",
            "يا توأم الروح ورفيقة الدرب.", "أنتِ ملاكي الحارس في هذه الحياة.", "أحبكِ بعمق البحار واتساع السماء.",
            "أنتِ عشقي الأبدي الذي لا يموت.", "يا غايتي في هذه الدنيا.", "أنتِ محطتي الأخيرة التي أستقر فيها.",
            "يا سحر العيون وفتنة الألباب.", "أنتِ شغفي الذي لا ينطفئ.", "يا أحلى أيامي وأجمل لياليّ.",
            "أنتِ قمري الذي لا يغيب.", "أحبكِ كما أنتِ، بكل تفاصيلكِ.", "أنتِ دنيتي وما فيها.",
            "يا زينة حياتي وتاج رأسي.", "أنتِ فرحتي التي لا توصف.", "يا أغلى البشر على قلبي.",
            "أنتِ حبي الأبدي الذي سيخلده الزمان.", "في صوتكِ حياة، وفي همسكِ نجاة.", "أنتِ ملاذي الآمن من كل خوف.",
            "يا قرة عيني وسلوى فؤادي.", "أنتِ كنزي الثمين الذي لا يقدر بثمن.", "أحبكِ أضعاف ما أبدي وأكثر مما تتخيلين.",
            "لو أن للحب صوتاً لسمعتِ دقات قلبي تنادي باسمكِ.", "أنتِ الإجابة لكل دعواتي.", "معكِ، كل الأيام أعياد."
        ];

        try {
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            await reply(`⏳ *جـاري تـصـمـيـم [ ${count} ] صـور بـالاعـتـمـاد عـلـى قـواعـد بـيـانـات طـرزان الـخـاصـة...*`);

            const generateImage = async () => {
                
                // اختيار رابط مباشر من القائمة (مضمون 100%)
                const randomBgUrl = premiumBackgrounds[Math.floor(Math.random() * premiumBackgrounds.length)];
                
                let bgImage;
                try {
                    bgImage = await loadImage(randomBgUrl);
                } catch (e) {
                    // في حالة نادرة جداً لو تعطل رابط، نستخدم رابط طوارئ احتياطي
                    bgImage = await loadImage('https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=1080');
                }

                const width = 1080;
                const height = 1080;
                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                // رسم الصورة بأعلى جودة
                const scale = Math.max(width / bgImage.width, height / bgImage.height);
                const x = (width / 2) - (bgImage.width / 2) * scale;
                const y = (height / 2) - (bgImage.height / 2) * scale;
                ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);

                // وضعيات النص (تتغير لتعطي تنوعاً في التصميم)
                const positions = ['top', 'center', 'bottom'];
                const textPos = positions[Math.floor(Math.random() * positions.length)];
                
                // ظل سينمائي قوي للتأكد من وضوح النص 1000%
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                if (textPos === 'bottom') {
                     gradient.addColorStop(0, 'rgba(0,0,0,0.1)');
                     gradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
                     gradient.addColorStop(1, 'rgba(0,0,0,0.95)'); 
                } else if (textPos === 'top') {
                     gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
                     gradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
                     gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
                } else {
                     gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
                     gradient.addColorStop(0.5, 'rgba(0,0,0,0.9)');
                     gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
                }
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);

                // تجهيز النص والخط الفخم
                const text = `${name1} ❤️ ${name2}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // خطوط عربية أساسية وفخمة (لا تتكسر)
                const fonts = ['"Arial Black"', 'Tahoma', 'Arial', 'Impact'];
                const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
                ctx.font = `bold 100px ${randomFont}, sans-serif`;
                
                // تأثيرات ظل (Drop Shadow) خرافية وعميقة
                ctx.shadowColor = '#000000';
                ctx.shadowBlur = 25;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;

                // تحديد الإحداثيات
                let textY;
                if (textPos === 'top') textY = 250;
                else if (textPos === 'bottom') textY = height - 250;
                else textY = height / 2 - 40;

                // التدرج اللوني الذهبي الملكي للاسم
                const textGradient = ctx.createLinearGradient(0, textY - 50, 0, textY + 50);
                textGradient.addColorStop(0, '#ffffff'); // أبيض ساطع
                textGradient.addColorStop(0.6, '#ffd700'); // ذهبي
                textGradient.addColorStop(1, '#b8860b'); // ذهبي داكن
                
                // رسم إطار قوي (Stroke) لضمان عدم اختلاط الكلمة بالخلفية
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 6;
                ctx.strokeText(text, width / 2, textY);
                
                // تلوين الاسم
                ctx.fillStyle = textGradient;
                ctx.fillText(text, width / 2, textY);

                // طباعة العبارة (من الـ 100 عبارة)
                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                ctx.font = `bold 38px Tahoma, sans-serif`;
                ctx.fillStyle = '#ffffff'; 
                ctx.lineWidth = 3;
                
                ctx.strokeText(randomQuote, width / 2, textY + 120);
                ctx.fillText(randomQuote, width / 2, textY + 120);

                // حقوق البوت
                ctx.shadowColor = 'transparent';
                ctx.font = 'bold 22px Tahoma';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillText('DESIGNED BY 𝑻𝑨𝑹𝒁𝑨𝑵 👑', width / 2, height - 30);

                return canvas.toBuffer('image/png');
            };

            const buffers = [];
            for (let i = 0; i < count; i++) {
                const buffer = await generateImage();
                buffers.push(buffer);
            }

            for (let i = 0; i < buffers.length; i++) {
                await sock.sendMessage(from, { 
                    image: buffers[i],
                    caption: `*• ───── ❨ 💍 إبـداع طـرزان ❩ ───── •*\n*📸 الـصـورة: ${i + 1}/${count}*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`
                });
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر التصميم المباشر:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ داخـلـي، يـرجـى الـمـحـاولـة لاحـقـاً.*');
        }
    }
};
