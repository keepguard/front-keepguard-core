/**
 * Custódia vinda do MT5 (SPEC-003 R2): o mercado fracionário da B3 negocia o mesmo
 * ativo com o sufixo "F" (PETR4F). Na Carteira, lote e fracionário são o MESMO ativo —
 * somam na linha do ticker-base, e o detalhe mostra quanto é de cada.
 */
import type { Mt5Position } from '../services/mt5AccountService';

export type CustodySide = 'Compra' | 'Venda';

export interface CustodyPosition {
  /** Ticker-base (sem o "F" do fracionário). */
  ticker: string;
  side: CustodySide;
  quantity: number;
  /** Parte em lote padrão. */
  lote: number;
  /** Parte no mercado fracionário. */
  fracionario: number;
  /** Preço médio ponderado pela quantidade. */
  averagePrice: number;
  priceCurrent: number;
  profit: number;
}

/** PETR4F -> PETR4; BOVA11F -> BOVA11. Só remove o F que vem depois do número da classe. */
export function baseTicker(symbol: string): string {
  const s = (symbol || '').trim().toUpperCase();
  return /\d+F$/.test(s) ? s.slice(0, -1) : s;
}

export function isFractional(symbol: string): boolean {
  return /\d+F$/.test((symbol || '').trim().toUpperCase());
}

// ORDER_TYPE_BUY=0 / POSITION_TYPE_SELL=1 — ver skill mt5-api.
function sideOf(type: number | undefined): CustodySide {
  return typeof type === 'number' && type % 2 === 1 ? 'Venda' : 'Compra';
}

/** Agrupa as posições do MT5 por ticker-base e lado, somando lote e fracionário. */
export function aggregatePositions(positions: Mt5Position[]): CustodyPosition[] {
  const byKey = new Map<string, CustodyPosition & { cost: number }>();
  for (const p of positions) {
    const volume = Number(p.volume) || 0;
    if (volume <= 0) continue;
    const ticker = baseTicker(p.symbol);
    const side = sideOf(p.type);
    const key = `${ticker}|${side}`;
    const acc = byKey.get(key) ?? {
      ticker, side, quantity: 0, lote: 0, fracionario: 0, averagePrice: 0, priceCurrent: 0, profit: 0, cost: 0,
    };
    acc.quantity += volume;
    if (isFractional(p.symbol)) acc.fracionario += volume;
    else acc.lote += volume;
    acc.cost += volume * (Number(p.priceOpen) || 0);
    acc.profit += Number(p.profit) || 0;
    // Preço atual: o do lote padrão é a referência; o fracionário só entra se não houver lote.
    if (!isFractional(p.symbol) || acc.priceCurrent === 0) acc.priceCurrent = Number(p.priceCurrent) || acc.priceCurrent;
    byKey.set(key, acc);
  }
  return [...byKey.values()]
    .map(({ cost, ...pos }) => ({ ...pos, averagePrice: pos.quantity > 0 ? cost / pos.quantity : 0 }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker, 'pt-BR'));
}

/** "100 lote + 30 fracionário" quando há os dois; vazio quando é só um tipo. */
export function custodyBreakdown(pos: Pick<CustodyPosition, 'lote' | 'fracionario'>): string {
  if (pos.lote > 0 && pos.fracionario > 0) {
    return `${pos.lote.toLocaleString('pt-BR')} lote + ${pos.fracionario.toLocaleString('pt-BR')} fracionário`;
  }
  return '';
}
