import { describe, expect, it } from 'vitest';
import {
  classifyMoneyError,
  dateInputToExpiry,
  isCreditActive,
  isCoreWriteEnabled,
  isFinancialActive,
  paidCents,
  parseBrlToCents,
  requestedRefundsCents,
} from './billingMoney';
import type { BillingRefund, BillingSettings } from '../services/billingService';

const settings = (over: Partial<BillingSettings>): BillingSettings => ({
  companyId: 'c',
  financialMode: 'OFF',
  creditEnabled: false,
  couponEnabled: false,
  referralEnabled: false,
  catalogEnabled: false,
  reportsEnabled: false,
  ...over,
});

describe('parseBrlToCents', () => {
  it.each([
    ['10', 1000],
    ['10,5', 1050],
    ['10,50', 1050],
    ['1.234,56', 123456],
    ['1.234.567', 123456700],
    ['R$ 19,40', 1940],
    ['0,01', 1],
    ['0', 0],
    ['19,99', 1999],
    ['1,10', 110],
  ])('%s vira %i centavos', (text, cents) => {
    expect(parseBrlToCents(text)).toBe(cents);
  });

  it.each(['', 'abc', '12.50', '1,234', '1.23,45', '-5', '10,', '1e3', '999999999999999'])(
    'recusa %s, sem adivinhar',
    (text) => {
      expect(parseBrlToCents(text)).toBeNull();
    },
  );
});

describe('liga por company', () => {
  it('sem configuração, tudo desligado', () => {
    expect(isFinancialActive(null)).toBe(false);
    expect(isCreditActive(null)).toBe(false);
  });

  it('credit_enabled sem modo ligado não abre o extrato', () => {
    expect(isCreditActive(settings({ creditEnabled: true }))).toBe(false);
  });

  it('modo ligado sem credit_enabled abre a fatura e não o extrato', () => {
    const s = settings({ financialMode: 'ON' });
    expect(isFinancialActive(s)).toBe(true);
    expect(isCreditActive(s)).toBe(false);
  });

  it('DRAINING continua mostrando o que está aberto', () => {
    const s = settings({ financialMode: 'DRAINING', creditEnabled: true });
    expect(isFinancialActive(s)).toBe(true);
    expect(isCreditActive(s)).toBe(true);
  });

  it('a escrita nasce desligada: campo ausente, falso ou sem configuração', () => {
    expect(isCoreWriteEnabled(null)).toBe(false);
    expect(isCoreWriteEnabled(settings({ financialMode: 'ON', creditEnabled: true }))).toBe(false);
    expect(isCoreWriteEnabled(settings({ financialMode: 'ON', coreWriteEnabled: false }))).toBe(false);
    expect(isCoreWriteEnabled(settings({ financialMode: 'ON', coreWriteEnabled: true }))).toBe(true);
  });
});

describe('conta do estorno', () => {
  const refund = (amountCents: number, status: BillingRefund['status']): BillingRefund => ({
    id: String(amountCents),
    amountCents,
    method: 'GATEWAY',
    status,
  });

  it('recusado não conta no que já foi pedido', () => {
    expect(requestedRefundsCents([refund(100, 'DONE'), refund(200, 'AWAITING_AUTHORIZATION'), refund(400, 'REJECTED')])).toBe(300);
  });

  it('fatura antiga vale pelo amountCents', () => {
    expect(paidCents({ amountCents: 9700, paidAmountCents: null })).toBe(9700);
    expect(paidCents({ amountCents: 9700, paidAmountCents: 5790 })).toBe(5790);
  });

  it('validade fecha no fim do dia em São Paulo', () => {
    expect(dateInputToExpiry('2027-01-31')).toBe('2027-01-31T23:59:59-03:00');
    expect(dateInputToExpiry('')).toBeUndefined();
  });
});

describe('classifyMoneyError', () => {
  const http = (status: number, error?: string, message?: string) => ({ status, data: { error, message } });

  it('CORE_WRITE_DISABLED trava a escrita', () => {
    expect(classifyMoneyError(http(403, 'CORE_WRITE_DISABLED')).kind).toBe('write_disabled');
  });

  it('recusa do gateway mostra o texto do Asaas e é definitiva', () => {
    const e = classifyMoneyError(http(422, 'REFUND_REJECTED_BY_GATEWAY', 'Esta transação só pode ser estornada parcialmente no próximo dia.'));
    expect(e.kind).toBe('definitive');
    expect(e.text).toContain('próximo dia');
    expect(e.text).toContain('Nada mudou no saldo');
  });

  it('502 do gateway fica registrado e não deve repetir', () => {
    expect(classifyMoneyError(http(502, 'GATEWAY_UNAVAILABLE')).kind).toBe('registered');
  });

  it('erro de rede e 5xx repetem com a mesma chave', () => {
    expect(classifyMoneyError(new TypeError('Failed to fetch')).kind).toBe('uncertain');
    expect(classifyMoneyError(http(503)).kind).toBe('uncertain');
  });

  it('4xx sem código conhecido é definitivo', () => {
    expect(classifyMoneyError(http(422, 'OUTRO', 'Texto do servidor')).text).toBe('Texto do servidor');
  });

  it('pedido em curso mantém a chave', () => {
    expect(classifyMoneyError(http(409, 'REQUEST_IN_PROGRESS')).kind).toBe('in_progress');
  });
});
