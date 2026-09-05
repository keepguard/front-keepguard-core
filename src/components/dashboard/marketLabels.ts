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
};
