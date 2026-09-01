import React, { useEffect, useState } from 'react';
import { Ban, LockOpen, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { Modal } from '../common/Modal';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { DeviceBlacklistEntry } from '../../types/auth';
import { canWriteTenantDevice } from '../../utils/roles';

function formatDate(isoDate?: string) {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function compactId(value?: string): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function toApiDate(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export const AdminDeviceBlacklistCard: React.FC = () => {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<DeviceBlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [filters, setFilters] = useState({ userId: '', deviceId: '', deviceName: '', ipAddress: '' });
  const [applied, setApplied] = useState(filters);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    deviceId: '',
    deviceName: '',
    reason: '',
    expiresAt: '',
  });

  const loadPage = async (nextPage = page, nextFilters = applied) => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const result = await authService.searchTenantDeviceBlacklist(
        {
          userId: nextFilters.userId || undefined,
          deviceId: nextFilters.deviceId || undefined,
          deviceName: nextFilters.deviceName || undefined,
          ipAddress: nextFilters.ipAddress || undefined,
          page: nextPage,
          size: 20,
        },
        token
      );
      setItems(result.content);
      setPage(result.page);
      setTotalPages(Math.max(result.totalPages, 1));
      setTotalElements(result.totalElements);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        addToast({
          type: 'error',
          title: 'Acesso restrito',
          description: 'Somente ADMIN, SYSTEM e MANAGER consultam a blacklist do tenant.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao consultar blacklist',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPage(0, applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    loadPage(0, filters);
  };

  const handleUnblock = async (entry: DeviceBlacklistEntry) => {
    if (!canWriteTenantDevice(entry.writable)) {
      addToast({
        type: 'error',
        title: 'Acesso restrito',
        description: 'MANAGER não pode alterar blacklist de ADMIN, SYSTEM ou outro MANAGER.',
      });
      return;
    }
    const userId = entry.codeUser;
    if (!userId || !entry.deviceId) {
      addToast({
        type: 'warning',
        title: 'Dados incompletos',
        description: 'Não foi possível identificar o usuário deste dispositivo.',
      });
      return;
    }
    const confirmed = window.confirm(
      `Desbloquear o dispositivo “${entry.deviceName || entry.deviceId}” do usuário ${userId}? A pessoa poderá entrar novamente neste aparelho.`
    );
    if (!confirmed) return;

    const key = `${userId}:${entry.deviceId}`;
    setRemovingKey(key);
    try {
      const token = getAccessToken();
      if (!token) return;
      await authService.adminRemoveDeviceFromBlacklist(entry.deviceId, userId, token);
      addToast({
        type: 'success',
        title: 'Dispositivo desbloqueado',
        description: 'A blacklist do tenant foi atualizada.',
      });
      loadPage(page, applied);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao desbloquear',
        description: err?.message || 'Não foi possível remover o bloqueio.',
      });
    } finally {
      setRemovingKey(null);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userId.trim() || !form.deviceId.trim()) {
      addToast({
        type: 'warning',
        title: 'Campos obrigatórios',
        description: 'Informe o usuário (UUID) e o identificador do dispositivo.',
      });
      return;
    }
    const confirmed = window.confirm(
      'A pessoa não entra mais neste aparelho até o desbloqueio. Confirmar o bloqueio administrativo?'
    );
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const token = getAccessToken();
      if (!token) return;
      await authService.adminAddDeviceToBlacklist(
        {
          userId: form.userId.trim(),
          deviceId: form.deviceId.trim(),
          deviceName: form.deviceName.trim() || undefined,
          reason: form.reason.trim() || undefined,
          expiresAt: toApiDate(form.expiresAt),
        },
        token
      );
      addToast({
        type: 'success',
        title: 'Dispositivo bloqueado',
        description: 'O bloqueio administrativo foi aplicado no tenant.',
      });
      setIsAddOpen(false);
      setForm({ userId: '', deviceId: '', deviceName: '', reason: '', expiresAt: '' });
      loadPage(0, applied);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao bloquear',
        description: err?.message || 'Não foi possível aplicar o bloqueio.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <form className="table-toolbar table-toolbar-stacked" onSubmit={handleSearch}>
        <div className="table-toolbar-row">
          <div className="search-input-wrapper" style={{ minWidth: 180, flex: 1 }}>
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Usuário (UUID)"
              value={filters.userId}
              onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
            />
          </div>
          <input
            className="form-input"
            style={{ maxWidth: 180 }}
            placeholder="Device ID"
            value={filters.deviceId}
            onChange={(e) => setFilters((f) => ({ ...f, deviceId: e.target.value }))}
          />
          <input
            className="form-input"
            style={{ maxWidth: 180 }}
            placeholder="Nome do dispositivo"
            value={filters.deviceName}
            onChange={(e) => setFilters((f) => ({ ...f, deviceName: e.target.value }))}
          />
          <input
            className="form-input"
            style={{ maxWidth: 140 }}
            placeholder="IP"
            value={filters.ipAddress}
            onChange={(e) => setFilters((f) => ({ ...f, ipAddress: e.target.value }))}
          />
        </div>
        <div className="table-toolbar-row">
          <button type="submit" className="btn btn-secondary btn-pill" disabled={loading}>
            <Search size={15} />
            <span>Filtrar</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-pill"
            onClick={() => loadPage(page, applied)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
          <button type="button" className="btn btn-primary btn-pill table-toolbar-push-end" onClick={() => setIsAddOpen(true)}>
            <Plus size={15} />
            <span>Bloquear dispositivo</span>
          </button>
        </div>
      </form>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Dispositivo</th>
              <th>IP</th>
              <th>Motivo</th>
              <th>Bloqueado por</th>
              <th>Quando</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando auditoria do tenant...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={22} />
                    <span>Nenhum dispositivo na blacklist do tenant para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((entry) => {
                const key = `${entry.codeUser}:${entry.deviceId}`;
                return (
                  <tr key={key}>
                    <td>
                      <span className="id-compact" title={entry.codeUser || undefined}>
                        {compactId(entry.codeUser)}
                      </span>
                    </td>
                    <td>
                      <div className="table-cell-title" title={entry.deviceId}>
                        <Ban size={14} />
                        <span>{entry.deviceName || 'Dispositivo'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="id-compact">{entry.ipAddress || '—'}</span>
                    </td>
                    <td>
                      <span className="table-reason" title={entry.reason || undefined}>
                        {entry.reason || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="id-compact" title={entry.blockedBy || undefined}>
                        {compactId(entry.blockedBy)}
                      </span>
                    </td>
                    <td>
                      {formatDate(entry.blockedAt)}
                      {entry.expiresAt ? (
                        <div className="table-cell-muted">Expira {formatDate(entry.expiresAt)}</div>
                      ) : null}
                    </td>
                    <td>
                      <div className="table-actions-group" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-table-icon"
                          title={entry.writable === false ? 'Sem permissão para desbloquear este alvo' : 'Desbloquear dispositivo'}
                          aria-label="Desbloquear dispositivo"
                          onClick={() => handleUnblock(entry)}
                          disabled={removingKey === key || !canWriteTenantDevice(entry.writable)}
                        >
                          <LockOpen size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {items.map((entry) => (
          <div key={`${entry.codeUser}:${entry.deviceId}`} className="mobile-domain-card">
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{entry.deviceName || entry.deviceId}</span>
            </div>
            <div className="mobile-card-subinfo">{entry.codeUser}</div>
            <div className="mobile-card-meta">{entry.reason || 'Sem motivo informado'}</div>
            <div className="mobile-card-actions table-actions-group">
              <button
                type="button"
                className="btn-table-icon"
                title={entry.writable === false ? 'Sem permissão para desbloquear este alvo' : 'Desbloquear dispositivo'}
                aria-label="Desbloquear dispositivo"
                onClick={() => handleUnblock(entry)}
                disabled={!canWriteTenantDevice(entry.writable)}
              >
                <LockOpen size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#5f6368' }}>
          {totalElements} registro{totalElements === 1 ? '' : 's'} · página {page + 1} de {totalPages}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-outline btn-pill"
            disabled={loading || page <= 0}
            onClick={() => loadPage(page - 1, applied)}
          >
            Anterior
          </button>
          <button
            className="btn btn-outline btn-pill"
            disabled={loading || page >= totalPages - 1}
            onClick={() => loadPage(page + 1, applied)}
          >
            Próxima
          </button>
        </div>
      </div>

      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Bloquear dispositivo no tenant"
        subtitle="A pessoa não entra mais neste aparelho até o desbloqueio."
        maxWidth="520px"
      >
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <label className="form-label">
            Usuário (UUID)
            <input
              className="form-input"
              required
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="codeUser do titular"
            />
          </label>
          <label className="form-label">
            Device ID
            <input
              className="form-input"
              required
              value={form.deviceId}
              onChange={(e) => setForm((f) => ({ ...f, deviceId: e.target.value }))}
              placeholder="Identificador do aparelho"
            />
          </label>
          <label className="form-label">
            Nome do dispositivo
            <input
              className="form-input"
              value={form.deviceName}
              onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))}
              placeholder="Opcional"
            />
          </label>
          <label className="form-label">
            Motivo
            <input
              className="form-input"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Ex.: aparelho perdido / suspeita de fraude"
            />
          </label>
          <label className="form-label">
            Expira em (opcional)
            <input
              className="form-input"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsAddOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger" disabled={isSaving}>
              {isSaving ? 'Bloqueando...' : 'Confirmar bloqueio'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
