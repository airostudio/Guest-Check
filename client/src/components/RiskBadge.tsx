import { RiskLevel, RISK_LABELS } from '../types';

interface RiskBadgeProps {
  level: RiskLevel;
  showScore?: number;
  size?: 'sm' | 'md';
}

const CLASSES: Record<RiskLevel, string> = {
  EXCELLENT: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  GOOD: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  AVERAGE: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  POOR: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  HIGH_RISK: 'bg-red-100 text-red-800 ring-1 ring-red-200',
  UNREVIEWED: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const ICONS: Record<RiskLevel, string> = {
  EXCELLENT: '★',
  GOOD: '✓',
  AVERAGE: '~',
  POOR: '!',
  HIGH_RISK: '⚠',
  UNREVIEWED: '?',
};

export default function RiskBadge({ level, showScore, size = 'md' }: RiskBadgeProps) {
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${sizeClass} ${CLASSES[level]}`}>
      <span>{ICONS[level]}</span>
      {RISK_LABELS[level]}
      {showScore !== undefined && <span className="opacity-75">({showScore.toFixed(1)}/6)</span>}
    </span>
  );
}
