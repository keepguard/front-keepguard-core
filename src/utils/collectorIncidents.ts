import type { CSSProperties } from 'react';

export function formatIncidentDate(isoDate?: string) {
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

export function incidentClassificationLabel(classification?: string): string {
  switch ((classification || '').toLowerCase()) {
    case 'source_changed':
      return 'Fonte mudou';
    case 'auth':
      return 'Auth';
    case 'rate_limited':
      return 'Rate limit';
    case 'transient_exhausted':
      return 'Transiente';
    case 'not_found':
      return 'Não encontrado';
    default:
      return classification ? classification : 'Incidente';
  }
}

export function incidentStatusLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'open':
      return 'Aberto';
    case 'acknowledged':
      return 'Reconhecido';
    case 'resolved':
      return 'Resolvido';
    default:
      return status || '—';
  }
}

export function incidentStatusStyle(status?: string): CSSProperties {
  switch ((status || '').toLowerCase()) {
    case 'open':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    case 'acknowledged':
      return { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' };
    case 'resolved':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    default:
      return {};
  }
}
