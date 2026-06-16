import * as Haptics from 'expo-haptics';
import { getDatabase } from '../../db/database';

const SETTING_KEY = 'haptics_enabled';

// Module-level cache so PanResponder callbacks (which are synchronous and
// can't await) can read the toggle without hitting the database.
let _enabled = true;

export async function loadHapticSetting(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [SETTING_KEY]
  );
  // Default is ON; only off when explicitly saved as 'false'
  _enabled = row ? row.value !== 'false' : true;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  _enabled = enabled;
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [SETTING_KEY, String(enabled)]
  );
}

export function isHapticsEnabled(): boolean { return _enabled; }

// Helpers — fire-and-forget, safe to call from synchronous contexts
export function hapticLight():     void { if (_enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
export function hapticMedium():    void { if (_enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }
export function hapticHeavy():     void { if (_enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }
export function hapticSelection(): void { if (_enabled) Haptics.selectionAsync(); }
