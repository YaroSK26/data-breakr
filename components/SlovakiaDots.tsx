// components/SlovakiaDots.tsx
//
// Hero background decoration - Slovakia's real outline (dissolved from the
// actual district geometry already in the DB via turf.js, then simplified
// and projected to a 800x263 viewBox), filled with a dot grid instead of a
// solid shape. Precomputed once and hardcoded here rather than shipping
// turf.js to the client for a static decoration.
const SLOVAKIA_PATH =
  'M 0.0 172.0 L 17.1 188.4 L 19.8 201.2 L 35.8 211.3 L 32.7 220.8 L 70.1 226.4 L 87.2 241.6 L 121.5 258.9 L 203.5 262.7 L 225.7 258.0 L 254.1 258.7 L 267.0 251.0 L 281.9 249.6 L 269.2 242.9 L 268.0 228.7 L 276.0 226.5 L 280.7 217.9 L 366.6 213.6 L 375.8 196.9 L 390.2 190.3 L 398.8 196.7 L 414.0 198.3 L 413.3 203.7 L 421.4 200.4 L 427.6 202.0 L 427.7 207.8 L 433.0 206.8 L 452.6 199.7 L 460.5 189.9 L 487.2 187.0 L 499.2 173.6 L 500.1 166.6 L 512.1 156.9 L 512.5 150.7 L 518.0 149.4 L 558.5 143.9 L 575.5 152.4 L 590.6 151.9 L 597.7 156.7 L 612.3 150.3 L 623.8 152.2 L 625.7 147.1 L 642.6 143.6 L 657.1 154.2 L 666.6 154.0 L 674.3 170.6 L 682.0 176.2 L 695.4 178.8 L 698.3 174.6 L 723.9 170.4 L 739.7 172.1 L 744.0 144.7 L 768.3 129.6 L 774.3 104.9 L 787.8 86.7 L 796.6 84.8 L 800.0 73.3 L 780.7 71.9 L 772.2 65.3 L 752.5 64.3 L 751.9 59.9 L 729.5 56.1 L 715.8 37.2 L 698.4 31.1 L 689.8 35.9 L 669.2 23.3 L 643.4 28.1 L 620.0 21.4 L 610.4 29.5 L 598.5 24.8 L 588.1 27.5 L 594.6 34.5 L 570.7 44.3 L 562.6 37.4 L 553.2 37.5 L 544.9 27.6 L 527.6 27.3 L 522.0 33.1 L 508.0 27.8 L 487.1 29.5 L 486.2 37.4 L 472.7 36.6 L 462.2 41.3 L 454.1 60.6 L 432.3 52.7 L 423.4 58.2 L 408.8 56.7 L 416.9 47.0 L 413.0 44.0 L 412.4 28.4 L 402.7 31.6 L 390.7 28.3 L 391.8 21.8 L 383.3 22.0 L 376.1 5.7 L 367.4 0.0 L 353.2 10.6 L 338.6 11.5 L 329.6 27.8 L 323.8 29.2 L 299.4 30.5 L 298.3 15.5 L 294.8 13.5 L 268.0 17.5 L 242.0 14.8 L 229.1 28.5 L 219.0 30.3 L 220.6 34.2 L 215.5 39.5 L 188.3 45.6 L 175.7 77.5 L 166.0 82.6 L 153.1 82.5 L 146.6 95.7 L 132.4 96.1 L 121.2 105.2 L 96.9 111.8 L 86.1 107.2 L 73.6 111.7 L 51.2 102.8 L 38.6 109.2 L 18.7 132.0 L 14.0 141.2 L 16.1 150.4 L 2.3 162.6 L 0.0 172.0 Z'

export function SlovakiaDots() {
  return (
    <svg
      viewBox="0 0 800 263"
      // "meet" (contain) rather than "slice" (cover) - on a narrow/tall
      // mobile hero, "slice" had to scale this wide 800x263 shape up
      // massively to cover the height, blowing the dot pattern up to a
      // huge, illegible size. "meet" keeps it at a sane, consistent size
      // regardless of the container's aspect ratio.
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0.16,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="sk-shape">
          <path d={SLOVAKIA_PATH} />
        </clipPath>
        <pattern id="sk-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="2" fill="white" />
        </pattern>
      </defs>
      <path d={SLOVAKIA_PATH} fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
      <rect x="0" y="0" width="800" height="263" fill="url(#sk-dots)" clipPath="url(#sk-shape)" />
    </svg>
  )
}
