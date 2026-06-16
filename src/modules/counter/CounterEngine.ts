import { getDatabase } from '../../db/database';
import { incrementSessionCount, decrementSessionCount } from '../session/SessionManager';
import { computeToDirection } from '../direction/DirectionCalculator';
import { Session, Count, RecordCountInput } from '../../types';
import { localTimestamp } from '../../utils/time';

export class CounterEngine {
  private session: Session;
  private lastCountId: number | null = null;

  constructor(session: Session) {
    this.session = session;
  }

  async record(input: RecordCountInput): Promise<Count> {
    const to_direction = computeToDirection(
      input.from_direction,
      input.movement,
      this.session.custom_legs ?? undefined
    );
    const timestamp = localTimestamp();
    const db = await getDatabase();
    const result = await db.runAsync(
      `INSERT INTO counts (session_id, from_direction, movement, to_direction, vehicle_type, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this.session.id, input.from_direction, input.movement, to_direction, input.vehicle_type, timestamp]
    );
    this.lastCountId = result.lastInsertRowId;
    await incrementSessionCount(this.session.id);
    return {
      id: result.lastInsertRowId,
      session_id: this.session.id,
      from_direction: input.from_direction,
      movement: input.movement,
      to_direction,
      vehicle_type: input.vehicle_type,
      timestamp,
    };
  }

  async undo(): Promise<boolean> {
    if (this.lastCountId === null) return false;
    const db = await getDatabase();
    const result = await db.runAsync(
      `DELETE FROM counts WHERE id = ?`,
      [this.lastCountId]
    );
    if (result.changes > 0) {
      this.lastCountId = null;
      await decrementSessionCount(this.session.id);
      return true;
    }
    return false;
  }
}
