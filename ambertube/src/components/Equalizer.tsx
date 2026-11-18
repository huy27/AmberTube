export default function Equalizer({ paused = false }: { paused?: boolean }) {
  return (
    <span className={`eq${paused ? ' is-paused' : ''}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}
