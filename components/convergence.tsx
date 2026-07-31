/* ── the signature graphic ────────────────────────────────────
   Two observers on the baseline, each firing sight lines at the
   same field of customers. Where a pair of lines meets is a point
   whose distance is actually known — that is the whole brand in
   one drawing, and the reason it is a fan and not a single burst.

   Fully deterministic: the "randomness" is a hashed sine so the
   server and client render identical markup.
   ───────────────────────────────────────────────────────────── */

const RAYS = 96;

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

type Ray = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  o: number;
  r: number;
};

function fan(originX: number, originY: number, from: number, to: number, seed: number): Ray[] {
  return Array.from({ length: RAYS }, (_, i) => {
    const t = i / (RAYS - 1);
    // jitter the angle so the fan reads as sampled data, not a sunburst
    const angle = from + (to - from) * t + (rand(i + seed) - 0.5) * 0.03;
    const len = 260 + rand(i + seed + 500) * 300;
    return {
      x1: originX,
      y1: originY,
      x2: originX + Math.cos(angle) * len,
      y2: originY + Math.sin(angle) * len,
      o: 0.28 + rand(i + seed + 900) * 0.62,
      r: 1.1 + rand(i + seed + 1300) * 1.7,
    };
  });
}

const W = 1200;
const H = 560;
const BASE_Y = 520;
const LEFT_X = 460;
const RIGHT_X = 740;

export function Convergence({ className = "" }: { className?: string }) {
  // two observation points on the same baseline — the two angles
  const left = fan(LEFT_X, BASE_Y, -Math.PI * 0.95, -Math.PI * 0.12, 7);
  const right = fan(RIGHT_X, BASE_Y, -Math.PI * 0.88, -Math.PI * 0.05, 91);
  const all = [...left, ...right];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      fill="none"
      role="img"
      aria-label="Two sets of sight lines from two positions reaching the same customers — where they converge is where distance becomes knowable"
    >
      <defs>
        <linearGradient
          id="cv-ray"
          x1="0"
          y1={BASE_Y}
          x2="0"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#001d6b" stopOpacity="1" />
          <stop offset="45%" stopColor="#0047ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#2b6bff" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="cv-glow" cx="50%" cy="95%" r="60%">
          <stop offset="0%" stopColor="#4d9bff" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#4d9bff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#cv-glow)" />

      <g stroke="url(#cv-ray)" strokeWidth="0.9" strokeLinecap="round">
        {all.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} opacity={r.o} />
        ))}
      </g>

      {/* each ray ends on a customer */}
      <g fill="#0047ff">
        {all.map((r, i) => (
          <circle key={i} cx={r.x2} cy={r.y2} r={r.r} opacity={r.o * 0.95} />
        ))}
      </g>

      {/* the two observation points, and the baseline between them */}
      <line
        x1={LEFT_X}
        y1={BASE_Y}
        x2={RIGHT_X}
        y2={BASE_Y}
        stroke="#0a1633"
        strokeWidth="1"
        opacity="0.3"
      />
      <circle cx={LEFT_X} cy={BASE_Y} r="3.5" fill="#0a1633" />
      <circle cx={RIGHT_X} cy={BASE_Y} r="3.5" fill="#0a1633" />
    </svg>
  );
}
