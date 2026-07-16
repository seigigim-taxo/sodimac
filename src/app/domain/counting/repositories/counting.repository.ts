import { CountingSession } from '../models/counting-session.model';

export abstract class CountingRepository {
  abstract createSession(session: CountingSession): Promise<void>;
  abstract getSessions(): Promise<CountingSession[]>;
  abstract getSession(id: string): Promise<CountingSession | null>;
  abstract updateSession(session: CountingSession): Promise<void>;
  abstract deleteSession(id: string): Promise<void>;
  abstract markSynced(id: string): Promise<void>;
}

