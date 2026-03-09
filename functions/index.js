const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECRETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TG_TOKEN      = defineSecret('TG_TOKEN');
const TG_CHAT_ID    = defineSecret('TG_CHAT_ID');
const ADMIN_PASS    = defineSecret('ADMIN_PASS');
const HMAC_SECRET   = defineSecret('HMAC_SECRET');
const TOYYIB_SECRET = defineSecret('TOYYIB_SECRET');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITER & WAF (Kekal kebal macam V8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ipHits = new Map();

function checkRateLimit(key, maxHits = 10, windowMs = 60000) {
    const now = Date.now();
    const entry = ipHits.get(key);
    if (!entry || now > entry.resetAt) {
        ipHits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (entry.count >= maxHits) return false;
    entry.count++;
    return true;
}

async function isIpBanned(ip) {
    try {
        const doc = await db.collection('banned_ips').doc(ip.replace(/[.:]/g, '_')).get();
        if (!doc.exists) return false;
        const data = doc.data();
        if (data.bannedUntil && Date.now() < data.bannedUntil) return true;
        return false;
    } catch (_) { return false; }
}

async function recordSuspiciousIp(ip, reason) {
    try {
        const key = ip.replace(/[.:]/g, '_');
        const ref = db.collection('banned_ips').doc(key);
        const doc = await ref.get();
        const strikes = doc.exists ? (doc.data().strikes || 0) + 1 : 1;
        const bannedUntil = strikes >= 5 ? Date.now() + (24 * 60 * 60 * 1000) : null;

        await ref.set({ ip, strikes, lastReason: reason, updatedAt: Date.now(), bannedUntil }, { merge: true });

        if (bannedUntil) {
            hantarTeleAlert(`🚨 <b>IP AUTO-BANNED</b>\n🌐 IP: <code>${ip}</code>\n📌 Sebab: ${reason}\n⚡ Strikes: ${strikes}`);
        }
    } catch (_) {}
}

function hantarTele(mesej, token, chatId) {
    const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(mesej)}&parse_mode=HTML`;
    https.get(url, () => {}).on('error', (e) => console.error(e));
}

function hantarTeleAlert(mesej) {
    try { hantarTele(mesej, TG_TOKEN.value(), TG_CHAT_ID.value()); } catch (_) {}
}

function signChallenge(digits, nonce, secret) {
    return crypto.createHmac('sha256', secret).update(`${digits.join('')}:${nonce}`).digest('hex');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RISK ENGINE V3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function hitungRiskScore(rawBehaviour = {}, deviceDNA = {}) {
    let riskScore = 0;
    const reasons = [];

    if (!deviceDNA || !deviceDNA.model || !deviceDNA.osVersion) {
        riskScore += 20; reasons.push('no_device_dna');
    }

    const { touchTimestamps = [], scrollVelocities = [], solveTimeMs = 0 } = rawBehaviour;

    if (solveTimeMs < 500) { riskScore += 40; reasons.push('solve_too_fast'); } 
    else if (solveTimeMs < 1500) { riskScore += 20; reasons.push('solve_suspicious'); } 
    else if (solveTimeMs > 60000) { riskScore += 10; reasons.push('solve_too_slow'); }

    if (touchTimestamps.length < 3) { riskScore += 20; reasons.push('insufficient_touch'); } 
    else {
        const intervals = [];
        for (let i = 1; i < touchTimestamps.length; i++) intervals.push(touchTimestamps[i] - touchTimestamps[i - 1]);
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const varianceInterval = intervals.reduce((a, b) => a + Math.abs(b - avgInterval), 0) / intervals.length;
        if (varianceInterval < 20) { riskScore += 20; reasons.push('touch_too_consistent'); }
    }

    if (scrollVelocities.length < 3) { riskScore += 20; reasons.push('insufficient_scroll'); } 
    else {
        const avgVel = scrollVelocities.reduce((a, b) => a + b, 0) / scrollVelocities.length;
        const varianceVel = scrollVelocities.reduce((a, b) => a + Math.abs(b - avgVel), 0) / scrollVelocities.length;
        if (varianceVel < 0.05) { riskScore += 20; reasons.push('scroll_too_consistent'); }
    }

    return { score: Math.min(riskScore, 100), reasons };
}

// MIDDLEWARE WAF
app.use(async (req, res, next) => {
if (req.path.startsWith('/admin/')) {
        return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (await isIpBanned(ip)) return res.status(403).json({ error: 'Akses disekat.' });

    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const suspiciousUA = ['burpsuite', 'postman', 'insomnia', 'python-requests', 'curl', 'wget', 'java/', 'go-http'];
    if (suspiciousUA.some(s => ua.includes(s))) {
        await recordSuspiciousIp(ip, `suspicious_ua:${ua.substring(0, 50)}`);
        return res.status(403).json({ error: 'Akses ditolak.' });
    }
    next();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 0. BOOTSTRAP (SISTEM TOKEN CLAUDE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/bootstrap', async (req, res) => {
    const { appId, deviceId, platform, ts, signature } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!appId || !deviceId || !ts || !signature) {
        return res.status(400).json({ error: 'Parameter tidak lengkap.' });
    }

    const tsNum = parseInt(ts);
    if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 30000) {
        await recordSuspiciousIp(ip, 'bootstrap_replay_attack');
        return res.status(403).json({ error: 'Request luput.' });
    }

    // Semak samada appId (apiKey) ni wujud dan aktif
    const keyDoc = await db.collection('api_keys').doc(appId).get();
    if (!keyDoc.exists) {
        await recordSuspiciousIp(ip, 'invalid_appId');
        return res.status(403).json({ error: 'App tidak dikenali.' });
    }

    const keyData = keyDoc.data();
    if (keyData.expiryDate && Date.now() > keyData.expiryDate) return res.status(403).json({ error: 'Akaun App Luput!' });

    // Sahkan tandatangan (HMAC)
    const signRaw = `${appId}:${deviceId}:${ts}`;
    const expected = crypto.createHmac('sha256', appId).update(signRaw).digest('hex');
    
    // Convert to Buffers safely for timingSafeEqual
    const sigBuffer = Buffer.from(signature.padEnd(64, '0').slice(0,64));
    const expBuffer = Buffer.from(expected.padEnd(64, '0').slice(0,64));

    if (!crypto.timingSafeEqual(sigBuffer, expBuffer)) {
        await recordSuspiciousIp(ip, 'invalid_bootstrap_signature');
        return res.status(403).json({ error: 'Signature tidak sah.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (60 * 60 * 1000); // Token sah 1 Jam

    await db.collection('app_sessions').doc(token).set({
        appId, deviceId, platform, ip, expiry, createdAt: Date.now(),
    });

    return res.json({ token, expiry });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MIDDLEWARE: SEMAK SESSION TOKEN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function verifySessionToken(req, res, next) {
    const sessionToken = req.headers['x-session-token'];
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!sessionToken) return res.status(401).json({ error: 'Token diperlukan.' });

    const sessionDoc = await db.collection('app_sessions').doc(sessionToken).get();
    if (!sessionDoc.exists) return res.status(401).json({ error: 'Token tidak sah.' });

    const sessionData = sessionDoc.data();
    if (Date.now() > sessionData.expiry) {
        await db.collection('app_sessions').doc(sessionToken).delete();
        return res.status(401).json({ error: 'Token luput.' });
    }

    // Pass appId to the next route
    req.appId = sessionData.appId;
    req.sessionData = sessionData;
    next();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. GET CHALLENGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/getChallenge', verifySessionToken, async (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(ip, 10, 60000)) {
        await recordSuspiciousIp(ip, 'rate_limit_getChallenge');
        return res.status(429).json({ error: 'Terlalu banyak percubaan.' });
    }

    const nonce  = crypto.randomUUID();
    const digits = [Math.floor(Math.random() * 10), Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)];
    const hmac   = signChallenge(digits, nonce, HMAC_SECRET.value());

    await db.collection('challenges').doc(nonce).set({
        hmac, digits, expiry: Date.now() + 30000, ip, appId: req.appId, createdAt: Date.now()
    });

    res.json({ nonce, challengeCode: digits });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. ATTEST / VERIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/attest', verifySessionToken, async (req, res) => {
    const { nonce, userAnswer, rawBehaviour = {}, deviceDNA = {} } = req.body;
    const appId = req.appId;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!nonce || !userAnswer) return res.status(400).json({ error: 'Parameter tidak lengkap.' });

    if (!checkRateLimit(ip + '_attest', 5, 60000)) {
        await recordSuspiciousIp(ip, 'rate_limit_attest');
        return res.status(429).json({ error: 'Rate limit dikesan.' });
    }

    if (!Array.isArray(userAnswer) || userAnswer.length !== 3 || !userAnswer.every(n => Number.isInteger(n) && n >= 0 && n <= 9)) {
        await recordSuspiciousIp(ip, 'invalid_userAnswer_format');
        return res.status(400).json({ error: 'Format jawapan tidak sah.' });
    }

    const keyDoc = await db.collection('api_keys').doc(appId).get();
    if (!keyDoc.exists) return res.status(403).json({ error: 'Akaun App Tidak Sah!' });
    
    const keyData = keyDoc.data();
    if (keyData.usageMonth >= keyData.planLimit) return res.status(429).json({ error: 'Kuota bulanan habis!' });

    const challengeDoc = await db.collection('challenges').doc(nonce).get();
    if (!challengeDoc.exists) return res.status(400).json({ error: 'Cabaran tidak dijumpai.' });

    const challengeData = challengeDoc.data();

    // Pastikan nonce milik IP & App yang sama
    if (challengeData.ip !== ip || challengeData.appId !== appId) {
        await recordSuspiciousIp(ip, 'nonce_hijack_attempt');
        await db.collection('challenges').doc(nonce).delete();
        return res.status(403).json({ error: 'Sesi tidak sah.' });
    }

    if (Date.now() > challengeData.expiry) {
        hantarTeleAlert(`🐞 DEBUG: Masa 30 saat dah tamat (Cabaran Luput)`);
        await db.collection('challenges').doc(nonce).delete();
        return res.status(400).json({ error: 'Cabaran Luput!' });
    }

    const expectedHmac    = signChallenge(userAnswer, nonce, HMAC_SECRET.value());
    const isAnswerCorrect = crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(challengeData.hmac));

    const { score: riskScore, reasons } = hitungRiskScore(rawBehaviour, deviceDNA);
    const deviceHash = req.sessionData.deviceId; // Guna deviceId dari session

    await db.collection('login_attempts').add({
        nonce, apiKey: appId, ip, deviceHash, riskScore, reasons,
        isAnswerCorrect, solveTimeMs: rawBehaviour.solveTimeMs || 0,
        timestamp: Date.now()
    });

    await db.collection('challenges').doc(nonce).delete();

    if (!isAnswerCorrect) {
        hantarTeleAlert(`🐞 DEBUG: Jawapan Salah! Roda hantar: ${userAnswer.join(',')}, Jawapan sebenar: ${challengeData.digits.join(',')}`);
        return res.status(401).json({ error: 'Jawapan Salah!', riskScore });
    }

    if (riskScore >= 80) {
        await recordSuspiciousIp(ip, `high_risk:${reasons.join(',')}`);
        hantarTeleAlert(`⚠️ <b>BOT DIKESAN</b>\n🌐 IP: <code>${ip}</code>\n📊 Risk: ${riskScore}/100\n📌 Sebab: ${reasons.join(', ')}`);
        return res.status(403).json({ error: 'Bot dikesan.', riskScore });
    }

    // Token Pengesahan Berjaya (Untuk klien gunakan)
    const successToken = crypto.randomBytes(32).toString('hex');
    await db.collection('verified_sessions').doc(successToken).set({
        appId, ip, deviceHash, riskScore, expiry: Date.now() + 300000
    });

    // Tolak Kuota
    await db.collection('api_keys').doc(appId).update({
        usageTotal: admin.firestore.FieldValue.increment(1),
        usageMonth: admin.firestore.FieldValue.increment(1),
        lastUsed: Date.now(),
    });

    return res.json({ token: successToken, riskScore, allowed: true });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN PORTALS & STATS & WEBHOOK (Kekal sama macam V8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/admin/cetak', async (req, res) => {
    if (req.headers['x-admin-pass'] !== ADMIN_PASS.value()) return res.status(403).json({ error: 'Salah Pass!' });
    const newKey = 'zk_live_' + crypto.randomBytes(16).toString('hex');
    await db.collection('api_keys').doc(newKey).set({
        clientName: req.body.clientName || 'Klien Baru', plan: req.body.plan || 'STARTER', planLimit: 100000,
        createdAt: Date.now(), expiryDate: Date.now() + (30 * 24 * 60 * 60 * 1000), status: 'active', usageTotal: 0, usageMonth: 0
    });
    hantarTele(`🔔 <b>PENDAFTARAN BARU</b>\n🔑 Kunci/AppID: <code>${newKey}</code>`, TG_TOKEN.value(), TG_CHAT_ID.value());
    res.json({ success: true, kunci_rahsia: newKey });
});

app.post('/admin/list', async (req, res) => {
    if (req.headers['x-admin-pass'] !== ADMIN_PASS.value()) return res.status(403).json({ error: 'Salah Pass!' });
    const snapshot = await db.collection('api_keys').orderBy('createdAt', 'desc').get();
    const senarai = []; snapshot.forEach(doc => senarai.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: senarai });
});

app.post('/admin/padam', async (req, res) => {
    if (req.headers['x-admin-pass'] !== ADMIN_PASS.value()) return res.status(403).json({ error: 'Salah Pass!' });
    await db.collection('api_keys').doc(req.body.apiKey).delete();
    res.json({ success: true, message: 'Kunci Dihancurkan!' });
});

app.post('/admin/banned', async (req, res) => {
    if (req.headers['x-admin-pass'] !== ADMIN_PASS.value()) return res.status(403).json({ error: 'Salah Pass!' });
    const snap = await db.collection('banned_ips').orderBy('updatedAt', 'desc').limit(50).get();
    const list = []; snap.forEach(doc => list.push(doc.data()));
    res.json({ success: true, data: list });
});

app.post('/admin/unban', async (req, res) => {
    if (req.headers['x-admin-pass'] !== ADMIN_PASS.value()) return res.status(403).json({ error: 'Salah Pass!' });
    await db.collection('banned_ips').doc(req.body.ip.replace(/[.:]/g, '_')).delete();
    res.json({ success: true, message: `IP Unbanned.` });
});

app.get('/stats', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'API key diperlukan' });
    const keyDoc = await db.collection('api_keys').doc(apiKey).get();
    if (!keyDoc.exists) return res.status(403).json({ error: 'API key tidak sah.' });
    const data = keyDoc.data();
    const attemptsSnap = await db.collection('login_attempts').where('apiKey', '==', apiKey).orderBy('timestamp', 'desc').limit(100).get();
    const attempts = attemptsSnap.docs.map(d => d.data());
    const totalAttempts = attempts.length;
    res.json({
        clientName: data.clientName, plan: data.plan, usageMonth: data.usageMonth || 0, planLimit: data.planLimit,
        stats: { totalAttempts, successCount: attempts.filter(a => a.isAnswerCorrect).length, botBlocked: attempts.filter(a => a.riskScore >= 80).length, avgRiskScore: totalAttempts > 0 ? Math.round(attempts.reduce((s, a) => s + (a.riskScore || 0), 0) / totalAttempts) : 0 }
    });
});

app.post('/webhook/toyyib', async (req, res) => {
    const { status, billcode, order_id, hash } = req.body;
    const expectedHash = crypto.createHash('md5').update(billcode + TOYYIB_SECRET.value() + status).digest('hex');
    if (hash !== expectedHash) return res.status(403).send('Invalid Hash');
    if (status === '1' || status === 1) {
        const clientName = order_id || 'Pelanggan Auto';
        const newKey = 'zk_live_' + crypto.randomBytes(16).toString('hex');
        await db.collection('api_keys').doc(newKey).set({
            clientName, plan: 'STARTER', planLimit: 100000, createdAt: Date.now(), expiryDate: Date.now() + (30 * 24 * 60 * 60 * 1000), status: 'active', usageTotal: 0, usageMonth: 0, billcode
        });
        hantarTele(`💰 <b>DUIT MASUK!</b>\n👤 Klien: <b>${clientName}</b>\n🔑 Kunci: <code>${newKey}</code>`, TG_TOKEN.value(), TG_CHAT_ID.value());
    }
    res.status(200).send('OK');
});

exports.api = onRequest({ region: 'asia-southeast1', memory: '256MiB', secrets: ['TG_TOKEN', 'TG_CHAT_ID', 'ADMIN_PASS', 'HMAC_SECRET', 'TOYYIB_SECRET'] }, app);

// --- LOGIK Z-TICKET DEMO ---
const ticketApp = express();
ticketApp.use(cors({ origin: true }));
ticketApp.use(express.json());

// State (Nota: Dalam Cloud Functions, data ni akan reset kalau lama tak guna)
let tickets = {
    1: { name: 'Coldplay 2026', available: 1000, price: 299 },
    2: { name: 'Siti Nurhaliza Live', available: 500, price: 199 }
};
let stats = { blockedBots: 0, totalPurchases: 0 };

// Endpoint Beli
ticketApp.post('/purchase', (req, res) => {
    const { eventId, isVerifiedHuman } = req.body;
    if (!isVerifiedHuman) {
        stats.blockedBots++;
        return res.status(403).json({ success: false, error: 'Bot Blocked!' });
    }
    if (tickets[eventId] && tickets[eventId].available > 0) {
        tickets[eventId].available--;
        stats.totalPurchases++;
        return res.json({ success: true, message: 'Berjaya!' });
    }
    res.status(400).json({ success: false, error: 'Tiket Habis!' });
});

// Endpoint Stats
ticketApp.get('/stats', (req, res) => res.json({ tickets, stats }));

// Export sebagai Function
exports.zTicketApp = onRequest(ticketApp);
