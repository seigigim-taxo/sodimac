import { Component, computed, signal, output, Input } from '@angular/core';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, trashOutline } from 'ionicons/icons';
import { CountingSession } from '../../../domain/counting/models/counting-session.model';
import { getStatusBadgeClass, getStatusLabel, formatDate } from '../../../shared/utils/counting-status.utils';

@Component({
  selector: 'app-counts-list',
  templateUrl: './counts-list.component.html',
  imports: [
    IonButton,
    IonIcon,
    IonSpinner,
  ],
})
export class CountsListComponent {
  readonly sessionOpen = output<CountingSession>();
  readonly sessionSync = output<CountingSession>();
  readonly sessionDelete = output<CountingSession>();

  @Input() sessions: CountingSession[] = [];
  @Input() isLoading = false;
  @Input() showSummary = true;
  @Input() showActions = true;

  syncingId = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  inProgress = computed(() => this.sessions.filter((s) => s.status === 'in-progress'));
  finalized = computed(() => this.sessions.filter((s) => s.status === 'finalized'));

  pendingCount = computed(() =>
    this.sessions.filter((s) => !s.synced && s.status === 'finalized').length
  );
  syncedCount = computed(() =>
    this.sessions.filter((s) => s.synced).length
  );

  getStatusBadgeClass = getStatusBadgeClass;
  getStatusLabel = getStatusLabel;
  formatDate = formatDate;

  constructor() {
    addIcons({ cloudUploadOutline, trashOutline });
  }

  onSync(session: CountingSession): void {
    this.syncingId.set(session.id);
    this.sessionSync.emit(session);
  }

  onDelete(session: CountingSession): void {
    this.deletingId.set(session.id);
    this.sessionDelete.emit(session);
  }

  clearSyncing(id: string): void {
    if (this.syncingId() === id) this.syncingId.set(null);
  }

  clearDeleting(id: string): void {
    if (this.deletingId() === id) this.deletingId.set(null);
  }
}
