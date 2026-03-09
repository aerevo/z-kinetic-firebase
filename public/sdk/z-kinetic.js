/**
 * Z-KINETIC WEB SDK v1.0 (ENTERPRISE EDITION)
 * Hybrid Biometric Anti-Bot (Mouse + Touch) + AI Poison
 */

const ZKinetic = (function () {
    const SERVER_URL = 'https://api-dxtcyy6wma-as.a.run.app';
    let config = { appId: '', onSuccess: null, onFail: null };
    let sessionToken = null;
    let currentNonce = null;
    let challengeStartTime = null;
    
    // Biometric Data
    let touchTimestamps = [];
    let scrollVelocities = [];
    let lastScrollTime = 0;

    // --- CRYPTO & DNA ENGINE ---
    async function getDeviceDNA() {
        const ua = navigator.userAgent;
        let os = "Unknown";
        if (ua.indexOf("Win") != -1) os = "Windows";
        if (ua.indexOf("Mac") != -1) os = "MacOS";
        if (ua.indexOf("Android") != -1) os = "Android";
        if (ua.indexOf("like Mac") != -1) os = "iOS";
        
        return {
            model: navigator.platform || "WebBrowser",
            osVersion: os,
            screenRes: `${window.screen.width}x${window.screen.height}`
        };
    }

    async function generateHMAC(secret, data) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function generateDeviceId() {
        let id = localStorage.getItem('zk_device_id');
        if (!id) {
            id = 'web_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
            localStorage.setItem('zk_device_id', id);
        }
        return id;
    }

    // --- API CALLS ---
    async function bootstrap() {
        try {
            const cachedToken = localStorage.getItem(`zk_token_${config.appId}`);
            const expiry = localStorage.getItem(`zk_expiry_${config.appId}`);
            if (cachedToken && expiry && Date.now() < parseInt(expiry)) {
                sessionToken = cachedToken;
                return true;
            }

            const deviceId = generateDeviceId();
            const ts = Date.now().toString();
            const signRaw = `${config.appId}:${deviceId}:${ts}`;
            const signature = await generateHMAC(config.appId, signRaw);

            const res = await fetch(`${SERVER_URL}/bootstrap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId: config.appId, deviceId, platform: 'web', ts, signature })
            });

            if (res.ok) {
                const data = await res.json();
                sessionToken = data.token;
                localStorage.setItem(`zk_token_${config.appId}`, sessionToken);
                localStorage.setItem(`zk_expiry_${config.appId}`, data.expiry);
                return true;
            }
            return false;
        } catch (e) { console.error("Z-Kinetic Bootstrap Error", e); return false; }
    }

    async function fetchChallenge() {
        const res = await fetch(`${SERVER_URL}/getChallenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken },
            body: JSON.stringify({})
        });
        if (res.ok) return await res.json();
        throw new Error("Gagal mengambil cabaran.");
    }

    async function attest(userAnswer) {
        const solveTimeMs = Date.now() - challengeStartTime;
        const deviceDNA = await getDeviceDNA();
        
        const rawBehaviour = {
            touchTimestamps: touchTimestamps.slice(-20),
            scrollVelocities: scrollVelocities.slice(-20),
            solveTimeMs: solveTimeMs
        };

        const res = await fetch(`${SERVER_URL}/attest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken },
            body: JSON.stringify({ nonce: currentNonce, userAnswer, deviceDNA, rawBehaviour })
        });
        
        return await res.json();
    }

    // --- UI INJECTION & AI POISON ---
    function injectUI(challengeDigits) {
        const style = document.createElement('style');
        style.innerHTML = `
            #zk-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: sans-serif; }
            .zk-box { background: #1e293b; padding: 30px; border-radius: 20px; border: 1px solid #38bdf8; box-shadow: 0 0 30px rgba(56, 189, 248, 0.2); text-align: center; max-width: 350px; width: 90%; }
            
            /* AI POISON CSS (Anti-OCR) */
            .zk-display { background: #3e2723; padding: 15px; border-radius: 10px; display: flex; justify-content: center; gap: 20px; border: 1px solid orange; position: relative; overflow: hidden; }
            .zk-digit { font-size: 32px; font-weight: 900; font-family: 'Courier New', monospace; color: white; text-shadow: 2px 2px 10px red, -2px -2px 10px blue; animation: zkPoison 0.15s infinite alternate; }
            .zk-noise { position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px); pointer-events: none; }
            
            @keyframes zkPoison { 0% { transform: skewX(5deg) scale(0.95); opacity: 0.9; } 100% { transform: skewX(-5deg) scale(1.05); opacity: 1; } }
            
            /* WHEELS */
            .zk-wheels { display: flex; justify-content: center; gap: 15px; margin: 20px 0; }
            .zk-wheel-container { height: 120px; width: 60px; overflow-y: scroll; scroll-snap-type: y mandatory; scrollbar-width: none; background: #0f172a; border-radius: 10px; border: 1px solid #334155; position: relative; }
            .zk-wheel-container::-webkit-scrollbar { display: none; }
            .zk-item { height: 40px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; color: #94a3b8; scroll-snap-align: center; }
            .zk-center-line { position: absolute; top: 40px; left: 0; right: 0; height: 40px; border-top: 2px solid #38bdf8; border-bottom: 2px solid #38bdf8; pointer-events: none; background: rgba(56, 189, 248, 0.1); }
            
            .zk-btn { background: #0284c7; color: white; border: none; padding: 12px 0; width: 100%; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.3s; box-shadow: 0 0 15px rgba(2, 132, 199, 0.5); }
            .zk-btn:hover { background: #0369a1; }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'zk-overlay';
        
        let wheelsHTML = '';
        for (let w = 0; w < 3; w++) {
            let items = '';
            for (let i = 0; i <= 9; i++) items += `<div class="zk-item" data-val="${i}">${i}</div>`;
            wheelsHTML += `
                <div class="zk-wheel-container" id="zk-w${w}">
                    <div style="height: 40px;"></div> ${items}
                    <div style="height: 40px;"></div> <div class="zk-center-line"></div>
                </div>
            `;
        }

        overlay.innerHTML = `
            <div class="zk-box">
                <h2 style="color: #38bdf8; margin: 0 0 5px 0; font-weight: 900; letter-spacing: 2px;">Z-KINETIC</h2>
                <p style="color: #94a3b8; font-size: 10px; margin-bottom: 15px;">ENTERPRISE BIOMETRIC WAF</p>
                
                <div class="zk-display">
                    <div class="zk-noise"></div>
                    <span class="zk-digit">${challengeDigits[0]}</span>
                    <span class="zk-digit">${challengeDigits[1]}</span>
                    <span class="zk-digit">${challengeDigits[2]}</span>
                </div>
                
                <div class="zk-wheels">${wheelsHTML}</div>
                <button class="zk-btn" id="zk-verify-btn">VERIFY HUMANKIND</button>
            </div>
        `;
        document.body.appendChild(overlay);

        // --- TRACKING BIOMETRICS (MOUSE & TOUCH) ---
        function trackAction() {
            touchTimestamps.push(Date.now() - challengeStartTime);
            if (touchTimestamps.length > 20) touchTimestamps.shift();
        }

        function trackScroll(e) {
            const now = Date.now();
            if (lastScrollTime > 0) {
                const deltaMs = now - lastScrollTime;
                if (deltaMs > 0) {
                    const vel = 100.0 / deltaMs; // Pseudo-velocity
                    scrollVelocities.push(vel);
                    if (scrollVelocities.length > 20) scrollVelocities.shift();
                }
            }
            lastScrollTime = now;
            trackAction();
        }

        // Attach trackers to wheels
        for (let w = 0; w < 3; w++) {
            const wheel = document.getElementById(`zk-w${w}`);
            wheel.addEventListener('scroll', trackScroll);
            wheel.addEventListener('touchmove', trackScroll);
            wheel.addEventListener('click', trackAction);
        }

        // --- VERIFY BUTTON LOGIC ---
        document.getElementById('zk-verify-btn').addEventListener('click', async () => {
            const btn = document.getElementById('zk-verify-btn');
            btn.innerText = "VERIFYING...";
            btn.disabled = true;

            const ans = [];
            for (let w = 0; w < 3; w++) {
                const wheel = document.getElementById(`zk-w${w}`);
                // Calculate selected digit based on scroll position (40px per item)
                const scrollY = wheel.scrollTop;
                const index = Math.round(scrollY / 40);
                ans.push(index > 9 ? 9 : (index < 0 ? 0 : index));
            }

            try {
                const result = await attest(ans);
                document.body.removeChild(overlay);
                if (result.allowed) {
                    if (config.onSuccess) config.onSuccess();
                } else {
                    if (config.onFail) config.onFail(result.error);
                }
            } catch (e) {
                alert("Ralat pelayan Z-Kinetic.");
                document.body.removeChild(overlay);
                if (config.onFail) config.onFail("Network error");
            }
        });
    }

    // --- PUBLIC API ---
    return {
        verify: async function (options) {
            config = options;
            if (!config.appId) return console.error("Z-Kinetic: appId is required!");

            // 1. Bootstrap (Get Session Token)
            const isBootstrapped = await bootstrap();
            if (!isBootstrapped) {
                alert("Sistem Keselamatan Gagal Dimulakan.");
                if (config.onFail) config.onFail("Bootstrap failed");
                return;
            }

            // 2. Fetch Challenge
            try {
                const data = await fetchChallenge();
                currentNonce = data.nonce;
                touchTimestamps = [];
                scrollVelocities = [];
                challengeStartTime = Date.now();
                
                // 3. Show UI
                injectUI(data.challengeCode);
            } catch (e) {
                alert("Akses Disekat oleh WAF Z-Kinetic.");
                if (config.onFail) config.onFail(e.message);
            }
        }
    };
})();
