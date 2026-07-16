import { Injectable, inject, signal } from '@angular/core';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { CreateCountingSessionUseCase } from '../../application/counting/create-counting-session.use-case';
import { SaveCountingSessionUseCase } from '../../application/counting/save-counting-session.use-case';
import { GetCountingSessionsUseCase } from '../../application/counting/get-counting-sessions.use-case';
import { FinalizeCountingSessionUseCase } from '../../application/counting/finalize-counting-session.use-case';
import { SyncCountingSessionUseCase } from '../../application/counting/sync-counting-session.use-case';
import { DeleteCountingSessionUseCase } from '../../application/counting/delete-counting-session.use-case';
import { GetCountingSessionUseCase } from '../../application/counting/get-counting-session.use-case';
import { ReopenCountingSessionUseCase } from '../../application/counting/reopen-counting-session.use-case';
import { UpdateCountingMetadataUseCase } from '../../application/counting/update-counting-metadata.use-case';
import { UpdateCountingItemsUseCase } from '../../application/counting/update-counting-items.use-case';

@Injectable({ providedIn: 'root' })
export class CountingFacade {
  private createSession = inject(CreateCountingSessionUseCase);
  private saveSession = inject(SaveCountingSessionUseCase);
  private getSessions = inject(GetCountingSessionsUseCase);
  private finalizeSession = inject(FinalizeCountingSessionUseCase);
  private syncSession = inject(SyncCountingSessionUseCase);
  private deleteSession = inject(DeleteCountingSessionUseCase);
  private getSession = inject(GetCountingSessionUseCase);
  private reopenSession = inject(ReopenCountingSessionUseCase);
  private updateMetadata = inject(UpdateCountingMetadataUseCase);
  private updateItemsUseCase = inject(UpdateCountingItemsUseCase);

  private _sessions = signal<CountingSession[]>([]);
  private _isLoading = signal(false);

  readonly sessions = this._sessions.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  async init(): Promise<void> {
    this._isLoading.set(true);
    try {
      const list = await this.getSessions.execute();
      this._sessions.set(list);
    } finally {
      this._isLoading.set(false);
    }
  }

  async createNewSession(tag: string, zone: string): Promise<CountingSession> {
    const session = await this.createSession.execute(tag, zone);
    await this.reload();
    return session;
  }

  async save(session: CountingSession): Promise<void> {
    await this.saveSession.execute(session);
    await this.reload();
  }

  async updateItems(session: CountingSession): Promise<CountingSession> {
    return await this.updateItemsUseCase.execute(session);
  }

  async finalize(session: CountingSession): Promise<void> {
    await this.finalizeSession.execute(session);
    await this.reload();
  }

  async sync(id: string): Promise<void> {
    await this.syncSession.execute(id);
    await this.reload();
  }

  async remove(id: string): Promise<void> {
    await this.deleteSession.execute(id);
    await this.reload();
  }

  async getById(id: string): Promise<CountingSession | null> {
    return this.getSession.execute(id);
  }

  async reopen(id: string): Promise<void> {
    await this.reopenSession.execute(id);
    await this.reload();
  }

  async updateSessionMetadata(id: string, tag: string, zone: string): Promise<void> {
    await this.updateMetadata.execute(id, tag, zone);
    await this.reload();
  }

  async reload(): Promise<void> {
    const list = await this.getSessions.execute();
    this._sessions.set(list);
  }
}
