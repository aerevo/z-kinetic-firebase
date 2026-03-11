/*!
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Z-KINETIC WEB SDK  v1.0
 *  Port penuh daripada Flutter SDK v6.1 ULTIMATE
 *
 *  Usage:
 *    <script src="z-kinetic.js"></script>
 *    ZKinetic.show({
 *      appId    : 'zk_live_xxxx',
 *      imageUrl : 'z_wheel3.png',   // sama folder dengan HTML
 *      onSuccess: (result) => { console.log('Human!', result); },
 *      onCancel : () => {},
 *    });
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════
  //  CONSTANTS  —  ZKineticConfig
  // ═══════════════════════════════════════════════════════
  const IMG_W = 712, IMG_H = 600;
  const WHEEL_COORDS = [
    [165, 155, 257, 380],
    [309, 155, 402, 380],
    [457, 155, 546, 381],
  ];
  const BTN_COORDS  = [122, 435, 603, 546];
  const REPEATS     = 3;          // 0-9 diulang 3× = 30 item
  const DIGITS_N    = 10;
  const TOTAL_ITEMS = REPEATS * DIGITS_N;

  // ═══════════════════════════════════════════════════════
  //  MODULE VARIABLES
  // ═══════════════════════════════════════════════════════
  let C = {};   // config
  let S = {};   // state (session + behaviour)
  let D = {};   // DOM refs
  let A = {};   // animation state

  function resetState() {
    S = {
      token      : null,
      nonce      : null,
      code       : [],
      touches    : [],      // touchTimestamps
      scrollVels : [],      // scrollVelocities
      solveStart : null,
      scrollEvts : [],      // GestureAudit events
      prevItems  : [0,0,0],
      motionScore: 0,
      lastMag    : 9.8,
      lastMotionT: Date.now(),
      activeWheel: null,
      wheelTimer : null,
    };
    A = {
      running  : false,
      rafId    : null,
      drift    : [[0,0],[0,0],[0,0]],   // _textDriftOffsets
      opT      : 0,                     // opacity animation phase
      lastNoise: 0,
      lastDrift: 0,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  CSS — Self-Contained (injek sekali, tiada fail luar)
  // ═══════════════════════════════════════════════════════
  const ZK_CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@600;700&family=Orbitron:wght@700;900&display=swap');

    /* ── Modal backdrop ── */
    #zk-modal {
      position:fixed;inset:0;z-index:999999;
      background:rgba(0,0,0,0.93);
      display:flex;align-items:center;justify-content:center;
      padding:12px;
      font-family:'Rajdhani',sans-serif;
    }

    /* ── Orange card — Container color:0xFFFF5722 borderRadius:24 ── */
    .zk-card {
      background:#FF5722;border-radius:24px;
      padding:16px 14px 10px;width:360px;max-width:96vw;
      box-shadow:0 20px 60px rgba(0,0,0,.65);
    }
    .zk-title {
      font-family:'Orbitron',sans-serif;font-size:26px;font-weight:900;
      color:#fff;letter-spacing:3px;text-align:center;margin:0 0 8px;
    }
    .zk-pill-row { display:flex;justify-content:center;margin-bottom:10px; }
    .zk-pill {
      display:inline-flex;align-items:center;gap:6px;
      background:rgba(255,255,255,.2);border-radius:20px;padding:4px 12px;
      font-family:'Orbitron',sans-serif;font-size:7px;font-weight:700;
      color:#fff;letter-spacing:.8px;
    }
    .zk-pill-ck { color:#4ade80;font-size:10px; }

    /* ── Code display — UltimatePoisonChallengeDisplay ──
       height:60, margin:0 40px, color:0xFF3E2723 ── */
    .zk-codebox {
      height:60px;margin:0 40px 8px;
      background:#3E2723;border-radius:12px;
      border:1.5px solid rgba(255,140,0,.4);
      box-shadow:0 0 15px rgba(255,120,0,.2);
      position:relative;overflow:hidden;
      display:flex;align-items:center;justify-content:center;
    }
    /* Scanline — port UltimatePoisonNoisePainter scanline loop */
    .zk-codebox::after {
      content:'';position:absolute;inset:0;
      background:repeating-linear-gradient(
        0deg,transparent,transparent 2px,
        rgba(255,255,255,.015) 2px,rgba(255,255,255,.015) 3px);
      pointer-events:none;z-index:2;
    }
    #zk-noise {
      position:absolute;inset:0;width:100%;height:100%;
      pointer-events:none;z-index:0;
    }
    .zk-digits {
      display:flex;align-items:center;gap:10px;
      position:relative;z-index:3;
    }
    /* Digit — port _buildPoisonedDigit, akan-diglitch via JS */
    .zk-digit {
      font-family:'Share Tech Mono',monospace;font-size:32px;font-weight:900;
      color:rgba(255,255,255,.97);
      width:40px;height:50px;
      display:inline-flex;align-items:center;justify-content:center;
      text-shadow:0 0 8px rgba(0,0,0,.8),0 0 15px rgba(255,120,0,.3);
      will-change:transform;
    }
    .zk-hint {
      text-align:center;color:rgba(255,255,255,.7);font-size:12px;
      font-family:'Rajdhani',sans-serif;margin:0 0 10px;
    }

    /* ── Cryptex — FittedBox.contain nisbah 712:600 ── */
    .zk-cryptex {
      position:relative;width:100%;
      padding-top:calc(600/712*100%);
      border-radius:12px;overflow:hidden;
      margin-bottom:10px;background:#c5c5c5;
    }
    .zk-cx-inner { position:absolute;inset:0; }
    .zk-cx-img   { width:100%;height:100%;object-fit:fill;display:block;border-radius:12px; }
    .zk-cx-fb    {
      position:absolute;inset:0;display:none;
      flex-direction:column;align-items:center;justify-content:center;gap:6px;
      background:linear-gradient(135deg,#ddd,#bbb);border-radius:12px;
      font-family:'Share Tech Mono',monospace;font-size:10px;
      color:#666;text-align:center;padding:12px;
    }

    /* ── Wheel overlay — transparent, dikira dari WHEEL_COORDS ── */
    .zk-wheel {
      position:absolute;
      overflow-y:scroll;scroll-snap-type:y mandatory;
      scrollbar-width:none;cursor:grab;
      -webkit-overflow-scrolling:touch;
      background:transparent;
      /* Barrel fade — simulasi Flutter diameterRatio:1.5 */
      -webkit-mask-image:linear-gradient(to bottom,
        transparent 0%,rgba(0,0,0,.55) 18%,
        black 33%,black 67%,
        rgba(0,0,0,.55) 82%,transparent 100%);
      mask-image:linear-gradient(to bottom,
        transparent 0%,rgba(0,0,0,.55) 18%,
        black 33%,black 67%,
        rgba(0,0,0,.55) 82%,transparent 100%);
    }
    .zk-wheel::-webkit-scrollbar { display:none; }
    .zk-wheel:active              { cursor:grabbing; }

    /* Digit item dalam roda */
    .zk-wi {
      display:flex;align-items:center;justify-content:center;
      scroll-snap-align:center;
      font-family:'Orbitron',sans-serif;font-weight:900;
      user-select:none;will-change:transform,opacity,color;
      /* height & fontSize dikira JS positionWheels() */
    }

    /* ── Confirm button overlay — transparent tap area ── */
    .zk-cbtn {
      position:absolute;cursor:pointer;
      background:transparent;border:none;border-radius:12px;
      transition:transform .1s,box-shadow .15s;
    }
    .zk-cbtn:hover  { box-shadow:0 0 30px rgba(255,87,34,.75)!important; }
    .zk-cbtn.pressed{ transform:scale(.97);box-shadow:none!important; }

    /* ── Biometric panel — _buildBiometricPanel ── */
    .zk-bio {
      background:#FF5722;border-radius:10px;padding:7px 12px;
      display:flex;justify-content:space-around;align-items:center;
      margin-bottom:6px;
    }
    .zk-bio-i   { display:flex;flex-direction:column;align-items:center;gap:3px; }
    .zk-bio-ico { font-size:16px;opacity:.28;transition:opacity .3s,filter .3s; }
    .zk-bio-ico.on { opacity:1;filter:drop-shadow(0 0 5px #4ade80); }
    .zk-bio-lbl {
      font-family:'Orbitron',sans-serif;font-size:6px;font-weight:700;
      letter-spacing:.5px;color:rgba(255,255,255,.3);transition:color .3s;
    }
    .zk-bio-lbl.on { color:#4ade80; }

    .zk-cancel {
      display:block;width:100%;background:none;border:none;
      color:rgba(255,255,255,.7);font-family:'Rajdhani',sans-serif;
      font-size:14px;cursor:pointer;padding:8px 0;
      text-align:center;transition:color .2s;
    }
    .zk-cancel:hover { color:#fff; }

    /* ── Loading state ── */
    .zk-loading {
      display:flex;flex-direction:column;align-items:center;
      gap:14px;padding:28px 0;
    }
    .zk-spinner {
      width:32px;height:32px;
      border:3px solid rgba(255,255,255,.3);
      border-top-color:#fff;border-radius:50%;
      animation:zk-spin .8s linear infinite;
    }
    @keyframes zk-spin { to { transform:rotate(360deg); } }
    .zk-load-lbl {
      font-family:'Share Tech Mono',monospace;font-size:11px;
      color:rgba(255,255,255,.65);letter-spacing:1px;
    }

    /* ── Network error — _buildNetworkErrorScreen ── */
    .zk-err {
      background:#263238;border-radius:24px;padding:28px 20px;
      border:2px solid rgba(255,60,60,.4);
      text-align:center;max-width:320px;width:96vw;
    }
    .zk-err-ico   { font-size:52px;margin-bottom:16px;display:block; }
    .zk-err-title {
      font-family:'Orbitron',sans-serif;font-size:17px;font-weight:700;
      color:#fff;letter-spacing:1px;margin:0 0 12px;
    }
    .zk-err-msg {
      font-size:13px;color:rgba(255,255,255,.6);line-height:1.6;
      margin:0 0 20px;font-family:'Rajdhani',sans-serif;
    }
    .zk-retry {
      background:#FF5722;color:#fff;border:none;border-radius:10px;
      font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;
      padding:12px 24px;cursor:pointer;letter-spacing:1px;transition:background .2s;
    }
    .zk-retry:hover { background:#E64A19; }
    .zk-back {
      display:block;margin-top:10px;background:none;border:none;
      color:rgba(255,255,255,.45);font-size:13px;cursor:pointer;
    }
  `;

  function injectCSS() {
    if (document.getElementById('zk-css')) return;
    const s   = document.createElement('style');
    s.id      = 'zk-css';
    s.textContent = ZK_CSS;
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════
  //  CRYPTO — HMAC-SHA256  (port _hmacSign: Hmac(sha256,key))
  // ═══════════════════════════════════════════════════════
  async function hmacSign(data, key) {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey(
      'raw', enc.encode(key), { name:'HMAC', hash:'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', k, enc.encode(data));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ═══════════════════════════════════════════════════════
  //  TOKEN STORAGE  (localStorage ≈ FlutterSecureStorage)
  // ═══════════════════════════════════════════════════════
  const K  = id => `zk_t_${id}`;
  const KE = id => `zk_e_${id}`;
  const tokenGet   = ()     => { try { const t=localStorage.getItem(K(C.appId)),e=localStorage.getItem(KE(C.appId)); return(t&&e&&Date.now()<+e)?t:null; } catch{return null;} };
  const tokenSave  = (t, e) => { try { localStorage.setItem(K(C.appId),t); localStorage.setItem(KE(C.appId),e); } catch{} };
  const tokenClear = ()     => { try { localStorage.removeItem(K(C.appId)); localStorage.removeItem(KE(C.appId)); } catch{} };

  // ═══════════════════════════════════════════════════════
  //  BOOTSTRAP  (port WidgetController.bootstrap)
  //  Cek cached token → kalau tiada, POST /bootstrap + HMAC
  // ═══════════════════════════════════════════════════════
  async function bootstrap() {
    const cached = tokenGet();
    if (cached) { S.token = cached; return true; }
    try {
      const deviceId  = navigator.userAgent.replace(/\W/g,'').slice(0, 64);
      const ts        = Date.now().toString();
      const signature = await hmacSign(`${C.appId}:${deviceId}:${ts}`, C.appId);
      const r = await fetch(`${C.serverUrl}/bootstrap`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ appId:C.appId, deviceId, platform:'web', ts, signature }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.token && d.expiry) { tokenSave(d.token, d.expiry); S.token = d.token; return true; }
      }
    } catch {}
    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  FETCH CHALLENGE  (port WidgetController.fetchChallenge)
  //  POST /getChallenge dengan x-session-token
  //  401 → clear token + null
  // ═══════════════════════════════════════════════════════
  async function fetchChallenge() {
    if (!S.token) return false;
    try {
      const r = await fetch(`${C.serverUrl}/getChallenge`, {
        method:'POST',
        headers:{'Content-Type':'application/json','x-session-token':S.token},
        body:'{}',
      });
      if (r.ok) {
        const d = await r.json();
        if (d.challengeCode && d.nonce) {
          S.nonce = d.nonce; S.code = d.challengeCode;
          S.touches=[]; S.scrollVels=[]; S.solveStart=Date.now();
          S.scrollEvts=[]; S.prevItems=[0,0,0];
          return true;
        }
      }
      if (r.status === 401) { tokenClear(); S.token = null; }
    } catch {}
    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  GESTURE AUDIT  (port GestureAudit)
  //  isTampered: digit≠0 tapi tiada scroll event = bot
  // ═══════════════════════════════════════════════════════
  function auditTampered(ans) {
    for (let i=0; i<3; i++) {
      if (ans[i] !== 0 && S.scrollEvts.filter(e=>e.wi===i).length===0) return true;
    }
    return false;
  }
  function auditRecord(wi, from, to) {
    S.scrollEvts.push({wi,from,to,at:Date.now()});
    if (S.scrollEvts.length > 50) S.scrollEvts.shift();
  }
  function registerTouch() {
    if (S.solveStart) { S.touches.push(Date.now()-S.solveStart); if(S.touches.length>20)S.touches.shift(); }
    refreshBio();
  }
  function registerScroll(v) {
    S.scrollVels.push(v); if(S.scrollVels.length>20) S.scrollVels.shift();
    refreshBio();
  }

  // ═══════════════════════════════════════════════════════
  //  VERIFY  (port WidgetController.verify → POST /attest)
  //  Hantar nonce, userAnswer, deviceDNA, rawBehaviour
  // ═══════════════════════════════════════════════════════
  async function doVerify(ans) {
    if (!S.token) return { allowed:false, error:'Tiada sesi aktif.' };
    if (!S.nonce) return { allowed:false, error:'Tiada cabaran aktif.' };
    if (auditTampered(ans)) return { allowed:false, error:'Aktiviti mencurigakan.', reason:'TAMPER_DETECTED' };

    const rawBehaviour = {
      touchTimestamps  : [...S.touches],
      scrollVelocities : [...S.scrollVels],
      solveTimeMs      : S.solveStart ? Date.now()-S.solveStart : 0,
    };
    const deviceDNA = {
      model    : navigator.userAgent,
      osVersion: navigator.platform || 'web',
      screenRes: `${Math.round(screen.width*devicePixelRatio)}x${Math.round(screen.height*devicePixelRatio)}`,
    };
    try {
      const r = await fetch(`${C.serverUrl}/attest`, {
        method:'POST',
        headers:{'Content-Type':'application/json','x-session-token':S.token},
        body: JSON.stringify({ nonce:S.nonce, userAnswer:ans, deviceDNA, rawBehaviour }),
      });
      if (r.ok) return await r.json();
      return { allowed:false, error:`Server error ${r.status}` };
    } catch { return { allowed:false, error:'Tiada sambungan.' }; }
  }

  // ═══════════════════════════════════════════════════════
  //  MOTION SENSOR  (port _initSensors + _startDecayTimer)
  //  DeviceMotionEvent → accelerometerEventStream
  //  Decay: -0.05 setiap 200ms selepas 500ms idle
  // ═══════════════════════════════════════════════════════
  let _mEL=null, _mDT=null;
  function startMotion() {
    _mEL = e => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      const mag = Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
      const delta = Math.abs(mag-S.lastMag);
      if (delta > 0.3) {                                     // threshold sama
        S.motionScore = Math.min(1, delta/3.0);              // (delta/3.0).clamp(0,1)
        S.lastMotionT = Date.now();
        refreshBio();
      }
      S.lastMag = mag;
    };
    window.addEventListener('devicemotion', _mEL);
    _mDT = setInterval(() => {                               // _startDecayTimer
      if (Date.now()-S.lastMotionT > 500) {
        S.motionScore = Math.max(0, S.motionScore-.05);
        refreshBio();
      }
    }, 200);
  }
  function stopMotion() {
    if (_mEL) { window.removeEventListener('devicemotion',_mEL); _mEL=null; }
    if (_mDT) { clearInterval(_mDT); _mDT=null; }
  }

  // ═══════════════════════════════════════════════════════
  //  NOISE PAINTER  (port penuh UltimatePoisonNoisePainter)
  //  50 garisan + 5 digit hantu + scanlines + 30 titik + 8 coretan
  // ═══════════════════════════════════════════════════════
  function paintNoise(canvas) {
    if (!canvas || !canvas.offsetWidth) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const W=canvas.width, H=canvas.height;

    // LCG seeded random (seed berubah setiap frame → noise bergerak)
    let s = Date.now() | 0;
    const r = () => { s=(s*1664525+1013904223)&0x7fffffff; return s/0x7fffffff; };

    // ① 50 garisan rawak
    for (let i=0;i<50;i++) {
      ctx.strokeStyle = `rgba(255,255,255,${r()*.12+.02})`;
      ctx.lineWidth   = r()*1.5+.3;
      ctx.beginPath(); ctx.moveTo(r()*W,r()*H); ctx.lineTo(r()*W,r()*H); ctx.stroke();
    }
    // ② 5 digit hantu
    for (let g=0;g<5;g++) {
      ctx.font      = `900 ${~~(18+r()*15)}px 'Share Tech Mono',monospace`;
      ctx.fillStyle = `rgba(255,255,255,${r()*.08+.02})`;
      ctx.fillText(~~(r()*10), r()*W, r()*H+20);
    }
    // ③ Scanlines setiap 3px
    ctx.strokeStyle='rgba(255,255,255,.02)'; ctx.lineWidth=1;
    for (let y=0;y<H;y+=3) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    // ④ 30 titik
    for (let d=0;d<30;d++) {
      ctx.fillStyle=`rgba(255,255,255,${r()*.06+.01})`;
      ctx.beginPath(); ctx.arc(r()*W,r()*H,r()*1.5+.3,0,Math.PI*2); ctx.fill();
    }
    // ⑤ 8 coretan menegak
    for (let i=0;i<8;i++) {
      ctx.strokeStyle=`rgba(255,255,255,${r()*.05+.01})`; ctx.lineWidth=r()*2;
      const sx=r()*W;
      ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx+(r()-.5)*40,H); ctx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════
  //  DIGIT GLITCH  (port _buildPoisonedDigit AnimatedBuilder)
  //  Setiap 120ms: jitter±4px, rotate±0.13rad, skew, scale 0.95-1.05
  // ═══════════════════════════════════════════════════════
  function glitchDigits() {
    if (!D.digits) return;
    D.digits.forEach(el => {
      if (!el) return;
      const rot  = (Math.random()-.5)*.26;
      const skew = (Math.random()-.5)*.1;
      const jx   = (Math.random()-.5)*4;
      const jy   = (Math.random()-.5)*4;
      const sc   = .95+Math.random()*.1;
      el.style.transform =
        `translate(${jx}px,${jy}px) rotate(${rot*57.3}deg) scale(${sc}) skewX(${skew*20}deg)`;
    });
  }

  // ═══════════════════════════════════════════════════════
  //  WHEEL MATH
  //  Dengan scroll-snap-align:center dan itemHeight = containerH/3:
  //    snap formula: scrollTop = ih*(i-1)
  //    centreIdx    = round(scrollTop/ih) + 1
  // ═══════════════════════════════════════════════════════
  function itemH(wEl)     { return wEl.offsetHeight / 3; }
  function centreIdx(wEl) { const ih=itemH(wEl); return ih ? Math.round(wEl.scrollTop/ih)+1 : 1; }
  function getDigit(wi)   { return centreIdx(D.wheels[wi]) % DIGITS_N; }

  // Smooth scroll ke item idx dengan easing function
  function scrollToItem(el, idx, dur, ease) {
    const ih=itemH(el); if(!ih) return;
    const target=(idx-1)*ih, start=el.scrollTop, t0=performance.now();
    const step = ts => {
      const p=Math.min(1,(ts-t0)/dur);
      el.scrollTop = start+(target-start)*ease(p);
      if (p<1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Elastic out — Curves.elasticOut Flutter
  function easeOutElastic(t) {
    const c4 = 2*Math.PI/3;
    return t===0?0:t===1?1:Math.pow(2,-10*t)*Math.sin((t*10-.75)*c4)+1;
  }

  // ═══════════════════════════════════════════════════════
  //  POSITION WHEELS  (FittedBox.contain — scale dari 712×600)
  //  Dikira semula setiap resize (ResizeObserver)
  // ═══════════════════════════════════════════════════════
  let _ro = null;
  function positionWheels() {
    const cx=D.cryptex; if(!cx) return;
    const scale = cx.offsetWidth / IMG_W;

    D.wheels.forEach((el,i) => {
      if(!el) return;
      const [x1,y1,x2,y2]=WHEEL_COORDS[i];
      const w=(x2-x1)*scale, h=(y2-y1)*scale;
      el.style.left   = (x1*scale)+'px';
      el.style.top    = (y1*scale)+'px';
      el.style.width  = w+'px';
      el.style.height = h+'px';
      // itemExtent = height*0.40 Flutter → 3 items visible = h/3
      const ih = h/3;
      el.querySelectorAll('.zk-wi').forEach(item => {
        item.style.height    = ih+'px';
        item.style.minHeight = ih+'px';
        item.style.fontSize  = ~~(ih*.72)+'px';
      });
    });

    if (D.btn) {
      const [bx1,by1,bx2,by2]=BTN_COORDS;
      D.btn.style.left      = (bx1*scale)+'px';
      D.btn.style.top       = (by1*scale)+'px';
      D.btn.style.width     = ((bx2-bx1)*scale)+'px';
      D.btn.style.height    = ((by2-by1)*scale)+'px';
      D.btn.style.boxShadow = `0 0 ${~~(20*scale)}px rgba(255,87,34,.5)`;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  BUILD WHEELS  (0-9 × 3 ulangan = 30 item)
  // ═══════════════════════════════════════════════════════
  function buildWheels() {
    D.wheels.forEach((el,wi) => {
      if(!el) return;
      el.innerHTML='';
      for (let rep=0;rep<REPEATS;rep++) {
        for (let d=0;d<=9;d++) {
          const item=document.createElement('div');
          item.className='zk-wi';
          item.textContent=d;
          el.appendChild(item);
        }
      }

      // Scroll listener → registerScroll + auditRecord
      let lstop=0, lstim=Date.now();
      el.addEventListener('scroll', () => {
        const now=Date.now(), dt=now-lstim;
        // port: 100.0/deltaMs
        if (dt>0) registerScroll(Math.abs(el.scrollTop-lstop)/dt*100);
        const ih=itemH(el); if(!ih) return;
        const cur=Math.round(el.scrollTop/ih);
        if (cur!==S.prevItems[wi]) {
          auditRecord(wi, S.prevItems[wi], cur);
          S.prevItems[wi]=cur;
          if (navigator.vibrate) navigator.vibrate(3); // HapticFeedback.selectionClick
        }
        lstop=el.scrollTop; lstim=now;
      },{passive:true});

      // Touch/mouse start → _onWheelScrollStart
      const onStart = () => {
        S.activeWheel=wi; clearTimeout(S.wheelTimer);
        registerTouch();
        if (navigator.vibrate) navigator.vibrate(5);
      };
      // End → _onWheelScrollEnd (500ms timer)
      const onEnd = () => {
        clearTimeout(S.wheelTimer);
        S.wheelTimer = setTimeout(() => { S.activeWheel=null; }, 500);
      };
      el.addEventListener('touchstart', onStart, {passive:true});
      el.addEventListener('mousedown',  onStart);
      el.addEventListener('touchend',   onEnd,   {passive:true});
      el.addEventListener('mouseup',    onEnd);
      el.addEventListener('mouseleave', onEnd);
    });
  }

  // ═══════════════════════════════════════════════════════
  //  SLOT MACHINE INTRO  (port _playSlotMachineIntro)
  //  Stagger 300ms per roda, animate ke item 20-30, elasticOut 1200ms
  // ═══════════════════════════════════════════════════════
  function playIntro() {
    D.wheels.forEach((el,i) => {
      if(!el) return;
      setTimeout(() => {
        const target = 20+Math.floor(Math.random()*10);
        scrollToItem(el, target, 1200, easeOutElastic);
      }, 200+i*300);
    });
  }

  // ═══════════════════════════════════════════════════════
  //  WHEEL ANIMATION  (port _buildWheel AnimatedBuilder)
  //
  //  Active  → isActive:true  → color:0xFFFF5722, opacity:1, no drift
  //            centre item extra glow
  //  Inactive→ isActive:false → color:0xFF263238
  //            opacity pulse 0.75–1.0 (_textOpacityAnimations)
  //            drift ±1.5px (_textDriftOffsets)
  // ═══════════════════════════════════════════════════════
  function animWheels() {
    A.opT += 0.018;  // ~800ms period macam AnimationController repeat
    D.wheels.forEach((wEl,wi) => {
      if(!wEl) return;
      const isActive = S.activeWheel === wi;
      const cIdx     = centreIdx(wEl);
      const drift    = A.drift[wi];
      // Tween(begin:0.75,end:1.0) + sin wave
      const opVal    = 0.75+0.25*Math.abs(Math.sin(A.opT+wi*.9));

      wEl.querySelectorAll('.zk-wi').forEach((item,idx) => {
        const isCentre = (idx===cIdx);
        if (isActive) {
          item.style.color      = '#FF5722';
          item.style.textShadow = isCentre
            ? '0 0 22px rgba(255,87,34,.95),0 0 8px rgba(255,87,34,.7)'  // glow terang
            : '0 0 8px rgba(255,87,34,.35)';
          item.style.opacity    = isCentre ? '1' : '0.5';
          item.style.transform  = '';
        } else {
          item.style.color      = isCentre ? '#1a1010' : '#263238';
          item.style.textShadow = isCentre
            ? '1px 1px 4px rgba(0,0,0,.35)'
            : '1px 1px 2px rgba(0,0,0,.15)';
          item.style.opacity    = (isCentre ? Math.min(1,opVal+.12) : opVal*.6).toString();
          // drift macam _textDriftOffsets
          item.style.transform  = `translate(${drift[0]}px,${drift[1]}px)`;
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  //  BIOMETRIC PANEL  (port _buildBiometricPanel)
  //  MOTION  → motionScore > 0.5
  //  TOUCH   → touchTimestamps.length > 3
  //  PATTERN → scrollVelocities.length > 3
  // ═══════════════════════════════════════════════════════
  function refreshBio() {
    const set=(ico,lbl,on)=>{ if(ico)ico.className='zk-bio-ico'+(on?' on':''); if(lbl)lbl.className='zk-bio-lbl'+(on?' on':''); };
    set(D.bm, D.bml, S.motionScore>.5);
    set(D.bt, D.btl, S.touches.length    > 3);
    set(D.bp, D.bpl, S.scrollVels.length > 3);
  }

  // ═══════════════════════════════════════════════════════
  //  MAIN ANIMATION LOOP
  // ═══════════════════════════════════════════════════════
  function startAnim() {
    A.running = true;
    const loop = ts => {
      if (!A.running) return;
      // Noise + glitch @ 120ms — port Timer.periodic(120ms)
      if (ts-A.lastNoise > 120) {
        if (D.noise) paintNoise(D.noise);
        glitchDigits();
        A.lastNoise = ts;
      }
      // Drift @ 100ms — port _driftTimer = Timer.periodic(100ms)
      if (ts-A.lastDrift > 100) {
        for (let i=0;i<3;i++) A.drift[i]=[(Math.random()-.5)*1.5,(Math.random()-.5)*1.5];
        A.lastDrift = ts;
      }
      animWheels();
      A.rafId = requestAnimationFrame(loop);
    };
    A.rafId = requestAnimationFrame(loop);
  }
  function stopAnim() {
    A.running=false;
    if (A.rafId) { cancelAnimationFrame(A.rafId); A.rafId=null; }
  }

  // ═══════════════════════════════════════════════════════
  //  BUTTON CLICK  (port _onButtonTap)
  // ═══════════════════════════════════════════════════════
  async function onBtnClick() {
    if (!D.btn) return;
    D.btn.classList.add('pressed');
    if (navigator.vibrate) navigator.vibrate(15);  // HapticFeedback.mediumImpact
    setTimeout(()=>D.btn&&D.btn.classList.remove('pressed'), 150);

    const ans = [getDigit(0), getDigit(1), getDigit(2)];
    const res = await doVerify(ans);

    if (res.allowed===true) {
      destroy();
      if (C.onSuccess) C.onSuccess(res);
    } else {
      // Flash merah pada digit — visual feedback gagal
      D.digits.forEach(el=>{
        if(!el) return;
        el.style.color='#ff3b5c'; el.style.textShadow='0 0 12px rgba(255,59,92,.8)';
        setTimeout(()=>{ if(el){el.style.color='';el.style.textShadow='';} }, 700);
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  UI SCREENS
  // ═══════════════════════════════════════════════════════
  function showLoading() {
    if (!D.modal) return;
    D.modal.innerHTML = `
      <div class="zk-card">
        <p class="zk-title">Z-KINETIC</p>
        <div class="zk-loading">
          <div class="zk-spinner"></div>
          <span class="zk-load-lbl">MENGESAHKAN SESI...</span>
        </div>
      </div>`;
  }

  function showError() {
    if (!D.modal) return;
    D.modal.innerHTML = `
      <div class="zk-err">
        <span class="zk-err-ico">☁</span>
        <p class="zk-err-title">SAMBUNGAN DIPERLUKAN</p>
        <p class="zk-err-msg">Z-Kinetic memerlukan sambungan internet untuk pengesahan selamat.</p>
        <button class="zk-retry" id="zk-r">↻ CUBA SEMULA</button>
        <button class="zk-back"  id="zk-bk">Kembali</button>
      </div>`;
    document.getElementById('zk-r').onclick  = initialize;
    document.getElementById('zk-bk').onclick = ()=>{ destroy(); if(C.onCancel)C.onCancel(); };
  }

  function showMainUI() {
    if (!D.modal) return;
    const [c0,c1,c2] = S.code;
    D.modal.innerHTML = `
      <div class="zk-card">
        <p class="zk-title">Z-KINETIC</p>
        <div class="zk-pill-row">
          <div class="zk-pill"><span class="zk-pill-ck">✔</span> INTELLIGENT-GRADE BIOMETRIC LOCK</div>
        </div>

        <div class="zk-codebox">
          <canvas id="zk-noise"></canvas>
          <div class="zk-digits">
            <span class="zk-digit" id="zk-d0">${c0}</span>
            <span class="zk-digit" id="zk-d1">${c1}</span>
            <span class="zk-digit" id="zk-d2">${c2}</span>
          </div>
        </div>
        <p class="zk-hint">Please match the code</p>

        <div class="zk-cryptex" id="zk-cx">
          <div class="zk-cx-inner">
            <img src="${C.imageUrl}" class="zk-cx-img" id="zk-img"
              onerror="this.style.display='none';document.getElementById('zk-fb').style.display='flex'">
            <div class="zk-cx-fb" id="zk-fb">⚠ Letak fail z_wheel3.png<br>dalam folder yang sama</div>
            <div class="zk-wheel" id="zk-w0"></div>
            <div class="zk-wheel" id="zk-w1"></div>
            <div class="zk-wheel" id="zk-w2"></div>
            <button class="zk-cbtn" id="zk-cbtn"></button>
          </div>
        </div>

        <div class="zk-bio">
          <div class="zk-bio-i">
            <span class="zk-bio-ico" id="zk-bm">📡</span>
            <span class="zk-bio-lbl" id="zk-bml">MOTION</span>
          </div>
          <div class="zk-bio-i">
            <span class="zk-bio-ico" id="zk-bt">👆</span>
            <span class="zk-bio-lbl" id="zk-btl">TOUCH</span>
          </div>
          <div class="zk-bio-i">
            <span class="zk-bio-ico" id="zk-bp">🔍</span>
            <span class="zk-bio-lbl" id="zk-bpl">PATTERN</span>
          </div>
        </div>

        <button class="zk-cancel" id="zk-cancel">Cancel</button>
      </div>`;

    // Grab refs
    D.noise   = document.getElementById('zk-noise');
    D.digits  = ['zk-d0','zk-d1','zk-d2'].map(id=>document.getElementById(id));
    D.wheels  = ['zk-w0','zk-w1','zk-w2'].map(id=>document.getElementById(id));
    D.btn     = document.getElementById('zk-cbtn');
    D.cryptex = document.getElementById('zk-cx');
    D.bm=document.getElementById('zk-bm'); D.bml=document.getElementById('zk-bml');
    D.bt=document.getElementById('zk-bt'); D.btl=document.getElementById('zk-btl');
    D.bp=document.getElementById('zk-bp'); D.bpl=document.getElementById('zk-bpl');

    // Build + position
    buildWheels();
    positionWheels();

    // Events
    D.btn.addEventListener('click', onBtnClick);
    document.getElementById('zk-cancel').addEventListener('click', ()=>{
      destroy(); if(C.onCancel)C.onCancel();
    });

    // ResizeObserver untuk re-scale bila window resize
    if (window.ResizeObserver) {
      _ro = new ResizeObserver(positionWheels);
      _ro.observe(D.cryptex);
    } else {
      window.addEventListener('resize', positionWheels);
    }

    startMotion();
    startAnim();
    refreshBio();

    // Post-layout: set initial scroll + slot machine intro
    // port: WidgetsBinding.addPostFrameCallback → _playSlotMachineIntro
    setTimeout(() => {
      positionWheels();
      D.wheels.forEach(el => {
        if(!el) return;
        // Center item 10 (digit 0, ulangan ke-2): scrollTop = ih*(10-1) = 9*ih
        const ih = itemH(el);
        el.scrollTop = 9 * ih;
      });
      setTimeout(playIntro, 80);
    }, 60);
  }

  // ═══════════════════════════════════════════════════════
  //  INITIALIZE  (port _ZKineticWidgetProdukBState._initialize)
  // ═══════════════════════════════════════════════════════
  async function initialize() {
    showLoading();
    const bootOk = await bootstrap();
    if (!bootOk) { showError(); return; }
    const ok = await fetchChallenge();
    if (!ok)     { showError(); return; }
    showMainUI();
  }

  // ═══════════════════════════════════════════════════════
  //  DESTROY  (port dispose)
  // ═══════════════════════════════════════════════════════
  function destroy() {
    stopAnim(); stopMotion();
    clearTimeout(S.wheelTimer);
    if (_ro) { _ro.disconnect(); _ro=null; }
    else window.removeEventListener('resize', positionWheels);
    if (D.modal) { D.modal.remove(); D.modal=null; }
    D={};
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════
  async function show(config) {
    if (typeof config==='function') config={onSuccess:config};
    C = {
      appId    : config.appId     || 'demo',
      serverUrl: config.serverUrl || 'https://api-dxtcyy6wma-as.a.run.app',
      imageUrl : config.imageUrl  || 'z_wheel3.png',
      onSuccess: config.onSuccess || null,
      onCancel : config.onCancel  || null,
    };
    resetState();
    injectCSS();
    D.modal = document.createElement('div');
    D.modal.id = 'zk-modal';
    document.body.appendChild(D.modal);
    await initialize();
  }

  global.ZKinetic = { show };

})(window);
