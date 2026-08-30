import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';

type IntervalPreset = '5s' | '30s' | '1m' | 'custom';

const INTERVAL_MS: Record<Exclude<IntervalPreset, 'custom'>, number> = {
  '5s': 5_000,
  '30s': 30_000,
  '1m': 60_000,
};

const CUSTOM_MIN_SECONDS = 3;
const CUSTOM_MAX_SECONDS = 3600;

function clampCustomSeconds(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(CUSTOM_MAX_SECONDS, Math.max(CUSTOM_MIN_SECONDS, Math.round(value)));
}

function intervalSecondsFrom(preset: IntervalPreset, customSeconds: number): number {
  if (preset === 'custom') {
    return clampCustomSeconds(customSeconds);
  }
  return Math.round(INTERVAL_MS[preset] / 1000);
}

function formatCountdown(seconds: number): string {
  return `${seconds}s`;
}

type RefreshComboProps = {
  onRefresh: () => void;
  disabled?: boolean;
  refreshing?: boolean;
};

export const RefreshCombo: React.FC<RefreshComboProps> = ({
  onRefresh,
  disabled = false,
  refreshing = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalPreset, setIntervalPreset] = useState<IntervalPreset>('30s');
  const [customSeconds, setCustomSeconds] = useState(10);
  const [remaining, setRemaining] = useState(0);
  const [turnNonce, setTurnNonce] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const intervalSeconds = useMemo(
    () => intervalSecondsFrom(intervalPreset, customSeconds),
    [customSeconds, intervalPreset]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const busy = disabled || refreshing;
  const wasBusy = useRef(false);

  useEffect(() => {
    if (busy && !wasBusy.current) {
      setTurnNonce((n) => n + 1);
    }
    wasBusy.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!autoRefresh) {
      setRemaining(0);
      return;
    }
    if (busy) {
      setRemaining(0);
      return;
    }

    const startedAt = Date.now();
    setRemaining(intervalSeconds);

    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = intervalSeconds - elapsed;
      if (left <= 0) {
        window.clearInterval(timer);
        setRemaining(0);
        onRefreshRef.current();
        return;
      }
      setRemaining(left);
    }, 250);

    return () => window.clearInterval(timer);
  }, [autoRefresh, busy, intervalSeconds]);

  const autoActive = autoRefresh;
  const title = autoActive
    ? refreshing
      ? 'Atualizando automaticamente…'
      : `Automático ligado · próxima em ${formatCountdown(Math.max(remaining, 0))}`
    : 'Atualizar agora';

  return (
    <div className="refresh-combo" ref={menuRef}>
      <div
        className={['refresh-combo-split', autoActive ? 'is-auto' : ''].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className="btn btn-secondary refresh-combo-main"
          onClick={() => onRefresh()}
          disabled={disabled}
          aria-label={title}
          title={title}
        >
          <RefreshCw
            key={turnNonce}
            size={15}
            className={busy ? 'refresh-combo-icon is-turning' : 'refresh-combo-icon'}
          />
          <span className="refresh-combo-countdown" aria-hidden="true">
            {autoActive && !busy && remaining > 0 ? formatCountdown(remaining) : '\u00a0'}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-secondary refresh-combo-caret"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Opções de atualização"
          title="Opções de atualização"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {menuOpen && (
        <div className="refresh-combo-menu" role="menu">
          <label className="refresh-combo-auto">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Automático
          </label>
          <p className="refresh-combo-hint">Intervalo (só vale com automático ligado)</p>
          {(['5s', '30s', '1m'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              className={`refresh-combo-option${intervalPreset === preset ? ' is-active' : ''}`}
              role="menuitem"
              onClick={() => setIntervalPreset(preset)}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            className={`refresh-combo-option${intervalPreset === 'custom' ? ' is-active' : ''}`}
            role="menuitem"
            onClick={() => setIntervalPreset('custom')}
          >
            Customizado
          </button>
          {intervalPreset === 'custom' && (
            <label className="refresh-combo-custom">
              Segundos (máx. 3600)
              <input
                className="form-input"
                type="number"
                min={CUSTOM_MIN_SECONDS}
                max={CUSTOM_MAX_SECONDS}
                step={1}
                value={customSeconds}
                onChange={(e) => setCustomSeconds(clampCustomSeconds(Number(e.target.value)))}
                aria-label="Intervalo personalizado em segundos (máximo 3600)"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
};

export default RefreshCombo;
