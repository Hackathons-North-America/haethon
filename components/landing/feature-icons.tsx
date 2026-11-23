/* Small color icons for the landing page's four-up feature row. All are
   generated placeholders, decorative only (the labels beside them carry the
   meaning). */

export function FlagsIcon() {
  return (
    <svg aria-hidden="true" className="h-8 w-[66px]" viewBox="0 0 66 32">
      <defs>
        <clipPath id="feature-flag-us">
          <rect height="30" rx="7" width="30" x="1" y="1" />
        </clipPath>
        <clipPath id="feature-flag-ca">
          <rect height="30" rx="7" width="30" x="35" y="1" />
        </clipPath>
      </defs>

      <g clipPath="url(#feature-flag-us)">
        <rect fill="#fff" height="30" width="30" x="1" y="1" />
        {[0, 2, 4, 6, 8, 10, 12].map((stripe) => (
          <rect fill="#c8323c" height="2.31" key={stripe} width="30" x="1" y={1 + stripe * 2.31} />
        ))}
        <rect fill="#2b3a8c" height="16.2" width="14" x="1" y="1" />
        {[4, 8, 12].flatMap((cx) =>
          [4.5, 8.5, 12.5].map((cy) => <circle cx={cx} cy={cy} fill="#fff" key={`${cx}-${cy}`} r="0.9" />)
        )}
      </g>
      <rect fill="none" height="30" rx="7" stroke="#1b1917" strokeOpacity="0.12" width="30" x="1" y="1" />

      <g clipPath="url(#feature-flag-ca)">
        <rect fill="#fff" height="30" width="30" x="35" y="1" />
        <rect fill="#d52b1e" height="30" width="7.5" x="35" y="1" />
        <rect fill="#d52b1e" height="30" width="7.5" x="57.5" y="1" />
        <path
          d="M50 7.5 l1.6 3.4 2-0.8 -0.6 3.6 3-1.6 -0.8 2.6 1.8 0.6 -3.4 3 0.6 1.6 -3.6 -0.6 v4.2 h-1.2 v-4.2 l-3.6 0.6 0.6 -1.6 -3.4 -3 1.8 -0.6 -0.8 -2.6 3 1.6 -0.6 -3.6 2 0.8 Z"
          fill="#d52b1e"
        />
      </g>
      <rect fill="none" height="30" rx="7" stroke="#1b1917" strokeOpacity="0.12" width="30" x="35" y="1" />
    </svg>
  );
}

export function TicketIcon() {
  return (
    <svg aria-hidden="true" className="h-9 w-[58px]" viewBox="0 0 58 36">
      <path
        d="M4 6 H40 a3 3 0 0 0 6 0 H54 a2 2 0 0 1 2 2 V28 a2 2 0 0 1 -2 2 H46 a3 3 0 0 0 -6 0 H4 a2 2 0 0 1 -2 -2 V8 a2 2 0 0 1 2 -2 Z"
        fill="#fff"
        stroke="#1b1917"
        strokeOpacity="0.15"
      />
      <path d="M46 6 H54 a2 2 0 0 1 2 2 V28 a2 2 0 0 1 -2 2 H46 Z" fill="#1b1917" />
      <path d="M43 11 V25" stroke="#1b1917" strokeDasharray="2 2" strokeOpacity="0.4" />
      <rect fill="#1b1917" height="3" opacity="0.8" rx="1.5" width="20" x="8" y="12" />
      <rect fill="#1b1917" height="2" opacity="0.3" rx="1" width="28" x="8" y="19" />
      <rect fill="#1b1917" height="2" opacity="0.3" rx="1" width="16" x="8" y="24" />
    </svg>
  );
}

export function GlobeStarIcon() {
  return (
    <svg aria-hidden="true" className="h-8 w-[60px]" fill="none" viewBox="0 0 60 32">
      <circle cx="16" cy="16" fill="#fff" r="14" stroke="#111" strokeWidth="2" />
      <ellipse cx="16" cy="16" rx="6" ry="14" stroke="#111" strokeWidth="1.6" />
      <path d="M2 16 H30 M4.5 9 H27.5 M4.5 23 H27.5" stroke="#111" strokeWidth="1.6" />
      <circle cx="43" cy="16" fill="#2b5bd7" r="15" stroke="#fff" strokeWidth="2" />
      <path d="M43 8.5 l2.3 4.7 5.2 0.8 -3.8 3.6 0.9 5.1 -4.6 -2.4 -4.6 2.4 0.9 -5.1 -3.8 -3.6 5.2 -0.8 Z" fill="#fff" />
    </svg>
  );
}

export function DotsIcon() {
  return (
    <svg aria-hidden="true" className="h-2 w-[34px]" viewBox="0 0 34 8">
      {[4, 17, 30].map((cx) => (
        <circle cx={cx} cy="4" fill="#2fa84f" key={cx} r="3.5" />
      ))}
    </svg>
  );
}
