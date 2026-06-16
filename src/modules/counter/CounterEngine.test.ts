import { __mockDb, __resetMocks } from '../../../__mocks__/expo-sqlite';

jest.mock('../../db/database', () => ({
  getDatabase: jest.fn().mockResolvedValue(require('../../../__mocks__/expo-sqlite').__mockDb),
}));
jest.mock('../session/SessionManager', () => ({
  incrementSessionCount: jest.fn().mockResolvedValue(undefined),
  decrementSessionCount: jest.fn().mockResolvedValue(undefined),
}));

import { CounterEngine } from './CounterEngine';
import { Session } from '../../types';

const mockSession: Session = {
  id: 'sess_test', location_name: 'X', intersection_type: '4way',
  time_period: 'am_peak', lat: null, lng: null, custom_legs: null,
  started_at: '2026-04-15T08:00:00Z', ended_at: null, total_count: 0, color_tag: null,
};

beforeEach(() => {
  __resetMocks();
  __mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 42, changes: 1 });
});

describe('record', () => {
  test('inserts a count with computed to_direction and returns the Count', async () => {
    const engine = new CounterEngine(mockSession);
    const count = await engine.record({ from_direction: 'N', movement: 'right', vehicle_type: 'moto' });
    expect(count.to_direction).toBe('E');
    expect(count.from_direction).toBe('N');
    expect(count.vehicle_type).toBe('moto');
    expect(count.id).toBe(42);
    expect(__mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  test('uses custom legs when session is roundabout type', async () => {
    const roundaboutSession: Session = {
      ...mockSession,
      intersection_type: 'roundabout',
      custom_legs: ['North Gate', 'East Gate', 'South Gate', 'West Gate'],
    };
    const engine = new CounterEngine(roundaboutSession);
    const count = await engine.record({ from_direction: 'North Gate', movement: 'right', vehicle_type: 'car' });
    expect(count.to_direction).toBe('East Gate');
  });
});

describe('undo', () => {
  test('deletes last inserted count and returns true when a count existed', async () => {
    const engine = new CounterEngine(mockSession);
    await engine.record({ from_direction: 'N', movement: 'straight', vehicle_type: 'car' });
    __mockDb.runAsync.mockResolvedValueOnce({ changes: 1 });
    const undone = await engine.undo();
    expect(undone).toBe(true);
  });

  test('returns false when there is nothing to undo', async () => {
    const engine = new CounterEngine(mockSession);
    __mockDb.runAsync.mockResolvedValueOnce({ changes: 0 });
    const undone = await engine.undo();
    expect(undone).toBe(false);
  });
});
