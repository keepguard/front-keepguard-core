export const VERDICT_LABEL: Record<string, string> = {
  CHEAP: 'Barato',
  FAIR: 'Justo',
  EXPENSIVE: 'Caro',
  HEALTHY: 'Saudável',
  RISKY: 'Arriscado',
  NEUTRAL: 'Neutro',
  MISSING: 'Indisponível',
};

export const METRIC_LABEL: Record<string, string> = {
  pl: 'P/L',
  dy_pct: 'Dividend yield',
  dividaliquida_ebitda: 'Dívida/EBITDA',
  roe_pct: 'ROE',
  pvp: 'P/VPA',
  roic_pct: 'ROIC',
  margem_liquida_pct: 'Margem líquida',
  liquidezcorrente: 'Liquidez corrente',
  dividaliquida_patrimonioliquido: 'Dívida líquida/PL',
  receitas_cagr5_pct: 'CAGR 5a receitas',
  lucros_cagr5_pct: 'CAGR 5a lucros',
  ev_ebitda: 'EV/EBITDA',
  price: 'Preço vs 52 semanas',
  cdi_pct: 'CDI',
  selic_meta_pct: 'Selic meta',
  ipca_mensal_pct: 'IPCA mensal',
  consistencia_roic: 'Consistência do ROIC',
  consistencia_margem: 'Consistência da margem',
  roic_spread_selic: 'ROIC vs SELIC',
  graham_number: 'Número de Graham',
  earnings_yield: 'Earnings yield',
  piotroski_f_score: 'Piotroski F-Score',
  fii_pvp: 'P/VP (FII)',
  fii_dividend_yield: 'Dividend yield 12M (FII)',
  fii_daily_liquidity: 'Liquidez média diária',
  fii_cash_reserve: 'Reserva de caixa',
  bazin_ceiling_price: 'Preço Teto de Bazin',
  lpa: 'LPA',
  vpa: 'VPA',
  ev_ebit: 'EV/EBIT',
  fco: 'Fluxo de caixa operacional',
  fco_vs_lucro: 'FCO vs lucro',
  divida_lp: 'Dívida de longo prazo',
  n_acoes: 'Número de ações',
  lucro_liquido: 'Lucro líquido',
  thesis: 'Tese',
  roa_pct: 'ROA',
  margem_bruta_pct: 'Margem bruta',
  giro_ativos: 'Giro de ativos',
  return_1m: 'Retorno 1 mês',
  return_6m: 'Retorno 6 meses',
  return_12m: 'Retorno 12 meses',
  volatility_30d: 'Volatilidade 30 dias',
  volatility_1y: 'Volatilidade 12 meses',
  daily_traded_value: 'Liquidez média diária',
};

export const GAP_REASON_LABEL: Record<string, string> = {
  FACT_MISSING: 'Dado ausente',
  SERIES_TOO_SHORT: 'Série curta demais',
  MACRO_MISSING: 'Macro ausente',
  NO_EARNINGS: 'Sem lucro/base',
  FINANCIAL: 'Não se aplica a banco',
  LPA_NOT_POSITIVE: 'LPA não positivo',
  VPA_NOT_POSITIVE: 'VPA não positivo',
  NOT_APPLICABLE_FOR_FII: 'Não se aplica a FII',
  NOT_APPLICABLE_FOR_ETF: 'Não se aplica a ETF',
  NOT_APPLICABLE_FOR_BDR: 'Não se aplica a BDR',
  NOT_APPLICABLE_FOR_FIAGRO: 'Não se aplica a FIAGRO',
  NOT_APPLICABLE_FOR_FI_INFRA: 'Não se aplica a FI-Infra',
};

export const THESIS_LABEL: Record<string, string> = {
  OPORTUNIDADE: 'Oportunidade',
  OPORTUNIDADE_IMOBILIARIA: 'Oportunidade imobiliária',
  QUALIDADE_A_PRECO_JUSTO: 'Qualidade a preço justo',
  BOA_MAS_CARA: 'Boa, mas cara',
  POSSIVEL_VALOR: 'Possível valor',
  NEUTRO: 'Neutro',
  EVITAR_PRECO: 'Evitar preço',
  ARMADILHA_DE_VALOR: 'Armadilha de valor',
  FRACA: 'Fraca',
  EVITAR: 'Evitar',
  RISCO_FINANCEIRO: 'Risco financeiro',
  INCONCLUSIVA: 'Inconclusiva',
};

export const AXIS_LABEL: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
  BARATO: 'Barato',
  JUSTO: 'Justo',
  CARO: 'Caro',
  HEALTHY: 'Saudável',
  NEUTRAL: 'Neutra',
  RISKY: 'Arriscada',
  INCONCLUSIVO: 'Inconclusivo',
};

export function thesisDisplayLabel(code: string): string {
  const suffix = '_COM_RISCO';
  if (code.endsWith(suffix)) {
    const base = code.slice(0, -suffix.length);
    return `${THESIS_LABEL[base] || base} (com risco financeiro)`;
  }
  return THESIS_LABEL[code] || code;
}

export function thesisTone(code: string): 'good' | 'bad' | 'warn' {
  const base = code.endsWith('_COM_RISCO') ? code.slice(0, -'_COM_RISCO'.length) : code;
  if (base === 'OPORTUNIDADE' || base === 'OPORTUNIDADE_IMOBILIARIA' || base === 'QUALIDADE_A_PRECO_JUSTO') {
    return 'good';
  }
  if (
    base === 'ARMADILHA_DE_VALOR' ||
    base === 'EVITAR' ||
    base === 'EVITAR_PRECO' ||
    base === 'FRACA' ||
    base === 'RISCO_FINANCEIRO'
  ) {
    return 'bad';
  }
  return 'warn';
}

