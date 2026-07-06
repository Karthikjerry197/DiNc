'use client';
import type { ReactNode } from 'react';

type Color = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'gray';

interface Props {
  value: number | null | undefined;
  label: string;
  icon: ReactNode;
  color: Color;
  suffix?: string;
}

const COLORS: Record<Color, { bg: string; text: string; border: string; icon: string }> = {
  blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', icon: '#3b82f6' },
  green:  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', icon: '#22c55e' },
  purple: { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe', icon: '#a855f7' },
  amber:  { bg: '#fffbeb', text: '#b45309', border: '#fde68a', icon: '#f59e0b' },
  red:    { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', icon: '#ef4444' },
  gray:   { bg: '#f9fafb', text: '#374151', border: '#e5e7eb', icon: '#6b7280' },
};

export default function StatCardWidget({ value, label, icon, color, suffix }: Props) {
  const c = COLORS[color];
  return (
    <div
      className="studio-stat-card"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="studio-stat-icon" style={{ color: c.icon }}>{icon}</div>
      <div className="studio-stat-value" style={{ color: c.text }}>
        {value == null ? '—' : value.toLocaleString()}
        {value != null && suffix && (
          <span className="studio-stat-suffix">{suffix}</span>
        )}
      </div>
      <div className="studio-stat-label">{label}</div>
    </div>
  );
}
