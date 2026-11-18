/**
 * AmberTube mark — "Giọt hổ phách": an amber drop (fossil resin → Amber) holding a Play button.
 * Same geometry as public/logo.svg and the favicon/app icons.
 */
export const DROP = 'M32 4C27.2 11.6 13 26.4 13 40.2a19 19 0 0 0 38 0C51 26.4 36.8 11.6 32 4Z';
export const PLAY = 'M27.5 31.6v17.2a1.6 1.6 0 0 0 2.4 1.4l13.7-8.6a1.6 1.6 0 0 0 0-2.7l-13.7-8.6a1.6 1.6 0 0 0-2.4 1.3Z';
export const SHINE = 'M21.5 38.5c.3-4.3 2.3-8.4 5.2-12.2';

export default function BrandMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`brand-mark ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={DROP} fill="#F5A524" />
      <path d={SHINE} fill="none" stroke="#FFE2A8" strokeOpacity="0.75" strokeWidth="3.2" strokeLinecap="round" />
      <path d={PLAY} fill="#1A1206" />
    </svg>
  );
}
