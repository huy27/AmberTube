import { useId, useMemo } from 'react';
import type { SceneVariant } from '../types';

// Original illustrated "scene" thumbnails for demo tracks (no external images needed).

function rng(seedStr: string): () => number {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function Skyline({ rand, hue, base = 180, light = 14 }: { rand: () => number; hue: number; base?: number; light?: number }) {
  const blds: { x: number; w: number; h: number }[] = [];
  let x = -4;
  while (x < 330) {
    const w = 14 + rand() * 26;
    const h = 30 + rand() * 70;
    blds.push({ x, w, h });
    x += w + 1;
  }
  return (
    <g>
      {blds.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={base - b.h} width={b.w} height={b.h} fill={hsl(hue + 10, 30, light + (i % 3) * 3)} />
          {Array.from({ length: Math.floor(b.h / 12) }).map((_, j) =>
            rand() > 0.6 ? (
              <rect key={j} x={b.x + 3 + rand() * (b.w - 8)} y={base - b.h + 6 + j * 11} width="3" height="4" fill={hsl(42, 100, 70, 0.85)} />
            ) : null,
          )}
        </g>
      ))}
    </g>
  );
}

interface Props { variant?: SceneVariant; hue?: number; seed?: string; className?: string }

export default function SceneArt({ variant = 'city', hue = 260, seed = 'x', className }: Props) {
  const uid = useId().replace(/:/g, '');
  const scene = useMemo(() => {
    const rand = rng(seed);
    const sky = `sky${uid}`;
    const glow = `glow${uid}`;
    const defs = (
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hsl(hue, 45, 22)} />
          <stop offset="0.65" stopColor={hsl(hue + 40, 55, 52)} />
          <stop offset="1" stopColor={hsl(hue + 70, 75, 70)} />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={hsl(38, 100, 72, 0.9)} />
          <stop offset="1" stopColor={hsl(38, 100, 72, 0)} />
        </radialGradient>
      </defs>
    );

    switch (variant) {
      case 'sea':
        return (
          <>
            {defs}
            <rect width="320" height="180" fill={`url(#${sky})`} />
            <circle cx={140 + rand() * 60} cy="112" r="26" fill={hsl(32, 100, 70)} />
            <rect y="112" width="320" height="68" fill={hsl(hue + 10, 40, 24)} />
            {Array.from({ length: 9 }).map((_, i) => (
              <rect key={i} x={110 + rand() * 90} y={118 + i * 6} width={20 + rand() * 50} height="2" rx="1" fill={hsl(32, 100, 72, 0.6 - i * 0.05)} />
            ))}
            <path d="M0 132 Q60 118 120 130 L120 180 L0 180Z" fill={hsl(hue, 30, 12)} />
            <rect x="248" y="70" width="70" height="110" fill={hsl(hue, 25, 14)} />
            {[0, 1, 2, 3].map((r) => (
              <rect key={r} x="258" y={80 + r * 22} width="50" height="12" fill={hsl(hue + 30, 40, 35, 0.8)} />
            ))}
          </>
        );
      case 'window':
        return (
          <>
            {defs}
            <rect width="320" height="180" fill={hsl(hue, 25, 30)} />
            <rect x="70" y="20" width="180" height="120" rx="4" fill={hsl(hue + 10, 40, 58)} />
            <rect x="70" y="20" width="180" height="120" rx="4" fill="none" stroke={hsl(hue, 20, 85)} strokeWidth="6" />
            <line x1="160" y1="20" x2="160" y2="140" stroke={hsl(hue, 20, 85)} strokeWidth="5" />
            <ellipse cx="120" cy="60" rx="30" ry="9" fill="#fff" opacity="0.5" />
            <ellipse cx="205" cy="90" rx="22" ry="7" fill="#fff" opacity="0.4" />
            <rect y="140" width="320" height="40" fill={hsl(hue, 20, 22)} />
            <rect x="30" y="118" width="26" height="24" rx="3" fill={hsl(20, 50, 45)} />
            <path d="M43 118 C30 95 25 90 32 82 M43 118 C46 92 52 85 60 80 M43 118 C40 100 44 92 46 86" stroke={hsl(130, 40, 40)} strokeWidth="5" fill="none" strokeLinecap="round" />
            <rect x="262" y="40" width="40" height="52" rx="3" fill={hsl(hue + 180, 30, 40)} />
            <circle cx="282" cy="62" r="10" fill={hsl(42, 80, 65, 0.8)} />
          </>
        );
      case 'desk':
        return (
          <>
            {defs}
            <rect width="320" height="180" fill={hsl(hue, 30, 18)} />
            <rect x="170" y="14" width="130" height="92" rx="3" fill={hsl(230, 45, 20)} />
            <Skyline rand={rand} hue={230} base={106} light={10} />
            <rect x="170" y="14" width="130" height="92" rx="3" fill="none" stroke={hsl(hue, 30, 30)} strokeWidth="6" />
            <rect x="0" y="0" width="170" height="180" fill={hsl(hue, 30, 18)} />
            <rect x="300" y="0" width="20" height="180" fill={hsl(hue, 30, 18)} />
            <circle cx="70" cy="60" r="70" fill={`url(#${glow})`} />
            <path d="M44 40 L96 40 L84 18 L56 18Z" fill={hsl(15, 70, 50)} />
            <rect x="68" y="40" width="4" height="70" fill={hsl(hue, 20, 12)} />
            <rect y="110" width="320" height="70" fill={hsl(25, 35, 26)} />
            <rect x="120" y="96" width="70" height="16" rx="2" fill={hsl(hue, 15, 70)} />
            <rect x="208" y="92" width="16" height="20" rx="3" fill={hsl(0, 0, 92)} />
            <path d="M224 98 q8 0 8 6 q0 6 -8 6" fill="none" stroke={hsl(0, 0, 92)} strokeWidth="3" />
            {Array.from({ length: 5 }).map((_, i) => (
              <rect key={i} x={10 + i * 9} y={70 - rand() * 10} width="7" height={40 + rand() * 10} fill={hsl(rand() * 360, 40, 40)} />
            ))}
          </>
        );
      case 'rain':
        return (
          <>
            {defs}
            <rect width="320" height="180" fill={hsl(hue, 40, 16)} />
            <Skyline rand={rand} hue={hue} base={180} light={12} />
            {Array.from({ length: 40 }).map((_, i) => {
              const x = rand() * 320;
              const y = rand() * 180;
              return <line key={i} x1={x} y1={y} x2={x - 4} y2={y + 14} stroke={hsl(hue, 60, 80, 0.35)} strokeWidth="1.2" />;
            })}
            <rect width="320" height="180" fill={hsl(hue, 60, 50, 0.08)} />
          </>
        );
      case 'city':
      default:
        return (
          <>
            {defs}
            <rect width="320" height="180" fill={`url(#${sky})`} />
            <circle cx={200 + rand() * 60} cy="70" r="16" fill={hsl(40, 100, 85, 0.9)} />
            <Skyline rand={rand} hue={hue} base={180} light={16} />
            <line x1="40" y1="20" x2="40" y2="180" stroke={hsl(hue, 30, 12)} strokeWidth="4" />
            <line x1="26" y1="34" x2="54" y2="34" stroke={hsl(hue, 30, 12)} strokeWidth="3" />
            <path d="M40 34 Q160 60 330 44 M40 34 Q170 76 330 62" stroke={hsl(hue, 30, 12)} strokeWidth="1.2" fill="none" />
          </>
        );
    }
  }, [variant, hue, seed, uid]);

  return (
    <svg className={className} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scene}
    </svg>
  );
}
