const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function createApiKey(clientName) {
    const newKey = 'zk_live_' + crypto.randomBytes(16).toString('hex');
    const keyData = {
        key: newKey,
        clientName: clientName,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalRequests: 0
    };

    try {
        await db.collection('api_keys').doc(newKey).set(keyData);
        console.log('\n✅ KUNCI BARU BERJAYA DICETAK!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`KLIEN : ${clientName}`);
        console.log(`KUNCI : ${newKey}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Gagal cetak kunci:', error);
        process.exit(1);
    }
}

const name = process.argv[2];
if (!name) {
    console.log('⚠️ Sila masukkan nama klien.');
    process.exit(1);
}

createApiKey(name);
