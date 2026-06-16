import { getDatabase } from '../../db/database';
import { Session, CreateSessionInput } from '../../types';
import { localTimestamp } from '../../utils/time';

function generateSessionId(): string {
  const now = new Date();
  const ts  = localTimestamp().replace(/[-: ]/g, '').slice(0, 14);
  const ms  = now.getMilliseconds().toString().padStart(3, '0');
  return `sess_${ts}_${ms}`;
}

function deserializeSession(row: Record<string, unknown>): Session {
  let custom_legs: string[] | null = null;
  if (row.custom_legs != null) {
    try {
      custom_legs = JSON.parse(row.custom_legs as string);
    } catch {
      throw new Error(
        `Session "${row.id}": custom_legs contains invalid JSON: ${row.custom_legs}`
      );
    }
  }
  return {
    id:                row.id as string,
    location_name:     row.location_name as string,
    intersection_type: row.intersection_type as Session['intersection_type'],
    time_period:       row.time_period as Session['time_period'],
    lat:               row.lat as number | null,
    lng:               row.lng as number | null,
    started_at:        row.started_at as string,
    ended_at:          row.ended_at as string | null,
    total_count:       Number(row.total_count),
    custom_legs,
    color_tag:         (row.color_tag as string | null) ?? null,
  };
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const db = await getDatabase();
  const session: Session = {
    id: generateSessionId(),
    location_name: input.location_name,
    intersection_type: input.intersection_type,
    time_period: input.time_period,
    lat: input.lat,
    lng: input.lng,
    custom_legs: input.custom_legs ?? null,
    started_at: localTimestamp(),
    ended_at: null,
    total_count: 0,
    color_tag: null,
  };
  await db.runAsync(
    `INSERT INTO sessions
      (id, location_name, intersection_type, time_period, lat, lng, custom_legs, started_at, ended_at, total_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id, session.location_name, session.intersection_type,
      session.time_period, session.lat, session.lng,
      session.custom_legs ? JSON.stringify(session.custom_legs) : null,
      session.started_at, session.ended_at, session.total_count,
    ]
  );
  return session;
}

export async function endSession(sessionId: string): Promise<Session> {
  const db = await getDatabase();
  const ended_at = localTimestamp();
  const result = await db.runAsync(
    `UPDATE sessions SET ended_at = ? WHERE id = ?`,
    [ended_at, sessionId]
  );
  if (result.changes === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  // getSession will now return the ended session
  return getSession(sessionId);
}

export async function getSession(sessionId: string): Promise<Session> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM sessions WHERE id = ?`, [sessionId]
  );
  if (!row) throw new Error(`Session not found: ${sessionId}`);
  return deserializeSession(row);
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM sessions ORDER BY started_at DESC`
  );
  return rows.map(deserializeSession);
}

export async function incrementSessionCount(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET total_count = total_count + 1 WHERE id = ?`,
    [sessionId]
  );
}

export async function decrementSessionCount(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET total_count = MAX(0, total_count - 1) WHERE id = ?`,
    [sessionId]
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM counts WHERE session_id = ?`, [sessionId]);
  await db.runAsync(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}

export async function updateSessionColorTag(
  sessionId: string,
  colorTag: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET color_tag = ? WHERE id = ?`,
    [colorTag, sessionId],
  );
}

export async function renameSession(sessionId: string, newName: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET location_name = ? WHERE id = ?`,
    [newName.trim(), sessionId],
  );
}
