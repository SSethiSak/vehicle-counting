import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { utils, write } from 'xlsx';
import { getDatabase } from '../../db/database';
import { Session, Count, PedestrianCount } from '../../types';

type ExportFormat = 'csv' | 'xlsx' | 'json';

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json',
};

const UTIS: Record<ExportFormat, string> = {
  csv: 'public.comma-separated-values-text',
  xlsx: 'com.microsoft.excel.xlsx',
  json: 'public.json',
};

// Module-level cache so we don't query the DB on every export.
let _downloadsDirUri: string | null | undefined = undefined;

async function getDownloadsDirUri(): Promise<string | null> {
  if (_downloadsDirUri !== undefined) return _downloadsDirUri;
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'downloads_dir_uri'",
  );
  _downloadsDirUri = row?.value ?? null;
  return _downloadsDirUri;
}

async function saveDownloadsDirUri(uri: string): Promise<void> {
  _downloadsDirUri = uri;
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('downloads_dir_uri', ?)",
    [uri],
  );
}

async function clearDownloadsDirUri(): Promise<void> {
  _downloadsDirUri = null;
  const db = await getDatabase();
  await db.runAsync("DELETE FROM app_settings WHERE key = 'downloads_dir_uri'");
}

// Attempt to save to user's chosen Downloads folder via Storage Access Framework.
// Returns true if the file was saved successfully.
async function saveToDownloads(
  content: string,
  filename: string,
  format: ExportFormat,
  encoding: typeof FileSystem.EncodingType[keyof typeof FileSystem.EncodingType],
): Promise<boolean> {
  const saf = (FileSystem as any).StorageAccessFramework;
  if (!saf) return false;

  const tryWrite = async (dirUri: string): Promise<boolean> => {
    const fileUri = await saf.createFileAsync(dirUri, filename, MIME_TYPES[format]);
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding });
    return true;
  };

  // Try with stored URI first (no picker needed).
  const stored = await getDownloadsDirUri();
  if (stored) {
    try {
      return await tryWrite(stored);
    } catch {
      // Stored URI may have been revoked — clear it and fall through to re-request.
      await clearDownloadsDirUri();
    }
  }

  // Ask the user to pick the Downloads folder.
  const result = await saf.requestDirectoryPermissionsAsync();
  if (!result.granted) return false;

  await saveDownloadsDirUri(result.directoryUri);
  try {
    return await tryWrite(result.directoryUri);
  } catch {
    return false;
  }
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildFilename(session: Session, format: ExportFormat): string {
  const dateStr = session.started_at.slice(0, 10).replace(/-/g, '');
  const timeStr = session.started_at.slice(11, 16).replace(':', '');
  const loc = slugify(session.location_name);
  return `fucount_${loc}_${dateStr}_${timeStr}.${format}`;
}

