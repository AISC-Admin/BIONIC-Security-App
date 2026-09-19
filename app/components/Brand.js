// Logo Bionic Stratom : marque maison (deux arches en degrade navy -> bleu,
// evoquant un pont/une connexion), recoloree aux teintes du site officiel
// mais dessinee independamment (ce n'est pas une reprise de leur logo).
export function LogoMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bsBack" x1="8" y1="52" x2="58" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a212c" />
          <stop offset="1" stopColor="#5b98d6" />
        </linearGradient>
        <linearGradient id="bsFront" x1="40" y1="52" x2="92" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b98d6" />
          <stop offset="1" stopColor="#8dbbea" />
        </linearGradient>
        <linearGradient id="bsRibbon" x1="0" y1="45" x2="100" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4f6f9" />
          <stop offset="1" stopColor="#8dbbea" />
        </linearGradient>
      </defs>
      <path d="M4,50 L12,50 L10,60 L2,60 Z" fill="#10151d" opacity=".9" />
      <path d="M54,50 L64,50 L62,60 L52,60 Z" fill="#10151d" opacity=".9" />
      <path d="M88,44 L96,44 L94,56 L86,56 Z" fill="#1a212c" opacity=".9" />
      <g stroke="#c7d0dc" strokeWidth="0.8" opacity=".4">
        <line x1="14" y1="42" x2="14" y2="52" />
        <line x1="20" y1="28" x2="20" y2="52" />
        <line x1="26" y1="16" x2="26" y2="52" />
        <line x1="40" y1="16" x2="40" y2="52" />
        <line x1="46" y1="28" x2="46" y2="52" />
        <line x1="52" y1="42" x2="52" y2="52" />
      </g>
      <path
        d="M8,52 C8,26 18,6 33,6 C48,6 58,26 58,52"
        fill="none"
        stroke="url(#bsBack)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <g stroke="#e7ebf1" strokeWidth="0.8" opacity=".45">
        <line x1="48" y1="46" x2="48" y2="52" />
        <line x1="54" y1="34" x2="54" y2="52" />
        <line x1="60" y1="24" x2="60" y2="52" />
        <line x1="72" y1="24" x2="72" y2="52" />
        <line x1="78" y1="34" x2="78" y2="52" />
        <line x1="84" y1="46" x2="84" y2="52" />
      </g>
      <path
        d="M40,52 C40,32 50,16 66,16 C82,16 92,32 92,52"
        fill="none"
        stroke="url(#bsFront)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M0,50 C20,44 40,46 55,49 C70,52 85,50 96,45 L100,50 L92,54 C78,58 62,57 50,54 C35,50 18,49 0,54 Z"
        fill="url(#bsRibbon)"
        opacity=".92"
      />
    </svg>
  );
}

// Rose des vents decorative (motif nautique generique a 8 pointes, maison :
// facettes claires/sombres alternees pour un effet biseaute, anneau de
// graduation). Placee en filigrane derriere l'ecran de connexion, avec une
// lente rotation en CSS (voir .compass-rose dans globals.css).
const TICK_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];

const POINTES = [
  // centre, epaule gauche, pointe, epaule droite (rayon long = cardinaux N/E/S/O) ;
  // epaule large (+/-14 deg) a mi-hauteur pour un profil de losange bien visible,
  // pas juste une fine aiguille.
  { c: [100, 100], a: [95.65, 82.53], tip: [100, 8], b: [104.35, 82.53] }, // N
  { c: [100, 100], a: [117.47, 95.65], tip: [192, 100], b: [117.47, 104.35] }, // E
  { c: [100, 100], a: [104.35, 117.47], tip: [100, 192], b: [95.65, 117.47] }, // S
  { c: [100, 100], a: [82.53, 104.35], tip: [8, 100], b: [82.53, 95.65] }, // O
  // rayon court = diagonales NE/SE/SO/NO
  { c: [100, 100], a: [107.21, 88.0], tip: [148.08, 51.92], b: [112.0, 92.79] }, // NE
  { c: [100, 100], a: [112.0, 107.21], tip: [148.08, 148.08], b: [107.21, 112.0] }, // SE
  { c: [100, 100], a: [92.79, 112.0], tip: [51.92, 148.08], b: [88.0, 107.21] }, // SO
  { c: [100, 100], a: [88.0, 92.79], tip: [51.92, 51.92], b: [92.79, 88.0] } // NO
];

export function CompassRose({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="96" fill="none" stroke="#8dbbea" strokeWidth="0.6" />
      <circle cx="100" cy="100" r="86" fill="none" stroke="#8dbbea" strokeWidth="0.5" />
      <g fill="#8dbbea">
        {TICK_ANGLES.map((angle) => (
          <rect key={angle} x="98.6" y="86" width="2.8" height="10" transform={`rotate(${angle} 100 100)`} />
        ))}
      </g>
      {POINTES.map((p, i) => (
        <g key={i}>
          <polygon points={`${p.c},${p.a},${p.tip}`} fill="#8dbbea" />
          <polygon points={`${p.c},${p.tip},${p.b}`} fill="#25303d" />
        </g>
      ))}
      <circle cx="100" cy="100" r="4" fill="#8dbbea" />
    </svg>
  );
}

export function Brand({ subtitle }) {
  return (
    <span className="brand">
      <LogoMark className="brand-icon" />
      <span className="brand-text">
        <span className="brand-word">
          <b>BIONIC</b> <span>Stratom</span>
        </span>
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
