import { useState, useEffect, useRef, useCallback } from "react";
import { saveData, loadData, listenData, deleteData } from "./firebase";
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
    --gold:#C9973A; --gold-light:#E8C070; --navy:#1A2744; --navy-mid:#243260;
    --cream:#FDF8F0; --cream-dark:#F0E8D8; --red:#C0392B; --green:#27AE60;
    --purple:#7D3C98; --teal:#148F77; --text:#2C2C2C; --muted:#7A7A7A;
    --sidebar-w:220px;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--text);min-height:100vh;}
  h1,h2,h3{font-family:'Playfair Display',serif;}

  /* ── MOBILE LAYOUT (default) ─────────────────────────────────── */
  .app{max-width:100%;min-height:100vh;display:flex;flex-direction:column;}
  .app-body{display:flex;flex-direction:column;flex:1;}
  .main-content{flex:1;min-width:0;}

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

  .scroll-area{overflow-y:auto;max-height:calc(100vh - 115px);padding-bottom:24px;}

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
    .scroll-area{max-height:calc(100vh - 60px);overflow-y:auto;padding-bottom:32px;}
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

  .login-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(160deg,var(--navy) 0%,var(--navy-mid) 55%,var(--gold) 100%);padding:30px 20px;}
  .login-card{background:white;border-radius:20px;padding:28px 22px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);}
  .login-logo{text-align:center;margin-bottom:20px;}
  .login-logo .cross{font-size:2.6rem;}
  .login-logo h2{font-family:'Playfair Display',serif;color:var(--navy);font-size:1.35rem;}
  .login-logo p{color:var(--muted);font-size:0.78rem;margin-top:3px;}
  .role-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;}
  .role-btn{padding:10px 6px;border:2px solid var(--cream-dark);border-radius:10px;background:white;
    cursor:pointer;text-align:center;transition:all 0.15s;font-family:'Lato',sans-serif;}
  .role-btn.selected{border-color:var(--gold);background:#FEF9EF;}
  .role-btn .role-icon{font-size:1.4rem;display:block;margin-bottom:3px;}
  .role-btn .role-name{font-size:0.72rem;font-weight:700;color:var(--navy);}

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
const CATEGORIES=["Elder","Deacon","Deaconess","Male","Female","Children"];
const SERVICE_TYPES=["Sunday Morning","Mid-Week","Friday Evening"];
const SERVICE_ICONS={"Sunday Morning":"☀️","Mid-Week":"📖","Friday Evening":"🌙"};
const CAT_ICONS={Elder:"👴",Deacon:"👨‍⚖️",Deaconess:"👩‍⚖️",Male:"👨",Female:"👩",Children:"🧒"};

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
  const [selectedMember,setSelectedMember]=useState(null);
  const [checkedIn,setCheckedIn]=useState(null);
  const date=todayStr();
  const attKey=(d,mid)=>`${d}|${mid}`;
  const gMembers=members.filter(m=>m.groupId===group.id);

  const doCheckIn=(m)=>{
    setAttendance(p=>({...p,[attKey(date,m.id)]:true}));
    setCheckedIn(m); setSelectedMember(null);
  };

  if(checkedIn){
    return (
      <div className="checkin-page">
        <div className="checkin-card">
          <div style={{fontSize:"3.5rem",marginBottom:8}}>✅</div>
          <h2>Welcome!</h2>
          <p style={{fontSize:"1rem",color:"var(--navy)",fontWeight:700,margin:"6px 0 4px"}}>{checkedIn.name}</p>
          <p style={{color:"var(--green)",fontWeight:700,fontSize:"0.9rem"}}>Attendance marked for {formatDate(date)}</p>
          <p style={{fontSize:"0.75rem",color:"var(--muted)",margin:"4px 0 18px"}}>{group.name} Group</p>
          <button className="btn btn-navy btn-full" onClick={()=>setCheckedIn(null)}>Check In Another Member</button>
          <button className="btn btn-outline btn-full" style={{marginTop:8}} onClick={onBack}>← Back to App</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        <div style={{fontSize:"2.2rem",marginBottom:6}}>⛪</div>
        <h2>{group.name} Group</h2>
        <p>Select your name to mark attendance for {formatDate(date)}</p>
        <div style={{maxHeight:320,overflowY:"auto",textAlign:"left"}}>
          {gMembers.map(m=>{
            const already=attendance[attKey(date,m.id)]===true;
            return (
              <div key={m.id} onClick={()=>!already&&doCheckIn(m)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 8px",
                  borderRadius:10,marginBottom:6,cursor:already?"default":"pointer",
                  background:already?"#D5F5E3":"#F8F9FA",border:`1.5px solid ${already?"#27AE60":"#eee"}`,
                  transition:"all 0.15s"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${group.color},#1A2744)`,
                  display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.78rem",flexShrink:0}}>
                  {initials(m.name)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:"0.85rem",color:"#1A2744"}}>{m.name}</div>
                  <div style={{fontSize:"0.65rem",color:"#7A7A7A"}}>{CAT_ICONS[m.category]} {m.category}</div>
                </div>
                {already&&<span style={{fontSize:"1.2rem"}}>✅</span>}
              </div>
            );
          })}
        </div>
        <button className="btn btn-outline btn-full" style={{marginTop:12,fontSize:"0.75rem"}} onClick={onBack}>← Back to App</button>
      </div>
    </div>
  );
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
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.1rem",color:"#27AE60",fontWeight:700}}>GHS {report.offertory}</div>
                </div>}
                {report.tithe&&<div style={{flex:1,border:"1px solid #F0E8D8",borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:"0.62rem",textTransform:"uppercase",color:"#7A7A7A"}}>💵 Tithe</div>
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.1rem",color:"#27AE60",fontWeight:700}}>GHS {report.tithe}</div>
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
            <span>Generated by Church Attendance System</span>
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
        {[{label:"Offertory (GHS)",icon:"🪙",field:"offertory",ph:"0.00"},{label:"Tithe (GHS)",icon:"💵",field:"tithe",ph:"0.00"}].map(({label,icon,field,ph})=>(
          <div className="report-field" key={field}>
            <label>{icon} {label}</label>
            <input className="input" type="text" inputMode="decimal" placeholder={ph}
              value={draft[field]??""}
              onChange={e=>upd(field,e.target.value)}
              onBlur={()=>commit(field)}/>
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
              onChange={e=>upd(field,e.target.value)}
              onBlur={()=>commit(field)}/>
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
  const [groups,       setGroups]       = useLocalStorage("church_groups",       initGroups);
  const [members,      setMembers]      = useLocalStorage("church_members",      initMembers);
  const [users,        setUsers]        = useLocalStorage("church_users",        initUsers);
  const [attendance,   setAttendance,   attLoaded]  = useLocalStorage("church_attendance",   {});
  const [dailyReports, setDailyReports, rptLoaded]  = useLocalStorage("church_dailyreports", {});
  const [submittedAtt, setSubmittedAtt] = useLocalStorage("church_submittedAtt", {}); // {groupId_date: true}

  // ── SESSION STATE (per-device, survives refresh but not shared) ─
  const [currentUser, setCurrentUserState] = useState(() => {
    try {
      const saved = sessionStorage.getItem("church_currentUser");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const setCurrentUser = (user) => {
    try {
      if (user) sessionStorage.setItem("church_currentUser", JSON.stringify(user));
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

  // ── CLEAN UP old Firebase currentUser doc (caused cross-device sign-out) ─
  useEffect(() => {
    deleteData("church_currentUser");
  }, []);

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
  const handleLogin=()=>{
    const user=users.find(u=>u.pin===loginPin&&(!loginRole||u.role===loginRole));
    if(user){setCurrentUser(user);setLoginError("");setLoginPin("");setActiveTab(user.role==="admin"?"dashboard":user.role==="secretary"?"sec-totals":"attendance");}
    else{setLoginError("Incorrect PIN or role. Try again.");setLoginPin("");}
  };

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
          <div className="login-card">
            <div className="login-logo">
              <div className="cross">⛪</div>
              <h2>Church Attendance</h2>
              <p>Select your role and enter PIN</p>
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
            <button className="btn btn-navy btn-full" onClick={handleLogin}>Sign In →</button>
            <div style={{marginTop:14,padding:"10px",background:"#F8F9FA",borderRadius:8,fontSize:"0.72rem",color:"#666"}}>
              <strong>Demo PINs:</strong><br/>
              Pastor: <strong>1234</strong> · Secretary: <strong>5678</strong><br/>
              Leaders: <strong>1111</strong> / <strong>2222</strong> / <strong>3333</strong>
            </div>
          </div>
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
  const tabs=isAdmin
    ?[{id:"dashboard",label:"📊 Dash"},{id:"charts",label:"📈 Trends"},{id:"sec-report",label:"📝 Daily Rpt"},{id:"month",label:"📅 Month"},{id:"history",label:"🗂 History"},{id:"members",label:"👥 Members"},{id:"users",label:"👤 Users"},{id:"qrcodes",label:"📱 QR Codes"}]
    :isSecretary
    ?[{id:"sec-totals",label:"📊 Totals"},{id:"charts",label:"📈 Trends"},{id:"sec-report",label:"📝 Daily Rpt"},{id:"month",label:"📅 Month"},{id:"history",label:"🗂 History"},{id:"members",label:"👥 Members"}]
    :[{id:"attendance",label:"✅ Mark"},{id:"grp-members",label:"👥 My Group"},{id:"month",label:"📅 Month"},{id:"grp-history",label:"🗂 History"}];

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

  // ════════════════ DASHBOARD (admin + leader) ══════════════════
  const DashboardTab=()=>{
    const total=getTotalStats(selectedDate);
    return(
      <div className="scroll-area">
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>
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

  // ── Breakdown group card (collapsible) ──────────────────────
  const BdGroup=({g,st,gm,presentList,absentList,cig})=>{
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
              {presentList.length===0?<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>None yet</div>
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
              {absentList.length===0?<div style={{fontSize:"0.78rem",color:"var(--muted)",fontStyle:"italic"}}>🎉 No absences!</div>
                :absentList.map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:"1px solid var(--cream-dark)"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:"#ccc",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.65rem",flexShrink:0}}>{initials(m.name)}</div>
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
                <Row icon="🪙" label="Offertory (GHS)" val={rpt.offertory}/>
                <Row icon="💵" label="Tithe (GHS)" val={rpt.tithe}/>
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
                {rpt.offertory&&<span className="badge badge-green">🪙 GHS {rpt.offertory}</span>}
                {rpt.tithe&&<span className="badge badge-gold">💵 GHS {rpt.tithe}</span>}
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
    const [addGroupName,setAddGroupName]=useState("");

    const base=groupFilter?members.filter(m=>m.groupId===groupFilter):members;
    const filtered=base.filter(m=>
      m.name.toLowerCase().includes(search.toLowerCase())&&
      (fg==="all"||m.groupId===fg)&&
      (fc==="all"||m.category===fc)
    );

    const saveMember=()=>{
      if(!aName.trim()){showAlert("Full name required","error");return;}
      setMembers(p=>[...p,{id:"m"+Date.now(),name:aName.trim(),groupId:aGid,category:aCat,gender:aGender,phone:aPhone.trim(),residence:aRes.trim(),occupation:aOcc.trim()}]);
      showAlert(`${aName} added!`);setAName("");setAPhone("");setARes("");setAOcc("");setAddMode(null);
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
          ].filter(f=>f.val&&String(f.val).trim());
          return(
            <div className="modal-overlay" onClick={()=>setViewM(null)}>
              <div className="modal" onClick={e=>e.stopPropagation()}>
                <div className="modal-title">👤 Member Profile <span style={{cursor:"pointer"}} onClick={()=>setViewM(null)}>✕</span></div>
                <div style={{textAlign:"center",margin:"4px 0 16px"}}>
                  <div style={{width:62,height:62,borderRadius:"50%",background:`linear-gradient(135deg,${grp?.color||"#888"},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1.4rem",margin:"0 auto 10px"}}>{initials(viewM.name)}</div>
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.05rem",fontWeight:700,color:"var(--navy)"}}>{viewM.name}</div>
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
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button className="btn btn-outline" style={{flex:1}} onClick={()=>setEditM(null)}>Cancel</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={saveEdit}>Save</button>
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
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveMember}>Add Member</button>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setAddMode(null)}>Cancel</button>
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
                <div className="avatar" style={{background:`linear-gradient(135deg,${grp?.color||"#888"},var(--navy))`}}>{initials(m.name)}</div>
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

    const saveUser=()=>{
      if(!addName.trim()||addPin.length<4){showAlert("Name and 4-digit PIN required","error");return;}
      if(users.find(u=>u.pin===addPin)){showAlert("PIN already in use. Choose another.","error");return;}
      setUsers(p=>[...p,{id:"u"+Date.now(),name:addName.trim(),role:addRole,pin:addPin,groupId:addRole==="leader"?addGid:null}]);
      showAlert(`${addName} (${addRole}) added!`);setAddName("");setAddPin("");setShowForm(false);
    };
    const deleteUser=id=>{
      if(id===currentUser.id){showAlert("Cannot delete yourself","error");return;}
      setUsers(p=>p.filter(u=>u.id!==id));showAlert("User removed","info");
    };
    const openPinModal=(user)=>{setPinModal(user);setNewPin("");setConfirmPin("");setPinSuccess("");};
    const savePin=()=>{
      if(newPin.length<4){showAlert("PIN must be at least 4 digits","error");return;}
      if(newPin!==confirmPin){showAlert("PINs do not match","error");return;}
      if(users.find(u=>u.pin===newPin&&u.id!==pinModal.id)){showAlert("PIN already in use. Choose another.","error");return;}
      setUsers(p=>p.map(u=>u.id===pinModal.id?{...u,pin:newPin}:u));
      // If pastor changed their own PIN, update session too
      if(pinModal.id===currentUser.id){
        const updated={...currentUser,pin:newPin};
        try{sessionStorage.setItem("church_currentUser",JSON.stringify(updated));}catch{}
      }
      setPinSuccess(`✅ PIN for ${pinModal.name} has been changed successfully!`);
      setNewPin("");setConfirmPin("");
    };

    const leaders=users.filter(u=>u.role==="leader");
    const secretaries=users.filter(u=>u.role==="secretary");
    const admins=users.filter(u=>u.role==="admin");

    const UserRow=({u,avatarStyle,badge})=>(
      <div className="member-row" key={u.id} style={{flexWrap:"wrap",gap:6}}>
        <div className="avatar" style={avatarStyle}>{initials(u.name)}</div>
        <div className="member-info">
          <div className="member-name">{u.name}</div>
          <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
            {badge}
            <span className="badge badge-gray" style={{fontSize:"0.6rem"}}>PIN: {"•".repeat(u.pin.length)}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:5}}>
          <button className="btn btn-sm" style={{background:"#EEF2FF",color:"var(--navy)",border:"1px solid #C5CAE9",fontSize:"0.68rem"}}
            onClick={()=>openPinModal(u)}>🔑 PIN</button>
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
                <RealQRCode value={`https://yourchurch.vercel.app/?checkin=${selectedGroup.id}`} size={180} color={selectedGroup.color}/>
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
          <div className="card-title" style={{color:"#1A5276"}}>ℹ️ Making QR Codes Scannable by Phone</div>
          <p style={{fontSize:"0.78rem",color:"#2C3E50",lineHeight:1.6}}>
            To make these QR codes work with real phones:<br/><br/>
            1. <strong>Host the app online</strong> (Vercel, Netlify – free)<br/>
            2. Each group QR encodes a URL like:<br/>
            <code style={{background:"#D6EAF8",padding:"2px 6px",borderRadius:4,fontSize:"0.72rem"}}>yoursite.com/?checkin=g1</code><br/><br/>
            3. When scanned, that URL opens the check-in page for that group directly.<br/><br/>
            The "Simulate QR Scan" button above demonstrates exactly how it works.
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
                <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.05rem",fontWeight:700,color:"var(--green)",marginTop:4}}>GHS {totalOffertory.toFixed(2)}</div>
              </div>
              <div style={{background:"var(--cream)",borderRadius:10,padding:"12px",textAlign:"center"}}>
                <div style={{fontSize:"0.62rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>💵 Total Tithe</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:"1.05rem",fontWeight:700,color:"var(--gold)",marginTop:4}}>GHS {totalTithe.toFixed(2)}</div>
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
                  <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${grp?.color||"#888"},var(--navy))`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.7rem",flexShrink:0}}>{initials(m.name)}</div>
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
                  <div style={{width:30,height:30,borderRadius:"50%",background:"#ccc",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"0.7rem",flexShrink:0}}>{initials(m.name)}</div>
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
                {!isLeader&&rpt.offertory&&<span className="badge badge-green" style={{fontSize:"0.6rem"}}>🪙 GHS {rpt.offertory}</span>}
                {!isLeader&&rpt.tithe&&<span className="badge badge-gold" style={{fontSize:"0.6rem"}}>💵 GHS {rpt.tithe}</span>}
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
        { label: "My Group",   items: tabs.filter(t=>["attendance","grp-members","month","grp-history"].includes(t.id)) },
      ];

  return(
    <>
      <style>{STYLE}</style>
      <div className="app">

        {/* ── TOP HEADER (visible on all screen sizes) ── */}
        <div className="header">
          <div className="header-logo">
            <span style={{fontSize:"1.6rem"}}>⛪</span>
            <div>
              <h1>Church Attendance</h1>
              <div className="subtitle">{roleLabel}</div>
            </div>
          </div>
          {/* Mobile: show title inline */}
          <div style={{display:"flex",flexDirection:"column"}} className="no-print">
            <h1 style={{fontSize:"1rem",color:"var(--gold-light)"}}>⛪ Church Attendance</h1>
            <div className="subtitle">{currentUser.name}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right",display:"none"}} className="desktop-user">
              <div style={{fontSize:"0.82rem",fontWeight:700,color:"white"}}>{currentUser.name}</div>
              <div style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.5)"}}>🔥 Live sync</div>
            </div>
            <button className="btn btn-sm" style={{background:"rgba(255,255,255,0.15)",color:"white",fontSize:"0.68rem",border:"1px solid rgba(255,255,255,0.2)"}} onClick={()=>setCurrentUser(null)}>Sign Out</button>
          </div>
        </div>

        <div className="app-body">
          {/* ── DESKTOP SIDEBAR ── */}
          <nav className="nav-sidebar no-print">
            <div style={{padding:"10px 20px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)",marginBottom:8}}>
              <div style={{fontSize:"0.68rem",color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.8px"}}>{roleLabel}</div>
              <div style={{fontSize:"0.9rem",fontWeight:700,color:"white",marginTop:2}}>{currentUser.name}</div>
              <div style={{fontSize:"0.58rem",color:"rgba(255,255,255,0.35)",marginTop:2}}>🔥 Live synced</div>
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
  );
}
