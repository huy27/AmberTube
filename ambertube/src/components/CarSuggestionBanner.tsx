import { Car, X } from 'lucide-react';
import { useDisplayMode } from '../context/DisplayModeContext';

/** Shown once on compact landscape screens. Only a suggestion: the user's choice always wins. */
export default function CarSuggestionBanner() {
  const { suggestCar, setMode, dismissSuggestion, mode } = useDisplayMode();
  if (!suggestCar || mode === 'car') return null;
  return (
    <div className="car-suggest" role="region" aria-label="Gợi ý Car View">
      <Car size={20} />
      <span>Màn hình nhỏ nằm ngang? Car View có nút lớn, dễ bấm hơn.</span>
      <button className="btn btn--primary btn--sm" onClick={() => setMode('car')}>Bật Car View</button>
      <button className="icon-btn icon-btn--sm" onClick={dismissSuggestion} aria-label="Không, cảm ơn"><X size={16} /></button>
    </div>
  );
}
