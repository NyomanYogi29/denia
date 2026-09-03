import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { config } from '@/config';
import * as schema from './schema.ts'

// Inisialisasi koneksi native SQLite via bun:sqlite
const sqlite = new Database(config.db.fileName);

// Optimasi performa dan konkurensi dengan WAL (Write-Ahead Logging)
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

// Inisialisasi instance Drizzle ORM dengan relational query API
export const db = drizzle({ client: sqlite });
export { sqlite };

// Re-export seluruh tabel, tipe, dan relasi
export * from './schema.ts';
