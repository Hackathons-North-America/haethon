/* Hero illustration: an open orange equipment case stuffed with hackathon gear
   (a stickered laptop lid, a tall energy drink can, a lanyard badge, a pizza
   slice and a sticker sheet). Everything is drawn back to front, so the case's
   front wall, painted last, hides the bottom of each item and they read as
   sitting inside it. Decorative: the headline beside it carries the meaning. */
const pepperoni = [
  { cx: 245, cy: 94, r: 6.5 },
  { cx: 268, cy: 100, r: 6 },
  { cx: 255, cy: 122, r: 5.5 },
];
const oregano = [
  [238, 86],
  [262, 88],
  [250, 106],
  [272, 84],
  [258, 134],
  [244, 112],
];
const droplets = [
  [121, 62, 1.6],
  [158, 74, 1.2],
  [124, 118, 1.4],
  [155, 128, 1.8],
  [130, 146, 1.1],
];

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
          <stop offset="0" stopColor="#eef0f3" />
          <stop offset="0.55" stopColor="#d3d8df" />
          <stop offset="1" stopColor="#b9c0c9" />
        </linearGradient>
        {/* Horizontal shading that makes the can read as a cylinder. */}
        <linearGradient id="toolbox-can" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#101224" />
          <stop offset="0.22" stopColor="#2b3070" />
          <stop offset="0.4" stopColor="#3b4290" />
          <stop offset="0.7" stopColor="#222658" />
          <stop offset="1" stopColor="#0d0f1f" />
        </linearGradient>
        <linearGradient id="toolbox-can-metal" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8b929c" />
          <stop offset="0.35" stopColor="#eef1f4" />
          <stop offset="0.65" stopColor="#c3c9d1" />
          <stop offset="1" stopColor="#7d848e" />
        </linearGradient>
        <linearGradient id="toolbox-cheese" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fbd970" />
          <stop offset="1" stopColor="#f0b23a" />
        </linearGradient>
        <linearGradient id="toolbox-crust" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d99050" />
          <stop offset="1" stopColor="#b5652c" />
        </linearGradient>
      </defs>

      {/* Ground shadow. */}
      <ellipse cx="150" cy="285" fill="#000" opacity="0.12" rx="138" ry="5" />

      {/* Open top: the dark inside of the back wall. */}
      <path d="M16 170 L26 146 H274 L284 170 Z" fill="url(#toolbox-interior)" />

      {/* Laptop lid: brushed-metal gradient, a bevelled edge, a glare across
          the top corner, and die-cut stickers with white borders. */}
      <g transform="rotate(-7 78 120)">
        <rect fill="#000" height="126" opacity="0.12" rx="7" width="112" x="25" y="59" />
        <rect fill="url(#toolbox-laptop)" height="126" rx="7" stroke="#a7aeb8" strokeWidth="1.5" width="112" x="22" y="56" />
        <rect height="120" rx="5" stroke="#fff" strokeOpacity="0.6" strokeWidth="1" width="106" x="25" y="59" />
        <path d="M29 57.5 H78 L23.5 124 V63 Q23.5 57.5 29 57.5 Z" fill="#fff" opacity="0.22" />

        <circle cx="54" cy="86" fill="#e4572e" r="14" stroke="#fff" strokeWidth="2.5" />
        <circle cx="54" cy="86" r="16.2" stroke="#000" strokeOpacity="0.08" strokeWidth="1" />
        <text fill="#fff" fontFamily="var(--font-geist-mono)" fontSize="10" fontWeight="600" textAnchor="middle" x="54" y="89.5">
          {"</>"}
        </text>

        <rect fill="#2b4fd8" height="18" rx="9" stroke="#fff" strokeWidth="2" width="40" x="78" y="98" />
        <text fill="#fff" fontSize="8.5" fontWeight="700" letterSpacing="0.6" textAnchor="middle" x="98" y="110">
          HACK
        </text>

        <path d="M48 120 l10 -6 l10 6 v12 l-10 6 l-10 -6 Z" fill="#f2c14e" stroke="#fff" strokeLinejoin="round" strokeWidth="2" />
        <path d="M51.5 122 l6.5 -3.9 l6.5 3.9 v8 l-6.5 3.9 l-6.5 -3.9 Z" stroke="#d9a52c" strokeWidth="0.8" />
        <text fill="#3a2a00" fontSize="7" fontWeight="800" textAnchor="middle" x="58" y="128.5">
          JS
        </text>

        <path
          d="M108 66 l3.2 6.6 7.2 1 -5.2 5 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.2 -5 7.2 -1 Z"
          fill="#2fa84f"
          stroke="#fff"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />

        <g transform="rotate(12 101 136)">
          <rect fill="#1b1917" height="14" rx="3" stroke="#fff" strokeWidth="1.8" width="26" x="88" y="129" />
          <text fill="#4ade80" fontFamily="var(--font-geist-mono)" fontSize="8" fontWeight="700" x="92" y="139">
            {">_"}
          </text>
        </g>
      </g>

      {/* Lanyard strap: two strands from the badge clip that disappear behind
          the can, drawn before it so the can covers their ends. A dashed
          lighter line on each is the woven stitching. */}
      <path
        d="M199 58 C192 42 172 34 150 32 M207 58 C204 36 180 22 155 20"
        stroke="#2b4fd8"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M199 58 C192 42 172 34 150 32 M207 58 C204 36 180 22 155 20"
        stroke="#7d95f0"
        strokeDasharray="3 3"
        strokeLinecap="round"
        strokeWidth="1.2"
      />

      {/* Tall energy drink can: a cylinder-shaded body, a metal neck and lid
          with the pull tab, a lightning bolt, and a few condensation beads. */}
      <g transform="rotate(-6 141 100)">
        <path d="M114 36 Q114 30 120 26 H164 Q170 30 170 36 V186 H114 Z" fill="#000" opacity="0.14" />
        <path d="M112 34 Q112 28 118 24 H162 Q168 28 168 34 V184 H112 Z" fill="url(#toolbox-can)" />

        <path d="M116 18 H164 L168 30 H112 Z" fill="url(#toolbox-can-metal)" />
        <rect fill="url(#toolbox-can-metal)" height="7" rx="3" stroke="#7d848e" strokeWidth="0.8" width="50" x="115" y="12" />
        <rect fill="#fff" height="1.2" opacity="0.7" rx="0.6" width="40" x="120" y="13.5" />
        <rect fill="#ccd2d9" height="5" rx="2.5" stroke="#7d848e" strokeWidth="0.8" width="14" x="133" y="8.5" />
        <circle cx="137" cy="11" fill="#7d848e" r="1.2" />
        <rect fill="#000" height="2" opacity="0.25" width="56" x="112" y="30" />

        <rect fill="#fff" height="150" opacity="0.22" rx="2" width="4" x="120" y="34" />
        <rect fill="#fff" height="150" opacity="0.12" rx="0.75" width="1.5" x="127" y="34" />
        <rect fill="#000" height="150" opacity="0.18" width="6" x="160" y="34" />

        <text fill="#fff" fontSize="9" fontWeight="800" letterSpacing="1.5" textAnchor="middle" x="140" y="46">
          HACK
        </text>
        <path d="M148 54 L128 100 H141 L134 138 L158 86 H145 L152 54 Z" fill="#0b0c1a" opacity="0.45" transform="translate(2 2)" />
        <path d="M148 54 L128 100 H141 L134 138 L158 86 H145 L152 54 Z" fill="#b6f23a" />
        <path d="M148 54 L132 92" stroke="#fff" strokeLinecap="round" strokeOpacity="0.55" strokeWidth="1.5" />
        <text fill="#b6f23a" fontSize="11" fontWeight="800" letterSpacing="1.2" textAnchor="middle" x="140" y="154">
          FUEL
        </text>

        {droplets.map(([cx, cy, r]) => (
          <g key={`${cx}-${cy}`}>
            <ellipse cx={cx} cy={cy} fill="#fff" opacity="0.45" rx={r} ry={r * 1.3} />
            <circle cx={cx - r * 0.3} cy={cy - r * 0.4} fill="#fff" opacity="0.8" r={r * 0.35} />
          </g>
        ))}
      </g>

      {/* Hacker badge in a clear plastic sleeve, hanging from a metal clip. */}
      <g transform="rotate(7 204 106)">
        <circle cx="204" cy="47" r="3.5" stroke="#8a929c" strokeWidth="1.8" />
        <rect fill="#8a929c" height="9" rx="2" width="14" x="197" y="50" />
        <rect fill="#fff" height="1.5" opacity="0.5" rx="0.75" width="10" x="199" y="51.5" />

        <rect fill="#000" height="102" opacity="0.1" rx="7" width="74" x="169.5" y="58.5" />
        <rect fill="#fff" height="102" rx="7" stroke="#d6d6d6" width="74" x="167" y="56" />
        <path d="M167 63 a7 7 0 0 1 7 -7 h60 a7 7 0 0 1 7 7 v19 h-74 Z" fill="#2b4fd8" />
        <rect fill="#f2c14e" height="2" width="74" x="167" y="82" />
        <rect fill="#fff" height="4" opacity="0.85" rx="2" width="16" x="196" y="60" />
        <text fill="#fff" fontSize="9" fontWeight="700" letterSpacing="1" textAnchor="middle" x="204" y="77">
          HACKER
        </text>

        <circle cx="204" cy="101" fill="#f3dccf" r="13" stroke="#2b4fd8" strokeOpacity="0.25" strokeWidth="1.5" />
        <path d="M195 110 a9 7 0 0 1 18 0 Z" fill="#2b4fd8" opacity="0.75" />
        <circle cx="204" cy="97" fill="#e2b393" r="5" />
        <path d="M198.8 96.5 a5.2 5.2 0 0 1 10.4 0 q-2.6 -1.8 -5.2 -1.3 q-2.6 0.4 -5.2 1.3 Z" fill="#5a3a36" />

        <rect fill="#1b1917" height="4" rx="2" width="38" x="185" y="121" />
        <rect fill="#2b4fd8" height="5" opacity="0.15" rx="2.5" width="28" x="190" y="128" />
        <rect fill="#2b4fd8" height="2" opacity="0.6" rx="1" width="20" x="194" y="129.5" />
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
        <rect fill="#9aa0a6" height="1.5" rx="0.75" width="34" x="187" y="150" />

        {/* Sleeve glare. */}
        <path d="M172 58 H196 L168 104 V64 Q168 58 172 58 Z" fill="#fff" opacity="0.18" />
      </g>

      {/* Pizza slice: shaded cheese with drips off both edges, a baked crust
          with char spots, pepperoni with cupped centres, basil and oregano. */}
      <g transform="translate(0 16) rotate(16 256 118)">
        <path d="M226 74 H286 L256 176 Z" fill="url(#toolbox-cheese)" />
        <path d="M235.5 100 Q230.5 104 231.5 109.5 Q232.8 113 235 110.2 Q236 106 237.6 104.8 Z" fill="#f4c04a" />
        <path d="M274.4 108 Q279.5 112 278.2 117.5 Q277 120.5 275.4 117.6 Q275 114 272.6 112.8 Z" fill="#f2b93f" />
        <path d="M232 84 Q238 96 236 104 M276 86 Q272 98 276 108" stroke="#e8a93a" strokeLinecap="round" strokeWidth="3" />
        <path d="M244 140 Q250 150 252 160" stroke="#e8a93a" strokeLinecap="round" strokeOpacity="0.7" strokeWidth="2" />

        {pepperoni.map(({ cx, cy, r }) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx + 0.8} cy={cy + 1} fill="#9e2b22" opacity="0.35" r={r} />
            <circle cx={cx} cy={cy} fill="#c8382e" r={r} />
            <circle cx={cx + 0.6} cy={cy + 0.6} fill="#a82a22" opacity="0.5" r={r * 0.62} />
            <circle cx={cx - 1.5} cy={cy + 1.8} fill="#8f1f1a" r="0.8" />
            <circle cx={cx + 2} cy={cy - 0.8} fill="#8f1f1a" r="0.7" />
            <circle cx={cx - r * 0.38} cy={cy - r * 0.38} fill="#fff" opacity="0.35" r={r * 0.24} />
          </g>
        ))}

        <g transform="translate(248 145) rotate(-30)">
          <path d="M0 0 Q5 -5.5 11 0 Q5 5.5 0 0 Z" fill="#3f8f3a" />
          <path d="M0.5 0 H10" stroke="#2c6b28" strokeWidth="0.6" />
        </g>
        {oregano.map(([x, y]) => (
          <rect fill="#5f7428" height="1.4" key={`${x}-${y}`} rx="0.5" transform={`rotate(35 ${x} ${y})`} width="2" x={x} y={y} />
        ))}

        <path d="M221 66 Q256 54 291 66 L288 80 Q256 70 224 80 Z" fill="url(#toolbox-crust)" />
        <path d="M228 66.5 Q256 58 284 66.5" stroke="#efb27a" strokeLinecap="round" strokeOpacity="0.8" strokeWidth="1.6" />
        {[
          [236, 70, 2],
          [252, 66, 1.4],
          [268, 68, 1.8],
          [280, 72, 1.2],
        ].map(([cx, cy, r]) => (
          <ellipse cx={cx} cy={cy} fill="#9a5424" key={cx} opacity="0.55" rx={r * 1.4} ry={r * 0.8} />
        ))}
      </g>

      {/* Sticker sheet leaning on the front left: die-cut lines around each
          sticker, and the green one half peeled with its corner folded back. */}
      <g transform="rotate(-15 40 150)">
        <rect fill="#000" height="62" opacity="0.1" rx="5" width="56" x="14" y="118" />
        <rect fill="#fbfbfa" height="62" rx="5" stroke="#dcdcdc" width="56" x="12" y="116" />

        <circle cx="27" cy="131" r="10" stroke="#d4d4d4" strokeWidth="0.8" />
        <circle cx="27" cy="131" fill="#e4572e" r="8" />
        <path d="M27 134.6 L23.3 130.9 A2.2 2.2 0 0 1 27 128.3 A2.2 2.2 0 0 1 30.7 130.9 Z" fill="#fff" />

        <rect height="18" rx="4.5" stroke="#d4d4d4" strokeWidth="0.8" width="20" x="42" y="122" />
        <path d="M47 124 H53 L60 131 V135 Q60 138 57 138 H47 Q44 138 44 135 V127 Q44 124 47 124 Z" fill="#2fa84f" />
        <path d="M51 129 l3 3 l5 -6" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" transform="translate(-4 2)" />
        <path d="M53 124 L60 131 L53 131 Z" fill="#000" opacity="0.12" transform="translate(0.8 0.8)" />
        <path d="M53 124 L60 131 L53 131 Z" fill="#ececec" stroke="#d0d0d0" strokeLinejoin="round" strokeWidth="0.5" />

        <path d="M18 154 L27 139 L36 154 Z" stroke="#d4d4d4" strokeLinejoin="round" strokeWidth="0.8" />
        <path d="M20 152 l7 -11 7 11 Z" fill="#2b4fd8" />
        <rect fill="#fff" height="4" rx="0.6" width="1.4" x="26.3" y="145" />
        <circle cx="27" cy="150.4" fill="#fff" r="0.8" />

        <circle cx="52" cy="149" r="9" stroke="#d4d4d4" strokeWidth="0.8" />
        <circle cx="52" cy="149" fill="#f2c14e" r="7" />
        <circle cx="49.6" cy="147.4" fill="#6b4a00" r="0.9" />
        <circle cx="54.4" cy="147.4" fill="#6b4a00" r="0.9" />
        <path d="M49 150.4 Q52 153.4 55 150.4" stroke="#6b4a00" strokeLinecap="round" strokeWidth="1.1" />
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
