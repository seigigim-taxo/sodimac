import { CountingSession } from '../../domain/counting/models/counting-session.model';

export function getStatusBadgeClass(session: CountingSession): string {
  if (session.status === 'in-progress') return 'badge-in-progress';
  if (session.synced) return 'badge-synced';
  if (session.edited) return 'badge-edited';
  return 'badge-pending';
}

export function getStatusLabel(session: CountingSession): string {
  if (session.status === 'in-progress') return 'En curso';
  if (session.synced) return 'Sincronizado';
  if (session.edited) return 'Editado';
  return 'Pendiente de sincronización';
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
