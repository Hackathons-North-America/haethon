/* Hero illustration: an open orange equipment case stuffed with hackathon gear
   (a stickered laptop lid, a printed schedule, a lanyard badge, a pizza slice
   and a sticker sheet). Everything is drawn back to front, so the case's front
   wall, painted last, hides the bottom of each item and they read as sitting
   inside it. Decorative: the headline beside it carries the meaning. */
const scheduleRows = [44, 36, 48, 30, 42, 38, 46, 34];

export function HeroToolbox({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 300 290">
      <defs>
        <linearGradient id="toolbox-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f48a50" />
          <stop offset="1" stopColor="#e9662d" />
        </linearGradient>
        <linearGradient id="toolbox-rim" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f9a46e" />
          <stop offset="1" stopColor="#ef7c42" />
        </linearGradient>
        <linearGradient id="toolbox-interior" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#a8441b" />
          <stop offset="1" stopColor="#7c2f12" />
        </linearGradient>
        <linearGradient id="toolbox-laptop" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e6e9ee" />
          <stop offset="1" stopColor="#c4cad2" />
        </linearGradient>
      </defs>

      {/* Ground shadow. */}
      <ellipse cx="150" cy="285" fill="#000" opacity="0.12" rx="138" ry="5" />

      {/* Open top: the dark inside of the back wall. */}
      <path d="M16 170 L26 146 H274 L284 170 Z" fill="url(#toolbox-interior)" />

      {/* Laptop lid, covered in stickers. */}
      <g transform="rotate(-7 78 120)">
        <rect fill="url(#toolbox-laptop)" height="126" rx="7" stroke="#aeb5bf" strokeWidth="1.5" width="112" x="22" y="56" />
        <circle cx="54" cy="86" fill="#e4572e" r="14" />
        <text fill="#fff" fontFamily="var(--font-geist-mono)" fontSize="10" fontWeight="600" textAnchor="middle" x="54" y="89.5">
          {"</>"}
        </text>
        <rect fill="#2b4fd8" height="18" rx="9" width="40" x="78" y="98" />
        <text fill="#fff" fontSize="8.5" fontWeight="700" letterSpacing="0.6" textAnchor="middle" x="98" y="110">
          HACK
        </text>
        <path d="M48 120 l10 -6 l10 6 v12 l-10 6 l-10 -6 Z" fill="#f2c14e" />
        <path d="M108 66 l3.2 6.6 7.2 1 -5.2 5 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.2 -5 7.2 -1 Z" fill="#2fa84f" />
        <rect fill="#1b1917" height="14" rx="3" transform="rotate(12 101 136)" width="26" x="88" y="129" />
      </g>

      {/* Lanyard strap: two strands from the badge clip that disappear
          behind the schedule, drawn before it so the paper covers their ends. */}
      <path
        d="M199 58 C194 40 184 28 168 20 M207 58 C205 38 194 22 176 10"
        stroke="#2b4fd8"
        strokeLinecap="round"
        strokeWidth="5"
      />

      {/* Printed schedule. */}
      <g transform="rotate(-6 141 100)">
        <rect fill="#f7b699" height="168" rx="2" stroke="#e59775" width="88" x="97" y="14" />
        <text fill="#7a3b22" fontSize="8" fontWeight="700" letterSpacing="1.2" x="106" y="32">
          SCHEDULE
        </text>
        <rect fill="#7a3b22" height="1" opacity="0.35" width="72" x="106" y="38" />
        <rect fill="#fff" height="12" opacity="0.45" rx="2" width="76" x="102" y="84" />
        {scheduleRows.map((width, index) => (
          <g key={index}>
            <rect fill="#8c4527" height="3" opacity="0.7" rx="1" width="12" x="106" y={48 + index * 14} />
            <rect fill="#8c4527" height="3" opacity="0.4" rx="1" width={width} x="122" y={48 + index * 14} />
          </g>
        ))}
      </g>

      {/* Hacker badge. */}
      <g transform="rotate(7 204 106)">
        <rect fill="#8a929c" height="9" rx="2" width="14" x="197" y="50" />
        <rect fill="#fff" height="102" rx="7" stroke="#d6d6d6" width="74" x="167" y="56" />
        <path d="M167 63 a7 7 0 0 1 7 -7 h60 a7 7 0 0 1 7 7 v19 h-74 Z" fill="#2b4fd8" />
        <rect fill="#fff" height="4" opacity="0.85" rx="2" width="16" x="196" y="60" />
        <text fill="#fff" fontSize="9" fontWeight="700" letterSpacing="1" textAnchor="middle" x="204" y="77">
          HACKER
        </text>
        <circle cx="204" cy="101" fill="#f3dccf" r="13" />
        <circle cx="204" cy="97" fill="#c98f73" r="5" />
        <path d="M195 110 a9 7 0 0 1 18 0 Z" fill="#c98f73" />
        <rect fill="#1b1917" height="4" rx="2" width="38" x="185" y="121" />
        <rect fill="#9aa0a6" height="3" rx="1.5" width="26" x="191" y="129" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <rect
            fill="#1b1917"
            height="10"
            key={index}
            width={index % 3 === 0 ? 2.5 : 1.2}
            x={187 + index * 4}
            y="138"
          />
        ))}
      </g>

      {/* Pizza slice. */}
      <g transform="rotate(16 256 118)">
        <path d="M226 74 H286 L256 176 Z" fill="#f5c451" />
        <path d="M232 84 Q238 96 236 104 M276 86 Q272 98 276 108" stroke="#e8a93a" strokeLinecap="round" strokeWidth="3" />
        <path d="M221 66 Q256 54 291 66 L288 80 Q256 70 224 80 Z" fill="#c97a3d" />
        <circle cx="245" cy="94" fill="#c8382e" r="6.5" />
        <circle cx="268" cy="100" fill="#c8382e" r="6" />
        <circle cx="255" cy="122" fill="#c8382e" r="5.5" />
      </g>

      {/* Sticker sheet leaning on the front left. */}
      <g transform="rotate(-15 40 150)">
        <rect fill="#fff" height="62" rx="5" stroke="#dcdcdc" width="56" x="12" y="116" />
        <circle cx="27" cy="131" fill="#e4572e" r="8" />
        <rect fill="#2fa84f" height="14" rx="3" width="16" x="44" y="124" />
        <path d="M20 152 l7 -11 7 11 Z" fill="#2b4fd8" />
        <circle cx="52" cy="149" fill="#f2c14e" r="7" />
      </g>

      {/* Side handles peek out from behind the body. */}
      <rect fill="#1f1f1f" height="38" rx="4" width="16" x="0" y="196" />
      <rect fill="#1f1f1f" height="38" rx="4" width="16" x="284" y="196" />

      {/* Front wall. */}
      <rect fill="url(#toolbox-body)" height="112" rx="14" width="284" x="8" y="172" />
      <rect fill="#fff" height="9" opacity="0.14" rx="4" width="268" x="16" y="194" />
      <rect fill="#cc5520" height="92" opacity="0.3" rx="3" width="7" x="24" y="186" />
      <rect fill="#cc5520" height="92" opacity="0.3" rx="3" width="7" x="269" y="186" />
      <rect fill="#cc5520" height="3" opacity="0.3" rx="1.5" width="244" x="28" y="262" />

      {/* Rim with its row of small tabs, then the two latches. */}
      <rect fill="url(#toolbox-rim)" height="26" rx="9" width="296" x="2" y="162" />
      <rect fill="#c9531f" height="3" opacity="0.35" width="280" x="10" y="185" />
      {[34, 86, 138, 190, 242].map((x) => (
        <rect fill="#e16a33" height="13" key={x} rx="3" width="24" x={x} y="167" />
      ))}
      {[62, 214].map((x) => (
        <g key={x}>
          <rect fill="#f08048" height="32" rx="5" stroke="#c95a26" strokeWidth="1.5" width="24" x={x} y="178" />
          <rect fill="#c95a26" height="3" opacity="0.6" rx="1.5" width="14" x={x + 5} y="200" />
        </g>
      ))}

      {/* Feet. */}
      <rect fill="#c85524" height="6" rx="3" width="44" x="30" y="280" />
      <rect fill="#c85524" height="6" rx="3" width="44" x="226" y="280" />
    </svg>
  );
}
