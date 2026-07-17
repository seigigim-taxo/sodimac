import { SqliteConnectionService } from './sqlite-connection.service';
import { MigrationRegistry } from './migrations/migration-registry.service';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';

function createMockDb(): SQLiteDBConnection {
  return {
    isDBOpen: jasmine.createSpy('isDBOpen').and.returnValue({ result: true }),
    open: jasmine.createSpy('open').and.returnValue(Promise.resolve()),
    execute: jasmine.createSpy('execute').and.returnValue(Promise.resolve({ changes: { changes: [] } })),
    query: jasmine.createSpy('query').and.returnValue(Promise.resolve({ values: [] })),
    run: jasmine.createSpy('run').and.returnValue(Promise.resolve({ changes: { changes: [] } })),
    close: jasmine.createSpy('close').and.returnValue(Promise.resolve()),
  } as unknown as SQLiteDBConnection;
}

function createMockSqlite(mockDb: SQLiteDBConnection) {
  return {
    checkConnectionsConsistency: jasmine.createSpy('checkConnectionsConsistency').and.returnValue(Promise.resolve()),
    isConnection: jasmine.createSpy('isConnection').and.returnValue({ result: false }),
    retrieveConnection: jasmine.createSpy('retrieveConnection').and.returnValue(Promise.resolve(mockDb)),
    createConnection: jasmine.createSpy('createConnection').and.returnValue(Promise.resolve(mockDb)),
    closeConnection: jasmine.createSpy('closeConnection').and.returnValue(Promise.resolve()),
    getDatabaseList: jasmine.createSpy('getDatabaseList').and.returnValue(Promise.resolve({ values: [] })),
    addUpgradeStatement: jasmine.createSpy('addUpgradeStatement').and.returnValue(Promise.resolve()),
  };
}

describe('SqliteConnectionService', () => {
  let service: SqliteConnectionService;
  let mockDb: SQLiteDBConnection;
  let mockSqliteConnection: ReturnType<typeof createMockSqlite>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockSqliteConnection = createMockSqlite(mockDb);

    const mockMigrationRegistry = {
      getMigrations: jasmine.createSpy('getMigrations').and.returnValue([]),
      getLatestVersion: jasmine.createSpy('getLatestVersion').and.returnValue(1),
    } as unknown as MigrationRegistry;

    service = new SqliteConnectionService(mockMigrationRegistry);
    (service as any).sqlite = mockSqliteConnection;
    (service as any).initialized = false;
    (service as any).db = null;
  });

  afterEach(async () => {
    try {
      await service.close();
    } catch {}
  });

  describe('connect', () => {
    it('should create connection when not already connected', async () => {
      await service.connect();
      expect(mockSqliteConnection.checkConnectionsConsistency).toHaveBeenCalled();
      expect(mockSqliteConnection.isConnection).toHaveBeenCalledWith('sodimac_app', false);
      expect(mockSqliteConnection.createConnection).toHaveBeenCalledWith('sodimac_app', false, 'no-encryption', 1, false);
    });

    it('should retrieve existing connection if already exists', async () => {
      (mockSqliteConnection.isConnection as jasmine.Spy).and.returnValue({ result: true });
      await service.connect();
      expect(mockSqliteConnection.retrieveConnection).toHaveBeenCalledWith('sodimac_app', false);
      expect(mockSqliteConnection.createConnection).not.toHaveBeenCalled();
    });

    it('should open database if not open', async () => {
      (mockDb.isDBOpen as jasmine.Spy).and.returnValue({ result: false });
      await service.connect();
      expect(mockDb.open).toHaveBeenCalled();
    });

    it('should not re-connect if already initialized', async () => {
      await service.connect();
      const callCount = mockSqliteConnection.createConnection.calls.count();
      await service.connect();
      expect(mockSqliteConnection.createConnection.calls.count()).toBe(callCount);
    });

    it('should throw and reset initialized flag on error', async () => {
      (mockSqliteConnection.checkConnectionsConsistency as jasmine.Spy).and.returnValue(Promise.reject(new Error('DB error')));
      await expectAsync(service.connect()).toBeRejected();
      expect((service as any).initialized).toBe(false);
    });
  });

  describe('getDb', () => {
    it('should return the database connection when initialized', async () => {
      await service.connect();
      const db = service.getDb();
      expect(db).toBe(mockDb);
    });

    it('should throw error when not initialized', () => {
      expect(() => service.getDb()).toThrowError('SqliteConnectionService not initialized. Call connect() first.');
    });
  });

  describe('close', () => {
    it('should close connection and reset state', async () => {
      await service.connect();
      await service.close();
      expect(mockSqliteConnection.closeConnection).toHaveBeenCalledWith('sodimac_app', false);
      expect((service as any).db).toBeNull();
      expect((service as any).initialized).toBe(false);
    });

    it('should do nothing if not initialized', async () => {
      const initialCallCount = mockSqliteConnection.closeConnection.calls.count();
      await service.close();
      expect(mockSqliteConnection.closeConnection.calls.count()).toBe(initialCallCount);
    });
  });
});
