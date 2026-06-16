import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('fucount.db');
    await _initSchema(_db);
  }
  return _db;
}

// Call this in tests to force a fresh db instance
export function _resetDbInstance(): void {
  _db = null;
}

async function _initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sessions (
      id             TEXT PRIMARY KEY,
      location_name  TEXT NOT NULL,
      intersection_type TEXT NOT NULL,
      time_period    TEXT NOT NULL,
      lat            REAL,
      lng            REAL,
      custom_legs    TEXT,
      started_at     TEXT NOT NULL,
      ended_at       TEXT,
      total_count    INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS counts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     TEXT NOT NULL REFERENCES sessions(id),
      from_direction TEXT NOT NULL,
      movement       TEXT NOT NULL,
      to_direction   TEXT NOT NULL,
      vehicle_type   TEXT NOT NULL,
      timestamp      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_types (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO vehicle_types (name, sort_order) VALUES
      ('Moto', 0), ('Car', 1), ('Rickshaw', 2), ('Other', 3);

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Migration: add color_tag column to existing installs
  try {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN color_tag TEXT;`);
  } catch { /* already exists */ }

  // Pedestrian counts table (new installs get it via CREATE IF NOT EXISTS above;
  // existing installs need this separate statement)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pedestrian_counts (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id         TEXT NOT NULL REFERENCES sessions(id),
      crossing_direction TEXT,
      timestamp          TEXT NOT NULL
    );
  `);
}
