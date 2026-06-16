import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSession } from '../modules/session/SessionManager';
import { getSessionCounts, exportSession, exportPdf, exportPedestrianCsv, ReportStats } from '../modules/export/ExportEngine';
import { getSessionPedestrianCounts } from '../modules/pedestrian/PedestrianManager';
import { Session, Count, PedestrianCount } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

type Route = RouteProp<RootStackParamList, 'SessionReview'>;
type Nav   = NativeStackNavigationProp<RootStackParamList, 'SessionReview'>;

function computeStats(session: Session, counts: Count[]): ReportStats {
  const byVehicle:  Record<string, number> = {};
  const byMovement: Record<string, number> = {};
  const byApproach: Record<string, number> = {};
  counts.forEach((c) => {
    byVehicle[c.vehicle_type]    = (byVehicle[c.vehicle_type]    ?? 0) + 1;
    byMovement[c.movement]       = (byMovement[c.movement]       ?? 0) + 1;
    byApproach[c.from_direction] = (byApproach[c.from_direction] ?? 0) + 1;
  });
  return { byVehicle, byMovement, byApproach, duration: formatDuration(session) };
}

function formatDuration(session: Session): string {
  if (!session.ended_at) return '—';
  const s  = Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function topEntry(rec: Record<string, number>): string {
  const entries = Object.entries(rec);
  return entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : '—';
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

const MOVEMENT_ICON: Record<string, string> = { left: '←', straight: '↑', right: '→' };
const PERIOD_LABELS: Record<string, string>  = { am_peak: 'AM Peak', pm_peak: 'PM Peak', off_peak: 'Off-Peak' };

function BarChart({ title, data, color, styles }: {
  title: string; data: Record<string, number>; color: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  if (!entries.length) return null;
  return (
    <View style={styles.chartCard}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {entries.map(([label, value]) => (
        <View key={label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {MOVEMENT_ICON[label] ? `${MOVEMENT_ICON[label]}  ${cap(label)}` : label}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={styles.barValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SessionReviewScreen() {
  const { params } = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const G = useTheme();
  const styles = useMemo(() => createStyles(G), [G]);

  const [session,    setSession]    = useState<Session | null>(null);
  const [counts,     setCounts]     = useState<Count[]>([]);
  const [pedCounts,  setPedCounts]  = useState<PedestrianCount[]>([]);
  const [exporting,  setExporting]  = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSession(params.sessionId),
      getSessionCounts(params.sessionId),
      getSessionPedestrianCounts(params.sessionId),
    ]).then(([s, c, p]) => { setSession(s); setCounts(c); setPedCounts(p); });
  }, [params.sessionId]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.popToTop()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Text style={{ color: G.blue, fontSize: 15, fontWeight: '600' }}>⌂ Sessions</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, G.blue]);

  if (!session) return <View style={styles.loading}><ActivityIndicator color={G.blue} /></View>;

  const stats = computeStats(session, counts);
  const { byVehicle, byMovement, byApproach, duration } = stats;

  const doExport = async (format: 'csv' | 'xlsx' | 'json' | 'pdf' | 'ped_csv') => {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === 'pdf') {
        await exportPdf(session, stats);
      } else if (format === 'ped_csv') {
        await exportPedestrianCsv(session, pedCounts);
      } else {
        await exportSession(session, counts, format, pedCounts.length > 0 ? pedCounts : undefined);
      }
    } finally { setExporting(null); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.location}>{session.location_name}</Text>
        <Text style={styles.meta}>
          {session.started_at.slice(0, 10)} · {session.intersection_type} · {PERIOD_LABELS[session.time_period] ?? session.time_period}
        </Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            {[
              { value: String(session.total_count), label: 'Total Vehicles' },
              { value: duration,                    label: 'Duration' },
              { value: topEntry(byVehicle),         label: 'Top Vehicle' },
              { value: cap(topEntry(byMovement)),   label: 'Dominant Move' },
            ].map(({ value, label }) => (
              <View key={label} style={styles.statCell}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <BarChart title="BY VEHICLE TYPE" data={byVehicle}  color={G.blue}   styles={styles} />
        <BarChart title="BY MOVEMENT"     data={byMovement} color={G.purple} styles={styles} />
        <BarChart title="BY APPROACH"     data={byApproach} color={G.green}  styles={styles} />

        {/* ── Pedestrian summary (shown only if data exists) ───────────────── */}
        {pedCounts.length > 0 && (() => {
          const pedNS  = pedCounts.filter((p) => p.crossing_direction === 'NS').length;
          const pedEW  = pedCounts.filter((p) => p.crossing_direction === 'EW').length;
          const pedAny = pedCounts.filter((p) => !p.crossing_direction).length;
          return (
            <View style={styles.pedCard}>
              <Text style={styles.sectionLabel}>👣 PEDESTRIAN COUNTS</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, { color: G.green }]}>{pedCounts.length}</Text>
                  <Text style={styles.statLabel}>Total Crossings</Text>
                </View>
                {pedNS > 0 && (
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: G.green }]}>{pedNS}</Text>
                    <Text style={styles.statLabel}>N ↕ S</Text>
                  </View>
                )}
                {pedEW > 0 && (
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: G.green }]}>{pedEW}</Text>
                    <Text style={styles.statLabel}>E ↔ W</Text>
                  </View>
                )}
                {pedAny > 0 && (
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: G.green }]}>{pedAny}</Text>
                    <Text style={styles.statLabel}>Unspecified</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        <Text style={styles.sectionLabel}>EXPORT DATA</Text>
        <View style={styles.exportRow}>
          {(['csv', 'xlsx', 'json'] as const).map((fmt) => (
            <TouchableOpacity
              key={fmt}
              testID={`export-${fmt}-btn`}
              style={styles.exportBtn}
              onPress={() => doExport(fmt)}
              disabled={!!exporting}
            >
              {exporting === fmt
                ? <ActivityIndicator color={G.blue} size="small" />
                : <Text style={styles.exportBtnText}>{fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()}</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          testID="export-pdf-btn"
          style={styles.pdfBtn}
          onPress={() => doExport('pdf')}
          disabled={!!exporting}
        >
          {exporting === 'pdf'
            ? <ActivityIndicator color={G.blue} size="small" />
            : <>
                <Text style={styles.pdfBtnText}>↓  Download PDF Report</Text>
                <Text style={styles.pdfBtnSub}>Charts + summary as a shareable PDF</Text>
              </>}
        </TouchableOpacity>

        {pedCounts.length > 0 && (
          <TouchableOpacity
            testID="export-ped-csv-btn"
            style={styles.pedCsvBtn}
            onPress={() => doExport('ped_csv')}
            disabled={!!exporting}
          >
            {exporting === 'ped_csv'
              ? <ActivityIndicator color={G.green} size="small" />
              : <>
                  <Text style={styles.pedCsvBtnText}>↓  Export Pedestrian CSV</Text>
                  <Text style={styles.pedCsvBtnSub}>Separate file for pedestrian counts</Text>
                </>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.homeBtnText}>⌂  Go to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(G: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: G.bg },
    loading:   { flex: 1, backgroundColor: G.bg, justifyContent: 'center', alignItems: 'center' },
    content:   { padding: 20, gap: 12, paddingBottom: 32 },
    location:  { color: G.text, fontSize: 22, fontWeight: '700' },
    meta:      { color: G.textSub, fontSize: 13, marginBottom: 4 },
    summaryCard: {
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.rim1, padding: 14,
    },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCell: {
      flex: 1, minWidth: '40%',
      backgroundColor: G.glass2, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim0,
      padding: 14, alignItems: 'center',
    },
    statValue: { color: G.blue, fontSize: 24, fontWeight: '700' },
    statLabel: { color: G.textMute, fontSize: 11, marginTop: 3 },
    sectionLabel: { color: G.textMute, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
    chartCard: {
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.rim1, padding: 16, gap: 10,
    },
    barRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    barLabel: { width: 88, color: G.text, fontSize: 13, fontWeight: '500' },
    barTrack: {
      flex: 1, height: 22, backgroundColor: G.glass2,
      borderRadius: 6, overflow: 'hidden',
      borderWidth: 1, borderColor: G.rim0,
    },
    barFill:  { height: '100%', borderRadius: 6 },
    barValue: { width: 32, color: G.textSub, fontSize: 13, fontWeight: '600', textAlign: 'right' },
    exportRow: { flexDirection: 'row', gap: 10 },
    exportBtn: {
      flex: 1, padding: 13, alignItems: 'center',
      backgroundColor: G.glass1, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1,
      minHeight: 46, justifyContent: 'center',
    },
    exportBtnText: { color: G.text, fontWeight: '600', fontSize: 14 },
    pdfBtn: {
      padding: 16, alignItems: 'center',
      backgroundColor: G.blueGlass, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.blueRim,
      minHeight: 62, justifyContent: 'center', gap: 3,
    },
    pdfBtnText: { color: G.blue, fontWeight: '700', fontSize: 15 },
    pdfBtnSub:  { color: G.textMute, fontSize: 12 },
    pedCard: {
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.greenRim, padding: 16, gap: 10,
    },
    pedCsvBtn: {
      padding: 16, alignItems: 'center',
      backgroundColor: G.greenGlass, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.greenRim,
      minHeight: 62, justifyContent: 'center', gap: 3,
    },
    pedCsvBtnText: { color: G.green, fontWeight: '700', fontSize: 15 },
    pedCsvBtnSub:  { color: G.textMute, fontSize: 12 },
    homeBtn: {
      marginTop: 8, padding: 16, alignItems: 'center',
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.rim1,
    },
    homeBtnText: { color: G.textSub, fontWeight: '600', fontSize: 15 },
  });
}
