import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// CHURCH CONFIGURATION — edit these values for each assembly
// ═══════════════════════════════════════════════════════════════
const CHURCH_CONFIG = {
  CHURCH_NAME:       "COP - Christ Temple Assembly",
  CHURCH_SHORT_NAME: "Christ Temple",
  CHURCH_ICON:       "⛪",
  CHURCH_SUBTITLE:   "Select your role and enter PIN",
  CHURCH_LOCATION:   "Ghana",
  CURRENCY:          "GHS",
  LEGACY_SALT:       "cop_christ_temple_salt",
  SERVICE_TYPES:     ["Sunday Morning", "Mid-Week", "Friday Evening"],
  SERVICE_ICONS:     {"Sunday Morning":"☀️","Mid-Week":"📖","Friday Evening":"🌙"},
  MEMBER_CATEGORIES: ["Elder","Deacon","Deaconess","Male","Female","Children"],
  COLOR_NAVY:        "#1A2744",
  COLOR_GOLD:        "#C9973A",
  COLOR_GREEN:       "#27AE60",
};
// ═══════════════════════════════════════════════════════════════
import { saveData, loadData, listenData, deleteData, authReady } from "./firebase";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

// ─── FIREBASE REAL-TIME STORAGE HOOK ─────────────────────────────
// Data is shared across ALL devices in real time via Firestore
function useLocalStorage(key, initialValue) {
  const initVal = typeof initialValue === "function" ? initialValue() : initialValue;
  const [storedValue, setStoredValue] = useState(initVal);
  const [loaded, setLoaded] = useState(false);

  // Load initial data from Firebase
  useEffect(() => {
    loadData(key, initVal).then(val => {
      setStoredValue(val);
      setLoaded(true);
    });
  }, [key]);

  // Listen for real-time updates from other devices
  useEffect(() => {
    if (!loaded) return;
    const unsub = listenData(key, (val) => {
      setStoredValue(val);
    });
    return () => unsub();
  }, [key, loaded]);

  const setValue = useCallback((value) => {
    setStoredValue(prev => {
      const valueToStore = typeof value === "function" ? value(prev) : value;
      saveData(key, valueToStore); // save to Firebase
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue, loaded];
}

// ─── MONTHLY ATTENDANCE HOOK ─────────────────────────────────
// Splits attendance across monthly Firebase documents to stay
// well under Firestore's 1MB document limit even for 500+ members.
// Each monthly doc holds ~50-100KB max (500 members × 30 days).
// Covers current month + 11 previous months on load (full year).
// Returns same [attendance, setAttendance, loaded] interface.
function useMonthlyAttendance() {
  const [monthlyDocs, setMonthlyDocs] = useState({});
  const [loadedMonths, setLoadedMonths] = useState({});
  const [loaded, setLoaded] = useState(false);
  const unsubsRef = useRef({});

  // Generate keys for current month + past 11 months (full year)
  function getMonthKeys() {
    const keys = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      keys.push(`church_att_${yr}_${mo}`);
    }
    return keys;
  }

  // Subscribe to all monthly docs on mount
  useEffect(() => {
    const monthKeys = getMonthKeys();
    let resolvedCount = 0;

    monthKeys.forEach(key => {
      // Load initial value
      loadData(key, {}).then(val => {
        setMonthlyDocs(prev => ({ ...prev, [key]: val || {} }));
        setLoadedMonths(prev => ({ ...prev, [key]: true }));
        resolvedCount++;
        if (resolvedCount === monthKeys.length) setLoaded(true);
      });

      // Listen for real-time updates
      const unsub = listenData(key, val => {
        setMonthlyDocs(prev => ({ ...prev, [key]: val || {} }));
      });
      unsubsRef.current[key] = unsub;
    });

    return () => {
      Object.values(unsubsRef.current).forEach(fn => fn && fn());
    };
  }, []);

  // Merge all monthly docs into one flat attendance object
  const attendance = useMemo(() => {
    const merged = {};
    Object.values(monthlyDocs).forEach(doc => Object.assign(merged, doc));
    return merged;
  }, [monthlyDocs]);

  // Smart setter — routes each key to the correct monthly doc
  const setAttendance = useCallback((updater) => {
    setMonthlyDocs(prevDocs => {
      // Build current full merged state
      const current = {};
      Object.values(prevDocs).forEach(doc => Object.assign(current, doc));

      // Apply updater
      const next = typeof updater === "function" ? updater(current) : updater;

      // Group changed keys by month
      const byMonth = {};
      Object.keys(next).forEach(k => {
        const datePart = k.split("|")[0]; // "2026-01-15"
        if (!datePart || datePart.length < 7) return;
        const yr = datePart.slice(0, 4);
        const mo = datePart.slice(5, 7);
        const mKey = `church_att_${yr}_${mo}`;
        if (!byMonth[mKey]) byMonth[mKey] = {};
        byMonth[mKey][k] = next[k];
      });

      // Save each affected monthly doc to Firebase
      Object.entries(byMonth).forEach(([mKey, doc]) => {
        saveData(mKey, doc);
      });

      // Rebuild monthlyDocs with updated months
      const newDocs = { ...prevDocs };
      Object.entries(byMonth).forEach(([mKey, doc]) => {
        newDocs[mKey] = doc;
      });
      return newDocs;
    });
  }, []);

  return [attendance, setAttendance, loaded];
}

// ─── REAL QR CODE using qrcode-generator ─────────────────────────
// Loaded dynamically from CDN; falls back to SVG pattern if not loaded
let qrLoaded = false;
function loadQRLib() {
  if (qrLoaded || typeof window === "undefined") return;
  if (window.qrcode) { qrLoaded = true; return; }
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  script.onload = () => { qrLoaded = true; };
  document.head.appendChild(script);
}

function RealQRCode({ value, size = 180, color = "#1A2744" }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadQRLib();
    const interval = setInterval(() => {
      if (window.QRCode) { setReady(true); clearInterval(interval); }
    }, 100);
    const timeout = setTimeout(() => clearInterval(interval), 3000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    try {
      new window.QRCode(containerRef.current, {
        text: value, width: size, height: size,
        colorDark: color, colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    } catch(e) { console.warn("QR gen failed", e); }
  }, [ready, value, size, color]);

  if (!ready) return <FallbackQR data={value} size={size} />;
  return <div ref={containerRef} style={{ width: size, height: size }} />;
}

// ─── FALLBACK SVG QR (used while real QR lib loads) ──────────────
function FallbackQR({ data, size = 160 }) {
  const hash = data.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  const N = 11;
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const inCorner = (r < 3 && c < 3) || (r < 3 && c > N - 4) || (r > N - 4 && c < 3);
    cells.push({ r, c, on: inCorner || ((hash * (r + 3) * (c + 5) + r * c * 13) % 3 !== 0) });
  }
  const cell = size / N;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect width={size} height={size} fill="white" />
      {cells.map(({ r, c, on }, i) => on
        ? <rect key={i} x={c * cell + 1} y={r * cell + 1} width={cell - 2} height={cell - 2} rx={1.5} fill="#1A2744" />
        : null)}
    </svg>
  );
}

// Keep QRSvg alias for compatibility
const QRSvg = FallbackQR;

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&display=swap');
  :root {
    --gold:${CHURCH_CONFIG.COLOR_GOLD}; --gold-light:#E8C070; --navy:${CHURCH_CONFIG.COLOR_NAVY}; --navy-mid:#243260;
    --cream:#FDF8F0; --cream-dark:#F0E8D8; --red:#C0392B; --green:${CHURCH_CONFIG.COLOR_GREEN};
    --purple:#7D3C98; --teal:#148F77; --text:#2C2C2C; --muted:#7A7A7A;
    --sidebar-w:220px;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--text);min-height:100vh;}
  h1,h2,h3{font-family:'Playfair Display',serif;}

  /* ── MOBILE LAYOUT (default) ─────────────────────────────────── */
  .app{max-width:100%;min-height:100vh;display:flex;flex-direction:column;}
  .app-body{display:flex;flex-direction:column;flex:1;}
  .main-content{flex:1;min-width:0;display:flex;flex-direction:column;}

  /* Mobile: top header */
  .header{background:linear-gradient(135deg,var(--navy) 0%,var(--navy-mid) 100%);color:white;
    padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;
    box-shadow:0 4px 20px rgba(26,39,68,0.3);position:sticky;top:0;z-index:100;}
  .header h1{font-size:1.1rem;color:var(--gold-light);letter-spacing:0.5px;}
  .header .subtitle{font-size:0.65rem;color:rgba(255,255,255,0.6);margin-top:1px;letter-spacing:0.8px;text-transform:uppercase;}
  .header-logo{display:none;}

  /* Mobile: horizontal scrolling tabs */
  .nav{display:flex;background:var(--navy);border-bottom:2px solid var(--gold);overflow-x:auto;flex-shrink:0;}
  .nav::-webkit-scrollbar{display:none;}
  .nav button{flex-shrink:0;padding:9px 10px;border:none;background:transparent;
    color:rgba(255,255,255,0.5);font-family:'Lato',sans-serif;
    font-size:0.6rem;font-weight:700;letter-spacing:0.5px;
    text-transform:uppercase;cursor:pointer;transition:all 0.2s;white-space:nowrap;}
  .nav button.active{color:var(--gold-light);border-bottom:2px solid var(--gold);margin-bottom:-2px;}
  .nav-sidebar{display:none;}

  .scroll-area{overflow-y:auto;max-height:calc(100vh - 115px);min-height:calc(100vh - 115px);padding-bottom:24px;}

  /* ── DESKTOP LAYOUT (768px+) ─────────────────────────────────── */
  @media(min-width:768px){
    .app{flex-direction:column;}
    .app-body{flex-direction:row;min-height:calc(100vh - 60px);}

    /* Slim top header on desktop */
    .header{padding:0 24px;height:60px;position:fixed;top:0;left:0;right:0;z-index:200;}
    .header h1{font-size:1.2rem;}
    .header .subtitle{font-size:0.68rem;}
    .header-logo{display:flex;align-items:center;gap:10px;}

    /* Hide mobile nav, show sidebar */
    .nav{display:none;}
    .nav-sidebar{
      display:flex;flex-direction:column;
      width:var(--sidebar-w);flex-shrink:0;
      background:var(--navy);
      border-right:2px solid var(--gold);
      position:fixed;top:60px;left:0;bottom:0;
      overflow-y:auto;padding:16px 0 24px;z-index:100;
    }
    .nav-sidebar::-webkit-scrollbar{width:4px;}
    .nav-sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px;}
    .nav-sidebar button{
      display:flex;align-items:center;gap:10px;
      padding:11px 20px;border:none;background:transparent;
      color:rgba(255,255,255,0.55);font-family:'Lato',sans-serif;
      font-size:0.78rem;font-weight:700;letter-spacing:0.4px;
      text-transform:uppercase;cursor:pointer;transition:all 0.2s;
      text-align:left;width:100%;border-left:3px solid transparent;
    }
    .nav-sidebar button:hover{color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.06);}
    .nav-sidebar button.active{
      color:var(--gold-light);background:rgba(201,151,58,0.12);
      border-left:3px solid var(--gold);
    }
    .nav-sidebar .nav-section{
      font-size:0.55rem;letter-spacing:1.2px;text-transform:uppercase;
      color:rgba(255,255,255,0.25);padding:14px 20px 4px;font-weight:700;
    }

    /* Main content shifts right of sidebar */
    .main-content{margin-left:var(--sidebar-w);margin-top:60px;flex:1;min-width:0;}

    /* Wider, grid-based layouts on desktop */
    .scroll-area{max-height:calc(100vh - 60px);min-height:calc(100vh - 60px);overflow-y:auto;padding-bottom:32px;}
    .card{margin:12px 20px;padding:20px;border-radius:14px;}
    .card-title{font-size:1.05rem;margin-bottom:14px;padding-bottom:10px;}
    .stats-row{margin:12px 20px;gap:12px;}
    .stat-box{padding:16px 10px;border-radius:12px;}
    .stat-num{font-size:1.8rem;}
    .stat-label{font-size:0.65rem;}
    .section-label{margin:16px 20px 6px;font-size:0.7rem;}
    .summary-banner{margin:12px 20px;padding:20px;border-radius:16px;}
    .summary-num{font-size:1.8rem;}
    .demo-grid{margin:0 20px 8px;grid-template-columns:repeat(4,1fr);gap:12px;}
    .demo-box{padding:14px 16px;}
    .demo-val{font-size:1.5rem;}
    .alert{margin:10px 20px;}
    .member-row{padding:11px 0;}
    .member-name{font-size:0.95rem;}
    .avatar{width:40px;height:40px;font-size:0.9rem;}
    .btn{font-size:0.88rem;padding:11px 18px;}
    .btn-sm{font-size:0.76rem;padding:6px 13px;}
    .input,.select{font-size:0.92rem;padding:10px 13px;}

    /* Desktop: cards in 2-column grid for some tabs */
    .desktop-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
    .desktop-grid .card{margin:12px;}

    /* Modal centered on desktop */
    .modal-overlay{align-items:center;}
    .modal{border-radius:16px;max-width:520px;max-height:85vh;}
    @keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
  }

  @media(min-width:1100px){
    :root{--sidebar-w:240px;}
    .nav-sidebar button{font-size:0.82rem;padding:12px 24px;}
    .card{margin:14px 28px;padding:24px;}
    .stats-row{margin:14px 28px;}
    .section-label{margin:18px 28px 8px;}
    .summary-banner{margin:14px 28px;}
    .demo-grid{margin:0 28px 10px;grid-template-columns:repeat(4,1fr);}
    .alert{margin:12px 28px;}
    .demo-box{padding:16px 18px;}
  }

  /* ── SHARED STYLES ───────────────────────────────────────────── */
  .card{background:white;border-radius:12px;padding:14px;margin:10px 12px;
    box-shadow:0 2px 12px rgba(0,0,0,0.07);border:1px solid var(--cream-dark);}
  .card-title{font-family:'Playfair Display',serif;font-size:0.95rem;color:var(--navy);
    margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--cream-dark);
    display:flex;align-items:center;gap:7px;}

  .btn{border:none;border-radius:8px;padding:10px 16px;font-family:'Lato',sans-serif;
    font-weight:700;font-size:0.82rem;cursor:pointer;transition:all 0.18s;letter-spacing:0.3px;}
  .btn-primary{background:var(--gold);color:white;}
  .btn-primary:hover{background:#b8862e;}
  .btn-navy{background:var(--navy);color:white;}
  .btn-navy:hover{background:var(--navy-mid);}
  .btn-purple{background:var(--purple);color:white;}
  .btn-teal{background:var(--teal);color:white;}
  .btn-success{background:var(--green);color:white;}
  .btn-danger{background:var(--red);color:white;}
  .btn-outline{background:transparent;border:2px solid var(--gold);color:var(--gold);}
  .btn-sm{padding:5px 11px;font-size:0.72rem;border-radius:6px;}
  .btn-full{width:100%;}

  .input,.select{width:100%;border:1.5px solid var(--cream-dark);border-radius:8px;
    padding:9px 11px;font-family:'Lato',sans-serif;font-size:0.88rem;
    background:var(--cream);color:var(--text);outline:none;transition:border 0.2s;margin-bottom:9px;}
  .input:focus,.select:focus{border-color:var(--gold);}

  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.65rem;font-weight:700;letter-spacing:0.4px;}
  .badge-gold{background:#FEF3CD;color:#856404;}
  .badge-green{background:#D5F5E3;color:#1E8449;}
  .badge-red{background:#FADBD8;color:#922B21;}
  .badge-blue{background:#D6EAF8;color:#1A5276;}
  .badge-purple{background:#E8DAEF;color:#6C3483;}
  .badge-teal{background:#D1F2EB;color:#0E6655;}
  .badge-gray{background:#EAECEE;color:#555;}

  .member-row{display:flex;align-items:center;padding:9px 0;border-bottom:1px solid var(--cream-dark);gap:9px;}
  .member-row:last-child{border-bottom:none;}
  .avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--navy));
    display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.8rem;flex-shrink:0;}
  .member-info{flex:1;min-width:0;}
  .member-name{font-weight:700;font-size:0.88rem;}
  .member-sub{font-size:0.7rem;color:var(--muted);}

  .att-btn{padding:6px 14px;border-radius:20px;font-size:0.72rem;font-weight:700;border:2px solid;
    cursor:pointer;transition:all 0.15s;font-family:'Lato',sans-serif;}
  .att-present{background:var(--green);border-color:var(--green);color:white;}
  .att-absent{background:white;border-color:#ccc;color:#aaa;}

  .stats-row{display:flex;gap:7px;margin:10px 12px;}
  .stat-box{flex:1;background:white;border-radius:10px;padding:10px 6px;text-align:center;
    border:1px solid var(--cream-dark);box-shadow:0 2px 8px rgba(0,0,0,0.05);}
  .stat-num{font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--navy);}
  .stat-label{font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-top:1px;}

  /* ── LOGIN PAGE — mobile: stacked, desktop: two columns ── */
  .login-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(160deg,var(--navy) 0%,var(--navy-mid) 55%,var(--gold) 100%);padding:30px 20px;}
  .login-card{background:white;border-radius:20px;padding:28px 22px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);}
  .login-logo{text-align:center;margin-bottom:20px;}
  .login-logo .cross{font-size:2.6rem;}
  .login-logo h2{font-family:'Playfair Display',serif;color:var(--navy);font-size:1.35rem;}
  .login-logo p{color:var(--muted);font-size:0.78rem;margin-top:3px;}
  .login-brand{display:none;}
  .role-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;}
  .role-btn{padding:10px 6px;border:2px solid var(--cream-dark);border-radius:10px;background:white;
    cursor:pointer;text-align:center;transition:all 0.15s;font-family:'Lato',sans-serif;}
  .role-btn.selected{border-color:var(--gold);background:#FEF9EF;}
  .role-btn .role-icon{font-size:1.4rem;display:block;margin-bottom:3px;}
  .role-btn .role-name{font-size:0.72rem;font-weight:700;color:var(--navy);}

  /* ── DESKTOP LOGIN: full screen two-column layout ── */
  @media(min-width:768px){
    .login-wrap{flex-direction:row;align-items:stretch;padding:0;border-radius:0;}
    .login-brand{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      flex:1;padding:60px 40px;
      background:linear-gradient(160deg,var(--navy) 0%,var(--navy-mid) 60%,#1a3a6b 100%);
      text-align:center;position:relative;overflow:hidden;
    }
    .login-brand::before{
      content:"";position:absolute;inset:0;
      background:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    }
    .login-brand-content{position:relative;z-index:1;}
    .login-brand h1{
      font-family:'Playfair Display',serif;color:var(--gold-light);
      font-size:2.4rem;line-height:1.2;margin-bottom:16px;
    }
    .login-brand p{color:rgba(255,255,255,0.65);font-size:1rem;line-height:1.7;max-width:420px;margin-bottom:40px;}
    .login-brand-features{display:flex;flex-direction:column;gap:14px;text-align:left;max-width:380px;}
    .login-brand-feature{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,0.8);font-size:0.88rem;}
    .login-brand-feature span:first-child{font-size:1.3rem;width:32px;text-align:center;flex-shrink:0;}
    .login-right{
      display:flex;align-items:center;justify-content:center;
      width:420px;flex-shrink:0;background:var(--cream);padding:40px 48px;
    }
    .login-card{
      border-radius:16px;padding:36px 32px;max-width:none;width:100%;
      box-shadow:0 8px 32px rgba(0,0,0,0.12);
    }
    .login-logo h2{font-size:1.5rem;}
  }

  .alert{margin:8px 12px;padding:9px 13px;border-radius:8px;font-size:0.8rem;font-weight:600;}
  .alert-success{background:#D5F5E3;color:#1E8449;border-left:4px solid var(--green);}
  .alert-error{background:#FADBD8;color:#922B21;border-left:4px solid var(--red);}
  .alert-info{background:#D6EAF8;color:#1A5276;border-left:4px solid #2980B9;}

  .section-label{font-size:0.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:14px 12px 4px;}
  .progress-bar{height:7px;background:var(--cream-dark);border-radius:4px;overflow:hidden;}
  .progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--gold),var(--gold-light));transition:width 0.5s ease;}

  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:flex-end;justify-content:center;z-index:300;}
  .modal{background:white;border-radius:20px 20px 0 0;padding:22px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;animation:slideUp 0.25s ease;}
  @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
  .modal-title{font-family:'Playfair Display',serif;font-size:1.05rem;color:var(--navy);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}

  .qr-wrap{display:flex;flex-direction:column;align-items:center;padding:14px;gap:8px;}
  .qr-box{width:180px;height:180px;border:3px solid var(--gold);border-radius:12px;display:flex;align-items:center;justify-content:center;background:white;overflow:hidden;}

  .report-field{margin-bottom:10px;}
  .report-field label{display:block;font-size:0.75rem;font-weight:700;color:var(--navy);margin-bottom:4px;letter-spacing:0.3px;}
  .report-field .input{margin-bottom:0;}

  .demo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 12px 4px;}
  .demo-box{background:white;border-radius:10px;padding:10px 12px;border:1px solid var(--cream-dark);box-shadow:0 1px 6px rgba(0,0,0,0.05);}
  .demo-box .demo-label{font-size:0.62rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;}
  .demo-box .demo-val{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--navy);margin-top:2px;}
  .demo-box .demo-sub{font-size:0.65rem;color:var(--muted);}

  .summary-banner{background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:white;border-radius:14px;padding:16px;margin:10px 12px;}
  .summary-banner h3{font-size:0.95rem;color:var(--gold-light);margin-bottom:10px;}
  .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
  .summary-cell{text-align:center;}
  .summary-num{font-family:'Playfair Display',serif;font-size:1.5rem;color:white;}
  .summary-lbl{font-size:0.58rem;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;}

  /* Group QR check-in page */
  .checkin-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(160deg,var(--navy) 0%,var(--navy-mid) 60%,var(--gold) 100%);padding:24px 20px;}
  .checkin-card{background:white;border-radius:20px;padding:28px 24px;width:100%;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.35);}
  .checkin-card h2{font-family:'Playfair Display',serif;color:var(--navy);font-size:1.3rem;margin-bottom:4px;}
  .checkin-card p{color:var(--muted);font-size:0.8rem;margin-bottom:18px;}

  /* Print styles */
  @media print {
    .no-print{display:none!important;}
    .print-only{display:block!important;}
    body{background:white;}
    .nav-sidebar,.header{display:none!important;}
    .main-content{margin:0!important;}
    .print-report{font-family:'Lato',sans-serif;max-width:700px;margin:0 auto;padding:20px;}
    .print-report h1{font-family:'Playfair Display',serif;color:#1A2744;font-size:1.5rem;border-bottom:2px solid #C9973A;padding-bottom:8px;margin-bottom:16px;}
    .print-report h2{font-family:'Playfair Display',serif;font-size:1.1rem;color:#1A2744;margin:14px 0 6px;}
    .print-report table{width:100%;border-collapse:collapse;margin-bottom:14px;}
    .print-report th{background:#1A2744;color:white;padding:7px 10px;font-size:0.78rem;text-align:left;}
    .print-report td{padding:6px 10px;border-bottom:1px solid #F0E8D8;font-size:0.82rem;}
    .print-report tr:nth-child(even) td{background:#FDF8F0;}
    .print-report .print-row{display:flex;gap:20px;margin-bottom:10px;}
    .print-report .print-cell{flex:1;}
    .print-report .print-label{font-size:0.7rem;color:#7A7A7A;text-transform:uppercase;letter-spacing:0.5px;}
    .print-report .print-value{font-size:1rem;font-weight:700;color:#1A2744;}
    .print-footer{margin-top:20px;font-size:0.72rem;color:#7A7A7A;border-top:1px solid #eee;padding-top:8px;}
  }

  @media (max-width:360px){.stat-num{font-size:1.2rem;}.demo-val{font-size:1.1rem;}}
`;

// ── Constants ─────────────────────────────────────────────────────
const GROUP_COLORS=["#C9973A","#2980B9","#27AE60","#8E44AD","#E74C3C","#16A085","#D35400","#2C3E50","#C0392B","#1ABC9C"];
// ── Constants from churchConfig.js ──────────────────────────
// Edit churchConfig.js to customise for each assembly
const CATEGORIES = CHURCH_CONFIG.MEMBER_CATEGORIES;
const SERVICE_TYPES = CHURCH_CONFIG.SERVICE_TYPES;
const SERVICE_ICONS = CHURCH_CONFIG.SERVICE_ICONS;
const ROLE_COLORS={"admin":CHURCH_CONFIG.COLOR_GOLD,"secretary":"#2980B9","leader":"#27AE60"};
// Auto-generate CAT_ICONS — default icons for common categories
const CAT_ICONS_DEFAULT={Elder:"👴",Deacon:"👨‍⚖️",Deaconess:"👩‍⚖️",Male:"👨",Female:"👩",Children:"🧒","Youth (Male)":"👦","Youth (Female)":"👧",Other:"👤"};
const CAT_ICONS=CATEGORIES.reduce((acc,cat)=>({...acc,[cat]:CAT_ICONS_DEFAULT[cat]||"👤"}),{});

// ── Seed Data ─────────────────────────────────────────────────────
const initGroups=()=>[
  {id:"g1",name:"Bereans",color:GROUP_COLORS[0]},
  {id:"g2",name:"Shalom",color:GROUP_COLORS[1]},
  {id:"g3",name:"Gideons",color:GROUP_COLORS[2]},
];
const initMembers=()=>[
  {id:"m1", name:"Elder Abena Mensah",   groupId:"g1",category:"Elder"},
  {id:"m2", name:"Elder Kofi Asante",    groupId:"g1",category:"Elder"},
  {id:"m3", name:"Deacon Kwame Boateng", groupId:"g1",category:"Deacon"},
  {id:"m4", name:"Ama Owusu",            groupId:"g1",category:"Female"},
  {id:"m5", name:"Adjoa Frimpong",       groupId:"g1",category:"Female"},
  {id:"m6", name:"Deaconess Adwoa Osei", groupId:"g2",category:"Deaconess"},
  {id:"m7", name:"Yaw Darko",            groupId:"g2",category:"Male"},
  {id:"m8", name:"Kwesi Amponsah",       groupId:"g2",category:"Male"},
  {id:"m9", name:"Abena Sarkodie",       groupId:"g2",category:"Female"},
  {id:"m10",name:"Elder Frank Tetteh",   groupId:"g3",category:"Elder"},
  {id:"m11",name:"Akosua Acheampong",    groupId:"g3",category:"Female"},
  {id:"m12",name:"Nana Agyei",           groupId:"g3",category:"Children"},
];
// users managed dynamically; seed at startup
const initUsers=()=>[
  {id:"u1",name:"Pastor Admin",   role:"admin",    pin:"1234",groupId:null},
  {id:"u2",name:"Sec. Grace Adu", role:"secretary",pin:"5678",groupId:null},
  {id:"u3",name:"Elder Mensah",   role:"leader",   pin:"1111",groupId:"g1"},
  {id:"u4",name:"Elder Asante",   role:"leader",   pin:"2222",groupId:"g2"},
  {id:"u5",name:"Elder Owusu",    role:"leader",   pin:"3333",groupId:"g3"},
];

// ── Helpers ───────────────────────────────────────────────────────
function todayStr(){return new Date().toISOString().split("T")[0];}
function formatDate(d){return new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"});}
function initials(name){return name.replace(/^(Elder|Deacon|Deaconess)\s+/i,"").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();}

// QRSvg defined above as FallbackQR alias

// ── PIN HASHING (SHA-256 + per-user random salt) ─────────────
// VULN-04 FIX: Each user gets a unique random salt so two users
// with the same PIN produce completely different hashes.
function generateSalt(){
  const arr=new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hashPin(pin, salt){
  const useSalt = salt || CHURCH_CONFIG.LEGACY_SALT; // fallback for old hashes
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + useSalt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,"0")).join("");
}
// Returns {hash, salt} for storage
async function hashPinWithSalt(pin){
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  return { hash, salt };
}
// Verifies plain PIN against stored value (handles all formats)
async function verifyPin(plain, stored, salt){
  if(!stored) return false;
  // Format 1: plain PIN (≤6 chars) — legacy migration
  if(stored.length <= 6) return plain === stored;
  // Format 2: new hash with per-user salt
  if(salt){ const h=await hashPin(plain,salt); return h===stored; }
  // Format 3: old hash with shared salt (pre-VULN-04 fix)
  const h=await hashPin(plain,CHURCH_CONFIG.LEGACY_SALT);
  return h===stored;
}

function DatePicker({value,onChange}){
  return (
    <div style={{margin:"10px 12px 4px",display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:"0.78rem",fontWeight:700,color:"var(--navy)",whiteSpace:"nowrap"}}>Date:</span>
      <input type="date" value={value} onChange={e=>onChange(e.target.value)}
        style={{border:"1.5px solid var(--gold)",borderRadius:8,padding:"5px 9px",fontSize:"0.8rem",
          background:"white",color:"var(--navy)",fontFamily:"Lato,sans-serif",flex:1}}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  GROUP CHECK-IN PAGE  (accessed via simulated QR scan)
// ═══════════════════════════════════════════════════════════════════
function GroupCheckIn({group, members, attendance, setAttendance, onBack}){
  const [mode,setMode]=useState(null);         // null | 'search' | 'face'
  const [search,setSearch]=useState('');
  const [selectedMember,setSelectedMember]=useState(null);
  const [checkedIn,setCheckedIn]=useState(null);
  const [faceStatus,setFaceStatus]=useState('idle'); // idle|loading|scanning|matched|no_face|no_match|failed|no_photos
  const [faceMatch,setFaceMatch]=useState(null);
  const [faceRetry,setFaceRetry]=useState(0);
  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const scanningRef=useRef(false);

  const date=todayStr();
  const attKey=(d,mid)=>`${d}|${mid}`;
  const gMembers=members.filter(m=>m.groupId===group.id);
  const membersWithPhotos=gMembers.filter(m=>m.photo);

  // One check-in per device per service (sessionStorage)
  const deviceKey=`checkin_${group.id}_${date}`;
  const alreadyUsed=sessionStorage.getItem(deviceKey);

  const stopCamera=()=>{
    scanningRef.current=false;
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  };

  useEffect(()=>()=>stopCamera(),[]);

  // Attach camera stream to video element once it appears in DOM
  useEffect(()=>{
    if(faceStatus==='scanning'&&streamRef.current&&videoRef.current){
      const video=videoRef.current;
      video.srcObject=streamRef.current;
      video.setAttribute('autoplay','');
      video.setAttribute('muted','');
      video.setAttribute('playsinline','');
      const playPromise=video.play();
      if(playPromise!==undefined){
        playPromise.catch(e=>console.warn('Video play error:',e));
      }
      // Wait for camera to warm up then scan
      const timer=setTimeout(()=>{
        if(scanningRef.current) runFaceScan();
      },3000);
      return()=>clearTimeout(timer);
    }
  },[faceStatus]);

  const doCheckIn=(m)=>{
    setAttendance(p=>({...p,[attKey(date,m.id)]:true}));
    sessionStorage.setItem(deviceKey,m.id);
    setCheckedIn(m);
    setSelectedMember(null);
    stopCamera();
  };

  // ── Search filtered members ────────────────────────────────
  const filtered=search.length>=2
    ?gMembers.filter(m=>m.name.toLowerCase().includes(search.toLowerCase()))
    :[];

  // ── Load face-api.js and models ───────────────────────────
  const loadFaceApi=async()=>{
    setFaceStatus('loading');
    try{
      if(!window.faceapi){
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src='https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
          s.onload=res; s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      const MODEL_URL='https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
      const fa=window.faceapi;
      if(!fa.nets.tinyFaceDetector.isLoaded)
        await fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      if(!fa.nets.faceLandmark68TinyNet.isLoaded)
        await fa.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
      if(!fa.nets.faceRecognitionNet.isLoaded)
        await fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      await startCamera();
    }catch(e){
      console.error('Face API load error:',e);
      setFaceStatus('failed');
    }
  };

  const startCamera=async()=>{
    try{
      const constraints={
        video:{
          facingMode:'user',
          width:{ideal:320},
          height:{ideal:240}
        }
      };
      const stream=await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current=stream;
      // Set scanning FIRST so React renders the <video> element
      // then useEffect will attach the stream once videoRef is ready
      setFaceStatus('scanning');
      scanningRef.current=true;
    }catch(e){
      console.error('Camera error:',e);
      setFaceStatus('camera_error');
    }
  };

  // Build HTMLImageElement from base64
  const base64ToImg=async(src)=>{
    return new Promise((res,rej)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>res(img);
      img.onerror=rej;
      img.src=src;
    });
  };

  const runFaceScan=async()=>{
    if(!scanningRef.current||!window.faceapi||!videoRef.current) return;
    const fa=window.faceapi;
    const opts=new fa.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:0.4});

    try{
      // Build labeled descriptors from member photos
      if(membersWithPhotos.length===0){setFaceStatus('no_photos');return;}
      const labeled=[];
      for(const m of membersWithPhotos){
        try{
          const img=await base64ToImg(m.photo);
          const det=await fa.detectSingleFace(img,opts).withFaceLandmarks(true).withFaceDescriptor();
          if(det) labeled.push(new fa.LabeledFaceDescriptors(m.id,[det.descriptor]));
        }catch(e){}
      }
      if(labeled.length===0){setFaceStatus('no_photos');return;}

      const matcher=new fa.FaceMatcher(labeled,0.5);

      // Detect from live video
      const detection=await fa.detectSingleFace(videoRef.current,opts)
        .withFaceLandmarks(true).withFaceDescriptor();

      if(!detection){setFaceStatus('no_face');return;}

      const best=matcher.findBestMatch(detection.descriptor);
      if(best.label!=='unknown'){
        const matched=gMembers.find(m=>m.id===best.label);
        if(matched){
          stopCamera();
          setFaceMatch(matched);
          setFaceStatus('matched');
          return;
        }
      }
      setFaceStatus('no_match');
    }catch(e){
      console.error('Scan error:',e);
      setFaceStatus('failed');
    }
  };

  const retryFace=()=>{
    setFaceStatus('loading');
    setFaceMatch(null);
    setFaceRetry(r=>r+1);
    stopCamera();
    setTimeout(()=>loadFaceApi(),300);
  };

  const grp=group;

  // ── Already checked in on this device ─────────────────────
  if(alreadyUsed){
    const who=gMembers.find(m=>m.id===alreadyUsed);
    return(
      <div className="checkin-page">
        <div className="checkin-card" style={{textAlign:"center"}}>
          <div style={{fontSize:"3rem",marginBottom:8}}>✅</div>
          <h2 style={{color:"#1A2744"}}>Already Checked In</h2>
          <p style={{color:"#27AE60",fontWeight:700,fontSize:"1rem",margin:"8px 0 4px"}}>{who?who.name:"Member"}</p>
          <p style={{color:"#7A7A7A",fontSize:"0.8rem",marginBottom:16}}>You have already checked in for {formatDate(date)}.</p>
          <button className="btn btn-outline btn-full" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────
  if(checkedIn){
    return(
      <div className="checkin-page">
        <div className="checkin-card" style={{textAlign:"center"}}>
          <div style={{fontSize:"3.5rem",marginBottom:8}}>🙌</div>
          <h2 style={{color:"#1A2744"}}>Welcome!</h2>
          <p style={{fontSize:"1.05rem",color:"#1A2744",fontWeight:700,margin:"6px 0 4px"}}>{checkedIn.name}</p>
          <p style={{color:"#27AE60",fontWeight:700,fontSize:"0.85rem"}}>Attendance marked for {formatDate(date)}</p>
          <p style={{fontSize:"0.72rem",color:"#7A7A7A",margin:"4px 0 18px"}}>{group.name} Group</p>
          <button className="btn btn-outline btn-full" onClick={onBack}>← Done</button>
        </div>
      </div>
    );
  }

  // ── Mode selection screen ──────────────────────────────────
  if(!mode){
    return(
      <div className="checkin-page">
        <div className="checkin-card">
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:"2.2rem",marginBottom:6}}>⛪</div>
            <h2 style={{color:"#1A2744",marginBottom:4}}>{group.name}</h2>
            <p style={{fontSize:"0.78rem",color:"#7A7A7A",margin:0}}>{CHURCH_CONFIG.CHURCH_NAME}</p>
            <p style={{fontSize:"0.72rem",color:"#7A7A7A",marginTop:2}}>{formatDate(date)}</p>
          </div>

          <div style={{background:"#FDF8F0",borderRadius:12,padding:"12px 14px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:"0.78rem",color:"#1A2744",fontWeight:700}}>How would you like to check in?</div>
          </div>

          {/* Option 1 — Search name */}
          <button onClick={()=>setMode('search')}
            style={{width:"100%",padding:"16px 14px",background:"#1A2744",color:"white",border:"none",
              borderRadius:14,marginBottom:10,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:"1.8rem",flexShrink:0}}>🔍</div>
            <div>
              <div style={{fontWeight:700,fontSize:"0.92rem"}}>Search My Name</div>
              <div style={{fontSize:"0.72rem",opacity:0.7,marginTop:2}}>Type your name and confirm you are here</div>
            </div>
          </button>

          {/* Option 2 — Face recognition */}
          <button onClick={()=>{setMode('face');loadFaceApi();}}
            style={{width:"100%",padding:"16px 14px",
              background:membersWithPhotos.length===0?"#E8E8E8":"linear-gradient(135deg,#C9973A,#E8C070)",
              color:membersWithPhotos.length===0?"#999":"#1A2744",border:"none",
              borderRadius:14,marginBottom:14,cursor:membersWithPhotos.length===0?"not-allowed":"pointer",
              textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:"1.8rem",flexShrink:0}}>📷</div>
            <div>
              <div style={{fontWeight:700,fontSize:"0.92rem"}}>Face Recognition</div>
              <div style={{fontSize:"0.72rem",opacity:0.75,marginTop:2}}>
                {membersWithPhotos.length===0
                  ?"No member photos uploaded yet"
                  :`Scan your face to check in automatically (${membersWithPhotos.length} photos on file)`}
              </div>
            </div>
          </button>

          <button className="btn btn-outline btn-full" style={{fontSize:"0.75rem"}} onClick={onBack}>← Back to App</button>
        </div>
      </div>
    );
  }

  // ── Search mode ────────────────────────────────────────────
  if(mode==='search'){
    return(
      <div className="checkin-page">
        <div className="checkin-card">
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:"1.8rem",marginBottom:4}}>🔍</div>
            <h2 style={{color:"#1A2744",marginBottom:2}}>Find Your Name</h2>
            <p style={{fontSize:"0.75rem",color:"#7A7A7A",margin:0}}>Type at least 2 letters of your name</p>
          </div>

          <input
            className="input"
            placeholder="Start typing your name..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
            autoFocus
            style={{marginBottom:10,fontSize:"0.95rem"}}
          />

          {search.length>0&&search.length<2&&(
            <p style={{fontSize:"0.72rem",color:"#C9973A",textAlign:"center",margin:"4px 0 8px"}}>Keep typing...</p>
          )}

          {/* Results */}
          {filtered.length>0&&!selectedMember&&(
            <div style={{maxHeight:240,overflowY:"auto",marginBottom:10}}>
              {filtered.map(m=>{
                const already=attendance[attKey(date,m.id)]===true;
                return(
                  <div key={m.id} onClick={()=>!already&&setSelectedMember(m)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 10px",
                      borderRadius:10,marginBottom:6,cursor:already?"default":"pointer",
                      background:already?"#D5F5E3":"#F0F4FF",
                      border:`1.5px solid ${already?"#27AE60":"#C5CAE9"}`,transition:"all 0.15s"}}>
                    <div style={{width:36,height:36,borderRadius:"50%",overflow:"hidden",flexShrink:0,
                      background:`linear-gradient(135deg,${group.color||"#888"},#1A2744)`,
                      display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.8rem"}}>
                      {m.photo
                        ?<img src={m.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        :initials(m.name)}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:"0.88rem",color:"#1A2744"}}>{m.name}</div>
                      <div style={{fontSize:"0.65rem",color:"#7A7A7A"}}>{CAT_ICONS[m.category]||""} {m.category}</div>
                    </div>
                    {already?<span style={{fontSize:"1.2rem"}}>✅</span>:<span style={{fontSize:"0.72rem",color:"#1A2744",fontWeight:700}}>Tap →</span>}
                  </div>
                );
              })}
            </div>
          )}

          {search.length>=2&&filtered.length===0&&(
            <p style={{textAlign:"center",color:"#7A7A7A",fontSize:"0.8rem",padding:"12px 0"}}>No member found. Check your spelling.</p>
          )}

          {/* Confirm screen */}
          {selectedMember&&(
            <div style={{background:"#F0F4FF",borderRadius:14,padding:"16px",textAlign:"center",marginBottom:10}}>
              <div style={{width:60,height:60,borderRadius:"50%",overflow:"hidden",margin:"0 auto 10px",
                background:`linear-gradient(135deg,${group.color||"#888"},#1A2744)`,
                display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.2rem"}}>
                {selectedMember.photo
                  ?<img src={selectedMember.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  :initials(selectedMember.name)}
              </div>
              <div style={{fontWeight:700,color:"#1A2744",fontSize:"1rem",marginBottom:4}}>{selectedMember.name}</div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A",marginBottom:14}}>{group.name} · {formatDate(date)}</div>
              <div style={{fontSize:"0.82rem",color:"#1A2744",fontWeight:700,marginBottom:12}}>
                Are you this person? Confirm your attendance below.
              </div>
              <button className="btn btn-success btn-full" style={{marginBottom:8,fontSize:"0.9rem",padding:"12px"}}
                onClick={()=>doCheckIn(selectedMember)}>
                ✅ Yes, I Am Here!
              </button>
              <button className="btn btn-outline btn-full" style={{fontSize:"0.8rem"}}
                onClick={()=>setSelectedMember(null)}>
                ✕ Not me — go back
              </button>
            </div>
          )}

          <button className="btn btn-outline btn-full" style={{fontSize:"0.75rem",marginTop:4}}
            onClick={()=>{setMode(null);setSearch('');setSelectedMember(null);}}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Face recognition mode ──────────────────────────────────
  if(mode==='face'){
    return(
      <div className="checkin-page">
        <div className="checkin-card">
          <div style={{textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:"1.8rem",marginBottom:4}}>📷</div>
            <h2 style={{color:"#1A2744",marginBottom:2}}>Face Recognition</h2>
            <p style={{fontSize:"0.72rem",color:"#7A7A7A",margin:0}}>{group.name} · {formatDate(date)}</p>
          </div>

          {/* Loading models */}
          {faceStatus==='loading'&&(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:"2rem",marginBottom:10}}>⏳</div>
              <div style={{fontWeight:700,color:"#1A2744",fontSize:"0.88rem",marginBottom:6}}>Loading face recognition...</div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A"}}>This may take a moment on first use</div>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:14}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#C9973A",
                    animation:`bounce 1s ease-in-out ${i*0.2}s infinite`}}/>
                ))}
              </div>
            </div>
          )}

          {/* Camera scanning */}
          {faceStatus==='scanning'&&(
            <div style={{textAlign:"center"}}>
              <div style={{position:"relative",display:"inline-block",marginBottom:10}}>
                <video ref={videoRef}
                  autoPlay muted playsInline
                  onLoadedMetadata={e=>e.target.play().catch(()=>{})}
                  style={{width:"100%",maxWidth:280,minHeight:180,borderRadius:16,
                    border:"3px solid #C9973A",background:"#000",
                    transform:"scaleX(-1)",display:"block",margin:"0 auto"}}/>
                <div style={{position:"absolute",inset:0,borderRadius:16,border:"3px solid #C9973A",
                  boxShadow:"0 0 0 4px rgba(201,151,58,0.2)",pointerEvents:"none"}}/>
              </div>
              <div style={{fontWeight:700,color:"#1A2744",fontSize:"0.85rem",marginBottom:4}}>
                👀 Look directly at the camera
              </div>
              <div style={{fontSize:"0.7rem",color:"#7A7A7A",marginBottom:8}}>Scanning your face...</div>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:8}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#C9973A",
                    animation:`bounce 1s ease-in-out ${i*0.2}s infinite`}}/>
                ))}
              </div>
              <div style={{fontSize:"0.68rem",color:"#7A7A7A",marginBottom:10,textAlign:"center"}}>
                Make sure your face is well lit and clearly visible
              </div>
              <button className="btn btn-outline" style={{fontSize:"0.75rem",padding:"7px 18px",margin:"0 auto",display:"block"}}
                onClick={()=>{
                  if(scanningRef.current) runFaceScan();
                }}>
                🔄 Scan Now
              </button>
            </div>
          )}

          {/* Matched */}
          {faceStatus==='matched'&&faceMatch&&(
            <div style={{background:"#D5F5E3",borderRadius:14,padding:"16px",textAlign:"center",marginBottom:10}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>✅</div>
              <div style={{fontWeight:700,color:"#1E8449",fontSize:"0.9rem",marginBottom:6}}>Face Recognised!</div>
              <div style={{width:64,height:64,borderRadius:"50%",overflow:"hidden",margin:"0 auto 10px",
                background:`linear-gradient(135deg,${group.color||"#888"},#1A2744)`,
                display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.2rem"}}>
                {faceMatch.photo
                  ?<img src={faceMatch.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  :initials(faceMatch.name)}
              </div>
              <div style={{fontWeight:700,color:"#1A2744",fontSize:"1rem",marginBottom:4}}>{faceMatch.name}</div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A",marginBottom:14}}>{group.name} · {formatDate(date)}</div>
              <div style={{fontSize:"0.82rem",color:"#1A2744",fontWeight:700,marginBottom:10}}>
                Is this you? Confirm your attendance:
              </div>
              <button className="btn btn-success btn-full" style={{marginBottom:8,fontSize:"0.9rem",padding:"12px"}}
                onClick={()=>doCheckIn(faceMatch)}>
                ✅ Yes, Mark Me Present!
              </button>
              <button className="btn btn-outline btn-full" style={{fontSize:"0.8rem"}}
                onClick={retryFace}>
                🔄 Not me — try again
              </button>
            </div>
          )}

          {/* No face detected */}
          {(faceStatus==='no_face'||faceStatus==='no_match')&&(
            <div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>{faceStatus==='no_face'?"😐":"❓"}</div>
              <div style={{fontWeight:700,color:"#1A2744",fontSize:"0.88rem",marginBottom:6}}>
                {faceStatus==='no_face'?"No face detected":"Face not recognised"}
              </div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A",marginBottom:14}}>
                {faceStatus==='no_face'
                  ?"Make sure your face is clearly visible and well lit."
                  :"Your face did not match any member on file. Make sure your photo is uploaded."}
              </div>
              <button className="btn btn-navy btn-full" style={{marginBottom:8}} onClick={retryFace}>🔄 Try Again</button>
              <button className="btn btn-outline btn-full" style={{fontSize:"0.8rem"}}
                onClick={()=>{stopCamera();setMode('search');setFaceStatus('idle');}}>
                🔍 Use Name Search Instead
              </button>
            </div>
          )}

          {/* Camera error */}
          {faceStatus==='camera_error'&&(
            <div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>📵</div>
              <div style={{fontWeight:700,color:"#C0392B",fontSize:"0.88rem",marginBottom:6}}>Camera Access Denied</div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A",marginBottom:14}}>
                Please allow camera access in your browser settings and try again.
              </div>
              <button className="btn btn-outline btn-full"
                onClick={()=>{stopCamera();setMode('search');setFaceStatus('idle');}}>
                🔍 Use Name Search Instead
              </button>
            </div>
          )}

          {/* No photos */}
          {faceStatus==='no_photos'&&(
            <div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>🖼️</div>
              <div style={{fontWeight:700,color:"#C9973A",fontSize:"0.88rem",marginBottom:6}}>No Member Photos</div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A",marginBottom:14}}>
                No members in this group have profile photos yet. Ask your leader to upload photos first.
              </div>
              <button className="btn btn-outline btn-full"
                onClick={()=>{stopCamera();setMode('search');setFaceStatus('idle');}}>
                🔍 Use Name Search Instead
              </button>
            </div>
          )}

          {/* General failed */}
          {faceStatus==='failed'&&(
            <div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>⚠️</div>
              <div style={{fontWeight:700,color:"#C0392B",fontSize:"0.88rem",marginBottom:6}}>Something went wrong</div>
              <div style={{fontSize:"0.72rem",color:"#7A7A7A",marginBottom:14}}>
                Could not load face recognition. Check your internet connection and try again.
              </div>
              <button className="btn btn-navy btn-full" style={{marginBottom:8}} onClick={retryFace}>🔄 Retry</button>
              <button className="btn btn-outline btn-full" style={{fontSize:"0.8rem"}}
                onClick={()=>{stopCamera();setMode('search');setFaceStatus('idle');}}>
                🔍 Use Name Search Instead
              </button>
            </div>
          )}

          {faceStatus!=='matched'&&faceStatus!=='no_face'&&faceStatus!=='no_match'
            &&faceStatus!=='camera_error'&&faceStatus!=='no_photos'&&faceStatus!=='failed'&&(
            <button className="btn btn-outline btn-full" style={{fontSize:"0.75rem",marginTop:4}}
              onClick={()=>{stopCamera();setMode(null);setFaceStatus('idle');}}>
              ← Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════
//  PRINTABLE REPORT COMPONENT
// ═══════════════════════════════════════════════════════════════════
function PrintableReport({date, groups, members, attendance, report, onClose}){
  const printRef=useRef();
  const isPresent=(d,mid)=>attendance[`${d}|${mid}`]===true;
  const total={
    enrolled:members.length,
    present:members.filter(m=>isPresent(date,m.id)).length,
  };
  total.absent=total.enrolled-total.present;
  total.pct=total.enrolled?Math.round(total.present/total.enrolled*100):0;

  const catStats={};
  CATEGORIES.forEach(cat=>{
    const cm=members.filter(m=>m.category===cat);
    catStats[cat]={total:cm.length,present:cm.filter(m=>isPresent(date,m.id)).length};
  });

  const handlePrint=()=>{
    const content=printRef.current.innerHTML;
    const win=window.open("","_blank","width=800,height=600");
    win.document.write(`
      <!DOCTYPE html><html><head><title>Church Report — ${date}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&display=swap');
        body{font-family:'Lato',sans-serif;padding:28px 36px;color:#2C2C2C;max-width:760px;margin:0 auto;}
        h1{font-family:'Playfair Display',serif;color:#1A2744;font-size:1.6rem;border-bottom:3px solid #C9973A;padding-bottom:10px;margin-bottom:20px;}
        h2{font-family:'Playfair Display',serif;font-size:1.05rem;color:#1A2744;margin:18px 0 8px;border-left:4px solid #C9973A;padding-left:8px;}
        .meta{display:flex;gap:30px;margin-bottom:18px;flex-wrap:wrap;}
        .meta-cell{}.meta-label{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;}
        .meta-value{font-size:1.1rem;font-weight:700;color:#1A2744;}
        .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;}
        .stat-box{border:1px solid #F0E8D8;border-radius:8px;padding:10px;text-align:center;}
        .stat-num{font-family:'Playfair Display',serif;font-size:1.5rem;color:#1A2744;}
        .stat-lbl{font-size:0.6rem;color:#7A7A7A;text-transform:uppercase;}
        table{width:100%;border-collapse:collapse;margin-bottom:14px;}
        th{background:#1A2744;color:white;padding:8px 10px;font-size:0.78rem;text-align:left;}
        td{padding:7px 10px;border-bottom:1px solid #F0E8D8;font-size:0.82rem;}
        tr:nth-child(even) td{background:#FDF8F0;}
        .present{color:#1E8449;font-weight:700;}
        .absent{color:#922B21;}
        .finance-row{display:flex;gap:40px;margin-bottom:16px;}
        .fin-cell{flex:1;border:1px solid #F0E8D8;border-radius:8px;padding:10px 14px;}
        .fin-label{font-size:0.68rem;text-transform:uppercase;color:#7A7A7A;letter-spacing:0.5px;}
        .fin-value{font-size:1.2rem;font-weight:700;color:#27AE60;font-family:'Playfair Display',serif;}
        .footer{margin-top:24px;padding-top:10px;border-top:1px solid #eee;font-size:0.7rem;color:#7A7A7A;display:flex;justify-content:space-between;}
        @media print{body{padding:14px 20px;}}
      </style></head><body>${content}
      <script>window.onload=function(){window.print();}</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxHeight:"92vh"}} onClick={e=>e.stopPropagation()}>
        <div className="modal-title">
          📄 Report Preview
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>🖨️ Print / PDF</button>
            <span style={{cursor:"pointer",fontSize:"1.2rem"}} onClick={onClose}>✕</span>
          </div>
        </div>

        {/* Preview */}
        <div ref={printRef} style={{fontSize:"0.82rem",lineHeight:1.5}}>
          <h1 style={{fontFamily:"Playfair Display,serif",color:"#1A2744",fontSize:"1.3rem",borderBottom:"3px solid #C9973A",paddingBottom:8,marginBottom:16}}>
            ⛪ Church Service Report
          </h1>

          {/* Date & Meta */}
          <div style={{display:"flex",gap:20,marginBottom:14,flexWrap:"wrap"}}>
            {[{l:"Date",v:formatDate(date)},{l:"Enrolled",v:total.enrolled},{l:"Present",v:total.present},{l:"Rate",v:total.pct+"%"}].map(x=>(
              <div key={x.l} style={{minWidth:90}}>
                <div style={{fontSize:"0.62rem",textTransform:"uppercase",color:"#7A7A7A",letterSpacing:"0.5px"}}>{x.l}</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:"1rem",fontWeight:700,color:"#1A2744"}}>{x.v}</div>
              </div>
            ))}
          </div>

          {/* Financials */}
          {(report.offertory||report.tithe)&&(
            <>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.98rem",color:"#1A2744",borderLeft:"4px solid #C9973A",paddingLeft:8,marginBottom:8,marginTop:12}}>Financial Records</div>
              <div style={{display:"flex",gap:12,marginBottom:14}}>
                {report.offertory&&<div style={{flex:1,border:"1px solid #F0E8D8",borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:"0.62rem",textTransform:"uppercase",color:"#7A7A7A"}}>🪙 Offertory</div>
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.1rem",color:"#27AE60",fontWeight:700}}>{CHURCH_CONFIG.CURRENCY} {report.offertory}</div>
                </div>}
                {report.tithe&&<div style={{flex:1,border:"1px solid #F0E8D8",borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:"0.62rem",textTransform:"uppercase",color:"#7A7A7A"}}>💵 Tithe</div>
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.1rem",color:"#27AE60",fontWeight:700}}>{CHURCH_CONFIG.CURRENCY} {report.tithe}</div>
                </div>}
              </div>
            </>
          )}

          {/* Spiritual */}
          <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.98rem",color:"#1A2744",borderLeft:"4px solid #C9973A",paddingLeft:8,marginBottom:8,marginTop:12}}>Spiritual Records</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
            <thead><tr>{["Item","Count"].map(h=><th key={h} style={{background:"#1A2744",color:"white",padding:"7px 10px",fontSize:"0.75rem",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {[["🙋 Visitors",report.visitors||"0"],["✨ Souls Won",report.soulsWon||"0"],["🕊️ Holy Spirit Baptism",report.holySpirit||"0"],["📖 Bible Study",report.bibleStudy||"0"]].map(([k,v])=>(
                <tr key={k}><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{k}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",fontWeight:700}}>{v}</td></tr>
              ))}
            </tbody>
          </table>

          {/* Attendance by Category */}
          <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.98rem",color:"#1A2744",borderLeft:"4px solid #C9973A",paddingLeft:8,marginBottom:8,marginTop:12}}>Attendance by Category</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
            <thead><tr>{["Category","Enrolled","Present","Absent"].map(h=><th key={h} style={{background:"#1A2744",color:"white",padding:"7px 10px",fontSize:"0.75rem",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {CATEGORIES.map(cat=>{
                const s=catStats[cat];
                if(s.total===0) return null;
                return <tr key={cat}><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{CAT_ICONS[cat]} {cat}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{s.total}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",color:"#1E8449",fontWeight:700}}>{s.present}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",color:"#922B21"}}>{s.total-s.present}</td></tr>;
              })}
              <tr style={{background:"#F0E8D8"}}>
                <td style={{padding:"6px 10px",fontWeight:700}}>TOTAL</td>
                <td style={{padding:"6px 10px",fontWeight:700}}>{total.enrolled}</td>
                <td style={{padding:"6px 10px",fontWeight:700,color:"#1E8449"}}>{total.present}</td>
                <td style={{padding:"6px 10px",fontWeight:700,color:"#922B21"}}>{total.absent}</td>
              </tr>
            </tbody>
          </table>

          {/* Attendance by Group */}
          <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.98rem",color:"#1A2744",borderLeft:"4px solid #C9973A",paddingLeft:8,marginBottom:8,marginTop:12}}>Attendance by Group</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
            <thead><tr>{["Group","Enrolled","Present","Absent","%"].map(h=><th key={h} style={{background:"#1A2744",color:"white",padding:"7px 10px",fontSize:"0.75rem",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {groups.map(g=>{
                const gm=members.filter(m=>m.groupId===g.id);
                const p=gm.filter(m=>isPresent(date,m.id)).length;
                const pct=gm.length?Math.round(p/gm.length*100):0;
                return <tr key={g.id}><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",fontWeight:700}}>{g.name}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{gm.length}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",color:"#1E8449",fontWeight:700}}>{p}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",color:"#922B21"}}>{gm.length-p}</td><td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{pct}%</td></tr>;
              })}
            </tbody>
          </table>

          {/* Full member list */}
          <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.98rem",color:"#1A2744",borderLeft:"4px solid #C9973A",paddingLeft:8,marginBottom:8,marginTop:12}}>Full Attendance Register</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
            <thead><tr>{["Member","Group","Category","Status"].map(h=><th key={h} style={{background:"#1A2744",color:"white",padding:"7px 10px",fontSize:"0.75rem",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {members.map((m,i)=>{
                const grp=groups.find(g=>g.id===m.groupId);
                const present=isPresent(date,m.id);
                return <tr key={m.id} style={{background:i%2===0?"white":"#FDF8F0"}}>
                  <td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{m.name}</td>
                  <td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{grp?.name}</td>
                  <td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8"}}>{m.category}</td>
                  <td style={{padding:"6px 10px",borderBottom:"1px solid #F0E8D8",color:present?"#1E8449":"#922B21",fontWeight:700}}>{present?"✓ Present":"✗ Absent"}</td>
                </tr>;
              })}
            </tbody>
          </table>

          {/* Activities & Notes */}
          {(report.activities||report.notes)&&(
            <>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.98rem",color:"#1A2744",borderLeft:"4px solid #C9973A",paddingLeft:8,marginBottom:8,marginTop:12}}>Activities & Notes</div>
              {report.activities&&<p style={{marginBottom:6}}><strong>Activities:</strong> {report.activities}</p>}
              {report.notes&&<p style={{marginBottom:6,fontStyle:"italic",color:"#555"}}><strong>Notes:</strong> {report.notes}</p>}
            </>
          )}

          <div style={{marginTop:20,paddingTop:8,borderTop:"1px solid #eee",fontSize:"0.68rem",color:"#7A7A7A",display:"flex",justifyContent:"space-between"}}>
            <span>Generated by {CHURCH_CONFIG.CHURCH_NAME}</span>
            <span>{new Date().toLocaleString()}</span>
          </div>
        </div>

        <div style={{marginTop:14,padding:"0 2px"}}>
          <button className="btn btn-primary btn-full" onClick={handlePrint}>🖨️ Print or Save as PDF</button>
          <p style={{fontSize:"0.7rem",color:"var(--muted)",textAlign:"center",marginTop:6}}>
            In the print dialog, select "Save as PDF" to download
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── IMAGE COMPRESSION HELPER ────────────────────────────────
// Resizes member photos to 160×160px before saving to Firebase
// Keeps file size small (~15-25KB) so Firestore stays fast
function compressImage(file, maxSize=100, quality=0.70){
  // VULN-07 FIX: Aggressive compression keeps photos ~5KB each
  // Safe for Firestore without needing paid Firebase Storage
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("File read failed"));
    reader.onload=e=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Image load failed"));
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        let w=img.width, h=img.height;
        if(w>h){ if(w>maxSize){h=Math.round(h*maxSize/w);w=maxSize;} }
        else    { if(h>maxSize){w=Math.round(w*maxSize/h);h=maxSize;} }
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── MEMBER AVATAR component (photo or initials fallback) ────
function MemberAvatar({member, group, size=36, fontSize="0.75rem"}){
  if(member?.photo){
    return(
      <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,
        border:`2px solid ${group?.color||"#888"}`,boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>
        <img src={member.photo} alt={member.name}
          style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      </div>
    );
  }
  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:`linear-gradient(135deg,${group?.color||"#888"},var(--navy))`,
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"white",fontWeight:700,fontSize}}>
      {initials(member?.name||"?")}
    </div>
  );
}

// ── INPUT VALIDATION HELPERS (VULN-06 FIX) ───────────────────
function sanitizeAmount(val){
  const n=parseFloat(val);
  if(isNaN(n)||n<0) return "0.00";
  if(n>999999) return "999999.00"; // max currency value 999,999
  return n.toFixed(2);
}
function sanitizeCount(val){
  const n=parseInt(val);
  if(isNaN(n)||n<0) return "0";
  if(n>9999) return "9999";
  return String(n);
}

// ─── ERROR BOUNDARY — prevents white screen on crashes ──────────
class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={hasError:false,error:null};
  }
  static getDerivedStateFromError(error){
    return{hasError:true,error};
  }
  componentDidCatch(error,info){
    console.error("App error:",error,info);
  }
  render(){
    if(this.state.hasError){
      return(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
          background:"linear-gradient(135deg,#1A2744,#243260)",padding:24,fontFamily:"Lato,sans-serif"}}>
          <div style={{background:"white",borderRadius:16,padding:"32px 24px",maxWidth:360,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:"3rem",marginBottom:12}}>⚠️</div>
            <h2 style={{fontFamily:"Playfair Display,serif",color:"#1A2744",marginBottom:8}}>Something went wrong</h2>
            <p style={{fontSize:"0.82rem",color:"#7A7A7A",marginBottom:20,lineHeight:1.6}}>
              The app encountered an unexpected error. Your data is safe in Firebase. Please refresh the page to continue.
            </p>
            <div style={{background:"#F8F9FA",borderRadius:8,padding:"8px 12px",marginBottom:20,fontSize:"0.7rem",color:"#888",textAlign:"left",wordBreak:"break-word"}}>
              {String(this.state.error?.message||"Unknown error")}
            </div>
            <button onClick={()=>window.location.reload()}
              style={{background:"#1A2744",color:"white",border:"none",borderRadius:10,padding:"12px 24px",
                fontSize:"0.88rem",fontWeight:700,cursor:"pointer",width:"100%"}}>
              🔄 Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── BREAKDOWN GROUP CARD (standalone — used by SecReportForm) ───
function BdGroup({g,st,gm,presentList,absentList,cig}){
  const [open,setOpen]=useState(false);
  return(
    <div className="card" style={{padding:0,overflow:"hidden",border:open?`2px solid ${g.color}`:undefined}}>
      <div style={{padding:"11px 14px",cursor:"pointer",background:g.color+"14"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:g.color,flexShrink:0}}/>
          <span style={{fontFamily:"Playfair Display,serif",fontWeight:700,flex:1,fontSize:"0.92rem"}}>{g.name}</span>
          <span style={{fontWeight:700,fontSize:"0.82rem",color:"var(--navy)"}}>{st.present}/{st.total}</span>
          <span className={`badge ${st.pct>=70?"badge-green":st.pct>=40?"badge-gold":"badge-red"}`}>{st.pct}%</span>
          <span style={{color:"var(--muted)",fontSize:"0.85rem",marginLeft:2}}>{open?"▲":"▼"}</span>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{width:st.pct+"%",background:`linear-gradient(90deg,${g.color},${g.color}99)`}}/></div>
        {!open&&absentList.length>0&&<div style={{marginTop:5,fontSize:"0.7rem",color:"var(--red)"}}>⚠ Absent: {absentList.map(m=>m.name.split(" ")[0]).join(", ")}</div>}
      </div>
      {open&&(
        <div style={{padding:"0 14px 12px",borderTop:`1px solid ${g.color}22`}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,margin:"10px 0 8px"}}>
            {CATEGORIES.map(cat=>{const ci=cig[cat];if(!ci||ci.total===0)return null;return(
              <div key={cat} style={{background:"var(--cream)",borderRadius:7,padding:"6px 5px",textAlign:"center"}}>
                <div style={{fontSize:"0.95rem"}}>{CAT_ICONS[cat]}</div>
                <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--navy)"}}>{ci.present}/{ci.total}</div>
                <div style={{fontSize:"0.58rem",color:"var(--muted)"}}>{cat}</div>
              </div>
            );})}
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:"0.68rem",fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:5}}>✓ Present ({presentList.length})</div>
            {presentList.length===0
              ?<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>None yet</div>
              :presentList.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${g.color},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.65rem",flexShrink:0}}>{initials(m.name)}</div>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:"0.82rem"}}>{m.name}</div><span className="badge badge-gray" style={{fontSize:"0.58rem"}}>{CAT_ICONS[m.category]} {m.category}</span></div>
                  <span className="badge badge-green" style={{fontSize:"0.62rem"}}>✓</span>
                </div>
              ))
            }
          </div>
          <div>
            <div style={{fontSize:"0.68rem",fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:5}}>✗ Absent ({absentList.length})</div>
            {absentList.length===0
              ?<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>🎉 No absences!</div>
              :absentList.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                  <MemberAvatar member={m} group={{color:"#ccc"}} size={28} fontSize="0.65rem"/>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:"0.82rem",color:"var(--muted)"}}>{m.name}</div>{m.phone&&<div style={{fontSize:"0.6rem",color:"var(--muted)"}}>📞 {m.phone}</div>}</div>
                  <span className="badge badge-red" style={{fontSize:"0.62rem"}}>✗</span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SECRETARY REPORT FORM (standalone — keeps keyboard alive) ────
// Must be defined OUTSIDE App() so React doesn't remount it on every render
function SecReportForm({date,rpt,groups,members,isPresent,getGroupStats,saveReport,setModal,showAlert,SERVICE_TYPES,SERVICE_ICONS,CATEGORIES,CAT_ICONS}){
  const [draft,setDraft]=useState(()=>({...rpt}));

  // Sync draft when date changes OR when rpt loads from Firebase
  useEffect(()=>{
    setDraft(prev=>{
      // Only update fields that haven't been locally modified
      // (i.e. if Firebase loaded fresh data, adopt it)
      return{...rpt,...prev,
        // Always take Firebase values for these since user isn't typing them
        serviceType:rpt.serviceType||prev.serviceType||"Sunday Morning",
      };
    });
  },[date]);

  // When Firebase data arrives (e.g. after page load), sync if draft still empty
  useEffect(()=>{
    setDraft(prev=>{
      const anyFilled=Object.values(prev).some(v=>v&&v!=="0"&&v!=="Sunday Morning");
      if(!anyFilled) return{...rpt};
      return prev;
    });
  },[rpt.offertory,rpt.tithe,rpt.visitors,rpt.soulsWon,rpt.holySpirit,rpt.bibleStudy,rpt.activities,rpt.notes]);

  const upd=(field,val)=>setDraft(p=>({...p,[field]:val}));
  const commit=(field)=>saveReport(date,field,draft[field]);
  const saveAll=()=>{
    Object.entries(draft).forEach(([field,val])=>saveReport(date,field,val));
    showAlert("Daily report saved! ✓");
  };

  const total={
    total:members.length,
    present:members.filter(m=>isPresent(date,m.id)).length,
  };
  total.absent=total.total-total.present;
  total.pct=total.total?Math.round(total.present/total.total*100):0;

  return(
    <div className="scroll-area">
      {/* Service Type */}
      <div style={{margin:"6px 12px"}}>
        <div style={{fontSize:"0.68rem",color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5}}>⛪ Service Type</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {SERVICE_TYPES.map(st=>{const sel=(draft.serviceType||"Sunday Morning")===st;return(
            <button key={st} onClick={()=>{upd("serviceType",st);saveReport(date,"serviceType",st);}}
              style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${sel?"var(--navy)":"var(--cream-dark)"}`,background:sel?"var(--navy)":"white",color:sel?"white":"var(--muted)",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              {SERVICE_ICONS[st]} {st}
            </button>
          );})}
        </div>
      </div>
      {/* Summary */}
      <div className="summary-banner">
        <h3>📊 Attendance Summary</h3>
        <div className="summary-grid">
          {[{l:"Enrolled",v:total.total},{l:"Present",v:total.present},{l:"Rate",v:total.pct+"%"}].map(s=>(
            <div className="summary-cell" key={s.l}><div className="summary-num">{s.v}</div><div className="summary-lbl">{s.l}</div></div>
          ))}
        </div>
      </div>
      {/* Financial */}
      <div className="card">
        <div className="card-title">💰 Financial Records</div>
        {[{label:"Offertory ({CHURCH_CONFIG.CURRENCY})",icon:"🪙",field:"offertory",ph:"0.00"},{label:"Tithe ({CHURCH_CONFIG.CURRENCY})",icon:"💵",field:"tithe",ph:"0.00"}].map(({label,icon,field,ph})=>(
          <div className="report-field" key={field}>
            <label>{icon} {label}</label>
            <input className="input" type="text" inputMode="decimal" placeholder={ph}
              value={draft[field]??""}
              onChange={e=>{
                // Only allow digits and one decimal point
                const v=e.target.value.replace(/[^0-9.]/g,"").replace(/(\..*)\./g,"$1");
                upd(field,v);
              }}
              onBlur={()=>{
                // Sanitize on blur — clamp to valid range
                upd(field, sanitizeAmount(draft[field]||"0"));
                commit(field);
              }}/>
          </div>
        ))}
      </div>
      {/* Spiritual */}
      <div className="card">
        <div className="card-title">🌱 Spiritual Records</div>
        {[
          {label:"Visitors",icon:"🙋",field:"visitors"},
          {label:"Souls Won",icon:"✨",field:"soulsWon"},
          {label:"Holy Spirit Baptism",icon:"🕊️",field:"holySpirit"},
          {label:"Bible Study Attendance",icon:"📖",field:"bibleStudy"},
        ].map(({label,icon,field})=>(
          <div className="report-field" key={field}>
            <label>{icon} {label}</label>
            <input className="input" type="text" inputMode="numeric" placeholder="0"
              value={draft[field]??""}
              onChange={e=>{
                const v=e.target.value.replace(/[^0-9]/g,"");
                upd(field,v);
              }}
              onBlur={()=>{
                upd(field, sanitizeCount(draft[field]||"0"));
                commit(field);
              }}/>
          </div>
        ))}
      </div>
      {/* Activities & Notes */}
      <div className="card">
        <div className="card-title">📌 Activities & Notes</div>
        <div className="report-field">
          <label>🗓️ Activities Held</label>
          <input className="input" type="text" placeholder="e.g. Youth Meeting, Prayer Session"
            value={draft.activities??""}
            onChange={e=>upd("activities",e.target.value)}
            onBlur={()=>commit("activities")}/>
        </div>
        <div className="report-field">
          <label>📝 Secretary Notes</label>
          <textarea className="input" rows={3} placeholder="Any additional observations..."
            value={draft.notes??""}
            onChange={e=>upd("notes",e.target.value)}
            onBlur={()=>commit("notes")}
            style={{resize:"vertical"}}/>
        </div>
      </div>
      {/* Breakdown */}
      <p className="section-label">🔢 Attendance Breakdown</p>
      <div className="demo-grid">
        {CATEGORIES.map(cat=>{
          const cm=members.filter(m=>m.category===cat);
          const pres=cm.filter(m=>isPresent(date,m.id)).length;
          const pct=cm.length?Math.round(pres/cm.length*100):0;
          if(cm.length===0)return null;
          return(
            <div className="demo-box" key={cat}>
              <div className="demo-label">{CAT_ICONS[cat]} {cat}</div>
              <div className="demo-val">{pres}<span style={{fontSize:"0.75rem",color:"var(--muted)",fontFamily:"Lato,sans-serif"}}>/{cm.length}</span></div>
              <div style={{margin:"4px 0 2px"}} className="progress-bar"><div className="progress-fill" style={{width:pct+"%"}}/></div>
              <div className="demo-sub">{cm.length-pres} absent · {pct}%</div>
            </div>
          );
        })}
      </div>
      <p className="section-label">By Group — <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:"0.72rem"}}>tap to see present & absent</span></p>
      {groups.map(g=>{
        const st=getGroupStats(g.id,date);
        const gm=members.filter(m=>m.groupId===g.id);
        const presentList=gm.filter(m=>isPresent(date,m.id));
        const absentList=gm.filter(m=>!isPresent(date,m.id));
        const cig={};CATEGORIES.forEach(cat=>{const cm=gm.filter(m=>m.category===cat);cig[cat]={total:cm.length,present:cm.filter(m=>isPresent(date,m.id)).length};});
        return(<BdGroup key={g.id} g={g} st={st} gm={gm} presentList={presentList} absentList={absentList} cig={cig}/>);
      })}
      {/* Save / Print */}
      <div style={{margin:"8px 12px",display:"flex",gap:8}}>
        <button className="btn btn-teal" style={{flex:1}} onClick={saveAll}>💾 Save</button>
        <button className="btn btn-primary" style={{flex:1}} onClick={()=>setModal({type:"printReport",date})}>🖨️ Print / PDF</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App(){
  // ── PERSISTENT STATE (survives page refresh via localStorage) ───
  // ── FIREBASE AUTH STATE ────────────────────────────────────
  const [firebaseAuthed, setFirebaseAuthed] = useState(false);
  useEffect(()=>{
    authReady.then(user=>{
      setFirebaseAuthed(!!user);
    });
  },[]);

  const [groups,       setGroups,       grpLoaded]  = useLocalStorage("church_groups",       initGroups);
  const [members,      setMembers,      memLoaded]  = useLocalStorage("church_members",      initMembers);
  const [users,        setUsers,        usrLoaded]  = useLocalStorage("church_users",        initUsers);
  const [attendance,   setAttendance,   attLoaded]  = useMonthlyAttendance();
  const [dailyReports, setDailyReports, rptLoaded]  = useLocalStorage("church_dailyreports", {});
  const [submittedAtt, setSubmittedAtt, subLoaded]  = useLocalStorage("church_submittedAtt", {});
  const [auditLog,     setAuditLog]                  = useLocalStorage("church_auditlog",     []);
  const appReady = firebaseAuthed && grpLoaded && memLoaded && usrLoaded && attLoaded && rptLoaded && subLoaded; // {groupId_date: true}

  // ── SESSION STATE (per-device, survives refresh but not shared) ─
  // VULN-03 FIX: Load from sessionStorage but verify against Firebase users
  const [currentUser, setCurrentUserState] = useState(()=>{
    try{
      const saved=sessionStorage.getItem("church_currentUser");
      return saved?JSON.parse(saved):null; // initially just {id,role}
    }catch{return null;}
  });
  // VULN-03 + VULN-10 FIX: Once Firebase users load, replace minimal session
  // with full user object — and verify user still exists + role unchanged
  useEffect(()=>{
    if(!usrLoaded||!currentUser) return;
    const fullUser=users.find(u=>u.id===currentUser.id&&u.role===currentUser.role);
    if(fullUser){
      setCurrentUserState(fullUser); // upgrade to full user object
    } else {
      // User deleted or role changed — force sign out
      sessionStorage.removeItem("church_currentUser");
      setCurrentUserState(null);
    }
  },[usrLoaded]);
  const setCurrentUser = (user) => {
    try {
      // VULN-10 FIX: Store only id+role in sessionStorage, not full user object
      if (user) sessionStorage.setItem("church_currentUser", JSON.stringify({id:user.id,role:user.role}));
      else sessionStorage.removeItem("church_currentUser");
    } catch {}
    setCurrentUserState(user);
  };
  const [activeTab,    setActiveTab]    = useState("dashboard");
  const [modal,        setModal]        = useState(null);
  const [alert,        setAlert]        = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loginPin,     setLoginPin]     = useState("");
  const [loginRole,    setLoginRole]    = useState(null);
  const [loginError,   setLoginError]   = useState("");
  const [checkInGroup, setCheckInGroup] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(0);   // 0=idle 1=first 2=final
  const [resetWord,    setResetWord]    = useState("");
  // VULN-02 FIX: Persist lockout in sessionStorage so refresh doesn't bypass it
  const [loginAttempts,setLoginAttempts]= useState(()=>{
    try{return parseInt(sessionStorage.getItem("church_loginAttempts")||"0");}catch{return 0;}
  });
  const [lockUntil,setLockUntil]=useState(()=>{
    try{
      const v=sessionStorage.getItem("church_lockUntil");
      const ts=v?parseInt(v):null;
      return (ts&&Date.now()<ts)?ts:null;
    }catch{return null;}
  });
  const persistAttempts=(n)=>{
    setLoginAttempts(n);
    try{sessionStorage.setItem("church_loginAttempts",String(n));}catch{}
  };
  const persistLock=(ts)=>{
    setLockUntil(ts);
    try{
      if(ts) sessionStorage.setItem("church_lockUntil",String(ts));
      else sessionStorage.removeItem("church_lockUntil");
    }catch{}
  };

  // ── CLEAN UP old Firebase currentUser doc (caused cross-device sign-out) ─
  useEffect(() => {
    deleteData("church_currentUser");
  }, []);

  // ── QR CHECK-IN URL HANDLER ──────────────────────────────────
  // When a member scans a group QR code, the URL contains ?checkin=groupId
  // This effect detects it and auto-opens the check-in page
  useEffect(() => {
    if(groups.length===0) return; // wait for groups to load from Firebase
    const params=new URLSearchParams(window.location.search);
    const gid=params.get("checkin");
    const exp=params.get("exp");
    if(gid){
      // VULN-05 FIX: Verify token hasn't expired (2 hour window)
      const expired=exp&&Date.now()>parseInt(exp);
      const grp=groups.find(g=>g.id===gid);
      if(grp&&!expired){
        setCheckInGroup(grp);
        window.history.replaceState({},"",window.location.pathname);
      } else if(expired){
        alert("This QR code has expired. Please ask the Pastor to generate a new one.");
        window.history.replaceState({},"",window.location.pathname);
      }
    }
  },[groups]);

  // ── SESSION TIMEOUT — auto sign out after 30 minutes of inactivity ──
  const lastActivityRef = useRef(Date.now());
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  useEffect(() => {
    if (!currentUser) return;
    const events = ["click","keydown","touchstart","scroll","mousemove"];
    const resetTimer = () => { lastActivityRef.current = Date.now(); };
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > TIMEOUT_MS) {
        setCurrentUser(null);
        showAlert("You have been signed out due to inactivity.","info");
      }
    }, 60000); // check every minute
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearInterval(interval);
    };
  }, [currentUser]);

  // ── SEED SAMPLE HISTORICAL DATA (for demo charts) ─────────────
  useEffect(()=>{
    if(!attLoaded||!rptLoaded) return; // wait for Firebase to load first
    const hasData=Object.keys(attendance).length>0||Object.keys(dailyReports).length>0;
    if(hasData) return; // don't overwrite real data
    const today=new Date();
    const sampleAtt={};
    const sampleRpts={};
    const rates=[0.75,0.82,0.68,0.90,0.72,0.85,0.78,0.88];
    for(let i=7;i>=0;i--){
      const d=new Date(today);
      d.setDate(d.getDate()-(i*7)); // weekly
      const dateStr=d.toISOString().split("T")[0];
      const rate=rates[7-i];
      // mark random members present based on rate
      const shuffled=[...initMembers()].sort(()=>Math.random()-0.5);
      const presentCount=Math.round(shuffled.length*rate);
      shuffled.slice(0,presentCount).forEach(m=>{ sampleAtt[dateStr+"|"+m.id]=true; });
      sampleRpts[dateStr]={
        offertory:(Math.round((180+Math.random()*120)*100)/100).toFixed(2),
        tithe:(Math.round((50+Math.random()*80)*100)/100).toFixed(2),
        visitors:String(Math.floor(Math.random()*5)),
        soulsWon:String(Math.floor(Math.random()*3)),
        holySpirit:String(Math.floor(Math.random()*2)),
        bibleStudy:String(Math.floor(6+Math.random()*6)),
        activities:["Sunday Service","Midweek Service","Prayer Meeting","Youth Service"][i%4],
        notes:"",
      };
    }
    setAttendance(sampleAtt);
    setDailyReports(sampleRpts);
  },[attLoaded,rptLoaded]);



  const showAlert=(msg,type="success")=>{setAlert({msg,type});setTimeout(()=>setAlert(null),3200);};

  // ── LOGIN ─────────────────────────────────────────────────────
  const MAX_ATTEMPTS=5;
  const LOCK_MINUTES=5;
  const handleLogin=async()=>{
    // Check if currently locked out
    if(lockUntil&&Date.now()<lockUntil){
      const remaining=Math.ceil((lockUntil-Date.now())/60000);
      setLoginError(`Too many failed attempts. Try again in ${remaining} minute${remaining>1?"s":""}.`);
      return;
    }
    const candidates=users.filter(u=>!loginRole||u.role===loginRole);
    let matched=null;
    for(const u of candidates){
      const ok=await verifyPin(loginPin,u.pin,u.salt);
      if(ok){matched=u;break;}
    }
    if(matched){
      setCurrentUser(matched);setLoginError("");setLoginPin("");
      persistAttempts(0);persistLock(null);
      setActiveTab(matched.role==="admin"?"dashboard":matched.role==="secretary"?"sec-totals":"attendance");
      // VULN-08 FIX: Audit log saved to Firebase (permanent, survives refresh)
      try{
        const logKey="church_auditlog";
        loadData(logKey,[]).then(existing=>{
          const log=Array.isArray(existing)?existing:[];
          log.unshift({action:"LOGIN",user:matched.name,role:matched.role,time:new Date().toISOString()});
          saveData(logKey,log.slice(0,100)); // keep last 100 events
        });
      }catch{}
    } else {
      const newAttempts=loginAttempts+1;
      persistAttempts(newAttempts);
      setLoginPin("");
      if(newAttempts>=MAX_ATTEMPTS){
        const until=Date.now()+(LOCK_MINUTES*60*1000);
        persistLock(until);
        setLoginError(`Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`);
        persistAttempts(0);
      } else {
        const left=MAX_ATTEMPTS-newAttempts;
        setLoginError(`Incorrect PIN or role. ${left} attempt${left>1?"s":""} remaining.`);
      }
    }
  };

  // ── LOADING SCREEN ───────────────────────────────────────────
  if(!appReady){
    return(
      <>
        <style>{STYLE}</style>
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,var(--navy) 0%,var(--navy-mid) 100%)"}}>
          <div style={{textAlign:"center",padding:24}}>
            <div style={{fontSize:"3.5rem",marginBottom:16,animation:"pulse 1.5s infinite"}}>⛪</div>
            <h2 style={{color:"var(--gold-light)",fontFamily:"Playfair Display,serif",marginBottom:8}}>{CHURCH_CONFIG.CHURCH_NAME}</h2>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:"0.85rem",marginBottom:24}}>{firebaseAuthed?"Loading church data...":"Securing connection..."}</p>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:10,height:10,borderRadius:"50%",background:"var(--gold)",
                  animation:`bounce 1.2s ${i*0.2}s infinite`,opacity:0.8}}/>
              ))}
            </div>
          </div>
          <style>{`
            @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-12px)}}
            @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
          `}</style>
        </div>
      </>
    );
  }

  // ── QR CHECK-IN SIMULATION ────────────────────────────────────
  if(checkInGroup){
    return(
      <>
        <style>{STYLE}</style>
        <GroupCheckIn group={checkInGroup} members={members} attendance={attendance}
          setAttendance={setAttendance} onBack={()=>setCheckInGroup(null)}/>
      </>
    );
  }

  if(!currentUser){
    const roles=[{id:"admin",label:"Pastor",icon:"✝️"},{id:"secretary",label:"Secretary",icon:"📋"},{id:"leader",label:"Leader",icon:"👥"}];
    return(
      <>
        <style>{STYLE}</style>
        <div className="login-wrap">
          {/* Left brand panel — desktop only */}
          <div className="login-brand">
            <div className="login-brand-content">
              <div style={{fontSize:"4rem",marginBottom:16}}>{CHURCH_CONFIG.CHURCH_ICON}</div>
              <h1>{CHURCH_CONFIG.CHURCH_NAME.replace(" Assembly","")}<br/>Assembly</h1>
              <p>A secure, modern church management system built for your assembly. Real-time attendance, financial records and monthly reports — all in one place.</p>
              <div className="login-brand-features">
                {[
                  ["✅","Real-time attendance tracking"],
                  ["📊","Live dashboard for Pastor"],
                  ["📝","Financial & spiritual records"],
                  ["👥","Member profiles with photos"],
                  ["📅","Monthly analysis & reports"],
                  ["🔐","Secure PIN-based access"],
                ].map(([icon,text])=>(
                  <div className="login-brand-feature" key={text}>
                    <span>{icon}</span><span>{text}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:32,padding:"12px 20px",background:"rgba(255,255,255,0.08)",borderRadius:10,border:"1px solid rgba(201,151,58,0.4)"}}>
                <div style={{color:"var(--gold)",fontSize:"0.75rem",fontWeight:700,marginBottom:4}}>🔒 ENTERPRISE SECURITY</div>
                <div style={{color:"rgba(255,255,255,0.55)",fontSize:"0.72rem"}}>Firebase Authentication · SHA-256 PIN hashing · Session timeout · Audit logging</div>
              </div>
            </div>
          </div>
          {/* Right login form */}
          <div className="login-right">
          <div className="login-card">
            <div className="login-logo">
              <div className="cross">⛪</div>
              <h2>{CHURCH_CONFIG.CHURCH_NAME}</h2>
              <p>{CHURCH_CONFIG.CHURCH_SUBTITLE}</p>
            </div>
            <p style={{fontSize:"0.72rem",fontWeight:700,color:"var(--muted)",marginBottom:8,letterSpacing:"0.8px",textTransform:"uppercase"}}>Your Role</p>
            <div className="role-grid">
              {roles.map(r=>(
                <div key={r.id} className={`role-btn${loginRole===r.id?" selected":""}`} onClick={()=>setLoginRole(r.id)}>
                  <span className="role-icon">{r.icon}</span>
                  <span className="role-name">{r.label}</span>
                </div>
              ))}
            </div>
            <label style={{fontSize:"0.75rem",fontWeight:700,color:"#555",display:"block",marginBottom:5}}>YOUR PIN</label>
            <input className="input" type="password" inputMode="numeric" placeholder="Enter PIN"
              value={loginPin} onChange={e=>setLoginPin(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              style={{fontSize:"1.2rem",letterSpacing:"8px",textAlign:"center"}}/>
            {loginError&&<div className="alert alert-error" style={{margin:"0 0 10px"}}>{loginError}</div>}
            {!loginError&&loginAttempts>0&&<div style={{fontSize:"0.72rem",color:"var(--gold)",textAlign:"center",marginBottom:8}}>⚠️ {MAX_ATTEMPTS-loginAttempts} attempt{MAX_ATTEMPTS-loginAttempts!==1?"s":""} remaining before lockout</div>}
            <button className="btn btn-navy btn-full" onClick={handleLogin}
              disabled={!!(lockUntil&&Date.now()<lockUntil)}
              style={{opacity:(lockUntil&&Date.now()<lockUntil)?0.5:1}}>
              {(lockUntil&&Date.now()<lockUntil)?"🔒 Account Locked":"Sign In →"}
            </button>

            {/* Privacy Notice */}
            <div style={{marginTop:16,padding:"10px 12px",background:"#F8F9FA",borderRadius:8,fontSize:"0.68rem",color:"#888",lineHeight:1.6,textAlign:"center"}}>
              🔒 <strong>Privacy Notice:</strong> This app collects and stores church attendance and financial data solely for internal church management purposes. All data is stored securely on encrypted cloud servers and is accessible only to authorised church staff. By signing in, you consent to this data usage. Data is not shared with third parties.
            </div>
          </div>
          </div>{/* end login-right */}
        </div>
      </>
    );
  }

  const isAdmin=currentUser.role==="admin";
  const isSecretary=currentUser.role==="secretary";
  const isLeader=currentUser.role==="leader";
  const myGroup=isLeader?groups.find(g=>g.id===currentUser.groupId):null;
  const visibleGroups=isLeader?groups.filter(g=>g.id===currentUser.groupId):groups;

  // ── Attendance helpers ────────────────────────────────────────
  const attKey=(date,mid)=>`${date}|${mid}`;
  const isPresent=(date,mid)=>attendance[attKey(date,mid)]===true;
  const toggleAtt=mid=>{const k=attKey(selectedDate,mid);setAttendance(p=>({...p,[k]:!p[k]}));};
  const markAllPresent=gid=>{
    const gm=members.filter(m=>m.groupId===gid);
    const up={};gm.forEach(m=>{up[attKey(selectedDate,m.id)]=true;});
    setAttendance(p=>({...p,...up}));showAlert(`All ${gm.length} marked present!`);
  };
  const getGroupStats=(gid,date)=>{
    const gm=members.filter(m=>m.groupId===gid);
    const present=gm.filter(m=>isPresent(date,m.id)).length;
    return{total:gm.length,present,absent:gm.length-present,pct:gm.length?Math.round(present/gm.length*100):0};
  };
  const getTotalStats=date=>{
    const present=members.filter(m=>isPresent(date,m.id)).length;
    return{total:members.length,present,absent:members.length-present,pct:members.length?Math.round(present/members.length*100):0};
  };
  const getCategoryStats=date=>{
    const res={};
    CATEGORIES.forEach(cat=>{const cm=members.filter(m=>m.category===cat);res[cat]={total:cm.length,present:cm.filter(m=>isPresent(date,m.id)).length};});
    return res;
  };

  // ── Report helpers ────────────────────────────────────────────
  const emptyReport=()=>({offertory:"",tithe:"",visitors:"0",soulsWon:"0",holySpirit:"0",bibleStudy:"0",activities:"",notes:"",serviceType:"Sunday Morning"});
  const getReport=date=>dailyReports[date]||emptyReport();
  const saveReport=(date,field,val)=>setDailyReports(p=>({...p,[date]:{...getReport(date),[field]:val}}));

  // ── TABS config ───────────────────────────────────────────────
  const todayNewSubs=Object.values(submittedAtt).filter(s=>s.date===todayStr()).length;
  const tabs=isAdmin
    ?[{id:"dashboard",label:"📊 Dash"+(todayNewSubs>0?` 🔴${todayNewSubs}`:"")},{id:"charts",label:"📈 Trends"},{id:"sec-report",label:"📝 Daily Rpt"},{id:"month",label:"📅 Month"},{id:"history",label:"🗂 History"},{id:"members",label:"👥 Members"},{id:"users",label:"👤 Users"},{id:"qrcodes",label:"📱 QR Codes"}]
    :isSecretary
    ?[{id:"sec-totals",label:"📊 Totals"},{id:"charts",label:"📈 Trends"},{id:"sec-report",label:"📝 Daily Rpt"},{id:"month",label:"📅 Month"},{id:"history",label:"🗂 History"},{id:"members",label:"👥 Members"}]
    :[{id:"attendance",label:"✅ Mark"},{id:"call-list",label:"📞 Calls"},{id:"grp-members",label:"👥 My Group"},{id:"month",label:"📅 Month"},{id:"grp-history",label:"🗂 History"}];

  // ════════════════ ATTENDANCE TAB (leader only) ════════════════
  const AttendanceTab=()=>{
    const [exp,setExp]=useState(visibleGroups[0]?.id||null);
    const [confirmGroup,setConfirmGroup]=useState(null);

    const submitKey=(gid,date)=>`${gid}_${date}`;
    const isSubmitted=(gid,date)=>!!submittedAtt[submitKey(gid,date)];

    const handleSubmit=(group)=>{
      const key=submitKey(group.id,selectedDate);
      const stats=getGroupStats(group.id,selectedDate);
      setSubmittedAtt(p=>({...p,[key]:{
        submittedBy:currentUser.name,
        groupName:group.name,
        date:selectedDate,
        present:stats.present,
        total:stats.total,
        submittedAt:new Date().toISOString(),
      }}));
      setConfirmGroup(null);
      showAlert(`✅ ${group.name} attendance submitted to Pastor & Secretary!`);
    };

    return(
      <div className="scroll-area">
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>
        <div style={{margin:"4px 12px 6px",display:"flex",gap:6,flexWrap:"wrap"}}>
          {SERVICE_TYPES.map(svc=>{const rpt=getReport(selectedDate);const sel=(rpt.serviceType||"Sunday Morning")===svc;return(
            <button key={svc} onClick={()=>saveReport(selectedDate,"serviceType",svc)}
              style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${sel?"var(--gold)":"var(--cream-dark)"}`,background:sel?"var(--gold)":"white",color:sel?"white":"var(--muted)",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              {SERVICE_ICONS[svc]} {svc}
            </button>
          );})}
        </div>

        {/* Confirm submit modal */}
        {confirmGroup&&(
          <div className="modal-overlay" onClick={()=>setConfirmGroup(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-title">📤 Submit Attendance <span style={{cursor:"pointer"}} onClick={()=>setConfirmGroup(null)}>✕</span></div>
              <div style={{textAlign:"center",padding:"10px 0 18px"}}>
                <div style={{fontSize:"2.5rem",marginBottom:8}}>📋</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:"1rem",color:"var(--navy)",marginBottom:6}}>{confirmGroup.name} Group</div>
                <div style={{fontSize:"0.82rem",color:"var(--muted)",marginBottom:4}}>{formatDate(selectedDate)}</div>
                <div style={{fontSize:"0.9rem",fontWeight:700,color:"var(--navy)",margin:"12px 0"}}>
                  {getGroupStats(confirmGroup.id,selectedDate).present} Present · {getGroupStats(confirmGroup.id,selectedDate).absent} Absent
                </div>
                <p style={{fontSize:"0.78rem",color:"var(--red)",background:"#FFF5F5",padding:"8px 12px",borderRadius:8,marginBottom:16}}>
                  ⚠️ Once submitted, you <strong>cannot edit</strong> this attendance. The Pastor and Secretary will be notified.
                </p>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-outline" style={{flex:1}} onClick={()=>setConfirmGroup(null)}>Cancel</button>
                  <button className="btn btn-success" style={{flex:1}} onClick={()=>handleSubmit(confirmGroup)}>✅ Confirm & Send</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ABSENT CALL LIST — shows when any member is absent ── */}
        {(()=>{
          const absentMembers=members
            .filter(m=>visibleGroups.some(g=>g.id===m.groupId))
            .filter(m=>!isPresent(selectedDate,m.id));
          if(absentMembers.length===0) return null;
          return(
            <div className="card" style={{border:"1.5px solid var(--red)",background:"#FFF8F8",padding:0,overflow:"hidden"}}>
              <div style={{background:"var(--red)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{color:"white",fontWeight:700,fontSize:"0.88rem"}}>📞 Follow-up Call List</div>
                <span style={{background:"rgba(255,255,255,0.25)",color:"white",borderRadius:20,padding:"2px 10px",fontSize:"0.7rem",fontWeight:700}}>{absentMembers.length} absent</span>
              </div>
              <div style={{padding:"8px 14px 12px"}}>
                <div style={{fontSize:"0.72rem",color:"var(--muted)",marginBottom:10}}>
                  Tap the call button to contact absent members directly.
                </div>
                {absentMembers.map(m=>{
                  const grp=groups.find(g=>g.id===m.groupId);
                  return(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #FFE5E5"}}>
                      <MemberAvatar member={m} group={grp} size={36} fontSize="0.7rem"/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:"0.85rem",color:"var(--navy)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.name}</div>
                        <div style={{fontSize:"0.68rem",color:"var(--muted)",display:"flex",gap:6,marginTop:1,flexWrap:"wrap"}}>
                          <span>{CAT_ICONS[m.category]} {m.category}</span>
                          {m.residence&&<span>📍 {m.residence}</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        {m.phone
                          ?<div style={{display:"flex",gap:5,flexShrink:0}}>
                              <a href={`tel:${m.phone}`}
                                style={{display:"flex",alignItems:"center",gap:4,background:"var(--green)",color:"white",
                                  borderRadius:20,padding:"6px 12px",fontSize:"0.72rem",fontWeight:700,textDecoration:"none"}}>
                                📞 Call
                              </a>
                              <a href={`https://wa.me/${m.phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                                style={{display:"flex",alignItems:"center",gap:4,background:"#25D366",color:"white",
                                  borderRadius:20,padding:"6px 12px",fontSize:"0.72rem",fontWeight:700,textDecoration:"none"}}>
                                💬 WA
                              </a>
                            </div>
                          :<span style={{fontSize:"0.68rem",color:"var(--muted)",fontStyle:"italic",padding:"6px 8px",background:"#F0F0F0",borderRadius:16}}>No number</span>
                        }
                      </div>
                    </div>
                  );
                })}
                {absentMembers.filter(m=>!m.phone).length>0&&(
                  <div style={{marginTop:8,padding:"8px 10px",background:"#FFF0F0",borderRadius:8,fontSize:"0.7rem",color:"var(--red)"}}>
                    ⚠️ {absentMembers.filter(m=>!m.phone).length} absent member{absentMembers.filter(m=>!m.phone).length>1?"s have":" has"} no phone number recorded. Ask Pastor to update their profile.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {visibleGroups.map(group=>{
          const stats=getGroupStats(group.id,selectedDate);
          const gm=members.filter(m=>m.groupId===group.id);
          const open=exp===group.id;
          const submitted=isSubmitted(group.id,selectedDate);
          const subInfo=submittedAtt[submitKey(group.id,selectedDate)];
          return(
            <div key={group.id} className="card" style={{padding:0,overflow:"hidden",border:submitted?"2px solid var(--green)":""}}>
              <div style={{padding:"11px 14px",background:group.color+"15",borderBottom:"1px solid "+group.color+"30",cursor:"pointer",display:"flex",alignItems:"center",gap:9}}
                onClick={()=>setExp(open?null:group.id)}>
                <div style={{width:11,height:11,borderRadius:"50%",background:group.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,color:"var(--navy)",fontSize:"0.92rem"}}>{group.name}</div>
                  <div style={{fontSize:"0.68rem",color:"var(--muted)"}}>{stats.present}/{stats.total} present · {stats.pct}%</div>
                </div>
                {submitted
                  ? <span className="badge badge-green">✅ Submitted</span>
                  : <><span className="badge badge-green">{stats.present}✓</span>{stats.absent>0&&<span className="badge badge-red">{stats.absent}✗</span>}</>
                }
                <span style={{color:"var(--muted)",fontSize:"0.9rem"}}>{open?"▲":"▼"}</span>
              </div>
              {open&&(
                <div style={{padding:"0 14px 12px"}}>
                  {submitted?(
                    <>
                      <div style={{background:"#D5F5E3",borderRadius:8,padding:"10px 12px",margin:"10px 0",textAlign:"center"}}>
                        <div style={{color:"var(--green)",fontWeight:700,fontSize:"0.85rem"}}>✅ Attendance Submitted</div>
                        <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:3}}>
                          Sent by {subInfo?.submittedBy} · {subInfo?.present}/{subInfo?.total} present
                        </div>
                      </div>
                      <p style={{fontWeight:700,fontSize:"0.8rem",color:"var(--navy)",margin:"10px 0 6px"}}>Attendance Record (Read-only)</p>
                      {gm.map(m=>(
                        <div className="member-row" key={m.id} style={{opacity:0.85}}>
                          <div className="avatar" style={{background:`linear-gradient(135deg,${group.color},var(--navy))`}}>{initials(m.name)}</div>
                          <div className="member-info">
                            <div className="member-name">{m.name}</div>
                            <span className="badge badge-gray" style={{fontSize:"0.6rem"}}>{CAT_ICONS[m.category]} {m.category}</span>
                          </div>
                          <span className={`badge ${isPresent(selectedDate,m.id)?"badge-green":"badge-red"}`} style={{fontSize:"0.72rem",padding:"4px 10px"}}>
                            {isPresent(selectedDate,m.id)?"✓ Present":"✗ Absent"}
                          </span>
                        </div>
                      ))}
                    </>
                  ):(
                    <>
                      <div style={{padding:"7px 0 3px",display:"flex",justifyContent:"flex-end"}}>
                        <button className="btn btn-success btn-sm" onClick={()=>markAllPresent(group.id)}>Mark All Present</button>
                      </div>
                      {gm.map(m=>(
                        <div className="member-row" key={m.id}>
                          <div className="avatar" style={{background:`linear-gradient(135deg,${group.color},var(--navy))`}}>{initials(m.name)}</div>
                          <div className="member-info">
                            <div className="member-name">{m.name}</div>
                            <span className="badge badge-gray" style={{fontSize:"0.6rem"}}>{CAT_ICONS[m.category]} {m.category}</span>
                          </div>
                          <button className={`att-btn ${isPresent(selectedDate,m.id)?"att-present":"att-absent"}`} onClick={()=>toggleAtt(m.id)}>
                            {isPresent(selectedDate,m.id)?"✓ Present":"Absent"}
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-navy btn-full" style={{marginTop:12}}
                        onClick={()=>setConfirmGroup(group)}>
                        📤 Submit Attendance to Pastor & Secretary
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };


  // ════════════════ CALL LIST TAB (leader) ═════════════════════
  const CallListTab=()=>{
    const [filter,setFilter]=useState("absent"); // absent | all
    const myGrpMembers=members.filter(m=>visibleGroups.some(g=>g.id===m.groupId));
    const absentToday=myGrpMembers.filter(m=>!isPresent(selectedDate,m.id));
    const displayList=filter==="absent"?absentToday:myGrpMembers;
    const noPhone=displayList.filter(m=>!m.phone);

    return(
      <div className="scroll-area">
        <ProfileBanner/>
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>

        {/* Filter toggle */}
        <div style={{display:"flex",gap:8,margin:"8px 12px"}}>
          {[["absent",`📞 Absent (${absentToday.length})`],["all",`👥 All Members (${myGrpMembers.length})`]].map(([key,label])=>(
            <button key={key} onClick={()=>setFilter(key)}
              style={{flex:1,padding:"8px 10px",borderRadius:20,border:`2px solid ${filter===key?"var(--red)":"var(--cream-dark)"}`,
                background:filter===key?"var(--red)":"white",color:filter===key?"white":"var(--muted)",
                fontWeight:700,fontSize:"0.75rem",cursor:"pointer"}}>
              {label}
            </button>
          ))}
        </div>

        {/* Summary card */}
        <div className="card" style={{background:"linear-gradient(135deg,var(--navy),#243260)",padding:"14px 16px",marginBottom:4}}>
          <div style={{display:"flex",justifyContent:"space-around",textAlign:"center"}}>
            <div>
              <div style={{color:"var(--gold)",fontSize:"1.6rem",fontWeight:700}}>{myGrpMembers.length}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:"0.65rem"}}>TOTAL</div>
            </div>
            <div>
              <div style={{color:"#2ECC71",fontSize:"1.6rem",fontWeight:700}}>{myGrpMembers.length-absentToday.length}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:"0.65rem"}}>PRESENT</div>
            </div>
            <div>
              <div style={{color:"#E74C3C",fontSize:"1.6rem",fontWeight:700}}>{absentToday.length}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:"0.65rem"}}>ABSENT</div>
            </div>
            <div>
              <div style={{color:"#F39C12",fontSize:"1.6rem",fontWeight:700}}>{noPhone.length}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:"0.65rem"}}>NO NUMBER</div>
            </div>
          </div>
          <div style={{textAlign:"center",marginTop:8,color:"rgba(255,255,255,0.45)",fontSize:"0.65rem"}}>
            {formatDate(selectedDate)}
          </div>
        </div>

        {displayList.length===0?(
          <div className="card" style={{textAlign:"center",padding:32}}>
            <div style={{fontSize:"2.5rem",marginBottom:8}}>{filter==="absent"?"🎉":"👥"}</div>
            <div style={{fontFamily:"Playfair Display,serif",color:"var(--navy)",fontWeight:700,marginBottom:4}}>
              {filter==="absent"?"All members present!":"No members found"}
            </div>
            <div style={{fontSize:"0.78rem",color:"var(--muted)"}}>
              {filter==="absent"?"Everyone attended today's service. Praise God! 🙌":"Add members in the My Group tab."}
            </div>
          </div>
        ):(
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",background:filter==="absent"?"#FFF0F0":"#F0F4FF",borderBottom:`2px solid ${filter==="absent"?"var(--red)":"var(--navy)"}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontWeight:700,fontSize:"0.85rem",color:filter==="absent"?"var(--red)":"var(--navy)"}}>
                {filter==="absent"?"📞 Members to Follow Up":"👥 Full Member List"}
              </div>
              <span style={{fontSize:"0.7rem",color:"var(--muted)"}}>{displayList.length} member{displayList.length!==1?"s":""}</span>
            </div>
            {displayList.map((m,idx)=>{
              const grp=groups.find(g=>g.id===m.groupId);
              const present=isPresent(selectedDate,m.id);
              return(
                <div key={m.id} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                  borderBottom:idx<displayList.length-1?"1px solid var(--cream-dark)":"none",
                  background:filter==="all"?(present?"#F0FFF4":"#FFF8F8"):"white"
                }}>
                  <MemberAvatar member={m} group={grp} size={40} fontSize="0.75rem"/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:"0.85rem",color:"var(--navy)",
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.name}</div>
                    <div style={{fontSize:"0.67rem",color:"var(--muted)",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                      <span>{CAT_ICONS[m.category]||"👤"} {m.category||"Member"}</span>
                      {m.residence&&<span>📍 {m.residence}</span>}
                      {filter==="all"&&<span className={`badge ${present?"badge-green":"badge-red"}`} style={{fontSize:"0.58rem",padding:"1px 6px"}}>
                        {present?"✓ Present":"✗ Absent"}
                      </span>}
                    </div>
                  </div>
                  {m.phone
                    ?<div style={{display:"flex",gap:5,flexShrink:0}}>
                        <a href={`tel:${m.phone}`}
                          style={{display:"flex",alignItems:"center",gap:4,background:"var(--green)",
                            color:"white",borderRadius:20,padding:"7px 12px",
                            fontSize:"0.72rem",fontWeight:700,textDecoration:"none"}}>
                          📞 Call
                        </a>
                        <a href={`https://wa.me/${m.phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                          style={{display:"flex",alignItems:"center",gap:4,background:"#25D366",
                            color:"white",borderRadius:20,padding:"7px 12px",
                            fontSize:"0.72rem",fontWeight:700,textDecoration:"none"}}>
                          💬 WA
                        </a>
                      </div>
                    :<span style={{fontSize:"0.65rem",color:"var(--muted)",fontStyle:"italic",
                        padding:"7px 10px",background:"#F0F0F0",borderRadius:16,flexShrink:0}}>
                        No number
                      </span>
                  }
                </div>
              );
            })}
          </div>
        )}

        {/* Warning about missing numbers */}
        {noPhone.length>0&&filter==="absent"&&(
          <div style={{margin:"0 12px 12px",padding:"10px 12px",background:"#FFF3CD",borderRadius:10,
            border:"1px solid #FFD700",fontSize:"0.72rem",color:"#856404"}}>
            ⚠️ <strong>{noPhone.length} absent member{noPhone.length>1?"s have":" has"} no phone number.</strong> Ask the Pastor to update their profile so you can reach them.
          </div>
        )}
      </div>
    );
  };

  // ════════════════ DASHBOARD (admin + leader) ══════════════════
  // ── PROFILE BANNER (Secretary + Leader portals) ─────────────
  const ProfileBanner=()=>{
    if(isAdmin) return null; // Pastor has full profile in Users tab
    return(
      <div style={{margin:"10px 12px 0",background:"linear-gradient(135deg,var(--navy),#243260)",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 16px rgba(26,39,68,0.18)"}}>
        <label style={{cursor:"pointer",position:"relative",flexShrink:0}}>
          {currentUser.photo
            ?<img src={currentUser.photo} alt={currentUser.name} style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",border:"2.5px solid var(--gold)",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}/>
            :<div style={{width:52,height:52,borderRadius:"50%",background:`linear-gradient(135deg,${ROLE_COLORS[currentUser.role]||"var(--gold)"},#0A1628)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.2rem",border:"2.5px solid var(--gold)"}}>
              {initials(currentUser.name)}
            </div>
          }
          <div style={{position:"absolute",bottom:1,right:1,width:16,height:16,borderRadius:"50%",background:"var(--gold)",border:"2px solid var(--navy)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.45rem"}}>📷</div>
          <input type="file" accept="image/*" style={{display:"none"}}
            onChange={async e=>{
              if(!e.target.files[0]) return;
              try{
                const compressed=await compressImage(e.target.files[0],120,0.8);
                setUsers(p=>p.map(x=>x.id===currentUser.id?{...x,photo:compressed}:x));
                const updated={...currentUser,photo:compressed};
                try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
                setCurrentUserState(updated);
                showAlert("Profile photo updated! ✓");
              }catch{showAlert("Could not process image","error");}
            }}/>
        </label>
        <div style={{flex:1}}>
          <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"0.95rem",color:"white"}}>{currentUser.name}</div>
          <div style={{fontSize:"0.65rem",color:"var(--gold)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginTop:1}}>{roleLabel}</div>
          <div style={{fontSize:"0.6rem",color:"rgba(255,255,255,0.45)",marginTop:2}}>Tap photo to update · 🔥 Live sync</div>
        </div>
      </div>
    );
  };




  // ── Birthday helpers ────────────────────────────────────────
  const getBirthdayAlerts=()=>{
    const today=new Date();
    const todayM=today.getMonth();
    const todayD=today.getDate();
    const alerts=[];
    members.forEach(m=>{
      if(!m.dob) return;
      const bd=new Date(m.dob);
      const monthDiff=bd.getMonth()-todayM;
      const dayDiff=bd.getDate()-todayD;
      const daysUntil=monthDiff*30+dayDiff;
      const grp=groups.find(g=>g.id===m.groupId);
      if(bd.getMonth()===todayM&&bd.getDate()===todayD){
        alerts.push({member:m,group:grp,type:"today",days:0,age:today.getFullYear()-bd.getFullYear()});
      } else {
        // Check within next 7 days
        const thisYearBd=new Date(today.getFullYear(),bd.getMonth(),bd.getDate());
        const diff=Math.ceil((thisYearBd-today)/(1000*60*60*24));
        if(diff>0&&diff<=7){
          alerts.push({member:m,group:grp,type:"soon",days:diff,age:today.getFullYear()-bd.getFullYear()});
        }
      }
    });
    return alerts.sort((a,b)=>a.days-b.days);
  };

  const DashboardTab=()=>{
    const total=getTotalStats(selectedDate);
    const todaySubs=Object.values(submittedAtt).filter(s=>s.date===todayStr());
    const pendingGroups=groups.filter(g=>!submittedAtt[`${g.id}_${todayStr()}`]);
    return(
      <div className="scroll-area">
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>

        {/* ── Birthday Alerts ── */}
        {(()=>{
          const alerts=getBirthdayAlerts();
          if(alerts.length===0) return null;
          return(
            <div className="card" style={{border:"2px solid var(--gold)",background:"linear-gradient(135deg,#FEF9EF,#FFFDF5)",padding:0,overflow:"hidden",margin:"0 0 4px"}}>
              <div style={{background:"linear-gradient(90deg,var(--gold),var(--gold-light))",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{color:"white",fontWeight:700,fontSize:"0.88rem"}}>🎂 Birthday Alerts</div>
                <span style={{background:"rgba(255,255,255,0.3)",color:"white",borderRadius:20,padding:"2px 10px",fontSize:"0.7rem",fontWeight:700}}>{alerts.length}</span>
              </div>
              <div style={{padding:"8px 14px 12px"}}>
                {alerts.map(({member:m,group:grp,type,days,age})=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #F5E9C8"}}>
                    <MemberAvatar member={m} group={grp} size={40} fontSize="0.72rem"/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:"0.85rem",color:"var(--navy)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.name}</div>
                      <div style={{fontSize:"0.7rem",color:"var(--muted)"}}>{grp?.name} · Turning {age}</div>
                    </div>
                    <div style={{textAlign:"center",flexShrink:0}}>
                      {type==="today"
                        ?<span style={{background:"var(--gold)",color:"white",borderRadius:20,padding:"4px 12px",fontSize:"0.72rem",fontWeight:700}}>🎉 Today!</span>
                        :<span style={{background:"#FEF3CD",color:"#856404",borderRadius:20,padding:"4px 10px",fontSize:"0.7rem",fontWeight:700}}>In {days}d</span>
                      }
                    </div>
                    {m.phone&&<div style={{display:"flex",gap:5,flexShrink:0}}>
                      <a href={`tel:${m.phone}`} style={{background:"var(--navy)",color:"white",borderRadius:20,padding:"6px 10px",fontSize:"0.7rem",fontWeight:700,textDecoration:"none"}}>📞</a>
                      <a href={`https://wa.me/${m.phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                        style={{background:"#25D366",color:"white",borderRadius:20,padding:"6px 10px",fontSize:"0.7rem",fontWeight:700,textDecoration:"none"}}>💬</a>
                    </div>}
                  </div>
                ))}
                <div style={{fontSize:"0.68rem",color:"var(--muted)",marginTop:6,textAlign:"center"}}>Birthdays today and within next 7 days</div>
              </div>
            </div>
          );
        })()}

        {/* ── Submission Notifications Panel ── */}
        {todaySubs.length>0&&(
          <div style={{margin:"8px 12px",borderRadius:12,overflow:"hidden",border:"1.5px solid var(--gold)"}}>
            <div style={{background:"var(--navy)",padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{color:"var(--gold-light)",fontWeight:700,fontSize:"0.8rem"}}>📥 Today's Submissions</span>
              <span className={`badge ${pendingGroups.length===0?"badge-green":"badge-gold"}`} style={{fontSize:"0.65rem"}}>
                {todaySubs.length}/{groups.length} groups
              </span>
            </div>
            <div style={{background:"white",padding:"8px 14px"}}>
              {groups.map(g=>{
                const sub=submittedAtt[`${g.id}_${todayStr()}`];
                return(
                  <div key={g.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:g.color,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:"0.8rem",fontWeight:600,color:"var(--navy)"}}>{g.name}</span>
                    {sub
                      ?<div style={{textAlign:"right"}}>
                        <span className="badge badge-green" style={{fontSize:"0.6rem"}}>✅ {sub.present}/{sub.total}</span>
                        <div style={{fontSize:"0.58rem",color:"var(--muted)",marginTop:1}}>by {sub.submittedBy}</div>
                      </div>
                      :<span className="badge badge-gray" style={{fontSize:"0.6rem"}}>⏳ Pending</span>
                    }
                  </div>
                );
              })}
              {pendingGroups.length>0&&(
                <div style={{marginTop:6,fontSize:"0.7rem",color:"var(--gold)",fontWeight:700}}>
                  ⏳ Still waiting: {pendingGroups.map(g=>g.name).join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
        {todaySubs.length===0&&(
          <div style={{margin:"8px 12px",background:"#FEF9EF",borderRadius:10,padding:"10px 14px",border:"1.5px solid var(--gold)"}}>
            <div style={{fontSize:"0.78rem",color:"var(--gold)",fontWeight:700}}>📋 No submissions yet today</div>
            <div style={{fontSize:"0.7rem",color:"var(--muted)",marginTop:2}}>Waiting for group leaders to submit attendance.</div>
          </div>
        )}

        <div className="stats-row">
          <div className="stat-box"><div className="stat-num">{total.total}</div><div className="stat-label">Total</div></div>
          <div className="stat-box"><div className="stat-num" style={{color:"var(--green)"}}>{total.present}</div><div className="stat-label">Present</div></div>
          <div className="stat-box"><div className="stat-num" style={{color:"var(--red)"}}>{total.absent}</div><div className="stat-label">Absent</div></div>
          <div className="stat-box"><div className="stat-num" style={{color:"var(--gold)"}}>{total.pct}%</div><div className="stat-label">Rate</div></div>
        </div>
        <p className="section-label">Group Stats</p>
        {groups.map(g=>{
          const st=getGroupStats(g.id,selectedDate);
          return(
            <div className="card" key={g.id} style={{padding:"11px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:g.color}}/>
                <span style={{fontFamily:"Playfair Display,serif",fontWeight:700,flex:1}}>{g.name}</span>
                <span style={{fontWeight:700,fontSize:"0.82rem",color:"var(--navy)"}}>{st.present}/{st.total}</span>
                <span className={`badge ${st.pct>=70?"badge-green":st.pct>=40?"badge-gold":"badge-red"}`}>{st.pct}%</span>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{width:st.pct+"%",background:`linear-gradient(90deg,${g.color},${g.color}99)`}}/></div>
              {st.absent>0&&<div style={{marginTop:5,fontSize:"0.7rem",color:"var(--red)"}}>
                ⚠ Absent: {members.filter(m=>m.groupId===g.id&&!isPresent(selectedDate,m.id)).map(m=>m.name.replace(/^(Elder|Deacon|Deaconess)\s+/i,"").split(" ")[0]).join(", ")}
              </div>}
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════ SEC TOTALS ══════════════════════════════════
  const SecTotalsTab=()=>{
    const total=getTotalStats(selectedDate);
    // Find today's submissions
    const todaySubmissions=Object.values(submittedAtt).filter(s=>s.date===selectedDate);
    const allGroupsSubmitted=groups.length>0&&groups.every(g=>!!submittedAtt[`${g.id}_${selectedDate}`]);
    return(
      <div className="scroll-area">
        <ProfileBanner/>
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>

        {/* Submission status banner */}
        {todaySubmissions.length>0&&(
          <div style={{margin:"8px 12px",background:allGroupsSubmitted?"#D5F5E3":"#FEF9EF",border:`1.5px solid ${allGroupsSubmitted?"var(--green)":"var(--gold)"}`,borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontWeight:700,fontSize:"0.82rem",color:allGroupsSubmitted?"var(--green)":"var(--gold)",marginBottom:6}}>
              {allGroupsSubmitted?"✅ All Groups Submitted":"📥 Attendance Submissions"}
            </div>
            {groups.map(g=>{
              const sub=submittedAtt[`${g.id}_${selectedDate}`];
              return(
                <div key={g.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,fontSize:"0.78rem"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:g.color,flexShrink:0}}/>
                  <span style={{flex:1,color:"var(--navy)",fontWeight:600}}>{g.name}</span>
                  {sub
                    ? <span className="badge badge-green" style={{fontSize:"0.62rem"}}>✅ {sub.present}/{sub.total} · by {sub.submittedBy}</span>
                    : <span className="badge badge-gray" style={{fontSize:"0.62rem"}}>⏳ Pending</span>
                  }
                </div>
              );
            })}
          </div>
        )}

        <div className="summary-banner">
          <h3>Live Attendance — {formatDate(selectedDate)}</h3>
          <div className="summary-grid">
            {[{l:"Enrolled",v:total.total},{l:"Present",v:total.present},{l:"Absent",v:total.absent}].map(s=>(
              <div className="summary-cell" key={s.l}><div className="summary-num">{s.v}</div><div className="summary-lbl">{s.l}</div></div>
            ))}
          </div>
          <div style={{marginTop:10,textAlign:"center"}}>
            <span className={`badge ${total.pct>=70?"badge-green":total.pct>=40?"badge-gold":"badge-red"}`} style={{fontSize:"0.82rem",padding:"4px 14px"}}>{total.pct}% Rate</span>
          </div>
        </div>
        <p className="section-label">By Group</p>
        {groups.map(g=>{
          const st=getGroupStats(g.id,selectedDate);
          return(
            <div className="card" key={g.id} style={{padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:g.color}}/>
                <span style={{fontFamily:"Playfair Display,serif",fontWeight:700,flex:1,fontSize:"0.92rem"}}>{g.name}</span>
                <span style={{fontWeight:700,fontSize:"0.82rem",color:"var(--navy)"}}>{st.present}/{st.total}</span>
                <span className={`badge ${st.pct>=70?"badge-green":st.pct>=40?"badge-gold":"badge-red"}`}>{st.pct}%</span>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{width:st.pct+"%",background:`linear-gradient(90deg,${g.color},${g.color}99)`}}/></div>
              {st.absent>0&&<div style={{marginTop:5,fontSize:"0.7rem",color:"var(--red)"}}>⚠ {members.filter(m=>m.groupId===g.id&&!isPresent(selectedDate,m.id)).map(m=>m.name.replace(/^(Elder|Deacon|Deaconess)\s+/i,"").split(" ")[0]).join(", ")}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════ SEC DAILY REPORT ═══════════════════════════
  const SecReportTab=()=>{
    const rpt=getReport(selectedDate);
    const total=getTotalStats(selectedDate);

    // ── PASTOR: read-only view with breakdown ───────────────────
    if(isAdmin){
      const hasData=rpt.offertory||rpt.tithe||rpt.visitors!=="0"||rpt.soulsWon!=="0"||rpt.holySpirit!=="0"||rpt.bibleStudy!=="0"||rpt.activities||rpt.notes;
      const Row=({icon,label,val})=>val&&val!=="0"?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--cream-dark)"}}>
          <span style={{fontSize:"0.82rem",color:"var(--muted)"}}>{icon} {label}</span>
          <span style={{fontWeight:700,fontSize:"0.9rem",color:"var(--navy)"}}>{val}</span>
        </div>
      ):null;
      return(
        <div className="scroll-area">
          <DatePicker value={selectedDate} onChange={setSelectedDate}/>
          <div style={{margin:"6px 12px",background:"#EBF5FB",border:"1.5px solid #2980B9",borderRadius:8,padding:"8px 12px",fontSize:"0.75rem",color:"#1A5276",display:"flex",alignItems:"center",gap:6}}>
            👁️ <span>Read-only view. Only the Secretary can edit this report.</span>
          </div>
          {rpt.serviceType&&<div style={{margin:"0 12px 4px",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:"0.68rem",color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}}>Service:</span>
            <span style={{padding:"4px 12px",borderRadius:20,background:"var(--navy)",color:"white",fontWeight:700,fontSize:"0.75rem"}}>{SERVICE_ICONS[rpt.serviceType]} {rpt.serviceType}</span>
          </div>}
          <div className="summary-banner">
            <h3>📊 {formatDate(selectedDate)}</h3>
            <div className="summary-grid">
              {[{l:"Enrolled",v:total.total},{l:"Present",v:total.present},{l:"Rate",v:total.pct+"%"}].map(s=>(
                <div className="summary-cell" key={s.l}><div className="summary-num">{s.v}</div><div className="summary-lbl">{s.l}</div></div>
              ))}
            </div>
          </div>
          {hasData&&(
            <>
              <div className="card">
                <div className="card-title">💰 Financial Records</div>
                <Row icon="🪙" label="Offertory ({CHURCH_CONFIG.CURRENCY})" val={rpt.offertory}/>
                <Row icon="💵" label="Tithe ({CHURCH_CONFIG.CURRENCY})" val={rpt.tithe}/>
                {!rpt.offertory&&!rpt.tithe&&<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>No financial data.</div>}
              </div>
              <div className="card">
                <div className="card-title">🌱 Spiritual Records</div>
                <Row icon="🙋" label="Visitors" val={rpt.visitors}/>
                <Row icon="✨" label="Souls Won" val={rpt.soulsWon}/>
                <Row icon="🕊️" label="Holy Spirit Baptism" val={rpt.holySpirit}/>
                <Row icon="📖" label="Bible Study Attendance" val={rpt.bibleStudy}/>
              </div>
              {(rpt.activities||rpt.notes)&&(
                <div className="card">
                  <div className="card-title">📌 Activities & Notes</div>
                  {rpt.activities&&<div style={{marginBottom:8}}><div style={{fontSize:"0.68rem",color:"var(--muted)",marginBottom:3}}>🗓️ Activities</div><div style={{fontSize:"0.85rem"}}>{rpt.activities}</div></div>}
                  {rpt.notes&&<div><div style={{fontSize:"0.68rem",color:"var(--muted)",marginBottom:3}}>📝 Secretary Notes</div><div style={{fontSize:"0.85rem",fontStyle:"italic"}}>{rpt.notes}</div></div>}
                </div>
              )}
            </>
          )}
          {!hasData&&<div className="card" style={{textAlign:"center",padding:"24px 16px"}}><div style={{fontSize:"2rem",marginBottom:8}}>📋</div><div style={{color:"var(--muted)",fontSize:"0.85rem"}}>No report submitted yet for this date.</div></div>}
          <p className="section-label">🔢 Attendance Breakdown</p>
          <div className="demo-grid">
            {CATEGORIES.map(cat=>{
              const cm=members.filter(m=>m.category===cat);
              const pres=cm.filter(m=>isPresent(selectedDate,m.id)).length;
              const pct=cm.length?Math.round(pres/cm.length*100):0;
              if(cm.length===0)return null;
              return(
                <div className="demo-box" key={cat}>
                  <div className="demo-label">{CAT_ICONS[cat]} {cat}</div>
                  <div className="demo-val">{pres}<span style={{fontSize:"0.75rem",color:"var(--muted)",fontFamily:"Lato,sans-serif"}}>/{cm.length}</span></div>
                  <div style={{margin:"4px 0 2px"}} className="progress-bar"><div className="progress-fill" style={{width:pct+"%"}}/></div>
                  <div className="demo-sub">{cm.length-pres} absent · {pct}%</div>
                </div>
              );
            })}
          </div>
          <p className="section-label">By Group — <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:"0.72rem"}}>tap to see present & absent</span></p>
          {groups.map(g=>{
            const st=getGroupStats(g.id,selectedDate);
            const gm=members.filter(m=>m.groupId===g.id);
            const presentList=gm.filter(m=>isPresent(selectedDate,m.id));
            const absentList=gm.filter(m=>!isPresent(selectedDate,m.id));
            const cig={};CATEGORIES.forEach(cat=>{const cm=gm.filter(m=>m.category===cat);cig[cat]={total:cm.length,present:cm.filter(m=>isPresent(selectedDate,m.id)).length};});
            return(<BdGroup key={g.id} g={g} st={st} gm={gm} presentList={presentList} absentList={absentList} cig={cig}/>);
          })}
          <div style={{margin:"8px 12px"}}>
            <button className="btn btn-primary btn-full" onClick={()=>setModal({type:"printReport",date:selectedDate})}>🖨️ Print / Save as PDF</button>
          </div>
        </div>
      );
    }

    // ── SECRETARY: delegate to standalone component (keeps keyboard alive) ──
    return(
      <>
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>
        <SecReportForm
          date={selectedDate}
          rpt={rpt}
          groups={groups}
          members={members}
          isPresent={isPresent}
          getGroupStats={getGroupStats}
          saveReport={saveReport}
          setModal={setModal}
          showAlert={showAlert}
          SERVICE_TYPES={SERVICE_TYPES}
          SERVICE_ICONS={SERVICE_ICONS}
          CATEGORIES={CATEGORIES}
          CAT_ICONS={CAT_ICONS}
        />
      </>
    );
  };

  // ════════════════ BREAKDOWN ═══════════════════════════════════
  const BreakdownTab=()=>{
    const catStats=getCategoryStats(selectedDate);
    const total=getTotalStats(selectedDate);
    return(
      <div className="scroll-area">
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>
        <div className="summary-banner">
          <h3>Attendance Breakdown — {formatDate(selectedDate)}</h3>
          <div className="summary-grid">
            {[{l:"Enrolled",v:total.total},{l:"Present",v:total.present},{l:"Rate",v:total.pct+"%"}].map(s=>(
              <div className="summary-cell" key={s.l}><div className="summary-num">{s.v}</div><div className="summary-lbl">{s.l}</div></div>
            ))}
          </div>
        </div>
        <p className="section-label">By Member Category</p>
        <div className="demo-grid">
          {CATEGORIES.map(cat=>{
            const s=catStats[cat];
            const pct=s.total?Math.round(s.present/s.total*100):0;
            return(
              <div className="demo-box" key={cat}>
                <div className="demo-label">{CAT_ICONS[cat]} {cat}</div>
                <div className="demo-val">{s.present}<span style={{fontSize:"0.75rem",color:"var(--muted)",fontFamily:"Lato,sans-serif"}}>/{s.total}</span></div>
                <div style={{margin:"4px 0 2px"}} className="progress-bar"><div className="progress-fill" style={{width:pct+"%"}}/></div>
                <div className="demo-sub">{s.total-s.present} absent · {pct}%</div>
              </div>
            );
          })}
        </div>
        <p className="section-label">By Group (with Category Detail)</p>
        {groups.map(g=>{
          const st=getGroupStats(g.id,selectedDate);
          const gm=members.filter(m=>m.groupId===g.id);
          const cig={};CATEGORIES.forEach(cat=>{const cm=gm.filter(m=>m.category===cat);cig[cat]={total:cm.length,present:cm.filter(m=>isPresent(selectedDate,m.id)).length};});
          return(
            <div className="card" key={g.id}>
              <div className="card-title">
                <div style={{width:10,height:10,borderRadius:"50%",background:g.color,flexShrink:0}}/>{g.name}
                <span style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:"0.82rem",color:"var(--navy)"}}>{st.present}/{st.total}</span>
                  <span className={`badge ${st.pct>=70?"badge-green":st.pct>=40?"badge-gold":"badge-red"}`}>{st.pct}%</span>
                </span>
              </div>
              <div className="progress-bar" style={{marginBottom:10}}><div className="progress-fill" style={{width:st.pct+"%",background:`linear-gradient(90deg,${g.color},${g.color}88)`}}/></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                {CATEGORIES.map(cat=>{const ci=cig[cat];if(ci.total===0)return null;return(
                  <div key={cat} style={{background:"var(--cream)",borderRadius:7,padding:"6px 5px",textAlign:"center"}}>
                    <div style={{fontSize:"0.95rem"}}>{CAT_ICONS[cat]}</div>
                    <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--navy)"}}>{ci.present}/{ci.total}</div>
                    <div style={{fontSize:"0.58rem",color:"var(--muted)"}}>{cat}</div>
                  </div>
                );})}
              </div>
              {st.absent>0&&<div style={{marginTop:8,fontSize:"0.7rem",color:"var(--red)",background:"#FFF5F5",borderRadius:6,padding:"5px 8px"}}>
                ⚠ Absent: {gm.filter(m=>!isPresent(selectedDate,m.id)).map(m=>m.name.replace(/^(Elder|Deacon|Deaconess)\s+/i,"").split(" ")[0]).join(", ")}
              </div>}
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════ HISTORY ════════════════════════════════════
  const HistoryTab=()=>{
    const dates=[...new Set(Object.keys(attendance).map(k=>k.split("|")[0]))].sort().reverse();
    if(dates.length===0)dates.push(selectedDate);
    const exportCSV=()=>{
      const rows=[["Date","Group","Member","Category","Status","Offertory","Tithe","Visitors","Souls Won","HS Baptism","Bible Study","Activities","Notes"]];
      dates.forEach(date=>{const rpt=getReport(date);members.forEach((m,i)=>{const grp=groups.find(g=>g.id===m.groupId);rows.push([date,grp?.name||"",m.name,m.category,isPresent(date,m.id)?"Present":"Absent",i===0?rpt.offertory:"",i===0?rpt.tithe:"",i===0?rpt.visitors:"",i===0?rpt.soulsWon:"",i===0?rpt.holySpirit:"",i===0?rpt.bibleStudy:"",i===0?rpt.activities:"",i===0?rpt.notes:""]);});});
      const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`church-report-${todayStr()}.csv`;a.click();
      showAlert("Full report exported!");
    };
    return(
      <div className="scroll-area">
        <div style={{margin:"10px 12px",display:"flex",gap:8}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={exportCSV}>⬇ Export CSV</button>
          {dates[0]&&<button className="btn btn-navy" style={{flex:1}} onClick={()=>setModal({type:"printReport",date:dates[0]})}>🖨️ Print Latest</button>}
        </div>
        {dates.map(date=>{
          const stats=getTotalStats(date);const rpt=getReport(date);
          return(
            <div className="card" key={date} style={{padding:"13px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
                <div>
                  <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"0.92rem"}}>{formatDate(date)}</div>
                  <div style={{fontSize:"0.7rem",color:"var(--muted)",marginTop:1}}>{stats.present} present · {stats.absent} absent</div>
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <span className={`badge ${stats.pct>=70?"badge-green":stats.pct>=40?"badge-gold":"badge-red"}`}>{stats.pct}%</span>
                  <button className="btn btn-outline btn-sm" onClick={()=>setModal({type:"printReport",date})}>🖨️</button>
                </div>
              </div>
              <div className="progress-bar" style={{marginBottom:8}}><div className="progress-fill" style={{width:stats.pct+"%"}}/></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {rpt.offertory&&<span className="badge badge-green">🪙 {CHURCH_CONFIG.CURRENCY} {rpt.offertory}</span>}
                {rpt.tithe&&<span className="badge badge-gold">💵 {CHURCH_CONFIG.CURRENCY} {rpt.tithe}</span>}
                {rpt.visitors!=="0"&&rpt.visitors&&<span className="badge badge-blue">🙋 {rpt.visitors}</span>}
                {rpt.soulsWon!=="0"&&rpt.soulsWon&&<span className="badge badge-purple">✨ {rpt.soulsWon} souls</span>}
                {rpt.holySpirit!=="0"&&rpt.holySpirit&&<span className="badge badge-teal">🕊️ {rpt.holySpirit}</span>}
                {rpt.bibleStudy!=="0"&&rpt.bibleStudy&&<span className="badge badge-blue">📖 {rpt.bibleStudy}</span>}
                {rpt.activities&&<span className="badge badge-gray">📌 {rpt.activities}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════ MEMBERS (multi-role) ═══════════════════════
  // canEdit=true → Pastor only (add/edit/delete)
  // groupFilter → Leader only sees their group
  const MembersTab=({canEdit=false,groupFilter=null})=>{
    const [search,setSearch]=useState("");
    const [fg,setFg]=useState("all");
    const [fc,setFc]=useState("all");
    const [viewM,setViewM]=useState(null);
    const [editM,setEditM]=useState(null);
    const [addMode,setAddMode]=useState(null);
    const [aName,setAName]=useState("");
    const [aGid,setAGid]=useState(groups[0]?.id||"");
    const [aCat,setACat]=useState("Male");
    const [aGender,setAGender]=useState("Male");
    const [aPhone,setAPhone]=useState("");
    const [aRes,setARes]=useState("");
    const [aOcc,setAOcc]=useState("");
    const [aDob,setADob]=useState("");
    const [addGroupName,setAddGroupName]=useState("");
    const [aPhoto,setAPhoto]=useState(null);
    const [photoLoading,setPhotoLoading]=useState(false);

    const handlePhotoUpload=async(file,setFn)=>{
      if(!file)return;
      if(file.size>10*1024*1024){showAlert("Photo too large. Please choose a smaller image.","error");return;}
      setPhotoLoading(true);
      try{
        const compressed=await compressImage(file);
        setFn(compressed);
      }catch(err){
        showAlert("Could not process image. Try another photo.","error");
      }finally{setPhotoLoading(false);}
    };

    // Leader photo update — saves directly to member record in Firebase
    const handleLeaderPhotoUpdate=async(file,memberId)=>{
      if(!file)return;
      if(file.size>10*1024*1024){showAlert("Photo too large. Please choose a smaller image.","error");return;}
      setPhotoLoading(true);
      try{
        const compressed=await compressImage(file);
        setMembers(p=>p.map(m=>m.id===memberId?{...m,photo:compressed}:m));
        // Update viewM so modal shows new photo instantly
        setViewM(prev=>prev?{...prev,photo:compressed}:prev);
        showAlert("📸 Photo updated successfully!","success");
      }catch(err){
        showAlert("Could not process image. Try another photo.","error");
      }finally{setPhotoLoading(false);}
    };

    const base=groupFilter?members.filter(m=>m.groupId===groupFilter):members;
    const filtered=base.filter(m=>
      m.name.toLowerCase().includes(search.toLowerCase())&&
      (fg==="all"||m.groupId===fg)&&
      (fc==="all"||m.category===fc)
    );

    const saveMember=()=>{
      if(!aName.trim()){showAlert("Full name required","error");return;}
      setMembers(p=>[...p,{id:"m"+Date.now(),name:aName.trim(),groupId:aGid,category:aCat,gender:aGender,phone:aPhone.trim(),residence:aRes.trim(),occupation:aOcc.trim(),dob:aDob||"",photo:aPhoto||null}]);
      showAlert(`${aName} added!`);setAName("");setAPhone("");setARes("");setAOcc("");setADob("");setAPhoto(null);setAddMode(null);
    };
    const saveGroup=()=>{
      if(!addGroupName.trim())return;
      const color=GROUP_COLORS[groups.length%GROUP_COLORS.length];
      setGroups(p=>[...p,{id:"g"+Date.now(),name:addGroupName.trim(),color}]);
      showAlert(`Group "${addGroupName}" created!`);setAddGroupName("");setAddMode(null);
    };
    const saveEdit=()=>{
      setMembers(p=>p.map(m=>m.id===editM.id?{...editM}:m));
      showAlert("Member updated!");setEditM(null);
    };
    const deleteMember=id=>{setMembers(p=>p.filter(m=>m.id!==id));showAlert("Member removed","info");};

    return(
      <div className="scroll-area">

        {/* ── Profile view modal (all roles) ── */}
        {viewM&&(()=>{
          const grp=groups.find(g=>g.id===viewM.groupId);
          const fields=[
            {icon:"👤",label:"Full Name",val:viewM.name},
            {icon:"👥",label:"Group",val:grp?.name},
            {icon:"🏷️",label:"Category",val:`${CAT_ICONS[viewM.category]||""} ${viewM.category||""}`},
            {icon:"⚧",label:"Gender",val:viewM.gender},
            {icon:"📞",label:"Telephone",val:viewM.phone},
            {icon:"📍",label:"Residence",val:viewM.residence},
            {icon:"💼",label:"Occupation",val:viewM.occupation},
            {icon:"🎂",label:"Date of Birth",val:viewM.dob?new Date(viewM.dob).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):""},
          ].filter(f=>f.val&&String(f.val).trim());
          return(
            <div className="modal-overlay" onClick={()=>setViewM(null)}>
              <div className="modal" onClick={e=>e.stopPropagation()}>
                <div className="modal-title">👤 Member Profile <span style={{cursor:"pointer"}} onClick={()=>setViewM(null)}>✕</span></div>
                <div style={{textAlign:"center",margin:"4px 0 16px"}}>
                  <div style={{position:"relative",display:"inline-block",marginBottom:10}}>
                    <label style={{cursor:groupFilter?"pointer":"default",display:"block",position:"relative"}}>
                      {viewM.photo
                        ?<img src={viewM.photo} alt={viewM.name} style={{width:80,height:80,borderRadius:"50%",objectFit:"cover",border:`3px solid ${grp?.color||"var(--gold)"}`,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",opacity:photoLoading?0.5:1}}/>
                        :<div style={{width:80,height:80,borderRadius:"50%",background:`linear-gradient(135deg,${grp?.color||"#888"},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.8rem",opacity:photoLoading?0.5:1}}>{initials(viewM.name)}</div>
                      }
                      {/* Camera icon badge — always show for leaders, cross for others */}
                      <div style={{position:"absolute",bottom:2,right:2,width:22,height:22,borderRadius:"50%",
                        background:groupFilter?"var(--gold)":grp?.color||"var(--navy)",
                        border:"2px solid white",display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:"0.6rem",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}>
                        {groupFilter?(photoLoading?"⏳":"📷"):"✝"}
                      </div>
                      {/* Hidden file input — only active for leaders */}
                      {groupFilter&&(
                        <input type="file" accept="image/*" capture="environment"
                          style={{display:"none"}}
                          onChange={e=>e.target.files[0]&&handleLeaderPhotoUpdate(e.target.files[0],viewM.id)}/>
                      )}
                    </label>
                  </div>
                  {/* Tap hint for leaders */}
                  {groupFilter&&(
                    <div style={{fontSize:"0.65rem",color:"var(--gold)",fontWeight:700,marginBottom:4}}>
                      {photoLoading?"⏳ Saving photo...":"📷 Tap photo to take/change"}
                    </div>
                  )}
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.05rem",fontWeight:700,color:"var(--navy)"}}>{viewM.name}</div>
                  {/* Camera buttons for leader — take photo or upload from gallery */}
                  {groupFilter&&!photoLoading&&(
                    <div style={{display:"flex",gap:8,marginTop:8,justifyContent:"center"}}>
                      <label style={{display:"flex",alignItems:"center",gap:5,background:"var(--navy)",color:"white",
                        borderRadius:20,padding:"6px 14px",fontSize:"0.72rem",fontWeight:700,cursor:"pointer"}}>
                        📷 Camera
                        <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                          onChange={e=>e.target.files[0]&&handleLeaderPhotoUpdate(e.target.files[0],viewM.id)}/>
                      </label>
                      <label style={{display:"flex",alignItems:"center",gap:5,background:"var(--gold)",color:"white",
                        borderRadius:20,padding:"6px 14px",fontSize:"0.72rem",fontWeight:700,cursor:"pointer"}}>
                        🖼️ Gallery
                        <input type="file" accept="image/*" style={{display:"none"}}
                          onChange={e=>e.target.files[0]&&handleLeaderPhotoUpdate(e.target.files[0],viewM.id)}/>
                      </label>
                      {viewM.photo&&(
                        <button onClick={()=>{setMembers(p=>p.map(m=>m.id===viewM.id?{...m,photo:null}:m));setViewM(prev=>({...prev,photo:null}));}}
                          style={{display:"flex",alignItems:"center",gap:4,background:"#FFF0F0",color:"var(--red)",
                            border:"1px solid #FAD7D7",borderRadius:20,padding:"6px 12px",fontSize:"0.72rem",fontWeight:700,cursor:"pointer"}}>
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {fields.map(f=>(
                    <div key={f.label} style={{display:"flex",alignItems:"center",gap:10,background:"var(--cream)",borderRadius:8,padding:"8px 12px"}}>
                      <span style={{fontSize:"1rem",width:22,textAlign:"center",flexShrink:0}}>{f.icon}</span>
                      <div>
                        <div style={{fontSize:"0.6rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>{f.label}</div>
                        <div style={{fontSize:"0.88rem",fontWeight:600,color:"var(--navy)"}}>{f.val}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {canEdit&&<button className="btn btn-navy btn-full" style={{marginTop:14}} onClick={()=>{setEditM({...viewM});setViewM(null);}}>✏️ Edit Details</button>}
              </div>
            </div>
          );
        })()}

        {/* ── Edit modal (Pastor only) ── */}
        {editM&&(
          <div className="modal-overlay" onClick={()=>setEditM(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-title">✏️ Edit Member <span style={{cursor:"pointer"}} onClick={()=>setEditM(null)}>✕</span></div>
              <input className="input" placeholder="Full Name *" value={editM.name} onChange={e=>setEditM(p=>({...p,name:e.target.value}))}/>
              <select className="select" value={editM.groupId||""} onChange={e=>setEditM(p=>({...p,groupId:e.target.value}))}>
                {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select className="select" value={editM.category||"Male"} onChange={e=>setEditM(p=>({...p,category:e.target.value}))}>
                {CATEGORIES.map(cat=><option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>)}
              </select>
              <select className="select" value={editM.gender||"Male"} onChange={e=>setEditM(p=>({...p,gender:e.target.value}))}>
                <option value="Male">Male</option><option value="Female">Female</option>
              </select>
              <input className="input" placeholder="📞 Telephone" value={editM.phone||""} onChange={e=>setEditM(p=>({...p,phone:e.target.value}))}/>
              <input className="input" placeholder="📍 Residence" value={editM.residence||""} onChange={e=>setEditM(p=>({...p,residence:e.target.value}))}/>
              <input className="input" placeholder="💼 Occupation" value={editM.occupation||""} onChange={e=>setEditM(p=>({...p,occupation:e.target.value}))}/>
              <div style={{marginBottom:4}}>
                <div style={{fontSize:"0.72rem",color:"var(--muted)",fontWeight:700,marginBottom:4}}>🎂 Date of Birth (optional)</div>
                <input className="input" type="date" value={editM.dob||""} onChange={e=>setEditM(p=>({...p,dob:e.target.value}))} style={{marginBottom:0}}/>
              </div>
              {/* Photo upload in edit */}
              <div style={{marginTop:4}}>
                <div style={{fontSize:"0.72rem",color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>📸 Member Photo</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {editM.photo
                    ?<img src={editM.photo} alt="preview" style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--gold)"}}/>
                    :<div style={{width:52,height:52,borderRadius:"50%",background:"var(--cream-dark)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.4rem"}}>👤</div>
                  }
                  <div style={{flex:1}}>
                    <label style={{display:"block",padding:"8px 14px",background:"var(--navy)",color:"white",borderRadius:8,textAlign:"center",fontSize:"0.75rem",fontWeight:700,cursor:photoLoading?"not-allowed":"pointer"}}>
                      {photoLoading?"⏳ Processing...":editM.photo?"🔄 Change Photo":"📷 Upload Photo"}
                      <input type="file" accept="image/*" style={{display:"none"}}
                        onChange={e=>handlePhotoUpload(e.target.files[0],photo=>setEditM(p=>({...p,photo})))} disabled={photoLoading}/>
                    </label>
                    {editM.photo&&<button style={{marginTop:4,width:"100%",padding:"4px",background:"transparent",border:"1px solid var(--red)",borderRadius:6,color:"var(--red)",fontSize:"0.68rem",cursor:"pointer"}} onClick={()=>setEditM(p=>({...p,photo:null}))}>✕ Remove photo</button>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button className="btn btn-outline" style={{flex:1}} onClick={()=>setEditM(null)}>Cancel</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={saveEdit} disabled={photoLoading}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Search & filters ── */}
        <div style={{margin:"10px 12px 0",display:"flex",gap:7}}>
          <input className="input" placeholder="🔍 Search members..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,marginBottom:0}}/>
          {!groupFilter&&(
            <select className="select" value={fg} onChange={e=>setFg(e.target.value)} style={{flex:1,marginBottom:0}}>
              <option value="all">All Groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>
        <div style={{margin:"6px 12px 0"}}>
          <select className="select" value={fc} onChange={e=>setFc(e.target.value)} style={{marginBottom:0}}>
            <option value="all">All Categories</option>{CATEGORIES.map(cat=><option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>)}
          </select>
        </div>

        {/* ── Pastor-only action buttons ── */}
        {canEdit&&(
          <div style={{margin:"8px 12px",display:"flex",gap:7}}>
            <button className="btn btn-primary btn-sm" onClick={()=>setAddMode(addMode==="member"?null:"member")}>+ Add Member</button>
            <button className="btn btn-navy btn-sm" onClick={()=>setAddMode(addMode==="group"?null:"group")}>+ Add Group</button>
          </div>
        )}

        {/* ── Add member form ── */}
        {canEdit&&addMode==="member"&&(
          <div className="card" style={{background:"#FEF9EF",border:"1.5px solid var(--gold)"}}>
            <div className="card-title">➕ Add New Member</div>
            <input className="input" placeholder="Full Name *" value={aName} onChange={e=>setAName(e.target.value)}/>
            <select className="select" value={aGid} onChange={e=>setAGid(e.target.value)}>
              {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className="select" value={aCat} onChange={e=>setACat(e.target.value)}>
              {CATEGORIES.map(cat=><option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>)}
            </select>
            <select className="select" value={aGender} onChange={e=>setAGender(e.target.value)}>
              <option value="Male">Male</option><option value="Female">Female</option>
            </select>
            <input className="input" placeholder="📞 Telephone" value={aPhone} onChange={e=>setAPhone(e.target.value)}/>
            <input className="input" placeholder="📍 Residence" value={aRes} onChange={e=>setARes(e.target.value)}/>
            <input className="input" placeholder="💼 Occupation" value={aOcc} onChange={e=>setAOcc(e.target.value)}/>
            <div style={{marginBottom:4}}>
              <div style={{fontSize:"0.72rem",color:"var(--muted)",fontWeight:700,marginBottom:4}}>🎂 Date of Birth (optional)</div>
              <input className="input" type="date" value={aDob} onChange={e=>setADob(e.target.value)} style={{marginBottom:0}}/>
            </div>
            {/* Photo upload */}
            <div style={{marginTop:4}}>
              <div style={{fontSize:"0.72rem",color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>📸 Member Photo (optional)</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {aPhoto
                  ?<img src={aPhoto} alt="preview" style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--gold)"}}/>
                  :<div style={{width:52,height:52,borderRadius:"50%",background:"var(--cream-dark)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.4rem"}}>👤</div>
                }
                <div style={{flex:1}}>
                  <label style={{display:"block",padding:"8px 14px",background:"var(--navy)",color:"white",borderRadius:8,textAlign:"center",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>
                    {photoLoading?"⏳ Processing...":aPhoto?"🔄 Change Photo":"📷 Upload Photo"}
                    <input type="file" accept="image/*" style={{display:"none"}}
                      onChange={e=>handlePhotoUpload(e.target.files[0],setAPhoto)} disabled={photoLoading}/>
                  </label>
                  {aPhoto&&<button style={{marginTop:4,width:"100%",padding:"4px",background:"transparent",border:"1px solid var(--red)",borderRadius:6,color:"var(--red)",fontSize:"0.68rem",cursor:"pointer"}} onClick={()=>setAPhoto(null)}>✕ Remove photo</button>}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveMember} disabled={photoLoading}>Add Member</button>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>{setAddMode(null);setAPhoto(null);}}>Cancel</button>
            </div>
          </div>
        )}
        {canEdit&&addMode==="group"&&(
          <div className="card" style={{background:"#F0F4FF",border:"1.5px solid var(--navy)"}}>
            <div className="card-title">➕ Add New Group</div>
            <input className="input" placeholder="Group Name (e.g. Bereans)" value={addGroupName} onChange={e=>setAddGroupName(e.target.value)}/>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-navy" style={{flex:1}} onClick={saveGroup}>Create Group</button>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setAddMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Member list ── */}
        <div className="card">
          <div style={{fontSize:"0.72rem",color:"var(--muted)",marginBottom:8}}>
            {filtered.length} member{filtered.length!==1?"s":""} shown
            {groupFilter&&myGroup?` · ${myGroup.name}`:""}
          </div>
          {filtered.length===0&&<div style={{textAlign:"center",color:"var(--muted)",padding:16,fontSize:"0.82rem"}}>No members found</div>}
          {filtered.map(m=>{
            const grp=groups.find(g=>g.id===m.groupId);
            return(
              <div className="member-row" key={m.id} style={{cursor:"pointer"}} onClick={()=>setViewM(m)}>
                <MemberAvatar member={m} group={grp} size={38} fontSize="0.72rem"/>
                <div className="member-info" style={{flex:1}}>
                  <div className="member-name">{m.name}</div>
                  <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                    {!groupFilter&&<span className="badge badge-blue" style={{fontSize:"0.6rem"}}>{grp?.name}</span>}
                    <span className="badge badge-gray" style={{fontSize:"0.6rem"}}>{CAT_ICONS[m.category]} {m.category}</span>
                    {m.gender&&<span className="badge badge-teal" style={{fontSize:"0.6rem"}}>{m.gender}</span>}
                  </div>
                  {(m.phone||m.residence||m.occupation)&&(
                    <div style={{marginTop:3,fontSize:"0.62rem",color:"var(--muted)",display:"flex",gap:8,flexWrap:"wrap"}}>
                      {m.phone&&<span>📞 {m.phone}</span>}
                      {m.residence&&<span>📍 {m.residence}</span>}
                      {m.occupation&&<span>💼 {m.occupation}</span>}
                    </div>
                  )}
                </div>
                {canEdit&&(
                  <div style={{display:"flex",gap:4,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-sm" style={{background:"#EEF2FF",color:"var(--navy)",border:"1px solid #C5CAE9"}} onClick={()=>setEditM({...m})}>✏️</button>
                    <button className="btn btn-sm" style={{background:"#FFF0F0",color:"var(--red)",border:"1px solid #FAD7D7"}} onClick={()=>deleteMember(m.id)}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ════════════════ USERS (admin only) ═════════════════════════
  const UsersTab=()=>{
    const [addName,setAddName]=useState("");
    const [addPin,setAddPin]=useState("");
    const [addRole,setAddRole]=useState("leader");
    const [addGid,setAddGid]=useState(groups[0]?.id||"");
    const [showForm,setShowForm]=useState(false);
    const [pinModal,setPinModal]=useState(null); // {user} being edited
    const [newPin,setNewPin]=useState("");
    const [confirmPin,setConfirmPin]=useState("");
    const [pinSuccess,setPinSuccess]=useState("");

    const saveUser=async()=>{
      if(!addName.trim()||addPin.length<4){showAlert("Name and 4-digit PIN required","error");return;}
      for(const u of users){
        const dup=await verifyPin(addPin,u.pin,u.salt);
        if(dup){showAlert("PIN already in use. Choose another.","error");return;}
      }
      const {hash:hashed,salt:newSalt}=await hashPinWithSalt(addPin);
      setUsers(p=>[...p,{id:"u"+Date.now(),name:addName.trim(),role:addRole,pin:hashed,salt:newSalt,groupId:addRole==="leader"?addGid:null}]);
      showAlert(`${addName} (${addRole}) added!`);setAddName("");setAddPin("");setShowForm(false);
    };
    const deleteUser=id=>{
      if(id===currentUser.id){showAlert("Cannot delete yourself","error");return;}
      setUsers(p=>p.filter(u=>u.id!==id));showAlert("User removed","info");
    };
    const openPinModal=(user)=>{setPinModal(user);setNewPin("");setConfirmPin("");setPinSuccess("");};
    const savePin=async()=>{
      if(newPin.length<4){showAlert("PIN must be at least 4 digits","error");return;}
      if(newPin!==confirmPin){showAlert("PINs do not match","error");return;}
      // Check for duplicate PIN — verify against all other users
      for(const u of users){
        if(u.id===pinModal.id) continue;
        const dup=await verifyPin(newPin,u.pin,u.salt);
        if(dup){showAlert("PIN already in use. Choose another.","error");return;}
      }
      const {hash:hashed,salt:newSalt}=await hashPinWithSalt(newPin);
      setUsers(p=>p.map(u=>u.id===pinModal.id?{...u,pin:hashed,salt:newSalt}:u));
      // If pastor changed their own PIN, update session too
      if(pinModal.id===currentUser.id){
        const updated={...currentUser,pin:hashed,salt:newSalt};
        try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
      }
      setPinSuccess(`✅ PIN for ${pinModal.name} has been changed successfully!`);
      setNewPin("");setConfirmPin("");
    };

    const leaders=users.filter(u=>u.role==="leader");
    const secretaries=users.filter(u=>u.role==="secretary");
    const admins=users.filter(u=>u.role==="admin");

    const updateUserPhoto=async(u,file)=>{
      if(!file) return;
      try{
        const compressed=await compressImage(file,120,0.8);
        setUsers(p=>p.map(x=>x.id===u.id?{...x,photo:compressed}:x));
        if(u.id===currentUser.id){
          const updated={...currentUser,photo:compressed};
          try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
          setCurrentUserState(updated);
        }
        showAlert(`Photo updated for ${u.name}!`);
      }catch{showAlert("Could not process image","error");}
    };
    const removeUserPhoto=(u)=>{
      setUsers(p=>p.map(x=>x.id===u.id?{...x,photo:null}:x));
      if(u.id===currentUser.id){
        const updated={...currentUser,photo:null};
        try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
        setCurrentUserState(updated);
      }
      showAlert(`Photo removed for ${u.name}`,"info");
    };

    const UserRow=({u,avatarStyle,badge})=>(
      <div className="member-row" key={u.id} style={{flexWrap:"wrap",gap:6}}>
        {/* Avatar — click to upload photo */}
        <label style={{cursor:"pointer",flexShrink:0,position:"relative"}}>
          {u.photo
            ?<img src={u.photo} alt={u.name} style={{width:42,height:42,borderRadius:"50%",objectFit:"cover",border:"2.5px solid var(--gold)",boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}/>
            :<div className="avatar" style={{...avatarStyle,width:42,height:42}}>{initials(u.name)}</div>
          }
          <div style={{position:"absolute",bottom:0,right:0,width:15,height:15,borderRadius:"50%",background:"var(--navy)",border:"1.5px solid white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.45rem",color:"white"}}>📷</div>
          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>updateUserPhoto(u,e.target.files[0])}/>
        </label>
        <div className="member-info">
          <div className="member-name">{u.name}</div>
          <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
            {badge}
            <span className="badge badge-gray" style={{fontSize:"0.6rem"}}>PIN: {"•".repeat(Math.min(u.pin.length,6))}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          <button className="btn btn-sm" style={{background:"#EEF2FF",color:"var(--navy)",border:"1px solid #C5CAE9",fontSize:"0.68rem"}}
            onClick={()=>openPinModal(u)}>🔑 PIN</button>
          {u.photo&&<button className="btn btn-sm" style={{background:"#FFF8F0",color:"#E67E22",border:"1px solid #F5CBA7",fontSize:"0.68rem"}}
            onClick={()=>removeUserPhoto(u)}>🗑️</button>}
          {u.id!==currentUser.id&&(
            <button className="btn btn-sm" style={{background:"#FFF0F0",color:"var(--red)",border:"1px solid #FAD7D7"}} onClick={()=>deleteUser(u.id)}>✕</button>
          )}
        </div>
      </div>
    );

    return(
      <div className="scroll-area">
        {/* PIN Change Modal */}
        {pinModal&&(
          <div className="modal-overlay" onClick={()=>setPinModal(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-title">🔑 Change PIN <span style={{cursor:"pointer"}} onClick={()=>setPinModal(null)}>✕</span></div>
              <div style={{textAlign:"center",marginBottom:14}}>
                <div className="avatar" style={{margin:"0 auto 8px",width:44,height:44,fontSize:"1rem",background:"linear-gradient(135deg,var(--gold),var(--navy))"}}>{initials(pinModal.name)}</div>
                <div style={{fontWeight:700,color:"var(--navy)"}}>{pinModal.name}</div>
                <div style={{fontSize:"0.72rem",color:"var(--muted)",textTransform:"capitalize"}}>{pinModal.role}</div>
              </div>
              {pinSuccess?(
                <div style={{background:"#D5F5E3",border:"1.5px solid var(--green)",borderRadius:10,padding:"14px",textAlign:"center",marginBottom:12}}>
                  <div style={{fontSize:"1.6rem",marginBottom:6}}>✅</div>
                  <div style={{color:"var(--green)",fontWeight:700,fontSize:"0.88rem"}}>{pinSuccess}</div>
                  <button className="btn btn-navy btn-full" style={{marginTop:12}} onClick={()=>setPinModal(null)}>Done</button>
                </div>
              ):(
                <>
                  <label style={{fontSize:"0.75rem",fontWeight:700,color:"#555",display:"block",marginBottom:5}}>NEW PIN</label>
                  <input className="input" type="password" inputMode="numeric" placeholder="Enter new PIN" maxLength={6}
                    value={newPin} onChange={e=>setNewPin(e.target.value)}
                    style={{fontSize:"1.1rem",letterSpacing:"6px",textAlign:"center"}}/>
                  <label style={{fontSize:"0.75rem",fontWeight:700,color:"#555",display:"block",marginBottom:5}}>CONFIRM NEW PIN</label>
                  <input className="input" type="password" inputMode="numeric" placeholder="Re-enter new PIN" maxLength={6}
                    value={confirmPin} onChange={e=>setConfirmPin(e.target.value)}
                    style={{fontSize:"1.1rem",letterSpacing:"6px",textAlign:"center"}}
                    onKeyDown={e=>e.key==="Enter"&&savePin()}/>
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button className="btn btn-outline" style={{flex:1}} onClick={()=>setPinModal(null)}>Cancel</button>
                    <button className="btn btn-navy" style={{flex:1}} onClick={savePin}>Save PIN</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{margin:"10px 12px"}}>
          <button className="btn btn-primary btn-full" onClick={()=>setShowForm(!showForm)}>
            {showForm?"✕ Cancel":"+ Add Leader or Secretary"}
          </button>
        </div>

        {showForm&&(
          <div className="card" style={{background:"#FEF9EF",border:"1.5px solid var(--gold)"}}>
            <div className="card-title">➕ Add New User</div>
            <input className="input" placeholder="Full Name" value={addName} onChange={e=>setAddName(e.target.value)}/>
            <input className="input" type="password" inputMode="numeric" placeholder="4-digit PIN" maxLength={6} value={addPin} onChange={e=>setAddPin(e.target.value)}/>
            <select className="select" value={addRole} onChange={e=>setAddRole(e.target.value)}>
              <option value="leader">Group Leader</option>
              <option value="secretary">Church Secretary</option>
            </select>
            {addRole==="leader"&&(
              <select className="select" value={addGid} onChange={e=>setAddGid(e.target.value)}>
                {groups.map(g=><option key={g.id} value={g.id}>{g.name} Group</option>)}
              </select>
            )}
            <button className="btn btn-primary btn-full" onClick={saveUser}>Create User</button>
          </div>
        )}

        <p className="section-label">Admin / Pastor</p>
        <div className="card">
          {admins.map(u=>(
            <UserRow key={u.id} u={u}
              avatarStyle={{background:"linear-gradient(135deg,var(--gold),var(--navy))"}}
              badge={<span className="badge badge-gold" style={{fontSize:"0.6rem"}}>✝️ Pastor</span>}/>
          ))}
        </div>

        <p className="section-label">Group Leaders ({leaders.length})</p>
        <div className="card">
          {leaders.length===0&&<div style={{textAlign:"center",color:"var(--muted)",padding:14,fontSize:"0.82rem"}}>No leaders added yet</div>}
          {leaders.map(u=>{
            const grp=groups.find(g=>g.id===u.groupId);
            return(
              <UserRow key={u.id} u={u}
                avatarStyle={{background:`linear-gradient(135deg,${grp?.color||"#888"},var(--navy))`}}
                badge={<span className="badge badge-blue" style={{fontSize:"0.6rem"}}>{grp?.name||"No group"}</span>}/>
            );
          })}
        </div>

        <p className="section-label">Secretaries ({secretaries.length})</p>
        <div className="card">
          {secretaries.length===0&&<div style={{textAlign:"center",color:"var(--muted)",padding:14,fontSize:"0.82rem"}}>No secretary added yet</div>}
          {secretaries.map(u=>(
            <UserRow key={u.id} u={u}
              avatarStyle={{background:"linear-gradient(135deg,var(--purple),var(--navy))"}}
              badge={<span className="badge badge-purple" style={{fontSize:"0.6rem"}}>Secretary</span>}/>
          ))}
        </div>

        {/* ── MY PROFILE CARD ── */}
        <p className="section-label">👤 My Profile</p>
        <div className="card" style={{border:"1.5px solid var(--gold)",background:"#FFFDF5"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <label style={{cursor:"pointer",position:"relative",flexShrink:0}}>
              {currentUser.photo
                ?<img src={currentUser.photo} alt={currentUser.name} style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:"3px solid var(--gold)",boxShadow:"0 4px 16px rgba(0,0,0,0.12)"}}/>
                :<div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${ROLE_COLORS[currentUser.role]||"var(--gold)"},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.4rem",border:"3px solid var(--gold)"}}>
                  {initials(currentUser.name)}
                </div>
              }
              <div style={{position:"absolute",bottom:2,right:2,width:18,height:18,borderRadius:"50%",background:"var(--navy)",border:"2px solid white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.5rem",color:"var(--gold)"}}>📷</div>
              <input type="file" accept="image/*" style={{display:"none"}}
                onChange={async e=>{
                  if(!e.target.files[0]) return;
                  try{
                    const compressed=await compressImage(e.target.files[0],120,0.8);
                    setUsers(p=>p.map(x=>x.id===currentUser.id?{...x,photo:compressed}:x));
                    const updated={...currentUser,photo:compressed};
                    try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
                    setCurrentUserState(updated);
                    showAlert("Profile photo updated! ✓");
                  }catch{showAlert("Could not process image","error");}
                }}/>
            </label>
            <div style={{flex:1}}>
              <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"1rem",color:"var(--navy)"}}>{currentUser.name}</div>
              <div style={{fontSize:"0.72rem",color:"var(--gold)",fontWeight:700,textTransform:"capitalize",marginTop:2}}>{currentUser.role==="admin"?"Pastor":currentUser.role}</div>
              <div style={{fontSize:"0.68rem",color:"var(--muted)",marginTop:4}}>Tap the photo to change it. Your photo appears in the app header and sidebar.</div>
            </div>
          </div>
          {currentUser.photo&&(
            <button style={{marginTop:10,width:"100%",padding:"6px",background:"transparent",border:"1px solid var(--red)",borderRadius:8,color:"var(--red)",fontSize:"0.72rem",cursor:"pointer"}}
              onClick={()=>{
                setUsers(p=>p.map(x=>x.id===currentUser.id?{...x,photo:null}:x));
                const updated={...currentUser,photo:null};
                try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
                setCurrentUserState(updated);
                showAlert("Profile photo removed","info");
              }}>✕ Remove profile photo</button>
          )}
        </div>

        {/* ── AUDIT LOG ── */}
        {(()=>{
          try{
            // VULN-08 FIX: Read from Firebase-backed auditLog state
            const log=auditLog;
            if(!Array.isArray(log)||log.length===0) return null;
            return(
              <>
                <p className="section-label">📋 Recent Activity Log</p>
                <div className="card" style={{padding:"10px 14px"}}>
                  {log.slice(0,8).map((entry,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                      <span style={{fontSize:"0.9rem"}}>{entry.action==="LOGIN"?"🔑":"📝"}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:"0.78rem",fontWeight:700,color:"var(--navy)"}}>{entry.user} <span style={{color:"var(--muted)",fontWeight:400,textTransform:"capitalize"}}>({entry.role})</span></div>
                        <div style={{fontSize:"0.65rem",color:"var(--muted)"}}>{entry.action} · {new Date(entry.time).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          }catch{return null;}
        })()}

        {/* ── BACKUP ── */}
        <p className="section-label">💾 Data Backup</p>
        <div className="card" style={{border:"1.5px solid var(--gold)",background:"#FFFDF5"}}>
          <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"0.92rem",color:"var(--navy)",marginBottom:6}}>Export Full Backup</div>
          <div style={{fontSize:"0.78rem",color:"var(--muted)",marginBottom:12,lineHeight:1.5}}>
            Downloads all attendance records, daily reports, members and users as a secure backup file. Keep it somewhere safe.
          </div>
          <button className="btn btn-primary btn-full" onClick={()=>{
            const backup={
              exportedAt:new Date().toISOString(),
              church:CHURCH_CONFIG.CHURCH_NAME,
              note:"Attendance stored across monthly documents for scalability (500+ members)",
              attendance,dailyReports,submittedAtt,members,groups,
              users:users.map(u=>({...u,pin:"[protected]"}))
            };
            const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");
            a.href=url;
            a.download=`christ-temple-backup-${todayStr()}.json`;
            a.click();
            showAlert("Backup downloaded successfully! ✓");
          }}>⬇️ Download Backup</button>
        </div>

        {/* ── DANGER ZONE ── */}
        <p className="section-label" style={{color:"var(--red)"}}>⚠️ Danger Zone</p>
        <div className="card" style={{border:"2px solid #FAD7D7",background:"#FFF8F8"}}>
          <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"0.92rem",color:"var(--red)",marginBottom:6}}>Reset Church Data</div>
          <div style={{fontSize:"0.78rem",color:"var(--muted)",marginBottom:14,lineHeight:1.5}}>
            This will permanently delete <strong>all attendance records</strong> and <strong>all daily reports</strong> for the entire church. Member lists and user accounts will be kept. This cannot be undone.
          </div>
          {resetConfirm===0&&(
            <button className="btn btn-sm" style={{background:"#FFF0F0",color:"var(--red)",border:"1.5px solid var(--red)",width:"100%",padding:"10px"}}
              onClick={()=>setResetConfirm(1)}>
              🗑️ Reset All Church Data
            </button>
          )}
          {resetConfirm===1&&(
            <div style={{background:"#FFF0F0",borderRadius:10,padding:"12px",textAlign:"center"}}>
              <div style={{fontWeight:700,fontSize:"0.88rem",color:"var(--red)",marginBottom:8}}>Are you absolutely sure?</div>
              <div style={{fontSize:"0.75rem",color:"var(--muted)",marginBottom:12}}>All attendance and report data will be lost forever.</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-outline" style={{flex:1}} onClick={()=>setResetConfirm(0)}>Cancel</button>
                <button className="btn btn-sm" style={{flex:1,background:"var(--red)",color:"white",border:"none",padding:"10px",borderRadius:8,fontWeight:700,cursor:"pointer"}}
                  onClick={()=>setResetConfirm(2)}>Yes, Reset</button>
              </div>
            </div>
          )}
          {resetConfirm===2&&(
            <div style={{background:"#FFF0F0",borderRadius:10,padding:"12px",textAlign:"center"}}>
              <div style={{fontWeight:700,fontSize:"0.88rem",color:"var(--red)",marginBottom:8}}>⚠️ Final Confirmation</div>
              <div style={{fontSize:"0.75rem",color:"var(--muted)",marginBottom:12}}>Type <strong>RESET</strong> to confirm.</div>
              <input className="input" placeholder="Type RESET" value={resetWord} onChange={e=>setResetWord(e.target.value.toUpperCase())} style={{textAlign:"center",fontWeight:700,letterSpacing:4}}/>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="btn btn-outline" style={{flex:1}} onClick={()=>{setResetConfirm(0);setResetWord("");}}>Cancel</button>
                <button className="btn btn-sm"
                  style={{flex:1,background:resetWord==="RESET"?"var(--red)":"#ccc",color:"white",border:"none",padding:"10px",borderRadius:8,fontWeight:700,cursor:resetWord==="RESET"?"pointer":"not-allowed"}}
                  disabled={resetWord!=="RESET"}
                  onClick={()=>{
                    if(resetWord!=="RESET")return;
                    setAttendance({});
                    setDailyReports({});
                    setSubmittedAtt({});
                    setResetConfirm(0);
                    setResetWord("");
                    showAlert("All church data has been reset.","info");
                  }}>
                  🗑️ Delete Everything
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ════════════════ QR CODES TAB (admin) ═══════════════════════
  const QRCodesTab=()=>{
    const [selectedGroup,setSelectedGroup]=useState(groups[0]||null);
    if(!selectedGroup&&groups.length>0)setSelectedGroup(groups[0]);
    return(
      <div className="scroll-area">
        <p className="section-label">Select Group</p>
        <div style={{display:"flex",gap:8,padding:"0 12px",flexWrap:"wrap"}}>
          {groups.map(g=>(
            <button key={g.id} onClick={()=>setSelectedGroup(g)}
              className="btn btn-sm"
              style={{background:selectedGroup?.id===g.id?g.color:"white",color:selectedGroup?.id===g.id?"white":g.color,
                border:`2px solid ${g.color}`,borderRadius:20}}>
              {g.name}
            </button>
          ))}
        </div>

        {selectedGroup&&(
          <div className="card" style={{textAlign:"center"}}>
            <div className="card-title" style={{justifyContent:"center"}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:selectedGroup.color}}/> {selectedGroup.name} Group QR Code
            </div>

            {/* QR code visual */}
            <div style={{display:"flex",justifyContent:"center",margin:"10px 0"}}>
              <div style={{padding:12,border:`3px solid ${selectedGroup.color}`,borderRadius:14,background:"white",boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}>
                <RealQRCode value={(()=>{
                  const exp=Date.now()+(2*60*60*1000); // 2 hours from now
                  const token=btoa(`${selectedGroup.id}:${exp}`).replace(/=/g,"");
                  return `${window.location.origin}/?checkin=${selectedGroup.id}&token=${token}&exp=${exp}`;
                })()} size={180} color={selectedGroup.color}/>
              </div>
            </div>

            <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.1rem",color:"var(--navy)",fontWeight:700,marginBottom:4}}>{selectedGroup.name} Group</div>
            <div style={{fontSize:"0.75rem",color:"var(--muted)",marginBottom:14}}>Members scan this code to mark their own attendance</div>

            {/* How it works */}
            <div style={{background:"var(--cream)",borderRadius:10,padding:"12px 14px",textAlign:"left",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:"0.8rem",color:"var(--navy)",marginBottom:8}}>📱 How Group QR Check-In Works:</div>
              {["Display this QR at the group entrance or on a screen","Member scans QR with phone camera","A check-in page opens showing group members","Member taps their name — attendance marked instantly!","Leader can also confirm on their dashboard"].map((s,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:5,fontSize:"0.75rem",color:"var(--text)"}}>
                  <span style={{width:18,height:18,borderRadius:"50%",background:selectedGroup.color,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.6rem",fontWeight:700,flexShrink:0}}>{i+1}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>

            {/* Simulate scan button */}
            <button className="btn btn-success btn-full" onClick={()=>setCheckInGroup(selectedGroup)}>
              📱 Simulate QR Scan (Test Check-In)
            </button>
            <p style={{fontSize:"0.68rem",color:"var(--muted)",marginTop:6}}>
              In production: members scan with phone camera. The check-in page opens automatically.
            </p>
          </div>
        )}

        {/* Info card */}
        <div className="card" style={{background:"#EEF6FF",border:"1.5px solid #2980B9"}}>
          <div className="card-title" style={{color:"#1A5276"}}>ℹ️ How to Use QR Codes</div>
          <p style={{fontSize:"0.78rem",color:"#2C3E50",lineHeight:1.6}}>
            ✅ <strong>QR codes are fully active!</strong><br/><br/>
            1. Print or display the QR code on a screen at the group entrance<br/>
            2. Members open their phone camera and scan it<br/>
            3. The check-in page opens automatically in their browser<br/>
            4. Member taps their name — attendance is marked instantly<br/><br/>
            <strong>Your live app URL:</strong><br/>
            <code style={{background:"#D6EAF8",padding:"2px 6px",borderRadius:4,fontSize:"0.72rem",wordBreak:"break-all"}}>{window.location.origin}</code>
          </p>
        </div>
      </div>
    );
  };


  // ════════════════ CHARTS / TRENDS TAB ════════════════════════
  const ChartsTab=()=>{
    const allDates=[...new Set(Object.keys(attendance).map(k=>k.split("|")[0]))].sort();
    const last8=allDates.slice(-8);

    // Line chart data: attendance % per service
    const trendData=last8.map(date=>{
      const st=getTotalStats(date);
      const rpt=getReport(date);
      return{
        date:new Date(date+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
        rate:st.pct,
        present:st.present,
        visitors:parseInt(rpt.visitors)||0,
        soulsWon:parseInt(rpt.soulsWon)||0,
      };
    });

    // Bar chart data: group comparison last service
    const lastDate=allDates[allDates.length-1]||selectedDate;
    const groupData=groups.map(g=>{
      const st=getGroupStats(g.id,lastDate);
      return{name:g.name,present:st.present,absent:st.absent,pct:st.pct,color:g.color};
    });

    // Category bar chart
    const catData=CATEGORIES.map(cat=>{
      const cm=members.filter(m=>m.category===cat);
      const present=cm.filter(m=>isPresent(lastDate,m.id)).length;
      return{name:cat,present,absent:cm.length-present,total:cm.length};
    }).filter(d=>d.total>0);

    // Spiritual trend
    const spiritualData=last8.map(date=>{
      const rpt=getReport(date);
      return{
        date:new Date(date+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
        visitors:parseInt(rpt.visitors)||0,
        soulsWon:parseInt(rpt.soulsWon)||0,
        holySpirit:parseInt(rpt.holySpirit)||0,
        bibleStudy:parseInt(rpt.bibleStudy)||0,
      };
    });

    const noData=trendData.length===0;

    return(
      <div className="scroll-area">
        {noData&&(
          <div className="card" style={{textAlign:"center",padding:"30px 20px"}}>
            <div style={{fontSize:"2.5rem",marginBottom:8}}>📈</div>
            <div style={{fontFamily:"Playfair Display,serif",color:"var(--navy)",fontSize:"1rem",marginBottom:6}}>No Trend Data Yet</div>
            <div style={{fontSize:"0.8rem",color:"var(--muted)"}}>Mark attendance for at least 2 services to see charts and trends.</div>
          </div>
        )}

        {!noData&&(
          <>
            <p className="section-label">Attendance Rate — Last {trendData.length} Services</p>
            <div className="card" style={{padding:"14px 8px 8px"}}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{top:4,right:16,left:-20,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0E8D8"/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                  <YAxis domain={[0,100]} tickFormatter={v=>v+"%"} tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                  <Tooltip formatter={(v,n)=>[n==="rate"?v+"%":v,n==="rate"?"Attendance %":"Present"]} contentStyle={{fontSize:"0.75rem",borderRadius:8,border:"1px solid #F0E8D8"}}/>
                  <Line type="monotone" dataKey="rate" stroke="#C9973A" strokeWidth={2.5} dot={{fill:"#C9973A",r:4}} name="rate"/>
                  <Line type="monotone" dataKey="present" stroke="#27AE60" strokeWidth={1.5} dot={{fill:"#27AE60",r:3}} strokeDasharray="4 2" name="present"/>
                </LineChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:12,justifyContent:"center",fontSize:"0.7rem",color:"var(--muted)",marginTop:4}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:16,height:2.5,background:"#C9973A",display:"inline-block",borderRadius:2}}/> Rate %</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:16,height:2,background:"#27AE60",display:"inline-block",borderRadius:2,borderTop:"2px dashed #27AE60"}}/> Count</span>
              </div>
            </div>

            <p className="section-label">Group Comparison — {new Date(lastDate+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</p>
            <div className="card" style={{padding:"14px 8px 8px"}}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={groupData} margin={{top:4,right:16,left:-20,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0E8D8"/>
                  <XAxis dataKey="name" tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                  <Tooltip contentStyle={{fontSize:"0.75rem",borderRadius:8,border:"1px solid #F0E8D8"}}/>
                  <Legend wrapperStyle={{fontSize:"0.7rem"}}/>
                  <Bar dataKey="present" name="Present" radius={[4,4,0,0]}>
                    {groupData.map((g,i)=><Cell key={i} fill={g.color}/>)}
                  </Bar>
                  <Bar dataKey="absent" name="Absent" fill="#FAD7D7" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="section-label">Attendance by Member Category</p>
            <div className="card" style={{padding:"14px 8px 8px"}}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={catData} margin={{top:4,right:16,left:-20,bottom:4}} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0E8D8"/>
                  <XAxis type="number" tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false} width={70}/>
                  <Tooltip contentStyle={{fontSize:"0.75rem",borderRadius:8,border:"1px solid #F0E8D8"}}/>
                  <Legend wrapperStyle={{fontSize:"0.7rem"}}/>
                  <Bar dataKey="present" name="Present" fill="#27AE60" radius={[0,4,4,0]}/>
                  <Bar dataKey="absent"  name="Absent"  fill="#FAD7D7" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {spiritualData.some(d=>d.visitors>0||d.soulsWon>0)&&(
              <>
                <p className="section-label">Spiritual Growth Trend</p>
                <div className="card" style={{padding:"14px 8px 8px"}}>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={spiritualData} margin={{top:4,right:16,left:-20,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0E8D8"/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:"#7A7A7A"}} tickLine={false}/>
                      <Tooltip contentStyle={{fontSize:"0.75rem",borderRadius:8,border:"1px solid #F0E8D8"}}/>
                      <Legend wrapperStyle={{fontSize:"0.7rem"}}/>
                      <Line type="monotone" dataKey="visitors"   name="Visitors"    stroke="#2980B9" strokeWidth={2} dot={{r:3}}/>
                      <Line type="monotone" dataKey="soulsWon"   name="Souls Won"   stroke="#8E44AD" strokeWidth={2} dot={{r:3}}/>
                      <Line type="monotone" dataKey="holySpirit" name="HS Baptism"  stroke="#1ABC9C" strokeWidth={2} dot={{r:3}}/>
                      <Line type="monotone" dataKey="bibleStudy" name="Bible Study" stroke="#E67E22" strokeWidth={2} dot={{r:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* Summary stats */}
            <p className="section-label">Summary Averages</p>
            <div className="stats-row" style={{flexWrap:"wrap"}}>
              {(()=>{
                const avg=trendData.length?Math.round(trendData.reduce((s,d)=>s+d.rate,0)/trendData.length):0;
                const best=trendData.length?Math.max(...trendData.map(d=>d.pct||d.rate)):0;
                const totalVisitors=spiritualData.reduce((s,d)=>s+d.visitors,0);
                const totalSouls=spiritualData.reduce((s,d)=>s+d.soulsWon,0);
                return[{v:avg+"%",l:"Avg Rate"},{v:best+"%",l:"Best"},{v:totalVisitors,l:"Visitors"},{v:totalSouls,l:"Souls Won"}];
              })().map(s=>(
                <div className="stat-box" key={s.l}><div className="stat-num">{s.v}</div><div className="stat-label">{s.l}</div></div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ════════════════ LEADER HISTORY ════════════════════════════
  // Shows history of submitted attendance for leader's own group
  const LeaderHistoryTab=()=>{
    const gid=myGroup?.id;
    // All dates where this group's attendance was submitted or recorded
    const allDates=[...new Set(
      Object.keys(attendance)
        .map(k=>k.split("|")[0])
        .concat(Object.keys(submittedAtt).filter(k=>k.startsWith(gid+"_")).map(k=>k.replace(gid+"_","")))
    )].sort().reverse();

    if(!gid||allDates.length===0){
      return(
        <div className="scroll-area">
          <div className="card" style={{textAlign:"center",padding:"40px 20px",margin:"16px 12px"}}>
            <div style={{fontSize:"2.5rem",marginBottom:10}}>📭</div>
            <div style={{color:"var(--muted)",fontSize:"0.85rem"}}>No attendance history yet for your group.</div>
          </div>
        </div>
      );
    }

    return(
      <div className="scroll-area">
        <p className="section-label">{myGroup?.name} — Attendance History</p>
        {allDates.map(date=>{
          const st=getGroupStats(gid,date);
          const gm=members.filter(m=>m.groupId===gid);
          const presentList=gm.filter(m=>isPresent(date,m.id));
          const absentList=gm.filter(m=>!isPresent(date,m.id));
          const subInfo=submittedAtt[`${gid}_${date}`];
          const [open,setOpen]=useState(false);
          return(
            <div className="card" key={date} style={{padding:0,overflow:"hidden",border:subInfo?"2px solid var(--green)":undefined}}>
              {/* Header */}
              <div style={{padding:"11px 14px",cursor:"pointer",background:subInfo?"#D5F5E320":"var(--cream)"}}
                onClick={()=>setOpen(o=>!o)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <div>
                    <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"0.9rem"}}>{formatDate(date)}</div>
                    <div style={{fontSize:"0.68rem",color:"var(--muted)",marginTop:1}}>
                      {st.present} present · {st.absent} absent
                      {subInfo&&<span style={{color:"var(--green)",marginLeft:6}}>✅ Submitted by {subInfo.submittedBy}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <span className={`badge ${st.pct>=70?"badge-green":st.pct>=40?"badge-gold":"badge-red"}`}>{st.pct}%</span>
                    <span style={{color:"var(--muted)",fontSize:"0.85rem"}}>{open?"▲":"▼"}</span>
                  </div>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{width:st.pct+"%"}}/></div>
              </div>
              {/* Expanded names */}
              {open&&(
                <div style={{padding:"8px 14px 12px",borderTop:"1px solid var(--cream-dark)"}}>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:"0.68rem",fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:5}}>✓ Present ({presentList.length})</div>
                    {presentList.length===0
                      ?<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>None</div>
                      :presentList.map(m=>(
                        <div key={m.id} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                          <div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${myGroup?.color||"#888"},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.65rem",flexShrink:0}}>{initials(m.name)}</div>
                          <span style={{fontSize:"0.82rem",fontWeight:600,flex:1}}>{m.name}</span>
                          <span className="badge badge-green" style={{fontSize:"0.6rem"}}>✓</span>
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <div style={{fontSize:"0.68rem",fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:5}}>✗ Absent ({absentList.length})</div>
                    {absentList.length===0
                      ?<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>🎉 No absences!</div>
                      :absentList.map(m=>(
                        <div key={m.id} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                          <div style={{width:26,height:26,borderRadius:"50%",background:"#ccc",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.65rem",flexShrink:0}}>{initials(m.name)}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:"0.82rem",fontWeight:600,color:"var(--muted)"}}>{m.name}</div>
                            {m.phone&&<div style={{fontSize:"0.6rem",color:"var(--muted)"}}>📞 {m.phone}</div>}
                          </div>
                          <span className="badge badge-red" style={{fontSize:"0.6rem"}}>✗</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════ MONTH TAB ══════════════════════════════════
  // Pastor & Secretary: full report analysis per month
  // Leader: attendance summary per month for their group
  const MonthTab=()=>{
    const now=new Date();
    const [selYear,setSelYear]=useState(now.getFullYear());
    const [selMonth,setSelMonth]=useState(now.getMonth());
    const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];

    // All attendance dates in selected month/year
    const allDates=[...new Set(Object.keys(attendance).map(k=>k.split("|")[0]))]
      .filter(d=>{const dt=new Date(d);return dt.getFullYear()===selYear&&dt.getMonth()===selMonth;})
      .sort();

    // Group dates by service type
    const byService={};
    SERVICE_TYPES.forEach(s=>{byService[s]=[];});
    allDates.forEach(d=>{const rpt=getReport(d);const s=rpt.serviceType||"Sunday Morning";if(byService[s])byService[s].push(d);});

    const monthStats=allDates.map(date=>{
      const rpt=getReport(date);
      return{date,
        serviceType:rpt.serviceType||"Sunday Morning",
        ...getTotalStats(date),
        offertory:parseFloat(rpt.offertory)||0,
        tithe:parseFloat(rpt.tithe)||0,
        visitors:parseInt(rpt.visitors)||0,
        soulsWon:parseInt(rpt.soulsWon)||0,
        holySpirit:parseInt(rpt.holySpirit)||0,
        activities:rpt.activities,notes:rpt.notes};
    });

    const totalSessions=monthStats.length;
    const avgPct=totalSessions?Math.round(monthStats.reduce((s,d)=>s+d.pct,0)/totalSessions):0;
    const avgPresent=totalSessions?Math.round(monthStats.reduce((s,d)=>s+d.present,0)/totalSessions):0;
    const bestDay=monthStats.length?monthStats.reduce((a,b)=>a.pct>b.pct?a:b):null;
    const worstDay=monthStats.length?monthStats.reduce((a,b)=>a.pct<b.pct?a:b):null;
    const totalOffertory=monthStats.reduce((s,d)=>s+d.offertory,0);
    const totalTithe=monthStats.reduce((s,d)=>s+d.tithe,0);
    const totalVisitors=monthStats.reduce((s,d)=>s+d.visitors,0);
    const totalSouls=monthStats.reduce((s,d)=>s+d.soulsWon,0);
    const totalHS=monthStats.reduce((s,d)=>s+d.holySpirit,0);

    // Member attendance counts
    const baseMbrs=isLeader?members.filter(m=>m.groupId===myGroup?.id):members;
    const memberCounts={};
    baseMbrs.forEach(m=>{memberCounts[m.id]=allDates.filter(d=>isPresent(d,m.id)).length;});
    const faithful=baseMbrs.filter(m=>totalSessions>0&&memberCounts[m.id]===totalSessions);
    const neverPresent=baseMbrs.filter(m=>totalSessions>0&&memberCounts[m.id]===0);

    // Group performance
    const groupMonthStats=(isLeader?[myGroup].filter(Boolean):groups).map(g=>{
      const gm=members.filter(m=>m.groupId===g.id);
      const totalSlots=gm.length*totalSessions;
      const totalPresent=allDates.reduce((s,d)=>s+gm.filter(m=>isPresent(d,m.id)).length,0);
      const pct=totalSlots?Math.round(totalPresent/totalSlots*100):0;
      return{...g,totalPresent,totalSlots,pct};
    }).sort((a,b)=>b.pct-a.pct);

    const MonthPicker=()=>(
      <div style={{margin:"10px 12px 0",display:"flex",gap:8}}>
        <select className="select" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))} style={{flex:2,marginBottom:0}}>
          {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
        </select>
        <select className="select" value={selYear} onChange={e=>setSelYear(Number(e.target.value))} style={{flex:1,marginBottom:0}}>
          {[now.getFullYear()-1,now.getFullYear(),now.getFullYear()+1].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    );

    if(totalSessions===0) return(
      <div className="scroll-area">
        <MonthPicker/>
        <div className="card" style={{textAlign:"center",padding:"40px 20px",margin:"16px 12px"}}>
          <div style={{fontSize:"2.5rem",marginBottom:10}}>📭</div>
          <div style={{fontFamily:"Playfair Display,serif",fontSize:"1rem",color:"var(--navy)",marginBottom:6}}>No data for {MONTHS[selMonth]} {selYear}</div>
          <div style={{fontSize:"0.8rem",color:"var(--muted)"}}>Record attendance for this month to see analysis here.</div>
        </div>
      </div>
    );

    return(
      <div className="scroll-area">
        <MonthPicker/>
        {/* ── Summary Banner ── */}
        <div className="summary-banner" style={{margin:"10px 12px 0"}}>
          <h3>📅 {MONTHS[selMonth]} {selYear}{isLeader?` · ${myGroup?.name}`:""}</h3>
          <div className="summary-grid">
            {[{l:"Sessions",v:totalSessions},{l:"Avg Present",v:avgPresent},{l:"Avg Rate",v:avgPct+"%"}].map(s=>(
              <div className="summary-cell" key={s.l}><div className="summary-num">{s.v}</div><div className="summary-lbl">{s.l}</div></div>
            ))}
          </div>
        </div>

        {/* ── Service type breakdown ── */}
        <p className="section-label">⛪ By Service Type</p>
        <div style={{margin:"0 12px",display:"flex",gap:8,flexWrap:"wrap"}}>
          {SERVICE_TYPES.map(svc=>{const dates=byService[svc];if(dates.length===0)return null;
            const avgP=Math.round(dates.reduce((s,d)=>s+getTotalStats(d).pct,0)/dates.length);
            return(
              <div key={svc} style={{flex:1,minWidth:90,background:"var(--cream)",borderRadius:10,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem"}}>{SERVICE_ICONS[svc]}</div>
                <div style={{fontWeight:700,fontSize:"0.9rem",color:"var(--navy)",marginTop:3}}>{dates.length} <span style={{fontSize:"0.65rem",fontWeight:400,color:"var(--muted)"}}>services</span></div>
                <div style={{fontSize:"0.72rem",color:"var(--muted)"}}>{svc}</div>
                <span className={`badge ${avgP>=70?"badge-green":avgP>=40?"badge-gold":"badge-red"}`} style={{marginTop:4,display:"inline-block"}}>{avgP}% avg</span>
              </div>
            );
          })}
        </div>

        {/* ── Best / Worst ── */}
        {bestDay&&worstDay&&(
          <div style={{margin:"10px 12px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:"#D5F5E3",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:"0.62rem",color:"var(--green)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>🏆 Best Day</div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.85rem",fontWeight:700,color:"var(--navy)"}}>{formatDate(bestDay.date)}</div>
              <div style={{fontSize:"0.72rem",color:"var(--green)",fontWeight:700,marginTop:2}}>{bestDay.pct}% · {bestDay.present} present</div>
              <div style={{fontSize:"0.62rem",color:"var(--muted)",marginTop:1}}>{SERVICE_ICONS[bestDay.serviceType]} {bestDay.serviceType}</div>
            </div>
            <div style={{background:"#FFF5F5",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:"0.62rem",color:"var(--red)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>📉 Lowest Day</div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.85rem",fontWeight:700,color:"var(--navy)"}}>{formatDate(worstDay.date)}</div>
              <div style={{fontSize:"0.72rem",color:"var(--red)",fontWeight:700,marginTop:2}}>{worstDay.pct}% · {worstDay.present} present</div>
              <div style={{fontSize:"0.62rem",color:"var(--muted)",marginTop:1}}>{SERVICE_ICONS[worstDay.serviceType]} {worstDay.serviceType}</div>
            </div>
          </div>
        )}

        {/* ── Financial (Pastor & Secretary only) ── */}
        {!isLeader&&(totalOffertory>0||totalTithe>0)&&(
          <>
            <p className="section-label">💰 Financial Summary</p>
            <div style={{margin:"0 12px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{background:"var(--cream)",borderRadius:10,padding:"12px",textAlign:"center"}}>
                <div style={{fontSize:"0.62rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>🪙 Total Offertory</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.05rem",fontWeight:700,color:"var(--green)",marginTop:4}}>{CHURCH_CONFIG.CURRENCY} {totalOffertory.toFixed(2)}</div>
              </div>
              <div style={{background:"var(--cream)",borderRadius:10,padding:"12px",textAlign:"center"}}>
                <div style={{fontSize:"0.62rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>💵 Total Tithe</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.05rem",fontWeight:700,color:"var(--gold)",marginTop:4}}>{CHURCH_CONFIG.CURRENCY} {totalTithe.toFixed(2)}</div>
              </div>
            </div>
          </>
        )}

        {/* ── Spiritual Summary (Pastor & Secretary only) ── */}
        {!isLeader&&(totalVisitors>0||totalSouls>0||totalHS>0)&&(
          <>
            <p className="section-label">🌱 Spiritual Summary</p>
            <div style={{margin:"0 12px",display:"flex",gap:8,flexWrap:"wrap"}}>
              {totalVisitors>0&&<div style={{flex:1,minWidth:80,background:"#EBF5FB",borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:"1.4rem"}}>🙋</div><div style={{fontWeight:700,fontSize:"1rem",color:"var(--navy)"}}>{totalVisitors}</div><div style={{fontSize:"0.65rem",color:"var(--muted)"}}>Visitors</div></div>}
              {totalSouls>0&&<div style={{flex:1,minWidth:80,background:"#F5EEF8",borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:"1.4rem"}}>✨</div><div style={{fontWeight:700,fontSize:"1rem",color:"var(--navy)"}}>{totalSouls}</div><div style={{fontSize:"0.65rem",color:"var(--muted)"}}>Souls Won</div></div>}
              {totalHS>0&&<div style={{flex:1,minWidth:80,background:"#E8F8F5",borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:"1.4rem"}}>🕊️</div><div style={{fontWeight:700,fontSize:"1rem",color:"var(--navy)"}}>{totalHS}</div><div style={{fontSize:"0.65rem",color:"var(--muted)"}}>HS Baptism</div></div>}
            </div>
          </>
        )}

        {/* ── Group Performance ── */}
        {!isLeader&&groupMonthStats.length>1&&(
          <>
            <p className="section-label">👥 Group Performance</p>
            {groupMonthStats.map((g,i)=>(
              <div className="card" key={g.id} style={{padding:"11px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:"0.72rem",fontWeight:700,color:"var(--muted)",width:16}}>#{i+1}</span>
                  <div style={{width:9,height:9,borderRadius:"50%",background:g.color,flexShrink:0}}/>
                  <span style={{fontFamily:"Playfair Display,serif",fontWeight:700,flex:1}}>{g.name}</span>
                  <span style={{fontSize:"0.78rem",fontWeight:700,color:"var(--navy)"}}>{g.totalPresent}/{g.totalSlots}</span>
                  <span className={`badge ${g.pct>=70?"badge-green":g.pct>=40?"badge-gold":"badge-red"}`}>{g.pct}%</span>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{width:g.pct+"%",background:`linear-gradient(90deg,${g.color},${g.color}99)`}}/></div>
              </div>
            ))}
          </>
        )}

        {/* ── Perfect Attendance ── */}
        {faithful.length>0&&(
          <>
            <p className="section-label">🌟 Perfect Attendance ({faithful.length})</p>
            <div className="card">
              {faithful.map(m=>{const grp=groups.find(g=>g.id===m.groupId);return(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                  <MemberAvatar member={m} group={grp} size={30} fontSize="0.7rem"/>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:"0.82rem"}}>{m.name}</div><span className="badge badge-gray" style={{fontSize:"0.58rem"}}>{grp?.name}</span></div>
                  <span style={{fontSize:"0.75rem",color:"var(--green)",fontWeight:700}}>✓ {totalSessions}/{totalSessions}</span>
                </div>
              );})}
            </div>
          </>
        )}

        {/* ── Never Present ── */}
        {neverPresent.length>0&&(
          <>
            <p className="section-label">⚠️ Never Attended ({neverPresent.length})</p>
            <div className="card">
              {neverPresent.map(m=>{const grp=groups.find(g=>g.id===m.groupId);return(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                  <MemberAvatar member={m} group={{color:"#ccc"}} size={30} fontSize="0.7rem"/>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:"0.82rem",color:"var(--muted)"}}>{m.name}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:1}}><span className="badge badge-gray" style={{fontSize:"0.58rem"}}>{grp?.name}</span>{m.phone&&<span style={{fontSize:"0.6rem",color:"var(--muted)"}}>📞 {m.phone}</span>}</div>
                  </div>
                  <span style={{fontSize:"0.75rem",color:"var(--red)",fontWeight:700}}>✗ 0/{totalSessions}</span>
                </div>
              );})}
            </div>
          </>
        )}

        {/* ── Session Log ── */}
        <p className="section-label">📋 Session Log</p>
        {monthStats.map(d=>{
          const rpt=getReport(d.date);
          return(
            <div className="card" key={d.date} style={{padding:"11px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div>
                  <div style={{fontFamily:"Playfair Display,serif",fontWeight:700,fontSize:"0.88rem"}}>{formatDate(d.date)}</div>
                  <div style={{fontSize:"0.68rem",color:"var(--muted)",marginTop:1,display:"flex",gap:6,alignItems:"center"}}>
                    <span>{SERVICE_ICONS[d.serviceType]} {d.serviceType}</span>
                    <span>·</span><span>{d.present} present · {d.absent} absent</span>
                  </div>
                </div>
                <span className={`badge ${d.pct>=70?"badge-green":d.pct>=40?"badge-gold":"badge-red"}`}>{d.pct}%</span>
              </div>
              <div className="progress-bar" style={{marginBottom:6}}><div className="progress-fill" style={{width:d.pct+"%"}}/></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {!isLeader&&rpt.offertory&&<span className="badge badge-green" style={{fontSize:"0.6rem"}}>🪙 {CHURCH_CONFIG.CURRENCY} {rpt.offertory}</span>}
                {!isLeader&&rpt.tithe&&<span className="badge badge-gold" style={{fontSize:"0.6rem"}}>💵 {CHURCH_CONFIG.CURRENCY} {rpt.tithe}</span>}
                {!isLeader&&rpt.visitors&&rpt.visitors!=="0"&&<span className="badge badge-blue" style={{fontSize:"0.6rem"}}>🙋 {rpt.visitors} visitors</span>}
                {!isLeader&&rpt.soulsWon&&rpt.soulsWon!=="0"&&<span className="badge badge-purple" style={{fontSize:"0.6rem"}}>✨ {rpt.soulsWon} souls</span>}
                {rpt.activities&&<span className="badge badge-gray" style={{fontSize:"0.6rem"}}>📌 {rpt.activities}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════ RENDER ══════════════════════════════════════
  const roleLabel=isAdmin?"Pastor / Admin":isSecretary?"Church Secretary":`Leader · ${myGroup?.name||""}`;

  // Build sidebar nav groups for desktop
  const navSections = isAdmin
    ? [
        { label: "Overview",   items: tabs.filter(t=>["dashboard","charts"].includes(t.id)) },
        { label: "Reports",    items: tabs.filter(t=>["sec-report","month","history"].includes(t.id)) },
        { label: "Admin",      items: tabs.filter(t=>["members","users","qrcodes"].includes(t.id)) },
      ]
    : isSecretary
    ? [
        { label: "Reports",    items: tabs.filter(t=>["sec-totals","sec-report","month","history"].includes(t.id)) },
        { label: "Trends",     items: tabs.filter(t=>["charts"].includes(t.id)) },
        { label: "Members",    items: tabs.filter(t=>["members"].includes(t.id)) },
      ]
    : [
        { label: "My Group",   items: tabs.filter(t=>["attendance","call-list","grp-members","month","grp-history"].includes(t.id)) },
      ];

  return(
    <ErrorBoundary>
    <>
      <style>{STYLE}</style>
      <div className="app">

        {/* ── TOP HEADER (visible on all screen sizes) ── */}
        <div className="header">
          {/* Desktop: church logo left */}
          <div className="header-logo">
            <span style={{fontSize:"1.6rem"}}>⛪</span>
            <div>
              <h1>${CHURCH_CONFIG.CHURCH_NAME}</h1>
              <div className="subtitle">{roleLabel}</div>
            </div>
          </div>
          {/* Mobile: church name */}
          <div style={{display:"flex",flexDirection:"column",flex:1}} className="no-print">
            <h1 style={{fontSize:"0.95rem",color:"var(--gold-light)"}}>{CHURCH_CONFIG.CHURCH_ICON} {CHURCH_CONFIG.CHURCH_SHORT_NAME}</h1>
            <div className="subtitle">{roleLabel}</div>
          </div>
          {/* Right side: user photo + name + sign out */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {/* User profile chip */}
            <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.1)",borderRadius:24,padding:"4px 12px 4px 4px",border:"1px solid rgba(255,255,255,0.15)"}}>
              {currentUser.photo
                ?<img src={currentUser.photo} alt={currentUser.name}
                    style={{width:30,height:30,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--gold)",flexShrink:0}}/>
                :<div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${ROLE_COLORS[currentUser.role]||"var(--gold)"},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.7rem",flexShrink:0,border:"2px solid var(--gold)"}}>
                  {initials(currentUser.name)}
                </div>
              }
              <div>
                <div style={{fontSize:"0.78rem",fontWeight:700,color:"white",lineHeight:1.1}}>{currentUser.name}</div>
                <div style={{fontSize:"0.58rem",color:"rgba(255,255,255,0.55)",textTransform:"capitalize"}}>{currentUser.role==="admin"?"Pastor":currentUser.role}</div>
              </div>
            </div>
            <button className="btn btn-sm" style={{background:"rgba(255,255,255,0.15)",color:"white",fontSize:"0.68rem",border:"1px solid rgba(255,255,255,0.2)"}} onClick={()=>setCurrentUser(null)}>Sign Out</button>
          </div>
        </div>

        <div className="app-body">
          {/* ── DESKTOP SIDEBAR ── */}
          <nav className="nav-sidebar no-print">
            <div style={{padding:"16px 20px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)",marginBottom:8,textAlign:"center"}}>
              {/* Large profile photo in sidebar */}
              <div style={{position:"relative",display:"inline-block",marginBottom:10}}>
                {currentUser.photo
                  ?<img src={currentUser.photo} alt={currentUser.name}
                      style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:"3px solid var(--gold)",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}/>
                  :<div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${ROLE_COLORS[currentUser.role]||"var(--gold)"},#0A1628)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.4rem",border:"3px solid var(--gold)",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>
                    {initials(currentUser.name)}
                  </div>
                }
                <div style={{position:"absolute",bottom:2,right:2,width:16,height:16,borderRadius:"50%",background:"var(--green)",border:"2px solid white"}}/>
              </div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:"0.92rem",fontWeight:700,color:"white",lineHeight:1.2}}>{currentUser.name}</div>
              <div style={{fontSize:"0.62rem",color:"var(--gold)",textTransform:"uppercase",letterSpacing:"0.8px",marginTop:3,fontWeight:700}}>{roleLabel}</div>
              <div style={{fontSize:"0.55rem",color:"rgba(255,255,255,0.35)",marginTop:4}}>🔥 Live · 🔒 Secured</div>
            </div>
            {navSections.map(section=>(
              <div key={section.label}>
                <div className="nav-section">{section.label}</div>
                {section.items.map(t=>(
                  <button key={t.id} className={activeTab===t.id?"active":""} onClick={()=>setActiveTab(t.id)}>
                    <span style={{fontSize:"1rem"}}>{t.label.split(" ")[0]}</span>
                    <span>{t.label.split(" ").slice(1).join(" ")}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* ── MOBILE HORIZONTAL NAV ── */}
          <div className="nav no-print">
            {tabs.map(t=>(
              <button key={t.id} className={activeTab===t.id?"active":""} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* ── MAIN CONTENT ── */}
          <div className="main-content">
            {alert&&<div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

            {activeTab==="attendance"  && isLeader      && <AttendanceTab/>}
        {activeTab==="call-list"  && isLeader      && <CallListTab/>}
        
            {activeTab==="dashboard"   && isAdmin       && <DashboardTab/>}
            {activeTab==="sec-totals"  && isSecretary   && <SecTotalsTab/>}
            {activeTab==="sec-report"  && (isAdmin||isSecretary) && <SecReportTab/>}
            {activeTab==="month"       && <MonthTab/>}
            {activeTab==="history"     && (isAdmin||isSecretary) && <HistoryTab/>}
            {activeTab==="members"     && isAdmin        && <MembersTab canEdit={true}/>}
            {activeTab==="members"     && isSecretary    && <MembersTab/>}
            {activeTab==="grp-members" && isLeader       && <MembersTab groupFilter={myGroup?.id}/>}
            {activeTab==="grp-history" && isLeader       && <LeaderHistoryTab/>}
            {activeTab==="users"       && isAdmin        && <UsersTab/>}
            {activeTab==="qrcodes"     && isAdmin        && <QRCodesTab/>}
            {activeTab==="charts"      && <ChartsTab/>}
          </div>
        </div>

        {/* QR individual member modal */}
        {modal?.type==="qr"&&(
          <div className="modal-overlay" onClick={()=>setModal(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-title">{modal.member.name}<span style={{cursor:"pointer",fontSize:"1.2rem"}} onClick={()=>setModal(null)}>✕</span></div>
              <div className="qr-wrap">
                <div className="qr-box"><RealQRCode value={`member:${modal.member.id}`} size={176}/></div>
                <div style={{fontWeight:700,fontSize:"0.88rem",color:"var(--navy)"}}>{modal.member.name}</div>
                <div style={{display:"flex",gap:5}}>
                  <span className="badge badge-blue">{groups.find(g=>g.id===modal.member.groupId)?.name}</span>
                  <span className="badge badge-gray">{CAT_ICONS[modal.member.category]} {modal.member.category}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Printable report modal */}
        {modal?.type==="printReport"&&(
          <PrintableReport
            date={modal.date} groups={groups} members={members}
            attendance={attendance} report={getReport(modal.date)}
            onClose={()=>setModal(null)}
          />
        )}
      </div>
    </>
    </ErrorBoundary>
  );
}
