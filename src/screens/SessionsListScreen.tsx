import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  listSessions, deleteSession, updateSessionColorTag, renameSession,
} from '../modules/session/SessionManager';
import { Session } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SessionsList'>;

const PERIOD_LABELS: Record<string, string> = {
  am_peak: 'AM Peak', pm_peak: 'PM Peak', off_peak: 'Off-Peak',
};

const COLOR_TAGS: { label: string; color: string | null }[] = [
  { label: 'None',   color: null },
  { label: 'Red',    color: '#ef4444' },
  { label: 'Orange', color: '#f97316' },
  { label: 'Yellow', color: '#eab308' },
  { label: 'Green',  color: '#22c55e' },
  { label: 'Blue',   color: '#007aff' },
  { label: 'Purple', color: '#af52de' },
  { label: 'Gray',   color: '#6b7280' },
];

export default function SessionsListScreen() {
  const navigation = useNavigation<Nav>();
  const G = useTheme();
  const styles = useMemo(() => createStyles(G), [G]);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [actionSession, setActionSession] = useState<Session | null>(null);
  const [actionVisible, setActionVisible] = useState(false);

  const [colorSession, setColorSession] = useState<Session | null>(null);
  const [colorVisible, setColorVisible] = useState(false);
  const [colorBulk, setColorBulk] = useState(false);

  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const reload = useCallback(() => { listSessions().then(setSessions); }, []);
  useFocusEffect(reload);

  // ── Header buttons ─────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            if (selectionMode) { setSelectionMode(false); setSelectedIds(new Set()); }
            else setSelectionMode(true);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text style={{ color: G.blue, fontSize: 16, fontWeight: '600' }}>
            {selectionMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, selectionMode, G.blue]);

  // ── Row interactions ───────────────────────────────────────────────────────
  const handlePress = (item: Session) => {
    if (selectionMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        return next;
      });
    } else {
      navigation.navigate('SessionReview', { sessionId: item.id });
    }
  };

  // ── Context action sheet ───────────────────────────────────────────────────
  const closeAction = () => setActionVisible(false);

  const openRename = () => {
    closeAction();
    if (!actionSession) return;
    setRenameTarget(actionSession);
    setRenameValue(actionSession.location_name);
    setRenameVisible(true);
  };

  const openColorForItem = (item: Session) => {
    setColorSession(item); setColorBulk(false); setColorVisible(true);
  };

  const openColorFromAction = () => {
    closeAction();
    if (actionSession) openColorForItem(actionSession);
  };

  const openColorForSelection = () => {
    setColorBulk(true); setColorVisible(true);
  };

  const openPedestrianFromAction = () => {
    closeAction();
    if (!actionSession) return;
    navigation.navigate('PedestrianCounting', { session: actionSession });
  };

  const selectFromAction = () => {
    closeAction();
    if (!actionSession) return;
    setSelectionMode(true); setSelectedIds(new Set([actionSession.id]));
  };

  const deleteFromAction = () => {
    closeAction();
    if (!actionSession) return;
    const target = actionSession;
    Alert.alert(
      'Delete Session?',
      `"${target.location_name}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSession(target.id); reload(); } },
      ]
    );
  };

  // ── Bulk delete ────────────────────────────────────────────────────────────
  const handleDeleteSelected = () => {
    const count = selectedIds.size;
    Alert.alert(
      'Delete Sessions?',
      `Delete ${count} session${count > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) await deleteSession(id);
            setSelectionMode(false); setSelectedIds(new Set()); reload();
          },
        },
      ]
    );
  };

  // ── Color tag ─────────────────────────────────────────────────────────────
  const handleColorSelect = async (color: string | null) => {
    if (colorBulk) {
      for (const id of selectedIds) await updateSessionColorTag(id, color);
      setSelectionMode(false); setSelectedIds(new Set());
    } else {
      if (colorSession) await updateSessionColorTag(colorSession.id, color);
    }
    setColorVisible(false); setColorSession(null); setColorBulk(false); reload();
  };

  // ── Rename ─────────────────────────────────────────────────────────────────
  const handleRenameConfirm = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await renameSession(renameTarget.id, renameValue.trim());
    setRenameVisible(false); setRenameTarget(null); reload();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No sessions yet. Tap + to start.</Text>}
        renderItem={({ item }) => {
          const selected = selectionMode && selectedIds.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => handlePress(item)}
              onLongPress={() => { if (!selectionMode) { setActionSession(item); setActionVisible(true); } }}
              delayLongPress={350}
              activeOpacity={0.7}
            >
              {selectionMode ? (
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              ) : (
                <TouchableOpacity onPress={() => openColorForItem(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <View style={[styles.colorDot, item.color_tag ? { backgroundColor: item.color_tag } : styles.colorDotEmpty]} />
                </TouchableOpacity>
              )}
              <View style={styles.textBlock}>
                <Text style={styles.location}>{item.location_name}</Text>
                <Text style={styles.meta}>
                  {item.started_at.slice(0, 10)} · {PERIOD_LABELS[item.time_period]} · {item.total_count} vehicles
                </Text>
              </View>
              {!selectionMode && <Text style={styles.arrow}>›</Text>}
            </TouchableOpacity>
          );
        }}
      />

      {selectionMode ? (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selBtnCancel} onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
            <Text style={styles.selBtnCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selCount}>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap to select'}</Text>
          <TouchableOpacity style={[styles.selBtnColor, selectedIds.size === 0 && styles.selBtnDim]} onPress={openColorForSelection} disabled={selectedIds.size === 0}>
            <Text style={styles.selBtnColorText}>Color</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.selBtnDelete, selectedIds.size === 0 && styles.selBtnDim]} onPress={handleDeleteSelected} disabled={selectedIds.size === 0}>
            <Text style={styles.selBtnDeleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity testID="new-session-btn" style={styles.fab} onPress={() => navigation.navigate('SessionSetup')}>
          <Text style={styles.fabLabel}>+ New Session</Text>
        </TouchableOpacity>
      )}

      {/* ── Context action sheet ───────────────────────────────────────────── */}
      <Modal visible={actionVisible} transparent animationType="slide" onRequestClose={closeAction}>
        <TouchableOpacity style={styles.overlay} onPress={closeAction} activeOpacity={1}>
          <BlurView intensity={G.blurIntensity} tint={G.blurTint} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{actionSession?.location_name}</Text>
            {[
              { icon: '✎',  label: 'Rename',            onPress: openRename },
              { icon: '👣', label: 'Pedestrian Count',  onPress: openPedestrianFromAction },
              { icon: '⬤',  label: 'Color Tag',         onPress: openColorFromAction },
              { icon: '☑',  label: 'Select',            onPress: selectFromAction },
            ].map(({ icon, label, onPress }, i, arr) => (
              <TouchableOpacity key={label} style={[styles.actionItem, i < arr.length - 1 && styles.actionItemBorder]} onPress={onPress}>
                <Text style={styles.actionIcon}>{icon}</Text>
                <Text style={styles.actionLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionItem} onPress={deleteFromAction}>
              <Text style={[styles.actionIcon, { color: G.red }]}>⊗</Text>
              <Text style={[styles.actionLabel, { color: G.red }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelPill} onPress={closeAction}>
              <Text style={styles.cancelPillText}>Cancel</Text>
            </TouchableOpacity>
          </BlurView>
        </TouchableOpacity>
      </Modal>

      {/* ── Color picker ───────────────────────────────────────────────────── */}
      <Modal visible={colorVisible} transparent animationType="slide" onRequestClose={() => setColorVisible(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setColorVisible(false)} activeOpacity={1}>
          <BlurView intensity={G.blurIntensity} tint={G.blurTint} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Color Tag</Text>
            <View style={styles.swatchRow}>
              {COLOR_TAGS.map(({ label, color }) => {
                const active = !colorBulk && colorSession?.color_tag === color;
                return (
                  <TouchableOpacity key={label} style={styles.swatchItem} onPress={() => handleColorSelect(color)}>
                    <View style={[styles.swatch, color ? { backgroundColor: color } : styles.swatchNone, active && styles.swatchActive]} />
                    <Text style={styles.swatchLabel}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BlurView>
        </TouchableOpacity>
      </Modal>

      {/* ── Rename sheet ───────────────────────────────────────────────────── */}
      <Modal visible={renameVisible} transparent animationType="slide" onRequestClose={() => setRenameVisible(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <BlurView intensity={G.blurIntensity} tint={G.blurTint} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Rename Session</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
              placeholderTextColor={G.textMute}
            />
            <View style={styles.renameRow}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setRenameVisible(false)}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameConfirmBtn, !renameValue.trim() && styles.renameConfirmDim]}
                onPress={handleRenameConfirm} disabled={!renameValue.trim()}
              >
                <Text style={styles.renameConfirmText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(G: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: G.bg },
    list: { padding: 12, gap: 8, paddingBottom: 0 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.rim1, gap: 12,
    },
    rowSelected: { backgroundColor: G.glass3, borderColor: G.blueRim },
    checkbox: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 2, borderColor: G.blue,
      justifyContent: 'center', alignItems: 'center',
    },
    checkboxSelected: { backgroundColor: G.blue },
    checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
    colorDot: { width: 13, height: 13, borderRadius: 7 },
    colorDotEmpty: { borderWidth: 1.5, borderColor: G.rim2 },
    textBlock: { flex: 1 },
    location: { color: G.text, fontSize: 16, fontWeight: '600' },
    meta: { color: G.textSub, fontSize: 12, marginTop: 2 },
    arrow: { color: G.textMute, fontSize: 20 },
    empty: { color: G.textMute, textAlign: 'center', marginTop: 60, fontSize: 14 },
    fab: {
      margin: 12, padding: 16,
      backgroundColor: G.blueGlass, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.blueRim, alignItems: 'center',
    },
    fabLabel: { color: G.blue, fontWeight: '700', fontSize: 16 },
    selectionBar: {
      flexDirection: 'row', alignItems: 'center',
      margin: 12, padding: 12,
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.rim1, gap: 10,
    },
    selBtnCancel: {
      paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: G.glass2, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1,
    },
    selBtnCancelText: { color: G.textSub, fontWeight: '600', fontSize: 13 },
    selCount: { flex: 1, color: G.textSub, fontSize: 13, textAlign: 'center' },
    selBtnColor: {
      paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: G.glass2, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1,
    },
    selBtnColorText: { color: G.text, fontWeight: '600', fontSize: 13 },
    selBtnDelete: {
      paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: G.redGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.redRim,
    },
    selBtnDim: { backgroundColor: G.glass0, borderColor: G.rim0 },
    selBtnDeleteText: { color: G.red, fontWeight: '600', fontSize: 13 },
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: G.radius, borderTopRightRadius: G.radius,
      borderWidth: 1, borderBottomWidth: 0, borderColor: G.rim1,
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: 36, overflow: 'hidden',
    },
    handle: {
      alignSelf: 'center', width: 36, height: 4,
      backgroundColor: G.rim2, borderRadius: 2, marginBottom: 14,
    },
    sheetTitle: { color: G.textSub, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 14, paddingHorizontal: 16 },
    actionItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 4 },
    actionItemBorder: { borderBottomWidth: 1, borderBottomColor: G.rim0 },
    actionIcon: { color: G.text, fontSize: 17, width: 24, textAlign: 'center' },
    actionLabel: { color: G.text, fontSize: 17 },
    actionDivider: { height: 1, backgroundColor: G.rim1, marginVertical: 6 },
    cancelPill: {
      marginTop: 10, padding: 15,
      backgroundColor: G.glass2, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1, alignItems: 'center',
    },
    cancelPillText: { color: G.textSub, fontWeight: '600', fontSize: 16 },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', paddingVertical: 8 },
    swatchItem: { alignItems: 'center', gap: 6, width: 54 },
    swatch: { width: 34, height: 34, borderRadius: 17 },
    swatchNone: { borderWidth: 1.5, borderColor: G.rim2 },
    swatchActive: { borderWidth: 3, borderColor: G.text },
    swatchLabel: { color: G.textMute, fontSize: 11 },
    renameInput: {
      backgroundColor: G.glass2, color: G.text,
      paddingHorizontal: 14, paddingVertical: 13,
      borderRadius: G.radiusSm, fontSize: 16,
      borderWidth: 1, borderColor: G.rim1, marginBottom: 14,
    },
    renameRow: { flexDirection: 'row', gap: 10 },
    renameCancelBtn: {
      flex: 1, padding: 14, alignItems: 'center',
      backgroundColor: G.glass2, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1,
    },
    renameCancelText: { color: G.textSub, fontWeight: '600', fontSize: 15 },
    renameConfirmBtn: {
      flex: 1, padding: 14, alignItems: 'center',
      backgroundColor: G.blueGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.blueRim,
    },
    renameConfirmDim: { backgroundColor: G.glass0, borderColor: G.rim0 },
    renameConfirmText: { color: G.blue, fontWeight: '700', fontSize: 15 },
  });
}
