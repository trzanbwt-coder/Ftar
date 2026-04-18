const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');

module.exports = {
    name: 'couplemax',
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

        // مكتبة ضخمة تحتوي على 115 عبارة رومانسية فخمة جداً
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
            await reply(`⏳ *جـاري تـولـيـد [ ${count} ] صـور فـخـمـة واسـتـدعـاء الـعـبـارات...*`);

            const generateImage = async (index) => {
                
                // 1. استخدام API لتوليد صور بالذكاء الاصطناعي (مضمونة 100% أن تكون رومانسية وفخمة)
                const randomSeed = Math.floor(Math.random() * 999999);
                const aiPrompt = encodeURIComponent("luxury dark romantic background, glowing neon hearts, red roses, cinematic lighting, 4k ultra hd");
                const imageUrl = `https://image.pollinations.ai/prompt/${aiPrompt}?width=1080&height=1080&nologo=true&seed=${randomSeed}`;

                let bgImage = await loadImage(imageUrl);

                const width = 1080;
                const height = 1080;
                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                // 2. رسم الخلفية الفخمة
                ctx.drawImage(bgImage, 0, 0, width, height);

                // 3. وضعيات متغيرة (أعلى، وسط، أسفل) لضمان التنوع
                const positions = ['top', 'center', 'bottom'];
                const textPos = positions[Math.floor(Math.random() * positions.length)];
                
                // فلتر سينمائي ذكي يتناسب مع وضعية النص (أسود متدرج قوي جداً لتبرز الأسماء)
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                if (textPos === 'bottom') {
                     gradient.addColorStop(0, 'rgba(0,0,0,0.1)');
                     gradient.addColorStop(0.5, 'rgba(0,0,0,0.4)');
                     gradient.addColorStop(1, 'rgba(0,0,0,0.95)'); 
                } else if (textPos === 'top') {
                     gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
                     gradient.addColorStop(0.5, 'rgba(0,0,0,0.4)');
                     gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
                } else {
                     gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
                     gradient.addColorStop(0.5, 'rgba(0,0,0,0.85)');
                     gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
                }
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);

                // 4. إعداد الأسماء بخطوط ملكية عريضة
                const text = `${name1} ❤️ ${name2}`;
                
                ctx.shadowColor = '#000000';
                ctx.shadowBlur = 30;
                ctx.shadowOffsetX = 6;
                ctx.shadowOffsetY = 6;

                // استخدام خطوط نظام عريضة وفخمة
                const fonts = ['Tahoma', 'Arial Black', 'Times New Roman', 'Impact'];
                const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
                
                ctx.font = `bold 105px "${randomFont}", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                let textY;
                if (textPos === 'top') textY = 280;
                else if (textPos === 'bottom') textY = height - 280;
                else textY = height / 2 - 40;

                const textGradient = ctx.createLinearGradient(0, textY - 60, 0, textY + 60);
                textGradient.addColorStop(0, '#ffffff'); 
                textGradient.addColorStop(0.5, '#fff1ba'); 
                textGradient.addColorStop(1, '#d4af37'); 
                
                ctx.fillStyle = textGradient;
                
                ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
                ctx.lineWidth = 5;
                ctx.strokeText(text, width / 2, textY);
                ctx.fillText(text, width / 2, textY);

                // 5. كتابة العبارة الرومانسية (من الـ 115 عبارة)
                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                ctx.font = `bold 42px Tahoma, sans-serif`;
                ctx.fillStyle = '#ffffff'; 
                
                ctx.shadowBlur = 15;
                ctx.lineWidth = 3;
                ctx.strokeText(randomQuote, width / 2, textY + 120);
                ctx.fillText(randomQuote, width / 2, textY + 120);

                // 6. حقوق البوت
                ctx.shadowColor = 'transparent';
                ctx.font = 'bold 24px Arial';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillText('DESIGNED BY 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑', width / 2, height - 30);

                return canvas.toBuffer('image/png');
            };

            // إنشاء الصور حسب العدد
            const buffers = [];
            for (let i = 0; i < count; i++) {
                const buffer = await generateImage(i);
                buffers.push(buffer);
            }

            // إرسال الصور للجروب متتالية
            for (let i = 0; i < buffers.length; i++) {
                await sock.sendMessage(from, { 
                    image: buffers[i],
                    caption: `*• ───── ❨ 💍 إبـداع طـرزان ❩ ───── •*\n*📸 الـصـورة: ${i + 1}/${count}*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`
                });
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر التصميم VIP الماكس:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ فـي سـيـرفـر الـتـصـمـيـم الـمـركـزي.*');
        }
    }
};
