import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  addPedestrianCount, undoLastPedestrianCount, countSessionPedestrians,
} from '../modules/pedestrian/PedestrianManager';
import { CrossingDirection } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'PedestrianCounting'>;
type Route = RouteProp<RootStackParamList, 'PedestrianCounting'>;

const PERIOD_LABELS: Record<string, string> = {
  am_peak: 'AM Peak', pm_peak: 'PM Peak', off_peak: 'Off-Peak',
};

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function PedestrianCountingScreen() {
  const navigation = useNavigation<Nav>();
  const { params }  = useRoute<Route>();
  const session     = params.session;
  const G           = useTheme();
  const styles      = useMemo(() => createStyles(G), [G]);
  const { height }  = useWindowDimensions();

  const [total,       setTotal]       = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  const [paused,      setPaused]      = useState(false);
  const [crossingDir, setCrossingDir] = useState<CrossingDirection | null>(null);
  const [lastTime,    setLastTime]    = useState<string | null>(null);

  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Load existing count for this session on mount
  useEffect(() => {
    countSessionPedestrians(session.id).then(setTotal);
  }, [session.id]);

  // Running timer
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [paused]);

  const handleTap = async () => {
    if (pausedRef.current) return;
    await addPedestrianCount(session.id, crossingDir);
    setTotal((t) => t + 1);
    setLastTime(new Date().toLocaleTimeString());
  };

  const handleUndo = async () => {
    const ok = await undoLastPedestrianCount(session.id);
    if (ok) {
      setTotal((t) => Math.max(0, t - 1));
      setLastTime(null);
    }
  };

  const handleDone = () => {
    Alert.alert(
      'Done Counting?',
      `${total} pedestrian${total !== 1 ? 's' : ''} recorded for this session.`,
      [
        { text: 'Keep Counting', style: 'cancel' },
        { text: 'Done', onPress: () => navigation.goBack() },
      ],
    );
  };

  const DIRS: { key: CrossingDirection | null; label: string }[] = [
    { key: null,  label: 'Any' },
    { key: 'NS',  label: 'N ↕ S' },
    { key: 'EW',  label: 'E ↔ W' },
  ];

  // Make tap button fill most of the vertical space
  const tapBtnHeight = Math.max(180, height * 0.38);

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.locationName} numberOfLines={1}>{session.location_name}</Text>
          <Text style={styles.periodLabel}>
            👣 Pedestrian · {PERIOD_LABELS[session.time_period] ?? session.time_period}
          </Text>
        </View>
        <Text style={[styles.timer, paused && styles.timerPaused]}>{formatElapsed(elapsed)}</Text>
        <TouchableOpacity style={styles.pauseBtn} onPress={() => setPaused((p) => !p)}>
          <Text style={styles.pauseBtnText}>{paused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* ── Counter display ─────────────────────────────────────────────────── */}
      <View style={styles.counterBlock}>
        <Text style={styles.counterLabel}>PEDESTRIANS</Text>
        <Text style={styles.counterNum}>{total}</Text>
        <Text style={styles.lastTap}>{lastTime ? `Last: ${lastTime}` : ' '}</Text>
      </View>

      {/* ── Crossing direction ───────────────────────────────────────────────── */}
      <View style={styles.dirRow}>
        <Text style={styles.dirRowLabel}>CROSSING</Text>
        {DIRS.map(({ key, label }) => (
          <TouchableOpacity
            key={String(key)}
            style={[styles.dirBtn, crossingDir === key && styles.dirBtnActive]}
            onPress={() => setCrossingDir(key)}
          >
            <Text style={[styles.dirBtnText, crossingDir === key && styles.dirBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── BIG TAP BUTTON ──────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.tapBtn, { height: tapBtnHeight }, paused && styles.tapBtnPaused]}
        onPress={handleTap}
        activeOpacity={0.65}
      >
        <Text style={[styles.tapBtnText, paused && styles.tapBtnTextPaused]}>
          {paused ? 'PAUSED' : 'TAP'}
        </Text>
        {!paused && (
          <Text style={styles.tapBtnSub}>one tap = one crossing</Text>
        )}
      </TouchableOpacity>

      {/* ── Undo ───────────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} disabled={total === 0}>
        <Text style={[styles.undoBtnText, total === 0 && styles.undoBtnDim]}>↩ Undo last</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

function createStyles(G: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: G.bg, padding: 16, gap: 10 },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: G.rim1,
    },
    headerLeft: { flex: 1 },
    locationName: { color: G.blue, fontWeight: '700', fontSize: 14 },
    periodLabel:  { color: G.textMute, fontSize: 11, marginTop: 1 },
    timer:        { color: G.textSub, fontSize: 13, fontVariant: ['tabular-nums'] },
    timerPaused:  { color: G.orange },
    pauseBtn: {
      padding: 7, backgroundColor: G.glass2, borderRadius: G.radiusXs,
      borderWidth: 1, borderColor: G.rim1,
    },
    pauseBtnText: { color: G.blue, fontSize: 15 },
    doneBtn: {
      paddingVertical: 7, paddingHorizontal: 12,
      backgroundColor: G.blueGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.blueRim,
    },
    doneBtnText: { color: G.blue, fontWeight: '700', fontSize: 14 },

    counterBlock: {
      alignItems: 'center', paddingVertical: 8,
    },
    counterLabel: { color: G.textMute, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
    counterNum:   { color: G.text, fontSize: 72, fontWeight: '700', lineHeight: 80 },
    lastTap:      { color: G.textMute, fontSize: 12, marginTop: 2, height: 18 },

    dirRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    dirRowLabel: { color: G.textMute, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    dirBtn: {
      flex: 1, paddingVertical: 10, alignItems: 'center',
      backgroundColor: G.glass1, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1,
    },
    dirBtnActive: { backgroundColor: G.blueGlass, borderColor: G.blueRim },
    dirBtnText:       { color: G.textSub, fontSize: 13, fontWeight: '600' },
    dirBtnTextActive: { color: G.blue },

    tapBtn: {
      width: '100%', borderRadius: G.radius,
      backgroundColor: G.blueGlass, borderWidth: 2, borderColor: G.blueRim,
      justifyContent: 'center', alignItems: 'center',
    },
    tapBtnPaused: { backgroundColor: G.glass1, borderColor: G.rim1 },
    tapBtnText: {
      color: G.blue, fontSize: 44, fontWeight: '800', letterSpacing: 4,
    },
    tapBtnTextPaused: { color: G.textMute },
    tapBtnSub: { color: G.blueRim, fontSize: 13, marginTop: 6 },

    undoBtn: {
      paddingVertical: 13, paddingHorizontal: 20,
      backgroundColor: G.redGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.redRim, alignItems: 'center',
    },
    undoBtnText: { color: G.red, fontWeight: '600', fontSize: 14 },
    undoBtnDim:  { color: G.textMute },
  });
}
