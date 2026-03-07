// ═══════════════════════════════════════════════════════════════
// CHURCH CONFIGURATION FILE
// ═══════════════════════════════════════════════════════════════
// This is the ONLY file you need to edit when setting up the app
// for a new church assembly. Change the values below and deploy.
//
// HOW TO USE FOR A NEW ASSEMBLY:
// 1. Edit the values in this file
// 2. Replace firebase.js with the new assembly's Firebase config
// 3. Deploy to a new Vercel project
// 4. Done!
// ═══════════════════════════════════════════════════════════════

const CHURCH_CONFIG = {

  // ── Church Identity ─────────────────────────────────────────
  // The full name shown on login page and reports
  CHURCH_NAME: "COP - Christ Temple Assembly",

  // Short name shown in header and sidebar
  CHURCH_SHORT_NAME: "Christ Temple",

  // Church emoji/icon shown on login page
  CHURCH_ICON: "⛪",

  // Denomination or subtitle shown under the name
  CHURCH_SUBTITLE: "Select your role and enter PIN",

  // ── Location ────────────────────────────────────────────────
  // Used in reports and district submissions
  CHURCH_LOCATION: "Ghana",

  // District name for auto-generated district reports
  DISTRICT_NAME: "District",

  // ── Currency ────────────────────────────────────────────────
  // Currency symbol used in financial records
  CURRENCY: "GHS",

  // ── Security ────────────────────────────────────────────────
  // Change this to a unique value for each assembly.
  // It is used as a fallback salt for legacy PIN hashing.
  // Use something unique like: "assembly_name_city_2024"
  LEGACY_SALT: "cop_christ_temple_salt",

  // ── Default PINs ────────────────────────────────────────────
  // These are the PINs used when the app is first set up.
  // IMPORTANT: Tell the Pastor to change these immediately!
  DEFAULT_ADMIN_PIN: "1234",
  DEFAULT_SECRETARY_PIN: "5678",
  DEFAULT_LEADER_PIN: "1111",

  // ── Service Types ───────────────────────────────────────────
  // Customise these to match the assembly's service schedule
  SERVICE_TYPES: ["Sunday Morning", "Mid-Week", "Friday Evening"],
  SERVICE_ICONS: {
    "Sunday Morning": "☀️",
    "Mid-Week": "📖",
    "Friday Evening": "🌙",
  },

  // ── Member Categories ───────────────────────────────────────
  // Customise to match how the assembly classifies members
  MEMBER_CATEGORIES: [
    "Male",
    "Female",
    "Youth (Male)",
    "Youth (Female)",
    "Children",
  ],

  // ── Branding Colors ─────────────────────────────────────────
  // Main color scheme — change to match assembly's branding
  COLOR_NAVY:      "#1A2744",   // Primary dark color
  COLOR_GOLD:      "#C9973A",   // Accent/highlight color
  COLOR_GREEN:     "#27AE60",   // Success/present color

  // ── Contact & Support ───────────────────────────────────────
  // Your name/company shown nowhere in the app — just for your records
  DEVELOPER_NAME:  "Your Name Here",
  DEVELOPER_PHONE: "+233XXXXXXXXX",

};

export default CHURCH_CONFIG;


// ═══════════════════════════════════════════════════════════════
// SETUP CHECKLIST FOR A NEW ASSEMBLY
// ═══════════════════════════════════════════════════════════════
//
// Step 1 — Firebase Setup (5 minutes, free)
//   □ Go to console.firebase.google.com
//   □ Create a new project (e.g. "st-peters-assembly")
//   □ Enable Firestore Database
//   □ Enable Anonymous Authentication
//   □ Copy the firebaseConfig and paste into firebase.js
//   □ Deploy Firestore Security Rules
//
// Step 2 — Edit This File (2 minutes)
//   □ Change CHURCH_NAME to the assembly's full name
//   □ Change CHURCH_SHORT_NAME to a short version
//   □ Change CHURCH_LOCATION to the city/town
//   □ Change LEGACY_SALT to something unique for this assembly
//   □ Change CURRENCY if needed (e.g. NGN for Nigeria)
//   □ Adjust SERVICE_TYPES if the assembly has different services
//
// Step 3 — Deploy to Vercel (3 minutes, free)
//   □ Create a new GitHub repository
//   □ Push the code to GitHub
//   □ Go to vercel.com → New Project → Import from GitHub
//   □ Deploy (takes about 2 minutes)
//   □ Share the URL with the assembly
//
// Step 4 — First Login (2 minutes)
//   □ Open the deployed URL
//   □ Log in as Pastor with default PIN 1234
//   □ Go to Users tab → change all PINs immediately
//   □ Add groups and members
//   □ Done!
//
// Total setup time: about 12 minutes per assembly
// ═══════════════════════════════════════════════════════════════
