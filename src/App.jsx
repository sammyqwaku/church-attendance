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

  return [storedValue, setValue];
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

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App(){
  // ── PERSISTENT STATE (survives page refresh via localStorage) ───
  const [groups,       setGroups]       = useLocalStorage("church_groups",       initGroups);
  const [members,      setMembers]      = useLocalStorage("church_members",      initMembers);
  const [users,        setUsers]        = useLocalStorage("church_users",        initUsers);
  const [attendance,   setAttendance]   = useLocalStorage("church_attendance",   {});
  const [dailyReports, setDailyReports] = useLocalStorage("church_dailyreports", {});
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

  // ── NOTE: Seed data removed — all data comes from Firebase ─────



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
  const emptyReport=()=>({offertory:"",tithe:"",visitors:"0",soulsWon:"0",holySpirit:"0",bibleStudy:"0",activities:"",notes:""});
  const getReport=date=>dailyReports[date]||emptyReport();
  const saveReport=(date,field,val)=>setDailyReports(p=>({...p,[date]:{...getReport(date),[field]:val}}));

  // ── TABS config ───────────────────────────────────────────────
  // ── TABS config ───────────────────────────────────────────────
  const tabs=isAdmin
    ?[{id:"dashboard",label:"📊 Dash"},{id:"charts",label:"📈 Trends"},{id:"sec-totals",label:"📋 Secretary"},{id:"sec-report",label:"📝 Rpt"},{id:"breakdown",label:"🔢 Breakdown"},{id:"history",label:"🗂 History"},{id:"members",label:"👥 Members"},{id:"users",label:"👤 Users"},{id:"qrcodes",label:"📱 QR Codes"}]
    :isSecretary
    ?[{id:"sec-totals",label:"📊 Totals"},{id:"charts",label:"📈 Trends"},{id:"sec-report",label:"📝 Daily Rpt"},{id:"breakdown",label:"🔢 Breakdown"},{id:"history",label:"🗂 History"}]
    :[{id:"attendance",label:"✅ Mark"},{id:"dashboard",label:"📊 Stats"},{id:"charts",label:"📈 Trends"}];

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

  // ════════════════ SEC DAILY REPORT ═══════════════════════════
  const SecReportTab=()=>{
    const rpt=getReport(selectedDate);
    const total=getTotalStats(selectedDate);
    const Field=({label,icon,field,type="number",placeholder="0"})=>(
      <div className="report-field">
        <label>{icon} {label}</label>
        <input className="input" type={type} placeholder={placeholder}
          value={rpt[field]} onChange={e=>saveReport(selectedDate,field,e.target.value)}/>
      </div>
    );
    return(
      <div className="scroll-area">
        <DatePicker value={selectedDate} onChange={setSelectedDate}/>
        <div className="summary-banner">
          <h3>📊 Attendance Summary</h3>
          <div className="summary-grid">
            {[{l:"Enrolled",v:total.total},{l:"Present",v:total.present},{l:"Rate",v:total.pct+"%"}].map(s=>(
              <div className="summary-cell" key={s.l}><div className="summary-num">{s.v}</div><div className="summary-lbl">{s.l}</div></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">💰 Financial Records</div>
          <Field label="Offertory (GHS)" icon="🪙" field="offertory" type="text" placeholder="0.00"/>
          <Field label="Tithe (GHS)"     icon="💵" field="tithe"     type="text" placeholder="0.00"/>
        </div>
        <div className="card">
          <div className="card-title">🌱 Spiritual Records</div>
          <Field label="Visitors"               icon="🙋" field="visitors"/>
          <Field label="Souls Won"              icon="✨" field="soulsWon"/>
          <Field label="Holy Spirit Baptism"    icon="🕊️" field="holySpirit"/>
          <Field label="Bible Study Attendance" icon="📖" field="bibleStudy"/>
        </div>
        <div className="card">
          <div className="card-title">📌 Activities & Notes</div>
          <div className="report-field">
            <label>🗓️ Activities Held</label>
            <input className="input" type="text" placeholder="e.g. Youth Meeting, Prayer Session"
              value={rpt.activities} onChange={e=>saveReport(selectedDate,"activities",e.target.value)}/>
          </div>
          <div className="report-field">
            <label>📝 Secretary Notes</label>
            <textarea className="input" rows={3} placeholder="Any additional observations..."
              value={rpt.notes} onChange={e=>saveReport(selectedDate,"notes",e.target.value)} style={{resize:"vertical"}}/>
          </div>
        </div>
        {/* ── BREAKDOWN SECTION ── */}
        <p className="section-label">🔢 Attendance Breakdown</p>
        <div className="demo-grid">
          {CATEGORIES.map(cat=>{
            const cm=members.filter(m=>m.category===cat);
            const present=cm.filter(m=>isPresent(selectedDate,m.id)).length;
            const pct=cm.length?Math.round(present/cm.length*100):0;
            if(cm.length===0)return null;
            return(
              <div className="demo-box" key={cat}>
                <div className="demo-label">{CAT_ICONS[cat]} {cat}</div>
                <div className="demo-val">{present}<span style={{fontSize:"0.75rem",color:"var(--muted)",fontFamily:"Lato,sans-serif"}}>/{cm.length}</span></div>
                <div style={{margin:"4px 0 2px"}} className="progress-bar"><div className="progress-fill" style={{width:pct+"%"}}/></div>
                <div className="demo-sub">{cm.length-present} absent · {pct}%</div>
              </div>
            );
          })}
        </div>
        <p className="section-label">By Group</p>
        {groups.map(g=>{
          const st=getGroupStats(g.id,selectedDate);
          const gm=members.filter(m=>m.groupId===g.id);
          return(
            <div className="card" key={g.id} style={{padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:g.color,flexShrink:0}}/>
                <span style={{fontFamily:"Playfair Display,serif",fontWeight:700,flex:1,fontSize:"0.9rem"}}>{g.name}</span>
                <span style={{fontWeight:700,fontSize:"0.8rem",color:"var(--navy)"}}>{st.present}/{st.total}</span>
                <span className={`badge ${st.pct>=70?"badge-green":st.pct>=40?"badge-gold":"badge-red"}`}>{st.pct}%</span>
              </div>
              <div className="progress-bar" style={{marginBottom:6}}><div className="progress-fill" style={{width:st.pct+"%",background:`linear-gradient(90deg,${g.color},${g.color}99)`}}/></div>
              {st.present>0&&<div style={{fontSize:"0.68rem",color:"var(--green)",marginBottom:2}}>✓ Present: {gm.filter(m=>isPresent(selectedDate,m.id)).map(m=>m.name.split(" ").slice(-1)[0]).join(", ")}</div>}
              {st.absent>0&&<div style={{fontSize:"0.68rem",color:"var(--red)"}}>✗ Absent: {gm.filter(m=>!isPresent(selectedDate,m.id)).map(m=>m.name.split(" ").slice(-1)[0]).join(", ")}</div>}
            </div>
          );
        })}

        <div style={{margin:"0 12px",display:"flex",gap:8}}>
          <button className="btn btn-teal" style={{flex:1}} onClick={()=>showAlert("Daily report saved! ✓")}>💾 Save</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={()=>setModal({type:"printReport",date:selectedDate})}>🖨️ Print / PDF</button>
        </div>
      </div>
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

  // ════════════════ MEMBERS (admin) ════════════════════════════
  const MembersTab=()=>{
    const [search,setSearch]=useState("");
    const [fg,setFg]=useState("all");
    const [fc,setFc]=useState("all");
    const [addName,setAddName]=useState("");
    const [addGid,setAddGid]=useState(groups[0]?.id||"");
    const [addCat,setAddCat]=useState("Male");
    const [addGroupName,setAddGroupName]=useState("");
    const [addMode,setAddMode]=useState(null);

    const filtered=members.filter(m=>m.name.toLowerCase().includes(search.toLowerCase())&&(fg==="all"||m.groupId===fg)&&(fc==="all"||m.category===fc));

    const saveMember=()=>{
      if(!addName.trim())return;
      setMembers(p=>[...p,{id:"m"+Date.now(),name:addName.trim(),groupId:addGid,category:addCat}]);
      showAlert(`${addName} added!`);setAddName("");setAddMode(null);
    };
    const saveGroup=()=>{
      if(!addGroupName.trim())return;
      const color=GROUP_COLORS[groups.length%GROUP_COLORS.length];
      setGroups(p=>[...p,{id:"g"+Date.now(),name:addGroupName.trim(),color}]);
      showAlert(`Group "${addGroupName}" created!`);setAddGroupName("");setAddMode(null);
    };
    const deleteMember=id=>{setMembers(p=>p.filter(m=>m.id!==id));showAlert("Member removed","info");};

    return(
      <div className="scroll-area">
        <div style={{margin:"10px 12px 0",display:"flex",gap:7}}>
          <input className="input" placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,marginBottom:0}}/>
          <select className="select" value={fg} onChange={e=>setFg(e.target.value)} style={{flex:1,marginBottom:0}}>
            <option value="all">All Groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{margin:"6px 12px 0"}}>
          <select className="select" value={fc} onChange={e=>setFc(e.target.value)} style={{marginBottom:0}}>
            <option value="all">All Categories</option>{CATEGORIES.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
          </select>
        </div>
        <div style={{margin:"8px 12px",display:"flex",gap:7}}>
          <button className="btn btn-primary btn-sm" onClick={()=>setAddMode(addMode==="member"?null:"member")}>+ Member</button>
          <button className="btn btn-navy btn-sm" onClick={()=>setAddMode(addMode==="group"?null:"group")}>+ Group</button>
        </div>

        {addMode==="member"&&(
          <div className="card" style={{background:"#FEF9EF",border:"1.5px solid var(--gold)"}}>
            <div className="card-title">➕ Add New Member</div>
            <input className="input" placeholder="Full Name" value={addName} onChange={e=>setAddName(e.target.value)}/>
            <select className="select" value={addGid} onChange={e=>setAddGid(e.target.value)}>
              {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className="select" value={addCat} onChange={e=>setAddCat(e.target.value)}>
              {CATEGORIES.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
            </select>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveMember}>Add Member</button>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setAddMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        {addMode==="group"&&(
          <div className="card" style={{background:"#F0F4FF",border:"1.5px solid var(--navy)"}}>
            <div className="card-title">➕ Add New Group</div>
            <input className="input" placeholder="Group Name (e.g. Bereans)" value={addGroupName} onChange={e=>setAddGroupName(e.target.value)}/>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-navy" style={{flex:1}} onClick={saveGroup}>Create Group</button>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setAddMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="card">
          <div style={{fontSize:"0.72rem",color:"var(--muted)",marginBottom:8}}>{filtered.length} member{filtered.length!==1?"s":""} shown</div>
          {filtered.length===0&&<div style={{textAlign:"center",color:"var(--muted)",padding:16,fontSize:"0.82rem"}}>No members found</div>}
          {filtered.map(m=>{
            const grp=groups.find(g=>g.id===m.groupId);
            return(
              <div className="member-row" key={m.id}>
                <div className="avatar" style={{background:`linear-gradient(135deg,${grp?.color||"#888"},var(--navy))`}}>{initials(m.name)}</div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <div style={{display:"flex",gap:4,marginTop:2}}>
                    <span className="badge badge-blue" style={{fontSize:"0.6rem"}}>{grp?.name}</span>
                    <span className="badge badge-gray" style={{fontSize:"0.6rem"}}>{CAT_ICONS[m.category]} {m.category}</span>
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" style={{marginRight:4}} onClick={()=>setModal({type:"qr",member:m})}>QR</button>
                <button className="btn btn-sm" style={{background:"#FFF0F0",color:"var(--red)",border:"1px solid #FAD7D7"}} onClick={()=>deleteMember(m.id)}>✕</button>
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

  // ════════════════ RENDER ══════════════════════════════════════
  const roleLabel=isAdmin?"Pastor / Admin":isSecretary?"Church Secretary":`Leader · ${myGroup?.name||""}`;

  // Build sidebar nav groups for desktop
  const navSections = isAdmin
    ? [
        { label: "Overview",   items: tabs.filter(t=>["dashboard","charts"].includes(t.id)) },
        { label: "Secretary",  items: tabs.filter(t=>["sec-totals","sec-report","breakdown","history"].includes(t.id)) },
        { label: "Admin",      items: tabs.filter(t=>["members","users","qrcodes"].includes(t.id)) },
      ]
    : isSecretary
    ? [
        { label: "Reports",    items: tabs.filter(t=>["sec-totals","sec-report","breakdown","history"].includes(t.id)) },
        { label: "Trends",     items: tabs.filter(t=>["charts"].includes(t.id)) },
      ]
    : [
        { label: "My Group",   items: tabs.filter(t=>["attendance","dashboard","charts"].includes(t.id)) },
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

            {activeTab==="attendance"  && isLeader    && <AttendanceTab/>}
            {activeTab==="dashboard"   && (isAdmin||isLeader) && <DashboardTab/>}
            {activeTab==="sec-totals"  && (isAdmin||isSecretary) && <SecTotalsTab/>}
            {activeTab==="sec-report"  && (isAdmin||isSecretary) && <SecReportTab/>}
            {activeTab==="breakdown"   && (isAdmin||isSecretary) && <BreakdownTab/>}
            {activeTab==="history"     && (isAdmin||isSecretary) && <HistoryTab/>}
            {activeTab==="members"     && isAdmin      && <MembersTab/>}
            {activeTab==="users"       && isAdmin      && <UsersTab/>}
            {activeTab==="qrcodes"     && isAdmin      && <QRCodesTab/>}
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
