const { onRequest } = require("firebase-functions/v2/https");
const express = require('express');
const cors = require('cors');

const ticketApp = express();
// Pas Pelawat Wajib untuk Web & Flutter
ticketApp.use(cors({ origin: true }));
ticketApp.use(express.json());

// ==========================================
// 🛡️ PINTU WAF Z-KINETIC (UNTUK SDK)
// ==========================================
ticketApp.post('/bootstrap', (req, res) => {
    res.json({ token: 'zk-token-' + Date.now(), expiry: Date.now() + 3600000 });
});

ticketApp.post('/getChallenge', (req, res) => {
    res.json({ 
        challengeCode: [Math.floor(Math.random()*10), Math.floor(Math.random()*10), Math.floor(Math.random()*10)],
        nonce: 'zk-nonce-' + Date.now()
    });
});

ticketApp.post('/attest', (req, res) => {
    res.json({ allowed: true, token: 'validated-human' });
});

// ==========================================
// 🎫 PINTU DEMO TIKET (UNTUK WEBSITE)
// ==========================================
let tickets = {
    'cp26': { name: 'Coldplay 2026 Live', available: 1000, price: 299 },
    'sn25': { name: 'Siti Nurhaliza Exclusive', available: 500, price: 199 }
};

ticketApp.get('/api/demo/stats', (req, res) => {
    res.json({ tickets: tickets });
});

ticketApp.post('/api/demo/purchase', (req, res) => {
    const { eventId, isVerifiedHuman } = req.body;
    if (!isVerifiedHuman) {
        return res.status(403).json({ success: false, error: 'Akses Disekat: Sila sahkan biometrik.' });
    }
    if (tickets[eventId] && tickets[eventId].available > 0) {
        tickets[eventId].available--;
        return res.json({ success: true, message: 'Berjaya!' });
    }
    res.status(400).json({ success: false, error: 'Tiket Habis!' });
});

// ==========================================
// 🚀 EXPORT KE MARKAS SINGAPURA
// ==========================================
exports.zTicketApp = onRequest({ region: "asia-southeast1" }, ticketApp);
