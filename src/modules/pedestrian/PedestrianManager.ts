import { getDatabase } from '../../db/database';
import { PedestrianCount, CrossingDirection } from '../../types';
import { localTimestamp } from '../../utils/time';

export async function addPedestrianCount(
  sessionId: string,
  crossingDirection: CrossingDirection | null,
): Promise<PedestrianCount> {
  const db = await getDatabase();
  const timestamp = localTimestamp();
  const result = await db.runAsync(
    `INSERT INTO pedestrian_counts (session_id, crossing_direction, timestamp)
     VALUES (?, ?, ?)`,
    [sessionId, crossingDirection, timestamp],
  );
  return {
    id: result.lastInsertRowId,
    session_id: sessionId,
    crossing_direction: crossingDirection,
    timestamp,
  };
}

export async function undoLastPedestrianCount(sessionId: string): Promise<boolean> {
  const db = await getDatabase();
  const last = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM pedestrian_counts WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
    [sessionId],
  );
  if (!last) return false;
  const result = await db.runAsync(
    `DELETE FROM pedestrian_counts WHERE id = ?`, [last.id],
  );
  return result.changes > 0;
}

export async function getSessionPedestrianCounts(sessionId: string): Promise<PedestrianCount[]> {
  const db = await getDatabase();
  return db.getAllAsync<PedestrianCount>(
    `SELECT * FROM pedestrian_counts WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId],
  );
}

export async function countSessionPedestrians(sessionId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM pedestrian_counts WHERE session_id = ?`,
    [sessionId],
  );
  return row?.cnt ?? 0;
}
