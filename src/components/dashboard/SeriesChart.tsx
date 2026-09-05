import React, { useId, useMemo } from 'react';
import type { AnalystInputPoint } from '../../services/analystService';
import { SOURCE_LABEL } from './marketLabels';

type Props = {
  title: string;
  periodHint: string;
  points: AnalystInputPoint[] | undefined;
  currentValue?: number;
  emptyMessage: string;
};

function pointTime(point: AnalystInputPoint): string {
  return point.periodStart || point.observedAt || '';
}

function formatAxis(iso: string, periodType?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (periodType === 'YEAR') {
    return String(date.getUTCFullYear());
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatValue(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function sourceLabel(slug?: string): string {
  if (!slug) return '';
  return SOURCE_LABEL[slug] || slug;
}

export const SeriesChart: React.FC<Props> = ({
  title,
  periodHint,
  points,
  currentValue,
  emptyMessage,
}) => {
  const tableId = useId();
  const sorted = useMemo(() => {
    const list = (points ?? []).filter((point) => Number.isFinite(point.valueNum));
    return [...list].sort((a, b) => pointTime(a).localeCompare(pointTime(b)));
  }, [points]);

  if (sorted.length < 2) {
    return (
      <figure className="market-chart">
        <figcaption>
          {title} <span className="text-muted">({periodHint})</span>
        </figcaption>
        <p className="text-muted market-chart-empty">{emptyMessage}</p>
      </figure>
    );
  }

  const width = 320;
  const height = 128;
  const padX = 12;
  const padY = 14;
  const values = sorted.map((point) => point.valueNum);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const coords = sorted.map((point, index) => {
    const x = padX + (index / (sorted.length - 1)) * innerW;
    const y = padY + ((max - point.valueNum) / (max - min)) * innerH;
    return { x, y, point };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  let current = coords[coords.length - 1];
  if (currentValue != null && Number.isFinite(currentValue)) {
    current = coords.reduce((best, item) => {
      const bestGap = Math.abs(best.point.valueNum - currentValue);
      const gap = Math.abs(item.point.valueNum - currentValue);
      return gap < bestGap ? item : best;
    }, current);
  }

  return (
    <figure className="market-chart">
      <figcaption>
        {title} <span className="text-muted">({periodHint})</span>
      </figcaption>
      <svg
        className="market-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={tableId}
      >
        <title id={tableId}>{`${title}: ${formatValue(sorted[0].valueNum)} a ${formatValue(sorted[sorted.length - 1].valueNum)}`}</title>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx={current.x} cy={current.y} r="4" fill="currentColor" />
      </svg>
      <p className="text-muted market-chart-meta">
        {formatAxis(pointTime(sorted[0]), sorted[0].periodType)} → {formatAxis(pointTime(sorted[sorted.length - 1]), sorted[sorted.length - 1].periodType)}
        {currentValue != null ? ` · atual ${formatValue(currentValue)}` : ` · ${formatValue(sorted[sorted.length - 1].valueNum)}`}
        {current.point.dataSource ? ` · ${sourceLabel(current.point.dataSource)}` : ''}
      </p>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Valor</th>
            <th>Fonte</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((point, index) => (
            <tr key={`${pointTime(point)}-${index}`}>
              <td>{formatAxis(pointTime(point), point.periodType)}</td>
              <td>{formatValue(point.valueNum)}</td>
              <td>{sourceLabel(point.dataSource) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