function buildCsv(session: Session, counts: Count[]): string {
  const header = 'session_id,location_name,intersection_type,time_period,lat,lng,session_started_at,from_direction,movement,to_direction,vehicle_type,timestamp';
  const rows = counts.map((c) =>
    [
      session.id, session.location_name, session.intersection_type,
      session.time_period, session.lat ?? '', session.lng ?? '',
      session.started_at,
      c.from_direction, c.movement, c.to_direction, c.vehicle_type, c.timestamp,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

function buildXlsx(
  session: Session,
  counts: Count[],
  pedestrianCounts?: PedestrianCount[],
): string {
  const rawRows = counts.map((c) => ({
    session_id: session.id, location_name: session.location_name,
    intersection_type: session.intersection_type, time_period: session.time_period,
    lat: session.lat, lng: session.lng, session_started_at: session.started_at,
    from_direction: c.from_direction, movement: c.movement, to_direction: c.to_direction,
    vehicle_type: c.vehicle_type, timestamp: c.timestamp,
  }));

  const summaryData: Record<string, number> = {};
  counts.forEach((c) => {
    const key = `${c.from_direction}→${c.to_direction} (${c.vehicle_type})`;
    summaryData[key] = (summaryData[key] ?? 0) + 1;
  });
  const summaryRows = Object.entries(summaryData).map(([movement, count]) => ({ movement, count }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(summaryRows), 'Vehicle Summary');
  utils.book_append_sheet(wb, utils.json_to_sheet(rawRows), 'Vehicle Raw');

  if (pedestrianCounts && pedestrianCounts.length > 0) {
    const pedRows = pedestrianCounts.map((p) => ({
      session_id: session.id,
      location_name: session.location_name,
      time_period: session.time_period,
      pedestrian_count: 1,
      crossing_direction: p.crossing_direction ?? '',
      timestamp: p.timestamp,
    }));
    utils.book_append_sheet(wb, utils.json_to_sheet(pedRows), 'Pedestrian Counts');
  }

  return write(wb, { type: 'base64', bookType: 'xlsx' });
}

export async function exportSession(
  session: Session,
  counts: Count[],
  format: ExportFormat,
  pedestrianCounts?: PedestrianCount[],
): Promise<void> {
  const filename = buildFilename(session, format);
  const path = `${FileSystem.documentDirectory}${filename}`;

  let content: string;
  let encoding: typeof FileSystem.EncodingType[keyof typeof FileSystem.EncodingType];

  if (format === 'csv') {
    content = buildCsv(session, counts);
    encoding = FileSystem.EncodingType.UTF8;
  } else if (format === 'json') {
    content = JSON.stringify({ session, counts }, null, 2);
    encoding = FileSystem.EncodingType.UTF8;
  } else {
    content = buildXlsx(session, counts, pedestrianCounts);
    encoding = FileSystem.EncodingType.Base64;
  }

  // Write to app documents directory (needed for share sheet).
  await FileSystem.writeAsStringAsync(path, content, { encoding });

  // Save to Downloads folder on Android (prompts folder picker on first use).
  let savedToDownloads = false;
  if (Platform.OS === 'android') {
    savedToDownloads = await saveToDownloads(content, filename, format, encoding);
  }

  // Open share sheet so user can also send/save elsewhere.
  await Sharing.shareAsync(path, { mimeType: MIME_TYPES[format], UTI: UTIS[format] });

  if (savedToDownloads) {
    Alert.alert('Saved to Downloads', `"${filename}" was saved to your Downloads folder.`);
  }
}

// ── PDF report ────────────────────────────────────────────────────────────────

export interface ReportStats {
  byVehicle:  Record<string, number>;
  byMovement: Record<string, number>;
  byApproach: Record<string, number>;
  duration:   string;
}

function barRows(
  data: Record<string, number>,
  color: string,
): string {
  const max = Math.max(...Object.values(data), 1);
  return Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => {
      const pct = Math.round((value / max) * 100);
      return `
        <div class="bar-row">
          <span class="bar-label">${label}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="bar-value">${value}</span>
        </div>`;
    })
    .join('');
}

function buildReportHtml(session: Session, stats: ReportStats): string {
  const { byVehicle, byMovement, byApproach, duration } = stats;
  const total = session.total_count;
  const topV  = Object.entries(byVehicle).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const topM  = Object.entries(byMovement).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const topM2 = topM.charAt(0).toUpperCase() + topM.slice(1);
  const period: Record<string, string> = { am_peak: 'AM Peak', pm_peak: 'PM Peak', off_peak: 'Off-Peak' };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
         background:#f2f2f7;color:#1c1c1e;padding:32px 24px;font-size:14px}
    h1{font-size:24px;font-weight:700;margin-bottom:4px}
    .sub{color:#636366;font-size:13px;margin-bottom:28px}
    .card{background:#fff;border-radius:16px;padding:20px;margin-bottom:20px}
    .card-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
                color:#636366;margin-bottom:16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .stat{background:#f2f2f7;border-radius:12px;padding:14px;text-align:center}
    .stat-val{font-size:26px;font-weight:700;color:#0a84ff}
    .stat-lbl{font-size:11px;color:#636366;margin-top:2px}
    .bar-row{display:flex;align-items:center;margin-bottom:10px;gap:10px}
    .bar-label{width:90px;font-size:13px;font-weight:500;flex-shrink:0}
    .bar-track{flex:1;background:#f2f2f7;border-radius:6px;height:22px;overflow:hidden}
    .bar-fill{height:100%;border-radius:6px;min-width:3px}
    .bar-value{width:36px;text-align:right;font-size:13px;font-weight:600;flex-shrink:0}
    .footer{text-align:center;font-size:11px;color:#aeaeb2;margin-top:24px}
  </style></head><body>
    <h1>${session.location_name}</h1>
    <p class="sub">${session.started_at.slice(0,10)} · ${session.intersection_type} · ${period[session.time_period] ?? session.time_period}</p>
    <div class="card">
      <div class="card-title">Summary</div>
      <div class="grid">
        <div class="stat"><div class="stat-val">${total}</div><div class="stat-lbl">Total Vehicles</div></div>
        <div class="stat"><div class="stat-val">${duration}</div><div class="stat-lbl">Duration</div></div>
        <div class="stat"><div class="stat-val">${topV}</div><div class="stat-lbl">Top Vehicle</div></div>
        <div class="stat"><div class="stat-val">${topM2}</div><div class="stat-lbl">Dominant Movement</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">By Vehicle Type</div>
      ${barRows(byVehicle, '#0a84ff')}
    </div>
    <div class="card">
      <div class="card-title">By Movement</div>
      ${barRows(byMovement, '#bf5af2')}
    </div>
    <div class="card">
      <div class="card-title">By Approach</div>
      ${barRows(byApproach, '#30d158')}
    </div>
    <p class="footer">Vehicle Counter · ${new Date().toLocaleString()}</p>
  </body></html>`;
}

export async function exportPdf(session: Session, stats: ReportStats): Promise<void> {
  const html     = buildReportHtml(session, stats);
  const { uri }  = await Print.printToFileAsync({ html });
  const dateStr  = session.started_at.slice(0, 10).replace(/-/g, '');
  const timeStr  = session.started_at.slice(11, 16).replace(':', '');
  const loc      = slugify(session.location_name);
  const filename = `fucount_${loc}_${dateStr}_${timeStr}.pdf`;
  const dest     = `${FileSystem.documentDirectory}${filename}`;

  await FileSystem.copyAsync({ from: uri, to: dest });

  let savedToDownloads = false;
  if (Platform.OS === 'android') {
    const saf = (FileSystem as any).StorageAccessFramework;
    if (saf) {
      const stored = await getDownloadsDirUri();
      const tryWrite = async (dirUri: string) => {
        const fileUri = await saf.createFileAsync(dirUri, filename, 'application/pdf');
        const b64 = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
        return true;
      };
      if (stored) {
        try { savedToDownloads = await tryWrite(stored); } catch { await clearDownloadsDirUri(); }
      }
      if (!savedToDownloads) {
        const result = await saf.requestDirectoryPermissionsAsync();
        if (result.granted) {
          await saveDownloadsDirUri(result.directoryUri);
          try { savedToDownloads = await tryWrite(result.directoryUri); } catch { /* ignore */ }
        }
      }
    }
  }

  await Sharing.shareAsync(dest, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  if (savedToDownloads) Alert.alert('Saved to Downloads', `"${filename}" was saved to your Downloads folder.`);
}

// ── Pedestrian CSV export ─────────────────────────────────────────────────────

export async function exportPedestrianCsv(
  session: Session,
  pedestrianCounts: PedestrianCount[],
): Promise<void> {
  const dateStr  = session.started_at.slice(0, 10).replace(/-/g, '');
  const timeStr  = session.started_at.slice(11, 16).replace(':', '');
  const loc      = slugify(session.location_name);
  const filename = `fucount_ped_${loc}_${dateStr}_${timeStr}.csv`;
  const path     = `${FileSystem.documentDirectory}${filename}`;

  const header = 'session_id,location_name,time_period,pedestrian_count,crossing_direction,timestamp';
  const rows   = pedestrianCounts.map((p) =>
    [session.id, session.location_name, session.time_period, 1, p.crossing_direction ?? '', p.timestamp].join(',')
  );
  const content = [header, ...rows].join('\n');

  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });

  let savedToDownloads = false;
  if (Platform.OS === 'android') {
    savedToDownloads = await saveToDownloads(content, filename, 'csv', FileSystem.EncodingType.UTF8);
  }

  await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  if (savedToDownloads) Alert.alert('Saved to Downloads', `"${filename}" was saved to your Downloads folder.`);
}

// ── Counts query ──────────────────────────────────────────────────────────────
export async function getSessionCounts(sessionId: string): Promise<Count[]> {
  const db = await getDatabase();
  return db.getAllAsync<Count>(
    `SELECT * FROM counts WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId],
  );
}
