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
    return new Date(isoDate).toLocaleString('pt-BR');
  } catch {
    return isoDate;
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
  const [sort, setSort] = useState('createdAt');
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

  return (
    <div>
      <form
        className="audits-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0);
        }}
      >
        <div className="audits-filter-row">
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
            <option value="createdAt">Criado em</option>
            <option value="lastSeenAt">Última ocorrência</option>
            <option value="severity">Severidade</option>
            <option value="status">Status</option>
            <option value="serviceName">Serviço</option>
          </select>
          <select className="form-input" value={dir} onChange={(e) => setDir(e.target.value)} aria-label="Direção">
            <option value="desc">Mais recentes</option>
            <option value="asc">Mais antigos</option>
          </select>
          <button type="submit" className="btn btn-secondary btn-pill" disabled={loading}>
            Filtrar
          </button>
        </div>
      </form>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Status</th>
              <th>Severidade</th>
              <th>Conclusão K8s</th>
              <th>Quando</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando incidentes...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum incidente para os filtros atuais.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item)} style={{ cursor: 'pointer' }}>
                  <td>{item.serviceName}</td>
                  <td>{item.status}</td>
                  <td>{item.severity}</td>
                  <td>{item.k8sConclusion || '—'}</td>
                  <td>{formatDate(item.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="audits-pager">
        <span className="audits-pager-meta">
          {totalElements} incidente(s) · página {page + 1} de {Math.max(totalPages, 1)}
        </span>
        <div className="audits-pager-actions">
          <button type="button" className="btn btn-secondary" disabled={page <= 0} onClick={() => void load(page - 1)}>
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page + 1 >= totalPages}
            onClick={() => void load(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem' }}>Destinatários de alerta</h3>
        <form onSubmit={addRecipient} className="audits-filter-row" style={{ marginTop: '0.75rem' }}>
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
        <ul style={{ marginTop: '0.75rem', paddingLeft: '1.1rem' }}>
          {recipients.map((recipient) => (
            <li key={recipient.id} style={{ marginBottom: '0.35rem' }}>
              {recipient.email} {recipient.enabled ? '' : '(inativo)'}
              <button
                type="button"
                className="btn btn-secondary btn-pill"
                style={{ marginLeft: '0.5rem' }}
                onClick={() => accessToken && void patchAlertRecipient(recipient.id, !recipient.enabled, accessToken).then(loadRecipients)}
              >
                {recipient.enabled ? 'Desativar' : 'Ativar'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        isOpen={!!detail || detailLoading}
        onClose={() => {
          setDetail(null);
          setPickerOpen(false);
        }}
        title={detail?.incident.serviceName || 'Incidente'}
        subtitle={detail ? formatDate(detail.incident.createdAt) : 'Carregando...'}
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
