import React, { useCallback, useId, useMemo, useState } from 'react';
import type { AnalystInputPoint } from '../../services/analystService';
import { SOURCE_LABEL } from './marketLabels';

type Props = {
  title: string;
  periodHint: string;
  points: AnalystInputPoint[] | undefined;
  currentValue?: number;
  emptyMessage: string;
};

type Coord = {
  x: number;
  y: number;
  point: AnalystInputPoint;
};

const VIEW_W = 320;
const VIEW_H = 128;
const PAD_X = 12;
const PAD_Y = 14;

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
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatValue(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function sourceLabel(slug?: string): string {
  if (!slug) return '';
  return SOURCE_LABEL[slug] || slug;
}

function nearestIndex(coords: Coord[], viewX: number): number {
  let best = 0;
  let bestGap = Math.abs(coords[0].x - viewX);
  for (let i = 1; i < coords.length; i += 1) {
    const gap = Math.abs(coords[i].x - viewX);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

export const SeriesChart: React.FC<Props> = ({
  title,
  periodHint,
  points,
  currentValue,
  emptyMessage,
}) => {
  const tableId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const list = (points ?? []).filter((point) => Number.isFinite(point.valueNum));
    return [...list].sort((a, b) => pointTime(a).localeCompare(pointTime(b)));
  }, [points]);

  const layout = useMemo(() => {
    if (sorted.length < 2) return null;
    const values = sorted.map((point) => point.valueNum);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const innerW = VIEW_W - PAD_X * 2;
    const innerH = VIEW_H - PAD_Y * 2;
    const coords: Coord[] = sorted.map((point, index) => {
      const x = PAD_X + (index / (sorted.length - 1)) * innerW;
      const y = PAD_Y + ((max - point.valueNum) / (max - min)) * innerH;
      return { x, y, point };
    });
    let current = coords[coords.length - 1];
    if (currentValue != null && Number.isFinite(currentValue)) {
      current = coords.reduce((best, item) => {
        const bestGap = Math.abs(best.point.valueNum - currentValue);
        const gap = Math.abs(item.point.valueNum - currentValue);
        return gap < bestGap ? item : best;
      }, current);
    }
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    return { coords, current, path };
  }, [sorted, currentValue]);

  const pickFromPointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!layout) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const viewX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    setActiveIndex(nearestIndex(layout.coords, viewX));
  }, [layout]);

  if (!layout) {
    return (
      <figure className="market-chart">
        <figcaption>
          {title} <span className="text-muted">({periodHint})</span>
        </figcaption>
        <p className="text-muted market-chart-empty">{emptyMessage}</p>
      </figure>
    );
  }

  const { coords, current, path } = layout;
  const shown = activeIndex == null ? current : coords[activeIndex];
  const shownPoint = shown.point;
  const when = formatAxis(pointTime(shownPoint), shownPoint.periodType);
  const value = formatValue(shownPoint.valueNum);
  const source = sourceLabel(shownPoint.dataSource);
  const tooltipLeft = Math.min(92, Math.max(8, (shown.x / VIEW_W) * 100));

  return (
    <figure className="market-chart">
      <figcaption>
        {title} <span className="text-muted">({periodHint})</span>
      </figcaption>
      <div className="market-chart-plot">
        <svg
          className="market-chart-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-labelledby={tableId}
          onPointerMove={pickFromPointer}
          onPointerDown={pickFromPointer}
          onPointerLeave={() => setActiveIndex(null)}
        >
          <title id={tableId}>{`${title}: ${formatValue(sorted[0].valueNum)} a ${formatValue(sorted[sorted.length - 1].valueNum)}`}</title>
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          <line
            x1={shown.x}
            x2={shown.x}
            y1={PAD_Y}
            y2={VIEW_H - PAD_Y}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="1"
          />
          <circle cx={shown.x} cy={shown.y} r="4.5" fill="currentColor" />
        </svg>
        <div
          className="market-chart-tooltip"
          style={{ left: `${tooltipLeft}%` }}
          role="status"
        >
          <strong>{when}</strong>
          <span>{value}</span>
          {source ? <span className="text-muted">{source}</span> : null}
        </div>
      </div>
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
