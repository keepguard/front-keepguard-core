import React, { useEffect, useRef } from 'react';
import type { MoneyError } from '../../../utils/billingMoney';

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'neutral', children }) => (
  <span className={`bm-pill is-${tone}`}>{children}</span>
);

export const Notice: React.FC<{
  tone: Tone;
  title: string;
  code?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ tone, title, code, children, action }) => (
  <div className={`bm-notice is-${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
    <strong>{title}</strong>
    {children ? <span> {children}</span> : null}
    {code ? <> <code>{code}</code></> : null}
    {action ? <div className="bm-notice-action">{action}</div> : null}
  </div>
);

export const FlashNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bm-notice is-ok" role="status"><strong>Feito</strong> <span>{children}</span></div>
);

export const WriteDisabledNotice: React.FC = () => (
  <Notice tone="warn" title="Escrita desligada nesta fase">
    Dá para consultar tudo. Os botões de gravar ficam travados até a liberação de segurança; até lá, o servidor responde <code>403 CORE_WRITE_DISABLED</code>.
  </Notice>
);

/** Erro de escrita. Recebe o foco para não ficar fora da vista num formulário longo. */
export const MoneyErrorNotice: React.FC<{ error: MoneyError }> = ({ error }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [error]);
  const code = error.status && error.code ? `${error.status} ${error.code}` : undefined;
  return (
    <div ref={ref} tabIndex={-1} className="bm-focus-target">
      <Notice tone="bad" title={error.title} code={code}>{error.text}</Notice>
    </div>
  );
};

export const StatCards: React.FC<{ items: Array<{ label: string; value: string; detail: string }> }> = ({ items }) => (
  <div className="bm-stats">
    {items.map((item) => (
      <div className="bm-stat" key={item.label}>
        <div className="bm-stat-label">{item.label}</div>
        <div className="bm-stat-value">{item.value}</div>
        <div className="bm-stat-detail">{item.detail}</div>
      </div>
    ))}
  </div>
);

export const Field: React.FC<{
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
}> = ({ id, label, required, hint, error, children }) => {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="bm-field">
      <label htmlFor={id}>
        {label} {required ? <span className="bm-required">(obrigatório)</span> : null}
      </label>
      {children(describedBy)}
      {hint ? <span className="bm-hint" id={`${id}-hint`}>{hint}</span> : null}
      {error ? <span className="bm-field-error" id={`${id}-error`}>{error}</span> : null}
    </div>
  );
};

export const REASON_HINT = 'Fica na auditoria. Só operadores leem. Não escreva dado pessoal.';
