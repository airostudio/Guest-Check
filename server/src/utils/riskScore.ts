import { RiskLevel } from '../types/enums';
import { RISK_THRESHOLDS } from '../types';

export function calculateRiskLevel(averageRating: number | null): RiskLevel {
  if (averageRating === null) return RiskLevel.UNREVIEWED;
  if (averageRating >= RISK_THRESHOLDS.EXCELLENT) return RiskLevel.EXCELLENT;
  if (averageRating >= RISK_THRESHOLDS.GOOD) return RiskLevel.GOOD;
  if (averageRating >= RISK_THRESHOLDS.AVERAGE) return RiskLevel.AVERAGE;
  if (averageRating >= RISK_THRESHOLDS.POOR) return RiskLevel.POOR;
  return RiskLevel.HIGH_RISK;
}

export function riskLevelToColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    EXCELLENT: '#10b981',   // green
    GOOD: '#3b82f6',        // blue
    AVERAGE: '#f59e0b',     // amber
    POOR: '#f97316',        // orange
    HIGH_RISK: '#ef4444',   // red
    UNREVIEWED: '#9ca3af',  // gray
  };
  return colors[level];
}

export function ratingToLabel(rating: number): string {
  if (rating >= 5.5) return 'Exceptional';
  if (rating >= 4.5) return 'Superb';
  if (rating >= 4.0) return 'Fabulous';
  if (rating >= 3.5) return 'Very Good';
  if (rating >= 3.0) return 'Good';
  if (rating >= 2.0) return 'Fair';
  if (rating >= 1.0) return 'Poor';
  return 'Terrible';
}

export function starRatingToScore(stars: number): string {
  return `${stars}/6`;
}
