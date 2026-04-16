/**
 * 👑 أمر دمج الإيموجيات (Emoji Kitchen)
 * ⚙️ الوظيفة: دمج إيموجيين وتحويلهما إلى ملصق مضحك
 * 💻 الاستخدام: mix 😋 😎 أو mix 😋😎
 */
const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = async ({ sock, msg, text, reply, from }) => {
  // تفعيل الأمر عند كتابة mix أو .mix
  if (!text || (!text.toLowerCase().startsWith('mix') && !text.toLowerCase().startsWith('.mix'))) return;

  // 1. استخراج الإيموجيات بذكاء (حتى لو كانت ملتصقة ببعضها)
  // نقوم بإزالة كلمة الأمر، ثم نستخرج كل الإيموجيات من النص المتبقي
  const input = text.replace(/^(?:\.)?mix\s*/i, '').trim();
  
  // تعبير نمطي (Regex) قوي لالتقاط الإيموجيات حتى لو كانت معقدة
  const emojiRegex = /[\p{Extended_Pictographic}]/gu;
  const emojis = input.match(emojiRegex);

  if (!emojis || emojis.length < 2) {
    return reply('⚠️ *طريقة الاستخدام:*\nأرسل الأمر متبوعاً بإيموجيين لدمجهما.\n\n*مثال:* `mix 🐢 🚀` أو `mix 🐢🚀`');
  }

  // نأخذ أول إيموجيين فقط في حال أرسل أكثر من ذلك
  const emoji1 = emojis[0];
  const emoji2 = emojis[1];

  try {
    // تفاعل قيد التنفيذ
    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

    // 2. استخدام API مجاني 100% ومستقر لدمج الإيموجيات (Emoji Kitchen API البديل)
    // نرسل طلب للـ API، وسيقوم هو بإرجاع رابط لصورة الدمج (PNG) شفافة
    const apiUrl = `https://weeb-api.vercel.app/emojimix?emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`;
    
    const res = await axios.get(apiUrl);

    // التحقق من نجاح الدمج من الـ API
    if (!res.data || !res.data.url) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return reply(`❌ *عذراً!*\nلا يمكن دمج هذين الإيموجيين (${emoji1} و ${emoji2}).\nشركة جوجل لم تقم بصنع دمج لهما بعد. جرب إيموجيات أخرى!`);
    }

    const imageUrl = res.data.url;

    // 3. تنزيل الصورة المدمجة (تأتي كخلفية شفافة PNG)
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imgBuffer = Buffer.from(imgResponse.data, 'utf-8');

    // 4. تحويل الصورة إلى ملصق فخم (Sticker) باستخدام مكتبة wa-sticker-formatter
    const sticker = new Sticker(imgBuffer, {
      pack: 'TARZAN VIP 👑', // اسم الحزمة التي تظهر عند حفظ الملصق
      author: 'طرزان الواقدي 🤖', // اسم صانع الملصق
      type: StickerTypes.FULL, // نوع الملصق (يأخذ المساحة كاملة)
      quality: 100 // أعلى جودة
    });

    const stickerBuffer = await sticker.build();

    // 5. إرسال الملصق للمستخدم
    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
    
    // تفاعل بنجاح
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ خطأ في أمر دمج الإيموجي:', err.message);
    
    // إرسال رسالة خطأ ذكية للمستخدم
    await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
    
    if (err.response && err.response.status === 404) {
      await reply(`❌ *فشل الدمج:*\nهذا الدمج (${emoji1} + ${emoji2}) غير مدعوم من قبل جوجل حتى الآن. جرب وجوهاً أخرى!`);
    } else {
      await reply('❌ *عذراً!*\nحدث خطأ في السيرفر أثناء توليد الملصق، يرجى المحاولة لاحقاً.');
    }
  }
};