export const SOURCE_LABEL: Record<string, string> = {
  'status-invest': 'Status Invest',
  'status-invest-fii': 'Status Invest (FIIs)',
  'yahoo-finance': 'Yahoo Finance',
  'bcb-sgs': 'Banco Central (SGS)',
  infomoney: 'InfoMoney',
  'money-times': 'Money Times',
  'cvm-dfp': 'CVM DFP',
};

function metricName(metric: string): string {
  return METRIC_LABEL[metric] || metric;
}

function changeValueLabel(raw: string | undefined, metric: string): string {
  if (!raw) return '—';
  if (metric === 'thesis') return thesisDisplayLabel(raw);
  return VERDICT_LABEL[raw] || GAP_REASON_LABEL[raw] || thesisDisplayLabel(raw);
}

export function deltaLabel(metric: string, fromVerdict?: string, toVerdict?: string): string {
  const name = metricName(metric);
  if (!fromVerdict && toVerdict && GAP_REASON_LABEL[toVerdict]) {
    if (toVerdict === 'FACT_MISSING') {
      return `${name}: passou a constar como dado ausente`;
    }
    return `${name}: passou a constar como ${GAP_REASON_LABEL[toVerdict]}`;
  }
  return `${name}: ${changeValueLabel(fromVerdict, metric)} → ${changeValueLabel(toVerdict, metric)}`;
}

export function displayIsMaterial(item: {
  isMaterial: boolean;
  changes: { kind?: string; fromVerdict?: string }[];
}): boolean {
  const deltas = item.changes ?? [];
  if (deltas.length > 0 && deltas.every((d) => d.kind === 'GAP' && !d.fromVerdict)) {
    return false;
  }
  return item.isMaterial;
}

export const FLAG_CATEGORY_LABEL: Record<string, string> = {
  VALUATION: 'Valuation',
  RENTABILIDADE: 'Rentabilidade',
  SAÚDE_FINANCEIRA: 'Saúde Financeira',
  CRESCIMENTO: 'Crescimento',
  DIVIDENDOS: 'Dividendos',
  GOVERNANÇA: 'Governança',
  QUALIDADE_LUCRO: 'Qualidade do Lucro',
  LIQUIDEZ: 'Liquidez',
};

export const RISK_LEVEL_LABEL: Record<string, string> = {
  LOW: 'Baixo',
  MEDIUM: 'Médio',
  HIGH: 'Alto',
};

export const SEVERITY_LABEL: Record<string, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

export function flagCategoryLabel(cat: string): string {
  return FLAG_CATEGORY_LABEL[cat] || cat;
}

export function riskLevelLabel(level: string): string {
  return RISK_LEVEL_LABEL[level] || level;
}

/** Unidades B3 que terminam em 11 mas não são FII. */
const UNIT_TICKERS = new Set([
  'SANB11',
  'KLBN11',
  'TAEE11',
  'ALUP11',
  'SAPR11',
  'TIET11',
  'CPLE11',
  'BPAC11',
]);

/** ETFs listados na B3 que terminam em 11. */
const ETF_TICKERS = new Set([
  'LFTB11',
  'BOVA11',
  'IVVB11',
  'SMAL11',
  'B5P211',
  'IMAB11',
  'HASH11',
  'XINA11',
  'NASD11',
  'SPXI11',
  'GOLD11',
  'DIVO11',
  'BRAX11',
  'MATB11',
  'FIND11',
  'ISUS11',
]);

export function isEtfAsset(assetType?: string, ticker?: string): boolean {
  if (assetType === 'ETF') return true;
  if (assetType && assetType !== 'ETF') return false;
  const code = ticker?.trim().toUpperCase() ?? '';
  return ETF_TICKERS.has(code);
}

/** Classes avaliadas só por preço, risco e liquidez (RFC-008): sem métricas corporativas. */
const PRICE_ONLY_ASSET_TYPES = new Set(['ETF', 'BDR', 'FIAGRO', 'FI_INFRA']);

export function isPriceOnlyAsset(assetType?: string, ticker?: string): boolean {
  if (assetType) return PRICE_ONLY_ASSET_TYPES.has(assetType);
  return isEtfAsset(undefined, ticker);
}

export function isFiiAsset(assetType?: string, ticker?: string): boolean {
  if (assetType === 'FII') return true;
  if (assetType && assetType !== 'FII') return false;
  const code = ticker?.trim().toUpperCase() ?? '';
  if (!code.endsWith('11') || code.length < 6) return false;
  return !UNIT_TICKERS.has(code) && !ETF_TICKERS.has(code);
}

/** Métricas corporativas de DRE e Balanço de empresas (inaplicáveis a fundos de índice/ETFs). */
export const CORPORATE_STOCK_METRICS = new Set([
  'pl',
  'dy_pct',
  'dividaliquida_ebitda',
  'roe_pct',
  'roic_pct',
  'margem_liquida_pct',
  'liquidezcorrente',
  'dividaliquida_patrimonioliquido',
  'receitas_cagr5_pct',
  'lucros_cagr5_pct',
  'ev_ebitda',
  'consistencia_roic',
  'consistencia_margem',
  'roic_spread_selic',
  'graham_number',
  'earnings_yield',
  'piotroski_f_score',
  'bazin_ceiling_price',
  'lpa',
  'vpa',
  'ev_ebit',
  'fco',
  'fco_vs_lucro',
  'divida_lp',
  'n_acoes',
  'lucro_liquido',
  'roa_pct',
  'margem_bruta_pct',
  'giro_ativos',
]);

