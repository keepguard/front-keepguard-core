import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ListPager } from '../../common/ListPager';
import { useAuth } from '../../../context/AuthContext';
import {
  getBillingAccount,
  getBillingCredits,
  type BillingAccount,
  type BillingCreditItem,
  type BillingCreditStatement,
  type BillingEntitlement,
} from '../../../services/billingService';
import {
  actorLabel,
  brl,
  creditEntryLabel,
  intervalAdjective,
  shortDate,
  signedBrl,
} from '../../../utils/billingMoney';
import { FlashNotice, Notice, Pill, StatCards, WriteDisabledNotice, type Tone } from './BillingMoneyUi';
import { GrantCreditModal, ReverseCreditModal } from './CreditModals';
import { useBillingFeatures } from './useBillingFeatures';

const PAGE_SIZE = 20;

function statusPill(status?: string | null): { tone: Tone; label: string } {
  switch ((status ?? '').toLowerCase()) {
    case 'active': return { tone: 'ok', label: 'Ativo' };
    case 'trial': return { tone: 'info', label: 'Período de avaliação' };
    case 'grace': return { tone: 'warn', label: 'Em carência' };
    case 'restricted': return { tone: 'bad', label: 'Restrito' };
    case 'canceled': return { tone: 'neutral', label: 'Cancelado' };
    default: return { tone: 'neutral', label: 'Sem assinatura' };
  }
}

function zeroStats() {
  return [
    { label: 'Disponível', value: brl(0), detail: 'Usado nas próximas faturas' },
    { label: 'Reservado', value: brl(0), detail: 'Preso a fatura aberta' },
    { label: 'Saldo total', value: brl(0), detail: 'Disponível + reservado' },
    { label: 'Próximo a vencer', value: '—', detail: 'Nada vence' },
  ];
}

function isLot(item: BillingCreditItem): boolean {
  return item.amountCents > 0 && item.remainingCents !== undefined && item.remainingCents !== null;
}

/** Restante e revertido do lote. Só lançamento positivo tem lote (§6.1, §14.3). */
const LotFacts: React.FC<{ item: BillingCreditItem }> = ({ item }) => {
  if (!isLot(item)) return null;
  return (
    <div className="bm-lot-facts">
      <span>Restante: {brl(item.remainingCents ?? 0)}</span>
      {item.reversedCents ? <span>Revertido: {brl(item.reversedCents)}</span> : null}
      {item.blocked ? <Pill tone="warn">Retido</Pill> : null}
    </div>
  );
};

