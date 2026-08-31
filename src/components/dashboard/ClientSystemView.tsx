import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LockOpen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { RefreshCombo } from '../common/RefreshCombo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  blockOAuthClient,
  createOAuthClient,
  deleteOAuthClient,
  getOAuthClient,
  searchOAuthClients,
  unblockOAuthClient,
  type OAuthClient,
  type OAuthClientDetail,
} from '../../services/oauthClientService';

type Filters = {
  tenantId: string;
  clientId: string;
  status: '' | 'ACTIVE' | 'BLOCKED';
  sort: 'createdAt' | 'clientId' | 'status' | '';
  dir: 'asc' | 'desc' | '';
};

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

const ClientPager: React.FC<{
  loading: boolean;
  refreshing: boolean;
  page: number;
  totalPages: number;
  totalElements: number;
  onPrev: () => void;
  onNext: () => void;
}> = ({ loading, refreshing, page, totalPages, totalElements, onPrev, onNext }) => (
  <div className="audits-pager">
    <span className="audits-pager-meta">
      {totalElements} client{totalElements === 1 ? '' : 's'} · página {page + 1} de {totalPages}
      {refreshing ? ' · atualizando…' : ''}
    </span>
    <div className="audits-pager-actions">
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || refreshing || page <= 0}
        onClick={onPrev}
        aria-label="Página anterior"
        title="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || refreshing || page >= totalPages - 1}
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
  const { accessToken, user } = useAuth();
  const { addToast } = useToast();
  const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('keepguard_access_token') : null);

  const [filters, setFilters] = useState<Filters>({
    tenantId: user?.tenantId || '',
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
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<OAuthClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<OAuthClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OAuthClient | null>(null);
  const [createForm, setCreateForm] = useState({
    clientId: '',
    description: '',
    authorities: 'knowledge:write',
    tokenTtlSeconds: '28800',
  });
  const [submitting, setSubmitting] = useState(false);

  const pageRef = useRef(0);
  const appliedRef = useRef(applied);
  pageRef.current = page;
  appliedRef.current = applied;

  const loadPage = useCallback(async (nextPage: number, nextFilters: Filters, silent = false) => {
    if (!token) return;
    if (!nextFilters.tenantId.trim()) {
      addToast({
        type: 'warning',
        title: 'Tenant ID obrigatório',
        description: 'Informe o tenant para buscar os OAuth clients.',
      });
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await searchOAuthClients(
        {
          tenantId: nextFilters.tenantId.trim(),
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
      setRefreshing(false);
    }
  }, [addToast, token]);

  useEffect(() => {
    if (user?.tenantId && !applied.tenantId) {
      const next = { ...filters, tenantId: user.tenantId };
      setFilters(next);
      setApplied(next);
      loadPage(0, next);
      return;
    }
    if (applied.tenantId) {
      loadPage(0, applied);
    }
  }, [accessToken]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    loadPage(0, filters);
  };

  const openDetail = async (item: OAuthClient) => {
    if (!token) return;
    setDetailLoading(true);
    try {
      const full = await getOAuthClient(item.id, applied.tenantId.trim(), token);
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

  const handleToggleStatus = async (item: OAuthClient, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!token) return;
    try {
      const next = item.status === 'BLOCKED'
        ? await unblockOAuthClient(item.id, applied.tenantId.trim(), token)
        : await blockOAuthClient(item.id, applied.tenantId.trim(), token);
      setItems((current) => current.map((row) => (row.id === next.id ? next : row)));
      addToast({
        type: 'success',
        title: next.status === 'BLOCKED' ? 'Client bloqueado' : 'Client desbloqueado',
        description: next.clientId,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível alterar o status',
        description: err?.message || 'Tente novamente.',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteOAuthClient(deleteTarget.id, applied.tenantId.trim(), token);
      addToast({ type: 'success', title: 'Client excluído', description: deleteTarget.clientId });
      setDeleteTarget(null);
      setDetail(null);
      await loadPage(page, applied);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível excluir',
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const tenantId = filters.tenantId.trim();
    if (!tenantId) {
      addToast({ type: 'warning', title: 'Tenant ID obrigatório', description: 'Informe o tenant antes de criar.' });
      return;
    }
    const clientId = createForm.clientId.trim();
    if (!clientId) {
      addToast({ type: 'warning', title: 'clientId obrigatório', description: 'Informe o identificador do client.' });
      return;
    }
    const authorities = createForm.authorities
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const ttl = Number(createForm.tokenTtlSeconds);
    setSubmitting(true);
    try {
      const created = await createOAuthClient(
        {
          tenantId,
          clientId,
          description: createForm.description.trim() || undefined,
          authorities,
          tokenTtlSeconds: Number.isFinite(ttl) ? ttl : undefined,
        },
        token
      );
      setCreateOpen(false);
      setCreateForm({ clientId: '', description: '', authorities: 'knowledge:write', tokenTtlSeconds: '28800' });
      setCreatedSecret(created);
      await loadPage(0, { ...filters, tenantId });
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

  const copySecret = async () => {
    if (!createdSecret?.clientSecret) return;
    await navigator.clipboard.writeText(createdSecret.clientSecret);
    addToast({ type: 'info', title: 'Secret copiado', description: 'Guarde em local seguro. Ele não será exibido de novo.' });
  };

  const pager = (
    <ClientPager
      loading={loading}
      refreshing={refreshing}
      page={page}
      totalPages={totalPages}
      totalElements={totalElements}
      onPrev={() => loadPage(page - 1, applied)}
      onNext={() => loadPage(page + 1, applied)}
    />
  );

  const renderActions = (item: OAuthClient) => (
    <div className="table-actions-group" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
      {item.status === 'BLOCKED' ? (
        <button
          type="button"
          className="btn-table-icon"
          title="Desbloquear"
          aria-label="Desbloquear client"
          onClick={(e) => handleToggleStatus(item, e)}
        >
          <LockOpen size={15} />
        </button>
      ) : (
        <button
          type="button"
          className="btn-table-icon"
          title="Bloquear"
          aria-label="Bloquear client"
          onClick={(e) => handleToggleStatus(item, e)}
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
          setDeleteTarget(item);
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <div>
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row">
          <input
            className="form-input"
            placeholder="Tenant ID"
            value={filters.tenantId}
            onChange={(e) => setFilters((f) => ({ ...f, tenantId: e.target.value }))}
            required
            aria-label="Tenant ID"
          />
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
            <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading || refreshing}>
              <Search size={15} />
              <span>Filtrar</span>
            </button>
            <RefreshCombo
              onRefresh={() => void loadPage(pageRef.current, appliedRef.current, true)}
              disabled={loading || refreshing}
              refreshing={refreshing}
            />
            <button type="button" className="btn btn-primary btn-pill" onClick={() => setCreateOpen(true)}>
              <Plus size={15} />
              <span>Criar</span>
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
              <th>Authorities</th>
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
                      {(item.authorities || []).length > 0 ? item.authorities.join(', ') : '—'}
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
              <div className="mobile-card-meta">{(item.authorities || []).join(', ') || 'Sem authorities'}</div>
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
        maxWidth="640px"
      >
        {detailLoading && !detail ? (
          <p style={{ color: '#5f6368' }}>Carregando detalhe...</p>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="info-row">
              <span className="info-label">ID</span>
              <span className="info-value text-mono">{detail.id}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Company</span>
              <span className="info-value text-mono">{detail.companyId}</span>
            </div>
            <div className="info-row">
              <span className="info-label">TTL</span>
              <span className="info-value">{detail.tokenTtlSeconds}s</span>
            </div>
            <div className="info-row">
              <span className="info-label">Authorities</span>
              <span className="info-value">{(detail.authorities || []).join(', ') || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Descrição</span>
              <span className="info-value">{detail.description || '—'}</span>
            </div>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Agents (collector)</strong>
              {detail.agents && detail.agents.length > 0 ? (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.agents.map((agent) => (
                    <li key={agent.id} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {agent.name} · {agent.collectorType} · {agent.enabled ? 'ativo' : 'inativo'}
                      <div className="text-mono" style={{ fontSize: '0.75rem' }}>{agent.code}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#5f6368' }}>
                  Nenhum agent neste company (ou collector indisponível).
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => !submitting && setCreateOpen(false)}
        title="Criar OAuth client"
        subtitle="O secret é exibido apenas uma vez após a criação."
      >
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label htmlFor="oauth-client-id">Client ID</label>
            <input
              id="oauth-client-id"
              className="form-input"
              value={createForm.clientId}
              onChange={(e) => setCreateForm((f) => ({ ...f, clientId: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="oauth-client-desc">Descrição</label>
            <input
              id="oauth-client-desc"
              className="form-input"
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="oauth-client-auth">Authorities</label>
            <input
              id="oauth-client-auth"
              className="form-input"
              value={createForm.authorities}
              onChange={(e) => setCreateForm((f) => ({ ...f, authorities: e.target.value }))}
              placeholder="knowledge:write, audit:read"
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
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar'}
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
        isOpen={!!deleteTarget}
        onClose={() => !submitting && setDeleteTarget(null)}
        title="Excluir OAuth client"
        subtitle={deleteTarget?.clientId}
      >
        <p style={{ color: '#5f6368', marginBottom: '1rem' }}>
          Esta ação remove o client de forma permanente. Tokens emitidos deixam de ser válidos após a exclusão.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={handleConfirmDelete} disabled={submitting}>
            {submitting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </Modal>
    </div>
  );
};
