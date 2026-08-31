import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LockOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  blockOAuthClient,
  createOAuthClient,
  deleteOAuthClient,
  getOAuthClient,
  listOAuthServiceRoles,
  searchOAuthClients,
  unblockOAuthClient,
  updateOAuthClient,
  type CollectorAgent,
  type OAuthClient,
  type OAuthClientDetail,
  type OAuthServiceRole,
} from '../../services/oauthClientService';

type Filters = {
  clientId: string;
  status: '' | 'ACTIVE' | 'BLOCKED';
  sort: 'createdAt' | 'clientId' | 'status' | '';
  dir: 'asc' | 'desc' | '';
};

type ConfirmKind = 'block' | 'delete';

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

function statusLabel(status?: string): string {
  if ((status || '').toUpperCase() === 'BLOCKED') return 'Bloqueado';
  if ((status || '').toUpperCase() === 'ACTIVE') return 'Ativo';
  return status || '—';
}

function statusStyle(status?: string): React.CSSProperties {
  if ((status || '').toUpperCase() === 'BLOCKED') {
    return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
  }
  return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
}

function AgentImpactList({
  agents,
  loading,
  agentsLoadError,
  impact = false,
}: {
  agents: CollectorAgent[];
  loading: boolean;
  agentsLoadError?: string;
  impact?: boolean;
}) {
  if (loading) {
    return (
      <div className="form-group oauth-authorities-group">
        <div className="form-label-row">
          <label>Agents (collector)</label>
        </div>
        <div className="oauth-authorities-list">
          <p className="oauth-authorities-empty">Buscando agents no collector...</p>
        </div>
      </div>
    );
  }
  if (agentsLoadError) {
    return (
      <div className="form-group oauth-authorities-group">
        <div className="form-label-row">
          <label>Agents (collector)</label>
        </div>
        <div className="oauth-authorities-list">
          <p className="oauth-authorities-empty" style={{ color: '#b45309' }}>
            Não foi possível consultar os agents no collector ({agentsLoadError}).
            {impact
              ? ' Verifique se o srv-data-collector está em execução antes de confirmar.'
              : ''}
          </p>
        </div>
      </div>
    );
  }

  const enabledCount = agents.filter((agent) => agent.enabled).length;
  const title = impact
    ? `Agents vinculados`
    : 'Agents (collector)';
  const countLabel = impact
    ? `${enabledCount} ativo${enabledCount === 1 ? '' : 's'} serão desabilitados`
    : agents.length === 1
      ? '1 agent'
      : `${agents.length} agents`;

  return (
    <div className="form-group oauth-authorities-group">
      <div className="form-label-row">
        <label>{title}</label>
        <span className="oauth-authorities-count">{countLabel}</span>
      </div>
      <div className="oauth-authorities-list" role="list">
        {agents.length > 0 ? (
          agents.map((agent) => (
            <div key={agent.id} className="oauth-authority-item" role="listitem">
              <span className="oauth-authority-name">{agent.name}</span>
              <span className="oauth-authority-desc">
                {agent.collectorType} · {agent.enabled ? 'ativo' : 'inativo'}
              </span>
              <span className="oauth-agent-code text-mono">{agent.code}</span>
            </div>
          ))
        ) : (
          <p className="oauth-authorities-empty">
            Nenhum agent encontrado em srv_data_collector.agents para este company.
          </p>
        )}
      </div>
    </div>
  );
}

const ClientPager: React.FC<{
  loading: boolean;
  page: number;
  totalPages: number;
  totalElements: number;
  onPrev: () => void;
  onNext: () => void;
}> = ({ loading, page, totalPages, totalElements, onPrev, onNext }) => (
  <div className="audits-pager">
    <span className="audits-pager-meta">
      {totalElements} client{totalElements === 1 ? '' : 's'} · página {page + 1} de {totalPages}
    </span>
    <div className="audits-pager-actions">
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || page <= 0}
        onClick={onPrev}
        aria-label="Página anterior"
        title="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || page >= totalPages - 1}
        onClick={onNext}
        aria-label="Próxima página"
        title="Próxima página"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  </div>
);

