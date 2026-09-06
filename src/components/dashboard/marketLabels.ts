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
};

export const GAP_REASON_LABEL: Record<string, string> = {
  FACT_MISSING: 'Dado ausente',
  SERIES_TOO_SHORT: 'Série curta demais',
  MACRO_MISSING: 'Macro ausente',
  NO_EARNINGS: 'Sem lucro/base',
  FINANCIAL: 'Não se aplica a banco',
  LPA_NOT_POSITIVE: 'LPA não positivo',
  VPA_NOT_POSITIVE: 'VPA não positivo',
};

export const THESIS_LABEL: Record<string, string> = {
  OPORTUNIDADE: 'Oportunidade',
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
  if (base === 'OPORTUNIDADE' || base === 'QUALIDADE_A_PRECO_JUSTO') return 'good';
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
