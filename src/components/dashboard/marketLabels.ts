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
};

export const SOURCE_LABEL: Record<string, string> = {
  'status-invest': 'Status Invest',
  'yahoo-finance': 'Yahoo Finance',
  'bcb-sgs': 'Banco Central (SGS)',
  infomoney: 'InfoMoney',
  'money-times': 'Money Times',
};
