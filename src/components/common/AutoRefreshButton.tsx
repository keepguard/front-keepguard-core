import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Botão de atualização SEMPRE automática, intervalo fixo (sem menu de opções, sem opção de
 * desligar) — diferente de RefreshCombo (genérico, auto-refresh desligado por padrão).
 * Usado no Trade Day: o Stop/Limite muda com o preço ao vivo durante o pregão, então essa
 * tela não pode depender do usuário lembrar de ligar atualização automática (achado em
 * operação real: ver PROGRESS.md 2026-10-02). O clique manual continua funcionando a
 * qualquer momento, reiniciando a contagem.
 */
type AutoRefreshButtonProps = {
  onRefresh: () => void;
  intervalSeconds: number;
  disabled?: boolean;
  refreshing?: boolean;
};

export const AutoRefreshButton: React.FC<AutoRefreshButtonProps> = ({
  onRefresh,
  intervalSeconds,
  disabled = false,
  refreshing = false,
}) => {
  const [remaining, setRemaining] = useState(intervalSeconds);
  const [turnNonce, setTurnNonce] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const busy = disabled || refreshing;
  const wasBusy = useRef(false);

  useEffect(() => {
    if (busy && !wasBusy.current) setTurnNonce((n) => n + 1);
    wasBusy.current = busy;
  }, [busy]);

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia a contagem quando o usuário clica manual (busy pulsa) ou quando um refresh termina
  }, [busy, intervalSeconds]);

  const title = refreshing ? 'Atualizando automaticamente…' : `Atualiza sozinho em ${remaining}s · clique para atualizar agora`;

  return (
    <button
      type="button"
      className="btn btn-secondary refresh-combo-main is-auto-fixed"
      onClick={() => onRefresh()}
      disabled={disabled}
      aria-label={title}
      title={title}
    >
      <RefreshCw key={turnNonce} size={15} className={busy ? 'refresh-combo-icon is-turning' : 'refresh-combo-icon'} />
      <span className="refresh-combo-countdown">{!busy ? `${remaining}s` : ' '}</span>
    </button>
  );
};

export default AutoRefreshButton;
