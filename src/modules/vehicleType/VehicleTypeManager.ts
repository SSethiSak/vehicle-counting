import { getDatabase } from '../../db/database';

export async function getVehicleTypes(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    'SELECT name FROM vehicle_types ORDER BY sort_order, id',
  );
  return rows.map((r) => r.name);
}

export async function addVehicleType(name: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) AS max_order FROM vehicle_types',
  );
  const nextOrder = (row?.max_order ?? -1) + 1;
  await db.runAsync(
    'INSERT INTO vehicle_types (name, sort_order) VALUES (?, ?)',
    [name.trim(), nextOrder],
  );
}

export async function deleteVehicleType(name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM vehicle_types WHERE name = ?', [name]);
}
