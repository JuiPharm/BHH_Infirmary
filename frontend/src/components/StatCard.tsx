import React from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  bgColor?: string;
  subtitle?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  color = '#0b1f3a',
  bgColor = '#eff6ff',
  subtitle
}) => {
  return (
    <div
      className="stat-card"
      style={{ '--stat-color': color, '--stat-bg': bgColor } as React.CSSProperties}
    >
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {subtitle && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{subtitle}</div>}
      </div>
    </div>
  );
};
