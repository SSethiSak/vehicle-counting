import { getDatabase } from '../../db/database';

export interface GestureSlot {
  vehicleTypes: string[];
}

export interface GestureConfig {
  slot1: GestureSlot;
  slot2: GestureSlot;
  slot3: GestureSlot;
  enhancedEnabled: boolean;
}

const SETTING_KEY = 'gesture_config';

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  slot1: { vehicleTypes: ['Moto'] },
  slot2: { vehicleTypes: ['Car'] },
  slot3: { vehicleTypes: ['Rickshaw'] },
  enhancedEnabled: false,
};

export async function getGestureConfig(): Promise<GestureConfig> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [SETTING_KEY]
  );
  if (!row) return { ...DEFAULT_GESTURE_CONFIG };
  try {
    return { ...DEFAULT_GESTURE_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_GESTURE_CONFIG };
  }
}

export async function saveGestureConfig(config: GestureConfig): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [SETTING_KEY, JSON.stringify(config)]
  );
}
