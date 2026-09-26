import type { AnalystSourceFreshness, DataFreshnessStatus } from '../services/analystService';

/** Textos da ficha de fontes, compartilhados pela tela (DataFreshnessBar) e pelo export. */

export const FRESHNESS_SOURCE_LABEL: Record<string, string> = {
  price: 'Preço',
  fundamentals: 'Fundamentos',
  macro: 'Macro (CDI, Selic, IPCA)',
  news: 'Notícias',
};

/** tone: HEALTHY | RISKY | NEUTRAL (classes do pill da tela); cls: good | warn | '' (badge do export). */
export const FRESHNESS_STATUS_COPY: Record<DataFreshnessStatus, { label: string; tone: string; cls: string }> = {
  FRESH: { label: 'Em dia', tone: 'HEALTHY', cls: 'good' },
  STALE: { label: 'Defasado', tone: 'RISKY', cls: 'warn' },
  MISSING: { label: 'Sem dado', tone: 'NEUTRAL', cls: '' },
};

/** dd/MM a partir da parte de data do ISO, sem passar pelo fuso do navegador. */
export function formatDayMonth(iso?: string): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}` : '—';
}

/** dd/MM/aaaa a partir da parte de data do ISO, sem passar pelo fuso do navegador. */
export function formatDayFull(iso?: string): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

export function formatAge(hours?: number): string {
  if (hours == null) return '';
  if (hours < 1) return 'agora há pouco';
  if (hours < 24) return `há ${Math.round(hours)} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function freshnessDetail(source: AnalystSourceFreshness, expectedSession: string): string {
  switch (source.source) {
    case 'price':
      if (source.status === 'MISSING') return 'sem cotação neste dossiê';
      return source.status === 'STALE'
        ? `fechamento de ${formatDayMonth(source.observedAt)} · esperado ${formatDayMonth(expectedSession)}`
        : `fechamento de ${formatDayMonth(source.observedAt)}`;
    case 'news':
      return source.items
        ? `${source.items} na janela do último pregão`
        : 'nenhuma na janela do último pregão';
    default:
      return source.status === 'MISSING' ? 'não coletado' : `coletado ${formatAge(source.ageHours)}`;
  }
}
