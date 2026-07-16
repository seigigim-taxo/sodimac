import { Injectable, inject } from '@angular/core';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { validateStatus } from '../../domain/counting/utils/status.utils';

const TABLE_NAME = 'counting_sessions';

@Injectable({ providedIn: 'root' })
export class CountingStorageService implements CountingRepository {
  private sqliteConnection = inject(SqliteConnectionService);

  private async getDb(): Promise<SQLiteDBConnection> {
    await this.sqliteConnection.connect();
    return this.sqliteConnection.getDb();
  }

  private toSqliteBool(value: boolean): number {
    return value ? 1 : 0;
  }

  private fromSqliteBool(value: number): boolean {
    return value === 1;
  }

  async createSession(session: CountingSession): Promise<void> {
    const db = await this.getDb();
    const sql = `INSERT INTO ${TABLE_NAME} (id, tag, zone, status, synced, edited, created_at, updated_at, items, total_items, total_quantity)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
    await db.run(sql, [
      session.id,
      session.tag,
      session.zone,
      session.status,
      this.toSqliteBool(session.synced),
      this.toSqliteBool(session.edited),
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.items),
      session.totalItems,
      session.totalQuantity,
    ]);
  }

  async getSessions(): Promise<CountingSession[]> {
    const db = await this.getDb();
    const result = await db.query(
      `SELECT * FROM ${TABLE_NAME} ORDER BY updated_at DESC;`
    );
    return this.mapRowsToSessions(result.values ?? []);
  }

  async getSession(id: string): Promise<CountingSession | null> {
    const db = await this.getDb();
    const result = await db.query(
      `SELECT * FROM ${TABLE_NAME} WHERE id = ?;`,
      [id]
    );
    const rows = result.values ?? [];
    if (!rows || rows.length === 0) return null;
    return this.mapRowToSession(rows[0]);
  }

  async updateSession(session: CountingSession): Promise<void> {
    const db = await this.getDb();
    const sql = `UPDATE ${TABLE_NAME}
                 SET tag=?, zone=?, status=?, synced=?, edited=?, updated_at=?, items=?, total_items=?, total_quantity=?
                 WHERE id=?;`;
    await db.run(sql, [
      session.tag,
      session.zone,
      session.status,
      this.toSqliteBool(session.synced),
      this.toSqliteBool(session.edited),
      session.updatedAt,
      JSON.stringify(session.items),
      session.totalItems,
      session.totalQuantity,
      session.id,
    ]);
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.getDb();
    await db.run(`DELETE FROM ${TABLE_NAME} WHERE id = ?;`, [id]);
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.getDb();
    await db.run(
      `UPDATE ${TABLE_NAME} SET synced=1, edited=0, updated_at=? WHERE id=?;`,
      [new Date().toISOString(), id]
    );
  }

  private mapRowsToSessions(rows: any[]): CountingSession[] {
    if (!rows) return [];
    return rows.map((row) => this.mapRowToSession(row));
  }

  private mapRowToSession(row: any): CountingSession {
    let items: any[] = [];
    try {
      items = JSON.parse(row.items || '[]');
    } catch {
      console.warn('[CountingStorage] Failed to parse items JSON:', row.items);
    }

    return {
      id: row.id,
      tag: row.tag,
      zone: row.zone,
      status: validateStatus(row.status),
      synced: this.fromSqliteBool(row.synced),
      edited: this.fromSqliteBool(row.edited),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
      totalItems: row.total_items || 0,
      totalQuantity: row.total_quantity || 0,
    };
  }
}
