import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { CounterEngine } from '../modules/counter/CounterEngine';
import { endSession, getSession } from '../modules/session/SessionManager';
import { getVehicleTypes, addVehicleType, deleteVehicleType } from '../modules/vehicleType/VehicleTypeManager';
import {
  addPedestrianCount, undoLastPedestrianCount, countSessionPedestrians,
} from '../modules/pedestrian/PedestrianManager';
import {
  GestureConfig, DEFAULT_GESTURE_CONFIG, getGestureConfig,
} from '../modules/gesture/GestureConfig';
import {
  loadHapticSetting, hapticSelection,
} from '../modules/haptics/HapticService';
import IntersectionDragMap from '../components/IntersectionDragMap';
import ManageVehicleTypesModal from '../components/ManageVehicleTypesModal';
import { Session, Movement } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Counting'>;
type Route = RouteProp<RootStackParamList, 'Counting'>;

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function CountingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const session: Session = params.session;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const G = useTheme();
  const styles = useMemo(() => createStyles(G), [G]);

  const engineRef = useRef(new CounterEngine(session));
  const [total,         setTotal]         = useState(session.total_count);
  const [elapsed,       setElapsed]       = useState(0);
  const [paused,        setPaused]        = useState(false);
  const [vehicleTypes,  setVehicleTypes]  = useState<string[]>(['Moto', 'Car', 'Rickshaw', 'Other']);
  const [manageVisible, setManageVisible] = useState(false);
  const [gestureConfig, setGestureConfig] = useState<GestureConfig>(DEFAULT_GESTURE_CONFIG);

  const [pedTotal, setPedTotal] = useState(0);

  useEffect(() => {
    countSessionPedestrians(session.id).then(setPedTotal);
  }, [session.id]);

  const handlePedTap = async () => {
    await addPedestrianCount(session.id, null);
    setPedTotal((n) => n + 1);
  };

  const handlePedUndo = async () => {
    const ok = await undoLastPedestrianCount(session.id);
    if (ok) setPedTotal((n) => Math.max(0, n - 1));
  };

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [paused]);

  const loadVehicleTypes = useCallback(async () => {
    const types = await getVehicleTypes();
    if (types.length > 0) setVehicleTypes(types);
  }, []);

  useEffect(() => {
    loadVehicleTypes();
    getGestureConfig().then(setGestureConfig);
    loadHapticSetting();
  }, [loadVehicleTypes]);

  const handleDrag = async (from: string, movement: Movement, vehicleType: string) => {
    await engineRef.current.record({ from_direction: from, movement, vehicle_type: vehicleType });
    setTotal((await getSession(session.id)).total_count);
  };

  const handleUndo = async () => {
    if (await engineRef.current.undo()) {
      setTotal((await getSession(session.id)).total_count);
    }
  };

  const handleEndSession = () => {
    Alert.alert(
      'End Session?',
      `You have counted ${total} vehicles and ${pedTotal} pedestrian${pedTotal !== 1 ? 's' : ''}. End this session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session', style: 'destructive',
          onPress: async () => {
            await endSession(session.id);
            navigation.replace('SessionReview', { sessionId: session.id });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={[styles.header, isLandscape && styles.headerLandscape]}>
        <Text style={styles.locationName} numberOfLines={1}>{session.location_name}</Text>
        <Text style={[styles.timer, paused && styles.timerPaused]}>{formatElapsed(elapsed)}</Text>
        <TouchableOpacity style={styles.pauseBtn} onPress={() => { hapticSelection(); setPaused((p) => !p); }}>
          <Text style={styles.pauseBtnText}>{paused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.manageBtn} onPress={() => { hapticSelection(); setManageVisible(true); }}>
          <Text style={styles.manageBtnText}>⚙</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="end-session-btn" style={styles.endBtn} onPress={handleEndSession}>
          <Text style={styles.endBtnText}>■</Text>
        </TouchableOpacity>
      </View>

      {/* ── Map fills everything below the header ────────────────────────────── */}
      <View style={styles.mapContainer}>
        <IntersectionDragMap
          legs={session.custom_legs}
          vehicleTypes={vehicleTypes}
          onDrag={handleDrag}
          paused={paused}
          gestureConfig={gestureConfig}
          pedTotal={pedTotal}
          onPedestrian={handlePedTap}
          total={total}
          onUndo={handleUndo}
          onPedUndo={handlePedUndo}
        />
      </View>

      <ManageVehicleTypesModal
        visible={manageVisible}
        vehicleTypes={vehicleTypes}
        onAdd={async (n) => { await addVehicleType(n); await loadVehicleTypes(); }}
        onDelete={async (n) => { await deleteVehicleType(n); await loadVehicleTypes(); }}
        onClose={() => setManageVisible(false)}
      />
    </SafeAreaView>
  );
}

function createStyles(G: ThemeTokens) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: G.bg },
    mapContainer: { flex: 1, padding: 8, minHeight: 0 },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: G.rim1,
      backgroundColor: G.glass2,
    },
    headerLandscape: { paddingVertical: 5 },
    locationName: { flex: 1, color: G.blue, fontWeight: '700', fontSize: 14 },
    timer: { color: G.textSub, fontSize: 13, marginHorizontal: 8, fontVariant: ['tabular-nums'] },
    timerPaused: { color: G.orange },
    pauseBtn: {
      padding: 7, marginRight: 6,
      backgroundColor: G.glass2, borderRadius: G.radiusXs,
      borderWidth: 1, borderColor: G.rim1,
    },
    pauseBtnText: { color: G.blue, fontSize: 15 },
    manageBtn: {
      padding: 7, marginRight: 6,
      backgroundColor: G.glass2, borderRadius: G.radiusXs,
      borderWidth: 1, borderColor: G.rim1,
    },
    manageBtnText: { color: G.textSub, fontSize: 15 },
    endBtn: {
      padding: 7, backgroundColor: G.redGlass, borderRadius: G.radiusXs,
      borderWidth: 1, borderColor: G.redRim,
    },
    endBtnText: { color: G.red, fontSize: 15 },
  });
}