export const ClientSystemView: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('keepguard_access_token') : null);

  const [filters, setFilters] = useState<Filters>({
    clientId: '',
    status: '',
    sort: 'createdAt',
    dir: 'desc',
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [items, setItems] = useState<OAuthClient[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<OAuthClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<OAuthClient | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; client: OAuthClient } | null>(null);
  const [impactAgents, setImpactAgents] = useState<CollectorAgent[]>([]);
  const [impactAgentsLoadError, setImpactAgentsLoadError] = useState<string | undefined>();
  const [impactLoading, setImpactLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientId: '',
    description: '',
    roleId: '',
    tokenTtlSeconds: '28800',
  });
  const [editClient, setEditClient] = useState<OAuthClient | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    roleId: '',
    tokenTtlSeconds: '28800',
  });
  const [serviceRoles, setServiceRoles] = useState<OAuthServiceRole[]>([]);
  const [serviceRolesLoading, setServiceRolesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selectedCreateRole = serviceRoles.find((role) => role.id === createForm.roleId);
  const selectedEditRole = serviceRoles.find((role) => role.id === editForm.roleId);

  const loadPage = useCallback(async (nextPage: number, nextFilters: Filters) => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await searchOAuthClients(
        {
          clientId: nextFilters.clientId.trim() || undefined,
          status: nextFilters.status || undefined,
          page: nextPage,
          size: 20,
          sort: nextFilters.sort || 'createdAt',
          dir: nextFilters.dir || 'desc',
        },
        token
      );
      setItems(result.content || []);
      setPage(result.page ?? nextPage);
      setTotalPages(Math.max(result.totalPages || 1, 1));
      setTotalElements(result.totalElements || 0);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        addToast({
          type: 'error',
          title: 'Acesso restrito',
          description: 'Somente ADMIN ou SYSTEM gerenciam OAuth clients.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao consultar clients',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, token]);

  useEffect(() => {
    if (token) {
      loadPage(0, applied);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!confirm || !token) {
      setImpactAgents([]);
      setImpactAgentsLoadError(undefined);
      return;
    }
    let cancelled = false;
    setImpactLoading(true);
    getOAuthClient(confirm.client.id, token)
      .then((full) => {
        if (!cancelled) {
          setImpactAgents(full.agents || []);
          setImpactAgentsLoadError(full.agentsLoadError);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImpactAgents([]);
          setImpactAgentsLoadError('falha ao carregar detalhe do client');
        }
      })
      .finally(() => {
        if (!cancelled) setImpactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addToast, confirm, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    loadPage(0, filters);
  };

  const openDetail = async (item: OAuthClient) => {
    if (!token) return;
    setDetailLoading(true);
    try {
      const full = await getOAuthClient(item.id, token);
      setDetail(full);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao abrir client',
        description: err?.message || 'Não foi possível carregar o detalhe.',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUnblock = async (item: OAuthClient, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!token) return;
    try {
      const next = await unblockOAuthClient(item.id, token);
      setItems((current) => current.map((row) => (row.id === next.id ? next : row)));
      addToast({ type: 'success', title: 'Client desbloqueado', description: next.clientId });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível desbloquear',
        description: err?.message || 'Tente novamente.',
      });
    }
  };

  const closeConfirm = () => {
    if (submitting) return;
    setConfirm(null);
    setImpactAgents([]);
  };

  const handleConfirmAction = async () => {
    if (!token || !confirm) return;
    setSubmitting(true);
    try {
      if (confirm.kind === 'block') {
        const next = await blockOAuthClient(confirm.client.id, token);
        setItems((current) => current.map((row) => (row.id === next.id ? next : row)));
        addToast({
          type: 'success',
          title: 'Client bloqueado',
          description: 'Agents ativos do company foram desabilitados.',
        });
      } else {
        await deleteOAuthClient(confirm.client.id, token);
        addToast({
          type: 'success',
          title: 'Client excluído',
          description: 'Agents ativos do company foram desabilitados.',
        });
        setDetail(null);
        await loadPage(page, applied);
      }
      setConfirm(null);
      setImpactAgents([]);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: confirm.kind === 'block' ? 'Não foi possível bloquear' : 'Não foi possível excluir',
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const clientId = createForm.clientId.trim();
    if (!clientId) {
      addToast({ type: 'warning', title: 'clientId obrigatório', description: 'Informe o identificador do client.' });
      return;
    }
    const ttl = Number(createForm.tokenTtlSeconds);
    if (!createForm.roleId) {
      addToast({ type: 'warning', title: 'Perfil obrigatório', description: 'Selecione um perfil de serviço.' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await createOAuthClient(
        {
          clientId,
          description: createForm.description.trim() || undefined,
          roleId: createForm.roleId,
          tokenTtlSeconds: Number.isFinite(ttl) ? ttl : undefined,
        },
        token
      );
      setCreateOpen(false);
      setCreateForm({ clientId: '', description: '', roleId: '', tokenTtlSeconds: '28800' });
      setCreatedSecret(created);
      await loadPage(0, filters);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível criar',
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !editClient) return;
    if (!editForm.roleId) {
      addToast({ type: 'warning', title: 'Perfil obrigatório', description: 'Selecione um perfil de serviço.' });
      return;
    }
    const ttl = Number(editForm.tokenTtlSeconds);
    setSubmitting(true);
    try {
      const next = await updateOAuthClient(
        editClient.id,
        {
          description: editForm.description.trim() || undefined,
          roleId: editForm.roleId,
          tokenTtlSeconds: Number.isFinite(ttl) ? ttl : undefined,
        },
        token
      );
      setItems((current) => current.map((row) => (row.id === next.id ? next : row)));
      setDetail((current) => (current && current.id === next.id ? { ...current, ...next } : current));
      setEditClient(null);
      addToast({ type: 'success', title: 'Client atualizado', description: next.clientId });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível salvar',
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!createdSecret?.clientSecret) return;
    await navigator.clipboard.writeText(createdSecret.clientSecret);
    addToast({ type: 'info', title: 'Secret copiado', description: 'Guarde em local seguro. Ele não será exibido de novo.' });
  };

  const loadServiceRoles = async (preferredRoleId?: string) => {
    if (!token) return '';
    setServiceRolesLoading(true);
    try {
      const roles = await listOAuthServiceRoles(token);
      setServiceRoles(roles || []);
      return preferredRoleId || roles?.[0]?.id || '';
    } catch (err: any) {
      setServiceRoles([]);
      addToast({
        type: 'error',
        title: 'Não foi possível carregar os perfis',
        description: err?.message || 'Tente novamente em instantes.',
      });
      return preferredRoleId || '';
    } finally {
      setServiceRolesLoading(false);
    }
  };

  const openCreate = async () => {
    setCreateOpen(true);
    const roleId = await loadServiceRoles(createForm.roleId);
    setCreateForm((current) => ({
      ...current,
      roleId: current.roleId || roleId,
    }));
  };

  const openEdit = async (item: OAuthClient, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditClient(item);
    setEditForm({
      description: item.description || '',
      roleId: item.serviceRoleId || '',
      tokenTtlSeconds: String(item.tokenTtlSeconds || 28800),
    });
    const roleId = await loadServiceRoles(item.serviceRoleId);
    setEditForm((current) => ({
      ...current,
      roleId: current.roleId || roleId,
    }));
  };

  const pager = (
    <ClientPager
      loading={loading}
      page={page}
      totalPages={totalPages}
      totalElements={totalElements}
      onPrev={() => loadPage(page - 1, applied)}
      onNext={() => loadPage(page + 1, applied)}
    />
  );

  const renderActions = (item: OAuthClient) => (
    <div className="table-actions-group" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn-table-icon"
        title="Editar"
        aria-label="Editar client"
        onClick={(e) => openEdit(item, e)}
      >
        <Pencil size={15} />
      </button>
      {item.status === 'BLOCKED' ? (
        <button
          type="button"
          className="btn-table-icon"
          title="Desbloquear"
          aria-label="Desbloquear client"
          onClick={(e) => handleUnblock(item, e)}
        >
          <LockOpen size={15} />
        </button>
      ) : (
        <button
          type="button"
          className="btn-table-icon"
          title="Bloquear"
          aria-label="Bloquear client"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm({ kind: 'block', client: item });
          }}
        >
          <Ban size={15} />
        </button>
      )}
      <button
        type="button"
        className="btn-table-icon"
        title="Excluir"
        aria-label="Excluir client"
        onClick={(e) => {
          e.stopPropagation();
          setConfirm({ kind: 'delete', client: item });
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <div>
      <div className="client-system-create-row">
        <button type="button" className="btn btn-primary btn-pill" onClick={openCreate}>
          <Plus size={15} />
          <span>Criar</span>
        </button>
      </div>

      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row client-system-filter-row">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Client ID"
              value={filters.clientId}
              onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}
            />
          </div>
          <select
            className="form-input"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativo</option>
            <option value="BLOCKED">Bloqueado</option>
          </select>
        </div>
        <div className="audits-filter-row audits-filter-row-tools client-system-filter-row-tools">
          <select
            className="form-input"
            value={filters.sort}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Filters['sort'] }))}
            aria-label="Ordenar por"
          >
            <option value="createdAt">Criado em</option>
            <option value="clientId">Client ID</option>
            <option value="status">Status</option>
          </select>
          <select
            className="form-input audits-dir-select"
            value={filters.dir}
            onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as Filters['dir'] }))}
            aria-label="Direção"
          >
            <option value="desc">Decrescente</option>
            <option value="asc">Crescente</option>
          </select>
          <div className="audits-filter-actions">
            <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
              <Search size={15} />
              <span>Filtrar</span>
            </button>
          </div>
        </div>
      </form>

      {pager}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Client ID</th>
              <th>Status</th>
              <th>Perfil / Authorities</th>
              <th>TTL</th>
              <th>Criado</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando OAuth clients...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <KeyRound size={22} />
                    <span>Nenhum OAuth client para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} onClick={() => openDetail(item)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="table-cell-title" title={item.clientId}>{item.clientId}</span>
                    {item.description ? <div className="table-cell-muted">{item.description}</div> : null}
                  </td>
                  <td>
                    <span className="badge-role" style={statusStyle(item.status)}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <span className="id-compact" title={(item.authorities || []).join(', ')}>
                      {item.serviceRoleName
                        ? `${item.serviceRoleName}${(item.authorities || []).length ? ` · ${item.authorities.join(', ')}` : ''}`
                        : (item.authorities || []).length > 0
                          ? item.authorities.join(', ')
                          : '—'}
                    </span>
                  </td>
                  <td>{item.tokenTtlSeconds ? `${Math.round(item.tokenTtlSeconds / 3600)}h` : '—'}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{renderActions(item)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {items.map((item) => (
          <div key={item.id} className="mobile-domain-card">
            <button
              type="button"
              onClick={() => openDetail(item)}
              style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit', padding: 0 }}
            >
              <div className="mobile-card-top">
                <span className="mobile-domain-name">{item.clientId}</span>
                <span className="badge-role" style={statusStyle(item.status)}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <div className="mobile-card-subinfo">{formatDate(item.createdAt)}</div>
              <div className="mobile-card-meta">
                {item.serviceRoleName
                  ? `${item.serviceRoleName}${(item.authorities || []).length ? ` · ${item.authorities.join(', ')}` : ''}`
                  : (item.authorities || []).join(', ') || 'Sem authorities'}
              </div>
            </button>
            <div className="mobile-card-actions table-actions-group">{renderActions(item)}</div>
          </div>
        ))}
      </div>

      {pager}

      <Modal
        isOpen={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.clientId || 'OAuth client'}
        subtitle={detail ? statusLabel(detail.status) : 'Carregando...'}
        maxWidth="560px"
      >
        {detailLoading && !detail ? (
          <p className="oauth-detail-loading">Carregando detalhe...</p>
        ) : detail ? (
          <div className="oauth-detail">
            <div className="form-row oauth-detail-row">
              <div className="oauth-detail-field">
                <span className="oauth-detail-label">ID</span>
                <span className="oauth-detail-value text-mono">{detail.id}</span>
              </div>
              <div className="oauth-detail-field">
                <span className="oauth-detail-label">TTL</span>
                <span className="oauth-detail-value">{detail.tokenTtlSeconds}s</span>
              </div>
            </div>
            <div className="oauth-detail-field">
              <span className="oauth-detail-label">Company</span>
              <span className="oauth-detail-value text-mono">{detail.companyId}</span>
            </div>
            <div className="oauth-detail-field">
              <span className="oauth-detail-label">Perfil de serviço</span>
              <span className="oauth-detail-value">{detail.serviceRoleName || '—'}</span>
            </div>
            <div className="form-group oauth-authorities-group">
              <div className="form-label-row">
                <label>Authorities associadas</label>
                <span className="oauth-authorities-count">
                  {(detail.authorities || []).length === 1
                    ? '1 permissão'
                    : `${(detail.authorities || []).length} permissões`}
                </span>
              </div>
              <div className="oauth-authorities-list" role="list">
                {(detail.authorities || []).length > 0 ? (
                  (detail.authorities || []).map((authority) => (
                    <div key={authority} className="oauth-authority-item" role="listitem">
                      <span className="oauth-authority-name">{authority}</span>
                    </div>
                  ))
                ) : (
                  <p className="oauth-authorities-empty">Nenhuma authority associada.</p>
                )}
              </div>
            </div>
            <div className="oauth-detail-field">
              <span className="oauth-detail-label">Descrição</span>
              <span className="oauth-detail-value">{detail.description || '—'}</span>
            </div>
            <div className="oauth-detail-agents">
              <AgentImpactList
                agents={detail.agents || []}
                loading={false}
                agentsLoadError={detail.agentsLoadError}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => !submitting && setCreateOpen(false)}
        title="Criar OAuth client"
        subtitle="O secret é exibido apenas uma vez após a criação."
        maxWidth="560px"
      >
        <form className="oauth-create-form" onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="oauth-client-id">Client ID</label>
              <input
                id="oauth-client-id"
                className="form-input"
                value={createForm.clientId}
                onChange={(e) => setCreateForm((f) => ({ ...f, clientId: e.target.value }))}
                placeholder="srv-data-collector"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="oauth-client-ttl">TTL (segundos)</label>
              <input
                id="oauth-client-ttl"
                className="form-input"
                type="number"
                min={900}
                max={86400}
                value={createForm.tokenTtlSeconds}
                onChange={(e) => setCreateForm((f) => ({ ...f, tokenTtlSeconds: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="oauth-client-desc">Descrição</label>
            <input
              id="oauth-client-desc"
              className="form-input"
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
          <div className="form-group">
            <label htmlFor="oauth-client-role">Perfil de serviço</label>
            <select
              id="oauth-client-role"
              className="form-input"
              value={createForm.roleId}
              onChange={(e) => setCreateForm((f) => ({ ...f, roleId: e.target.value }))}
              disabled={serviceRolesLoading || serviceRoles.length === 0}
              required
            >
              <option value="">{serviceRolesLoading ? 'Carregando perfis...' : 'Selecione um perfil'}</option>
              {serviceRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {selectedCreateRole?.description ? (
              <p className="oauth-role-hint">{selectedCreateRole.description}</p>
            ) : null}
          </div>
          <div className="form-group oauth-authorities-group">
            <div className="form-label-row">
              <label>Authorities associadas</label>
              <span className="oauth-authorities-count">
                {selectedCreateRole
                  ? `${(selectedCreateRole.authorities || []).length} ${(selectedCreateRole.authorities || []).length === 1 ? 'permissão' : 'permissões'}`
                  : '—'}
              </span>
            </div>
            <div className="oauth-authorities-list" role="list">
              {selectedCreateRole && (selectedCreateRole.authorities || []).length > 0 ? (
                (selectedCreateRole.authorities || []).map((authority) => (
                  <div key={authority.name} className="oauth-authority-item" role="listitem">
                    <span className="oauth-authority-name">{authority.name}</span>
                    {authority.description ? (
                      <span className="oauth-authority-desc">{authority.description}</span>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="oauth-authorities-empty">
                  {serviceRolesLoading
                    ? 'Carregando permissões...'
                    : 'Selecione um perfil para ver as permissões associadas.'}
                </p>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || serviceRolesLoading || !createForm.roleId}>
              {submitting ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!editClient}
        onClose={() => !submitting && setEditClient(null)}
        title="Editar OAuth client"
        subtitle={editClient?.clientId}
        maxWidth="560px"
      >
        <form className="oauth-create-form" onSubmit={handleUpdate}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="oauth-edit-client-id">Client ID</label>
              <input
                id="oauth-edit-client-id"
                className="form-input"
                value={editClient?.clientId || ''}
                disabled
                readOnly
              />
            </div>
            <div className="form-group">
              <label htmlFor="oauth-edit-ttl">TTL (segundos)</label>
              <input
                id="oauth-edit-ttl"
                className="form-input"
                type="number"
                min={900}
                max={86400}
                value={editForm.tokenTtlSeconds}
                onChange={(e) => setEditForm((f) => ({ ...f, tokenTtlSeconds: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="oauth-edit-desc">Descrição</label>
            <input
              id="oauth-edit-desc"
              className="form-input"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
          <div className="form-group">
            <label htmlFor="oauth-edit-role">Perfil de serviço</label>
            <select
              id="oauth-edit-role"
              className="form-input"
              value={editForm.roleId}
              onChange={(e) => setEditForm((f) => ({ ...f, roleId: e.target.value }))}
              disabled={serviceRolesLoading || serviceRoles.length === 0}
              required
            >
              <option value="">{serviceRolesLoading ? 'Carregando perfis...' : 'Selecione um perfil'}</option>
              {serviceRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {selectedEditRole?.description ? (
              <p className="oauth-role-hint">{selectedEditRole.description}</p>
            ) : null}
          </div>
          <div className="form-group oauth-authorities-group">
            <div className="form-label-row">
              <label>Authorities associadas</label>
              <span className="oauth-authorities-count">
                {selectedEditRole
                  ? `${(selectedEditRole.authorities || []).length} ${(selectedEditRole.authorities || []).length === 1 ? 'permissão' : 'permissões'}`
                  : '—'}
              </span>
            </div>
            <div className="oauth-authorities-list" role="list">
              {selectedEditRole && (selectedEditRole.authorities || []).length > 0 ? (
                (selectedEditRole.authorities || []).map((authority) => (
                  <div key={authority.name} className="oauth-authority-item" role="listitem">
                    <span className="oauth-authority-name">{authority.name}</span>
                    {authority.description ? (
                      <span className="oauth-authority-desc">{authority.description}</span>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="oauth-authorities-empty">
                  {serviceRolesLoading
                    ? 'Carregando permissões...'
                    : 'Selecione um perfil para ver as permissões associadas.'}
                </p>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEditClient(null)} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || serviceRolesLoading || !editForm.roleId}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!createdSecret}
        onClose={() => setCreatedSecret(null)}
        title="Client criado"
        subtitle="Copie o secret agora. Ele não será mostrado novamente."
      >
        {createdSecret ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="info-row">
              <span className="info-label">Client ID</span>
              <span className="info-value text-mono">{createdSecret.clientId}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Secret</span>
              <span className="info-value text-mono">{createdSecret.clientSecret || '—'}</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setCreatedSecret(null)}>
                Fechar
              </button>
              <button type="button" className="btn btn-primary" onClick={copySecret} disabled={!createdSecret.clientSecret}>
                Copiar secret
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!confirm}
        onClose={closeConfirm}
        title={confirm?.kind === 'block' ? 'Bloquear OAuth client' : 'Excluir OAuth client'}
        subtitle={confirm?.client.clientId}
        maxWidth="560px"
      >
        <p style={{ color: '#5f6368', marginBottom: '0.75rem' }}>
          {confirm?.kind === 'block'
            ? 'O client deixa de emitir tokens. Agents ativos do company serão desabilitados.'
            : 'Esta ação remove o client de forma permanente. Agents ativos do company serão desabilitados.'}
        </p>
        <AgentImpactList
          agents={impactAgents}
          loading={impactLoading}
          agentsLoadError={impactAgentsLoadError}
          impact
        />
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={closeConfirm} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="button"
            className={confirm?.kind === 'block' ? 'btn btn-primary' : 'btn btn-danger'}
            onClick={handleConfirmAction}
            disabled={submitting || impactLoading}
          >
            {submitting
              ? (confirm?.kind === 'block' ? 'Bloqueando...' : 'Excluindo...')
              : (confirm?.kind === 'block' ? 'Confirmar bloqueio' : 'Confirmar exclusão')}
          </button>
        </div>
      </Modal>
    </div>
  );
};
