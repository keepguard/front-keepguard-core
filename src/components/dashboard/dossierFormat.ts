/** Formatação compartilhada pelos dossiês por classe de ativo (FII, ETF e demais classes só preço). */

export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatCompactBrl(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `R$ ${(value / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bilhões`;
  }
  if (abs >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} M`;
  }
  if (abs >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mil`;
  }
  return formatMoney(value);
}

export function formatRatio(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

export function formatPct(value: number, digits = 2): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Variação com sinal explícito: +2,45% / −4,80%. */
export function formatSignedPct(value: number, digits = 2): string {
  const abs = formatPct(Math.abs(value), digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('pt-BR');
}

export function formatCompactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return formatCount(value);
}

export function dash(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}
