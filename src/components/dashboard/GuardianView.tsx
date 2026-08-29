import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  executeIncidentAction,
  getIncident,
  listAlertRecipients,
  patchAlertRecipient,
  searchIncidents,
  upsertAlertRecipient,
  type AlertRecipient,
  type GuardianIncidentListItem,
  type IncidentDetail,
  type SuggestionDTO,
} from '../../services/guardianService';

function formatDate(isoDate?: string) {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function whenOf(item: GuardianIncidentListItem) {
  return item.lastSeenAt || item.createdAt;
}

function statusLabel(status?: string) {
  switch ((status || '').toUpperCase()) {
    case 'AWAITING_HUMAN':
      return 'Aguardando humano';
    case 'ACTION_RUNNING':
      return 'Ação em andamento';
    case 'NOTIFIED':
      return 'Notificado';
    case 'DETECTED':
      return 'Detectado';
    case 'DIAGNOSING':
      return 'Diagnosticando';
    case 'DIAGNOSED':
      return 'Diagnosticado';
    case 'NORMALIZED':
      return 'Normalizado';
    case 'DISMISSED':
      return 'Dispensado';
    default:
      return status || '—';
  }
}

function statusStyle(status?: string): React.CSSProperties {
  switch ((status || '').toUpperCase()) {
    case 'NOTIFIED':
    case 'AWAITING_HUMAN':
      return { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' };
    case 'ACTION_RUNNING':
    case 'DIAGNOSING':
      return { background: '#eef3ff', color: '#2b4cdb', borderColor: '#c9d4ff' };
    case 'NORMALIZED':
    case 'DISMISSED':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    case 'DETECTED':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    default:
      return {};
  }
}

function severityStyle(severity?: string): React.CSSProperties {
  switch ((severity || '').toUpperCase()) {
    case 'CRITICAL':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    case 'HIGH':
      return { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' };
    case 'MEDIUM':
      return { background: '#eef3ff', color: '#2b4cdb', borderColor: '#c9d4ff' };
    case 'LOW':
    case 'INFO':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    default:
      return {};
  }
}

export const GuardianView: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<GuardianIncidentListItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('lastSeenAt');
  const [dir, setDir] = useState('desc');
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pendingSuggestion, setPendingSuggestion] = useState<SuggestionDTO | null>(null);
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [newEmail, setNewEmail] = useState('');

  const load = useCallback(async (nextPage = page) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const result = await searchIncidents(
        { page: nextPage, size: 20, status, q, sort, dir, namespace: 'keepguard' },
        accessToken
      );
      setItems(result.content || []);
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao listar incidentes',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, addToast, dir, page, q, sort, status]);

  const loadRecipients = useCallback(async () => {
    if (!accessToken) return;
    try {
      setRecipients(await listAlertRecipients(accessToken));
    } catch {
      setRecipients([]);
    }
  }, [accessToken]);

  useEffect(() => {
    void load(0);
    void loadRecipients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const openDetail = async (item: GuardianIncidentListItem) => {
    if (!accessToken) return;
    setDetailLoading(true);
    setPickerOpen(false);
    setPendingSuggestion(null);
    try {
      setDetail(await getIncident(item.id, accessToken));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao abrir incidente',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: string) => {
    if (!accessToken) return;
    setDetail(await getIncident(id, accessToken));
  };

  const runAction = async (suggestion: SuggestionDTO) => {
    if (!accessToken || !detail) return;
    if (suggestion.risk === 'DESTRUCTIVE' && confirmation !== detail.incident.serviceName) {
      addToast({
        type: 'error',
        title: 'Confirmação obrigatória',
        description: `Digite o nome do serviço (${detail.incident.serviceName}) para ações destrutivas.`,
      });
      return;
    }
    try {
      await executeIncidentAction(
        detail.incident.id,
        suggestion.id,
        suggestion.risk === 'DESTRUCTIVE' ? confirmation : undefined,
        accessToken
      );
      addToast({ type: 'success', title: 'Ação enviada', description: suggestion.label });
      setPickerOpen(false);
      setPendingSuggestion(null);
      setConfirmation('');
      await refreshDetail(detail.incident.id);
      await load(page);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha na ação',
        description: error instanceof Error ? error.message : 'O cluster recusou a operação.',
      });
    }
  };

  const addRecipient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !newEmail.trim()) return;
    try {
      await upsertAlertRecipient({ email: newEmail.trim(), enabled: true }, accessToken);
      setNewEmail('');
      await loadRecipients();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Não foi possível salvar o e-mail',
        description: error instanceof Error ? error.message : 'Verifique o formato.',
      });
    }
  };

  const pager = (
    <div className="audits-pager">
      <span className="audits-pager-meta">
        {totalElements} incidente{totalElements === 1 ? '' : 's'} · página {page + 1} de {Math.max(totalPages, 1)}
      </span>
      <div className="audits-pager-actions">
        <button
          type="button"
          className="btn btn-outline btn-pill btn-icon-pager"
          disabled={loading || page <= 0}
          onClick={() => void load(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="btn btn-outline btn-pill btn-icon-pager"
          disabled={loading || page + 1 >= totalPages}
          onClick={() => void load(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <form
        className="audits-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0);
        }}
      >
        <div className="audits-filter-row guardian-filter-row">
          <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="AWAITING_HUMAN">Aguardando humano</option>
            <option value="ACTION_RUNNING">Ação em andamento</option>
            <option value="NOTIFIED">Notificado</option>
            <option value="DETECTED">Detectado</option>
            <option value="NORMALIZED">Normalizado</option>
            <option value="DISMISSED">Dispensado</option>
          </select>
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Serviço, pod ou resumo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="form-input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
            <option value="lastSeenAt">Última ocorrência</option>
            <option value="createdAt">Criado em</option>
            <option value="severity">Severidade</option>
            <option value="status">Status</option>
            <option value="serviceName">Serviço</option>
          </select>
          <select className="form-input" value={dir} onChange={(e) => setDir(e.target.value)} aria-label="Direção">
            <option value="desc">Mais recentes</option>
            <option value="asc">Mais antigos</option>
          </select>
          <button type="submit" className="btn btn-secondary btn-pill guardian-filter-submit" disabled={loading}>
            Filtrar
          </button>
        </div>
      </form>

      {pager}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table guardian-table">
          <colgroup>
            <col className="col-service" />
            <col className="col-status" />
            <col className="col-severity" />
            <col className="col-k8s" />
            <col className="col-when" />
          </colgroup>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Status</th>
              <th>Severidade</th>
              <th title="Conclusão Kubernetes">K8s</th>
              <th>Quando</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando incidentes...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Nenhum incidente para os filtros atuais.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item)} style={{ cursor: 'pointer' }}>
                  <td className="cell-service">
                    <span className="table-cell-title">{item.serviceName}</span>
                    {item.podName ? <div className="table-cell-muted">{item.podName}</div> : null}
                  </td>
                  <td>
                    <span className="badge-role" style={statusStyle(item.status)}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <span className="badge-role" style={severityStyle(item.severity)}>
                      {item.severity || '—'}
                    </span>
                  </td>
                  <td className="cell-k8s" title={item.k8sConclusion || ''}>{item.k8sConclusion || '—'}</td>
                  <td className="cell-when">{formatDate(whenOf(item))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className="mobile-domain-card"
            onClick={() => void openDetail(item)}
            style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit' }}
          >
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{item.serviceName}</span>
              <span className="badge-role" style={severityStyle(item.severity)}>
                {item.severity}
              </span>
            </div>
            <div className="mobile-card-subinfo">{formatDate(whenOf(item))}</div>
            <div className="mobile-card-meta">
              {statusLabel(item.status)} · {item.k8sConclusion || 'sem conclusão K8s'}
            </div>
          </button>
        ))}
      </div>

      {pager}

      <div className="hpanel-table-card guardian-recipients-card">
        <div className="guardian-recipients-head">
          <h3>Destinatários de alerta</h3>
        </div>
        <form onSubmit={addRecipient} className="guardian-recipients-form">
          <input
            className="form-input"
            placeholder="email@empresa.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-pill">
            Adicionar
          </button>
        </form>
        <ul className="guardian-recipient-list">
          {recipients.length === 0 ? (
            <li className="guardian-recipient-row">
              <span className="table-cell-muted">Nenhum destinatário cadastrado.</span>
            </li>
          ) : (
            recipients.map((recipient) => (
              <li key={recipient.id} className="guardian-recipient-row">
                <div>
                  <div className="guardian-recipient-email">{recipient.email}</div>
                  <div className="guardian-recipient-meta">{recipient.enabled ? 'Ativo' : 'Inativo'}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-pill"
                  onClick={() => accessToken && void patchAlertRecipient(recipient.id, !recipient.enabled, accessToken).then(loadRecipients)}
                >
                  {recipient.enabled ? 'Desativar' : 'Ativar'}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <Modal
        isOpen={!!detail || detailLoading}
        onClose={() => {
          setDetail(null);
          setPickerOpen(false);
        }}
        title={detail?.incident.serviceName || 'Incidente'}
        subtitle={detail ? formatDate(whenOf(detail.incident)) : 'Carregando...'}
        maxWidth="720px"
      >
        {detailLoading && !detail ? (
          <p>Carregando detalhe...</p>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="info-value">{detail.incident.status}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Conclusão K8s</span>
              <span className="info-value">{detail.incident.k8sConclusion || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Investigação</span>
              <span className="info-value">{detail.investigationSource || '—'}</span>
            </div>
            <p>{detail.aiSummary || detail.aiRootCause || 'Sem resumo da IA.'}</p>
            {detail.timeline && detail.timeline.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Linha do tempo</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.timeline.map((hop, index) => (
                    <li key={`${hop.eventType}-${index}`} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {formatDate(hop.createdAt)} · {hop.eventType} · {hop.detail || ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail.deliveries && detail.deliveries.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>E-mails</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.deliveries.map((delivery, index) => (
                    <li key={`${delivery.email}-${index}`} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {delivery.email} · {delivery.outcome} · {delivery.kind}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button type="button" className="btn btn-primary" onClick={() => setPickerOpen((open) => !open)}>
              Ação
            </button>
            {pickerOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>O que você quer fazer neste incidente?</p>
                {(detail.suggestions || []).map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="btn btn-secondary"
                    disabled={!suggestion.enabled && suggestion.actionType !== 'DISMISS'}
                    title={suggestion.disabledReason || suggestion.aiRationale}
                    onClick={() => {
                      setPendingSuggestion(suggestion);
                      if (suggestion.risk !== 'DESTRUCTIVE') {
                        void runAction(suggestion);
                      }
                    }}
                  >
                    {suggestion.label} · {suggestion.risk}
                    {!suggestion.enabled && suggestion.actionType !== 'DISMISS' ? ' (indisponível)' : ''}
                  </button>
                ))}
                {pendingSuggestion?.risk === 'DESTRUCTIVE' ? (
                  <div>
                    <input
                      className="form-input"
                      placeholder={`Digite ${detail.incident.serviceName}`}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                    <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => void runAction(pendingSuggestion)}>
                      Confirmar {pendingSuggestion.label}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default GuardianView;
