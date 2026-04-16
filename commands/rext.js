module.exports = {
    name: 'reactwa',
    aliases: ['تفاعل', 'دعم'], // يمكن تشغيله بـ .reactwa أو .تفاعل أو .دعم
    execute: async ({ sock, msg, args, reply, isFromMe, sessions, from }) => {
        
        // 1. حماية قصوى: هذا الأمر خطير، يجب أن يعمل فقط إذا كتبته أنت (صاحب البوت الرئيسي)
        if (!isFromMe) return;

        // التحقق من أنك قمت بتحديث index.js كما في الشرح
        if (!sessions) {
            return reply('❌ *خطأ في النظام:* يرجى تحديث ملف index.js لتمرير متغير `sessions` كما في الشرح لكي يعمل أمر التحكم الجماعي.');
        }

        // 2. التحقق من المدخلات
        if (args.length < 2) {
            return reply('❌ *الاستخدام الصحيح:*\nأرسل الأمر + رابط المنشور + الإيموجيات\n\n*مثال:*\n`.reactwa https://whatsapp.com/channel/0029V.../378 😍 😴 😎`');
        }

        const url = args[0];
        const emojisStr = args.slice(1).join(' ');

        // 3. استخراج الإيموجيات النقية بذكاء اصطناعي (Regex)
        const emojiRegex = /[\p{Extended_Pictographic}]/gu;
        const emojisList = emojisStr.match(emojiRegex);

        if (!emojisList || emojisList.length === 0) {
            return reply('❌ لم يتم العثور على إيموجيات صالحة في رسالتك.');
        }

        // 4. تحليل رابط القناة واستخراج (كود الدعوة) و (رقم المنشور)
        const urlRegex = /whatsapp\.com\/channel\/([^/]+)\/(\d+)/i;
        const match = url.match(urlRegex);

        if (!match) {
            return reply('❌ *رابط غير صالح!* تأكد أن الرابط بصيغة:\n`https://whatsapp.com/channel/ID/123`');
        }

        const inviteCode = match[1]; // كود القناة
        const messageId = String(match[2]); // ID المنشور في السيرفر

        try {
            // إعطاء تفاعل قيد العمل
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
            await reply('⏳ *جاري البحث عن القناة والمنشور...*');

            // 5. استخراج الـ JID الحقيقي للقناة من سيرفرات واتساب
            const metadata = await sock.newsletterMetadata('invite', inviteCode);
            const realJid = metadata.id; // المعرف الحقيقي للقناة
            const channelName = metadata.name;

            await reply(`✅ *تم العثور على القناة:* [ ${channelName} ]\n🚀 *جاري إطلاق جيش التفاعلات من جميع الجلسات المتاحة...*`);

            let successCount = 0;
            let failCount = 0;

            // 6. تشغيل الهجوم الجماعي (Loop عبر جميع الأرقام المربوطة بالبوت)
            const activeSessions = Object.values(sessions);

            for (const sSock of activeSessions) {
                try {
                    // اختيار إيموجي عشوائي من القائمة التي وضعتها أنت
                    const randomEmoji = emojisList[Math.floor(Math.random() * emojisList.length)];

                    // الخطوة الأهم: جعل الرقم "يتابع" القناة أولاً، لأنه لا يمكن التفاعل بدون متابعة!
                    await sSock.newsletterFollow(realJid).catch(() => {});

                    // انتظار نصف ثانية بين كل تفاعل لتجنب حظر الواتساب للأرقام (Anti-Ban Delay)
                    await new Promise(r => setTimeout(r, 500));

                    // إرسال التفاعل للمنشور
                    await sSock.sendMessage(realJid, {
                        react: {
                            text: randomEmoji,
                            key: {
                                remoteJid: realJid,
                                id: messageId
                            }
                        }
                    });

                    successCount++;
                } catch (e) {
                    console.error('خطأ في إرسال تفاعل من إحدى الجلسات:', e.message);
                    failCount++;
                }
            }

            // إعطاء تفاعل النجاح النهائي
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            
            // إرسال تقرير الهجوم
            const report = `🎉 *اكتملت مهمة الدعم بنجاح!* 👑\n\n📢 *القناة:* ${channelName}\n📊 *النتائج النهائية:*\n✅ *نجاح:* ${successCount} تفاعل\n❌ *فشل:* ${failCount} تفاعل\n\n*— TARZAN VIP BOTNET ⚔️*`;
            await reply(report);

        } catch (error) {
            console.error('❌ خطأ في أمر reactwa:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشل في جلب بيانات القناة!*\nتأكد من أن الرابط صحيح وأن القناة عامة ومفتوحة.');
        }
    }
};
