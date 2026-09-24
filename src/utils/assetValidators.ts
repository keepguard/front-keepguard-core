/**
 * Validações inline do cadastro de ativo. Espelham as do bff-invest (o servidor valida de novo:
 * aqui é só para o operador ver o erro antes de enviar).
 */

export function isValidCnpj(raw: string): boolean {
  const digits: number[] = [];
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') digits.push(Number(ch));
    else if (ch !== '.' && ch !== '/' && ch !== '-') return false;
  }
  if (digits.length !== 14) return false;
  if (digits.every((d) => d === digits[0])) return false;
  const check = (base: number[]): number => {
    const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(-base.length);
    const sum = base.reduce((acc, d, i) => acc + d * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(digits.slice(0, 12)) === digits[12] && check(digits.slice(0, 13)) === digits[13];
}

export function isValidIsin(raw: string): boolean {
  const isin = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const digits: number[] = [];
  for (const ch of isin) {
    if (ch >= 'A' && ch <= 'Z') {
      const n = ch.charCodeAt(0) - 55;
      digits.push(Math.floor(n / 10), n % 10);
    } else {
      digits.push(Number(ch));
    }
  }
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits[i];
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidMt5Symbol(raw: string): boolean {
  return /^[A-Z0-9]{4,12}$/.test(raw.trim().toUpperCase());
}

/** Classe do ativo derivada do tipo (o ms-analyst-finance faz a mesma derivação ao gravar). */
export const ASSET_CLASS_BY_TYPE: Readonly<Record<string, string>> = {
  STOCK: 'Renda variável (ações)',
  BDR: 'Renda variável (ações)',
  FII: 'Imobiliário',
  FI_INFRA: 'Crédito',
  FIAGRO: 'Agronegócio',
  ETF: 'Índice',
};

/** Tipo MT5 sugerido para cada tipo de ativo (só sugestão; o operador pode não usar). */
export const MT5_TIPO_BY_ASSET_TYPE: Readonly<Record<string, string>> = {
  STOCK: 'acao',
  BDR: 'bdr',
  FII: 'fii',
  FI_INFRA: 'fi_infra',
  FIAGRO: 'fiagro',
  ETF: 'etf',
};

export function formatCnpjMask(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let out = parts[0];
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;
  return out;
}

/** Tipos de ativo aceitos no cadastro (mesmos do catálogo do ms-analyst-finance). */
export const ASSET_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'STOCK', label: 'Ação' },
  { value: 'FII', label: 'FII' },
  { value: 'FI_INFRA', label: 'FI-Infra' },
  { value: 'FIAGRO', label: 'Fiagro' },
  { value: 'BDR', label: 'BDR' },
  { value: 'ETF', label: 'ETF' },
];
