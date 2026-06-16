jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing');
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportSession } from './ExportEngine';
import { Session, Count } from '../../types';

const session: Session = {
  id: 'sess_20260415_0830_000',
  location_name: 'Jl. Sudirman',
  intersection_type: '4way',
  time_period: 'am_peak',
  lat: -6.2088,
  lng: 106.8456,
  custom_legs: null,
  started_at: '2026-04-15T08:30:00Z',
  ended_at: '2026-04-15T09:00:00Z',
  total_count: 2,
  color_tag: null,
};

const counts: Count[] = [
  { id: 1, session_id: session.id, from_direction: 'N', movement: 'straight', to_direction: 'S', vehicle_type: 'moto', timestamp: '2026-04-15T08:31:00Z' },
  { id: 2, session_id: session.id, from_direction: 'S', movement: 'left', to_direction: 'E', vehicle_type: 'car', timestamp: '2026-04-15T08:31:05Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
});

test('CSV export writes a file with correct headers and 2 data rows', async () => {
  await exportSession(session, counts, 'csv');
  const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
  const csv: string = written[1];
  expect(csv).toContain('session_id,location_name');
  expect(csv.split('\n').filter(Boolean)).toHaveLength(3); // header + 2 rows
});

test('JSON export writes valid JSON with session and counts', async () => {
  await exportSession(session, counts, 'json');
  const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
  const parsed = JSON.parse(written[1]);
  expect(parsed.session.id).toBe(session.id);
  expect(parsed.counts).toHaveLength(2);
});

test('export filename follows convention', async () => {
  await exportSession(session, counts, 'csv');
  const filePath: string = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][0];
  expect(filePath).toMatch(/fucount_jl-sudirman_20260415_0830\.csv$/);
});

test('triggers share sheet after writing file', async () => {
  await exportSession(session, counts, 'csv');
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
