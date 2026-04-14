interface StarRatingProps {
  value: number;        // 0-6
  onChange?: (val: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const LABELS: Record<number, string> = {
  0: 'Terrible',
  1: 'Bad',
  2: 'Poor',
  3: 'OK',
  4: 'Good',
  5: 'Great',
  6: 'Exceptional',
};

const SIZES = { sm: 'w-5 h-5', md: 'w-7 h-7', lg: 'w-9 h-9' };

export default function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
  showLabel = false,
}: StarRatingProps) {
  const starSize = SIZES[size];

  const getColor = (index: number) => {
    if (index > value) return 'text-slate-200';
    if (value <= 1) return 'text-red-500';
    if (value <= 2) return 'text-orange-500';
    if (value <= 3) return 'text-amber-400';
    if (value <= 4) return 'text-yellow-400';
    if (value <= 5) return 'text-emerald-400';
    return 'text-emerald-500';
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5, 6].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`${starSize} transition-transform ${
            !readonly ? 'hover:scale-110 cursor-pointer' : 'cursor-default'
          } ${getColor(star)}`}
          title={LABELS[star]}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
      {showLabel && value > 0 && (
        <span className="ml-2 text-sm font-medium text-slate-600">
          {LABELS[value] || ''} ({value}/6)
        </span>
      )}
    </div>
  );
}
