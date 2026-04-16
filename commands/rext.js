module.exports = {
    name: 'reactwa',
    aliases: ['تفاعل', 'دعم'], 
    execute: async ({ sock, msg, args, reply, isFromMe, sessions, from }) => {
        
        // 1. حماية قصوى: الأمر يعمل لك أنت فقط
        if (!isFromMe) return;

        if (!sessions) {
            return reply('❌ *خطأ في النظام:* لم يتم تمرير الجلسات من السيرفر الرئيسي.');
        }

        // 2. التحقق من المدخلات
        if (args.length < 2) {
            return reply('❌ *الاستخدام الصحيح:*\nأرسل الأمر + رابط المنشور + الإيموجيات\n\n*مثال:*\n`.reactwa https://whatsapp.com/channel/0029V.../378 😍 😴 😎`');
        }

        const url = args[0];
        const emojisStr = args.slice(1).join(' ');

        // 3. استخراج الإيموجيات النقية
        const emojiRegex = /[\p{Extended_Pictographic}]/gu;
        const emojisList = emojisStr.match(emojiRegex);

        if (!emojisList || emojisList.length === 0) {
            return reply('❌ لم يتم العثور على إيموجيات صالحة.');
        }

        // 4. تحليل الرابط واستخراج (كود القناة) و (ID المنشور)
        const urlRegex = /whatsapp\.com\/channel\/([^/]+)\/(\d+)/i;
        const match = url.match(urlRegex);

        if (!match) {
            return reply('❌ *رابط غير صالح!* تأكد أن الرابط بصيغة:\n`https://whatsapp.com/channel/ID/123`');
        }

        const inviteCode = match[1]; 
        const messageId = String(match[2]); 

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
            await reply('⏳ *جاري اختراق القناة وربط الجلسات...*');

            // 5. جلب المعرف الحقيقي للقناة
            const metadata = await sock.newsletterMetadata('invite', inviteCode);
            const realJid = metadata.id; 
            const channelName = metadata.name;

            await reply(`✅ *تم تجهيز القناة:* [ ${channelName} ]\n🚀 *جاري إطلاق جيش التفاعلات، يرجى الانتظار...*`);

            let successCount = 0;
            let failCount = 0;

            const activeSessions = Object.values(sessions);

            // 6. الهجوم الجماعي
            for (const sSock of activeSessions) {
                try {
                    const randomEmoji = emojisList[Math.floor(Math.random() * emojisList.length)];

                    // الخطوة 1: متابعة القناة
                    await sSock.newsletterFollow(realJid).catch(() => {});
                    
                    // 🌟 [إصلاح هام]: الانتظار 1.5 ثانية لضمان تسجيل المتابعة في سيرفرات واتساب
                    await new Promise(r => setTimeout(r, 1500));

                    // 🌟 [إصلاح جذري]: استخدام relayMessage للحقن المباشر لتجاوز أخطاء الذاكرة المؤقتة
                    const reactionMessage = {
                        reactionMessage: {
                            key: {
                                remoteJid: realJid,
                                id: messageId, // رقم المنشور
                                fromMe: false  // 🌟 (يجب أن يكون false لكي يقبله واتساب كرسالة خارجية)
                            },
                            text: randomEmoji,
                            senderTimestampMs: Date.now()
                        }
                    };

                    // إرسال التفاعل مباشرة بالقوة
                    await sSock.relayMessage(realJid, reactionMessage, {});

                    successCount++;
                } catch (e) {
                    console.error('❌ خطأ في جلسة أثناء التفاعل:', e.message);
                    failCount++;
                }
            }

            // تقرير النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            const report = `🎉 *اكتملت المهمة بنجاح!* 👑\n\n📢 *القناة:* ${channelName}\n📊 *النتائج النهائية:*\n✅ *نجاح:* ${successCount} تفاعل\n❌ *فشل:* ${failCount} تفاعل\n\n*— TARZAN VIP BOTNET ⚔️*`;
            await reply(report);

        } catch (error) {
            console.error('❌ خطأ رئيسي في reactwa:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشل في جلب بيانات القناة!*\nتأكد من أن الرابط صحيح وأن القناة عامة.');
        }
    }
};
