import { TestBed } from '@angular/core/testing';
import { CountingStorageService } from './counting-storage.service';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { CountingSession } from '../../domain/counting/models/counting-session.model';

const mockDb = {
  execute: jasmine.createSpy('execute').and.returnValue(Promise.resolve({ changes: { changes: [] } })),
  query: jasmine.createSpy('query').and.returnValue(Promise.resolve({ values: [] })),
  run: jasmine.createSpy('run').and.returnValue(Promise.resolve({ changes: { changes: 1 } })),
};

const mockSqliteConnection = {
  connect: jasmine.createSpy('connect').and.returnValue(Promise.resolve()),
  getDb: jasmine.createSpy('getDb').and.returnValue(mockDb),
};

function createMockSession(overrides: Partial<CountingSession> = {}): CountingSession {
  return {
    id: 'session-1',
    tag: 'TAG001',
    zone: 'Zona 1',
    status: 'in-progress',
    synced: false,
    edited: false,
    createdAt: '2026-07-15T10:00:00.000Z',
    updatedAt: '2026-07-15T10:00:00.000Z',
    items: [],
    totalItems: 0,
    totalQuantity: 0,
    ...overrides,
  };
}

describe('CountingStorageService', () => {
  let service: CountingStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SqliteConnectionService, useValue: mockSqliteConnection },
      ],
    });

    service = TestBed.inject(CountingStorageService);

    mockDb.execute.calls.reset();
    mockDb.query.calls.reset();
    mockDb.run.calls.reset();
    mockSqliteConnection.connect.calls.reset();
    mockSqliteConnection.getDb.calls.reset();
    mockSqliteConnection.getDb.and.returnValue(mockDb);
  });

  describe('createSession', () => {
    it('should insert session into database', async () => {
      const session = createMockSession();
      await service.createSession(session);
      expect(mockSqliteConnection.connect).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalledWith(
        jasmine.stringContaining('INSERT INTO counting_sessions'),
        jasmine.arrayContaining([session.id, session.tag, session.zone])
      );
    });
  });

  describe('getSessions', () => {
    it('should return empty array when no sessions', async () => {
      mockDb.query.and.returnValue(Promise.resolve({ values: [] }));
      const result = await service.getSessions();
      expect(result).toEqual([]);
    });

    it('should return mapped sessions', async () => {
      const row = {
        id: 'session-1',
        tag: 'TAG001',
        zone: 'Zona 1',
        status: 'finalized',
        synced: 1,
        edited: 0,
        created_at: '2026-07-15T10:00:00.000Z',
        updated_at: '2026-07-15T11:00:00.000Z',
        items: '[]',
        total_items: 5,
        total_quantity: 10,
      };
      mockDb.query.and.returnValue(Promise.resolve({ values: [row] }));
      const result = await service.getSessions();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('session-1');
      expect(result[0].synced).toBe(true);
      expect(result[0].status).toBe('finalized');
    });
  });

  describe('getSession', () => {
    it('should return session by id', async () => {
      const row = {
        id: 'session-1',
        tag: 'TAG001',
        zone: 'Zona 1',
        status: 'in-progress',
        synced: 0,
        edited: 0,
        created_at: '2026-07-15T10:00:00.000Z',
        updated_at: '2026-07-15T10:00:00.000Z',
        items: '[]',
        total_items: 0,
        total_quantity: 0,
      };
      mockDb.query.and.returnValue(Promise.resolve({ values: [row] }));
      const result = await service.getSession('session-1');
      expect(result).toBeTruthy();
      expect(result!.id).toBe('session-1');
    });

    it('should return null when not found', async () => {
      mockDb.query.and.returnValue(Promise.resolve({ values: [] }));
      const result = await service.getSession('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session in database', async () => {
      const session = createMockSession({ tag: 'NEWTAG' });
      await service.updateSession(session);
      expect(mockDb.run).toHaveBeenCalledWith(
        jasmine.stringContaining('UPDATE counting_sessions'),
        jasmine.arrayContaining(['NEWTAG', session.id])
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete session from database', async () => {
      await service.deleteSession('session-1');
      expect(mockDb.run).toHaveBeenCalledWith(
        jasmine.stringContaining('DELETE FROM counting_sessions'),
        ['session-1']
      );
    });
  });

  describe('markSynced', () => {
    it('should mark session as synced', async () => {
      await service.markSynced('session-1');
      expect(mockDb.run).toHaveBeenCalledWith(
        jasmine.stringContaining('UPDATE counting_sessions SET synced=1'),
        jasmine.arrayContaining(['session-1'])
      );
    });
  });
});
