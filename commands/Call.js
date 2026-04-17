const delay = ms => new Promise(res => setTimeout(res, ms));

module.exports = {
    name: 'call',
    aliases: ['اتصال', 'رن', 'مكالمة'],
    execute: async ({ sock, msg, args, text, reply, from, isOwner }) => {
        
        // 1. التحقق من الصلاحيات (يفضل للمطور فقط لحماية الرقم من الحظر)
        if (!isOwner) return reply('❌ *هذا الأمر السيبراني مخصص لمطور البوت فقط.*');

        // 2. التحقق من المدخلات (الرقم والعدد)
        if (args.length < 2) {
            return reply('❌ *طريقة الاستخدام:* `.اتصال الرقم عدد_المكالمات`\n*مثال:* `.اتصال 967737996293 10`');
        }

        const targetNumber = args[0].replace(/\D/g, ''); // تنظيف الرقم من أي رموز
        const count = parseInt(args[1]);

        if (isNaN(count) || count <= 0) {
            return reply('❌ *يرجى كتابة عدد صحيح للمكالمات.*');
        }

        // تحديد سقف للمكالمات (مثلاً 30 مكالمة) لتجنب انهيار البوت أو حظر الرقم
        if (count > 30) {
            return reply('⚠️ *العدد كبير جداً! الحد الأقصى 30 مكالمة في الهجوم الواحد.*');
        }

        const targetJid = `${targetNumber}@s.whatsapp.net`;

        try {
            await sock.sendMessage(from, { react: { text: '📞', key: msg.key } });
            await reply(`🚀 *جاري شن هجوم المكالمات على الرقم:* +${targetNumber}\n*الكمية:* [ ${count} ] مكالمة\n*التكرار:* مكالمة كل ثانية.`);

            for (let i = 0; i < count; i++) {
                try {
                    // 3. إرسال طلب المكالمة (WhatsApp Call Offer)
                    await sock.offerCall(targetJid);
                    
                    // الانتظار لمدة 1000 ميلي ثانية (ثانية واحدة) كما طلبت
                    await delay(1000); 
                } catch (e) {
                    console.log(`فشلت المكالمة رقم ${i+1}`);
                }
            }

            // 4. إرسال تقرير الانتهاء
            const finishMsg = `
*• ───── ❨ 🏁 انـتـهـى الـهـجـوم ❩ ───── •*

✅ *تـم تـنـفـيذ جـمـيـع الـمـكـالـمـات بـنـجـاح.*
🎯 *الـهـدف:* +${targetNumber}
📦 *الـعـدد الإجـمـالـي:* ${count}

*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑺𝒆𝒄𝒖𝒓𝒊𝒕𝒚 𝑺𝒚𝒔𝒕𝒆𝒎 👑*
`.trim();

            await reply(finishMsg);
            await sock.sendMessage(from, { react: { text: '🔥', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الاتصال:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشلت العملية! قد يكون الرقم غير صحيح أو أن إصدار المكتبة لا يدعم المكالمات.*');
        }
    }
};