export const SubscriberPage: React.FC<{
  userId: string;
  row?: BillingEntitlement | null;
  onBack: () => void;
}> = ({ userId, row, onBack }) => {
  const { getAccessToken, user } = useAuth();
  const { writeOpen } = useBillingFeatures();
  const [page, setPage] = useState(0);
  const [statement, setStatement] = useState<BillingCreditStatement | null>(null);
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [reversing, setReversing] = useState<BillingCreditItem | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef(0);

  const isSelf = Boolean(user?.codeUser) && user?.codeUser === userId;
  const entitlement = account?.entitlement ?? row ?? null;
  const name = entitlement?.payerName || entitlement?.payerEmail || `Usuário ${actorLabel(userId)}`;
  const email = entitlement?.payerName ? entitlement?.payerEmail : null;

  const load = useCallback(async (nextPage: number) => {
    const access = getAccessToken();
    if (!access) return;
    const request = ++requestRef.current;
    setLoading(true);
    setFailed(false);
    const [credits, accountResult] = await Promise.allSettled([
      getBillingCredits({ userId, page: nextPage, size: PAGE_SIZE }, access),
      getBillingAccount(userId, access),
    ]);
    if (request !== requestRef.current) return;
    if (credits.status === 'fulfilled') setStatement(credits.value);
    else setFailed(true);
    if (accountResult.status === 'fulfilled') setAccount(accountResult.value);
    setLoading(false);
  }, [getAccessToken, userId]);

  useEffect(() => { void load(page); }, [load, page]);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const afterWrite = (message: string) => {
    setGranting(false);
    setReversing(null);
    setFlash(message);
    if (page === 0) void load(0);
    else setPage(0);
  };

  const canWriteHere = writeOpen && !isSelf;
  const pill = statusPill(entitlement?.status);
  const available = statement?.availableCents ?? 0;
  const items = statement?.items ?? [];
  const totalPages = statement ? Math.max(1, Math.ceil(statement.total / (statement.size || PAGE_SIZE))) : 1;
  const hasLots = items.length > 0;

  const actionFor = (item: BillingCreditItem): React.ReactNode => {
    if (isSelf || !isLot(item)) return null;
    if ((item.remainingCents ?? 0) > 0) {
      if (item.blocked) return <span className="table-cell-muted">Retido</span>;
      return (
        <button
          type="button"
          className="btn btn-secondary btn-pill bm-btn bm-btn-sm"
          disabled={!canWriteHere}
          onClick={() => setReversing(item)}
        >
          Lançar contrário
        </button>
      );
    }
    return item.reversedCents ? <span className="table-cell-muted">Já corrigido</span> : null;
  };

  const expiryOf = (item: BillingCreditItem): React.ReactNode =>
    item.expiresAt ? shortDate(item.expiresAt) : <span className="table-cell-muted">Não vence</span>;

  const reasonOf = (item: BillingCreditItem): React.ReactNode => (
    <>
      {item.reason ? item.reason : <span className="table-cell-muted">Automático</span>}
      <div className="table-cell-muted">Por: {actorLabel(item.actor)}</div>
    </>
  );

  const entryOf = (item: BillingCreditItem): React.ReactNode => (
    <>
      <span className="bm-strong">{creditEntryLabel(item.type)}</span>
      <div className="table-cell-muted">Cliente vê: {item.publicText || creditEntryLabel(item.type)}</div>
    </>
  );

  const valueOf = (item: BillingCreditItem): React.ReactNode => (
    <>
      <span className={item.amountCents > 0 ? 'bm-positive' : 'bm-negative'}>{signedBrl(item.amountCents)}</span>
      <LotFacts item={item} />
    </>
  );

  return (
    <div className="bm-scope">
      <nav className="bm-breadcrumb" aria-label="Trilha">
        <button type="button" className="bm-link" onClick={onBack}>Assinantes</button>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{name}</span>
      </nav>

      {flash ? <FlashNotice>{flash}</FlashNotice> : null}
      {isSelf ? (
        <Notice tone="bad" title="Esta é a sua própria conta." code="403 SELF_ACTION_FORBIDDEN">
          Nenhum operador lança crédito para si mesmo. Peça a outra pessoa da operação.
        </Notice>
      ) : null}
      {!writeOpen ? <WriteDisabledNotice /> : null}

      <section className="bm-block" aria-labelledby="bm-subscriber-name">
        <div className="bm-block-top">
          <div>
            <h2 id="bm-subscriber-name" ref={headingRef} tabIndex={-1} className="bm-title">{name}</h2>
            {email ? <p className="table-cell-muted">{email}</p> : null}
            <p className="bm-subline">
              <Pill tone={pill.tone}>{pill.label}</Pill>
              {entitlement?.planCode ? (
                <span className="table-cell-muted">
                  {entitlement.planCode} {intervalAdjective(entitlement.interval)}
                  {entitlement.currentPeriodEnd ? `, até ${shortDate(entitlement.currentPeriodEnd)}` : ''}
                </span>
              ) : null}
              {account?.openDisputes?.length ? <Pill tone="bad">Contestação aberta</Pill> : null}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-pill bm-btn"
            disabled={!canWriteHere || loading || failed}
            onClick={() => { setFlash(null); setGranting(true); }}
          >
            Lançar crédito
          </button>
        </div>
        {loading && !statement ? (
          <div className="bm-stats" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <div className="bm-stat" key={i}><span className="bm-skeleton is-large" /></div>)}
          </div>
        ) : failed ? null : (
          <StatCards
            items={statement && (hasLots || statement.balanceCents !== 0) ? [
              { label: 'Disponível', value: brl(statement.availableCents), detail: 'Usado nas próximas faturas' },
              { label: 'Reservado', value: brl(statement.reservedCents), detail: 'Preso a fatura aberta' },
              { label: 'Saldo total', value: brl(statement.balanceCents), detail: 'Disponível + reservado' },
              {
                label: 'Próximo a vencer',
                value: statement.nextExpiry ? brl(statement.nextExpiry.amountCents) : '—',
                detail: statement.nextExpiry ? `Em ${shortDate(statement.nextExpiry.expiresAt)}` : 'Nada vence',
              },
            ] : zeroStats()}
          />
        )}
      </section>

      {failed ? (
        <Notice
          tone="bad"
          title="Não foi possível carregar o extrato."
          action={<button type="button" className="btn btn-secondary btn-pill bm-btn-sm" onClick={() => void load(page)}>Tentar de novo</button>}
        >
          O saldo não mudou. Tente de novo; se continuar, confira se o billing está no ar.
        </Notice>
      ) : loading && !statement ? (
        <>
          <p role="status" className="table-cell-muted">Carregando o extrato…</p>
          <div className="bm-block" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <span className="bm-skeleton" key={i} />)}
          </div>
        </>
      ) : !hasLots ? (
        <section className="bm-block bm-empty">
          <h3>Sem lançamentos de crédito</h3>
          <p>Esta pessoa nunca recebeu crédito. O que for lançado aparece aqui e não pode ser editado depois.</p>
          <button
            type="button"
            className="btn btn-outline btn-pill bm-btn"
            disabled={!canWriteHere}
            onClick={() => { setFlash(null); setGranting(true); }}
          >
            Lançar crédito
          </button>
        </section>
      ) : (
        <>
          <Notice tone="info" title="Extrato imutável">
            Nenhuma linha é editada ou apagada. Para corrigir, lance o contrário com motivo: a linha original fica e a correção entra como outra linha.
          </Notice>
          <div className="hpanel-table-card desktop-table-view">
            <table className="hpanel-table">
              <caption className="bm-sr-only">Extrato de crédito</caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Lançamento</th>
                  <th scope="col">Motivo e autor</th>
                  <th scope="col">Validade</th>
                  <th scope="col" className="bm-num">Valor</th>
                  <th scope="col"><span className="bm-sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{shortDate(item.createdAt)}</td>
                    <td>{entryOf(item)}</td>
                    <td>{reasonOf(item)}</td>
                    <td>{expiryOf(item)}</td>
                    <td className="bm-num">{valueOf(item)}</td>
                    <td>{actionFor(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mobile-cards-container bm-cards" aria-label="Extrato de crédito">
            {items.map((item) => (
              <li className="bm-card" key={item.id}>
                <dl>
                  <dt>Data</dt><dd>{shortDate(item.createdAt)}</dd>
                  <dt>Lançamento</dt><dd>{entryOf(item)}</dd>
                  <dt>Motivo e autor</dt><dd>{reasonOf(item)}</dd>
                  <dt>Validade</dt><dd>{expiryOf(item)}</dd>
                  <dt>Valor</dt><dd>{valueOf(item)}</dd>
                </dl>
                {actionFor(item) ? <div className="bm-card-actions">{actionFor(item)}</div> : null}
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <ListPager
              loading={loading}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </>
      )}

      {granting ? (
        <GrantCreditModal
          userId={userId}
          subtitle={email ? `${name} · ${email}` : name}
          availableCents={available}
          onClose={() => setGranting(false)}
          onDone={afterWrite}
        />
      ) : null}
      {reversing ? (
        <ReverseCreditModal
          item={reversing}
          availableCents={available}
          onClose={() => setReversing(null)}
          onDone={afterWrite}
        />
      ) : null}
    </div>
  );
};
