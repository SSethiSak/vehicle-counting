import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

interface Props {
  visible: boolean;
  vehicleTypes: string[];
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

export default function ManageVehicleTypesModal({
  visible, vehicleTypes, onAdd, onDelete, onClose,
}: Props) {
  const G = useTheme();
  const styles = useMemo(() => createStyles(G), [G]);
  const [draft, setDraft] = useState('');

  function handleAdd() {
    const name = draft.trim();
    if (!name || vehicleTypes.includes(name)) return;
    onAdd(name);
    setDraft('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BlurView intensity={G.blurIntensity} tint={G.blurTint} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Vehicle Types</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={vehicleTypes}
            keyExtractor={(item) => item}
            style={styles.list}
            renderItem={({ item, index }) => (
              <View style={[styles.row, index < vehicleTypes.length - 1 && styles.rowBorder]}>
                <Text style={styles.typeName}>{item}</Text>
                <TouchableOpacity
                  style={[styles.deleteBtn, vehicleTypes.length <= 1 && styles.deleteBtnDisabled]}
                  onPress={() => vehicleTypes.length > 1 && onDelete(item)}
                  disabled={vehicleTypes.length <= 1}
                >
                  <Text style={styles.deleteBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
          />
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="New type name…"
              placeholderTextColor={G.textMute}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.addBtn, !draft.trim() && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!draft.trim()}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(G: ThemeTokens) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: G.radius, borderTopRightRadius: G.radius,
      borderWidth: 1, borderBottomWidth: 0, borderColor: G.rim1,
      maxHeight: '70%', paddingBottom: 28, overflow: 'hidden',
    },
    handle: {
      alignSelf: 'center', width: 36, height: 4,
      backgroundColor: G.rim2, borderRadius: 2, marginTop: 12, marginBottom: 4,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 18, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: G.rim0,
    },
    title: { color: G.text, fontSize: 16, fontWeight: '700' },
    doneBtn: { paddingHorizontal: 12, paddingVertical: 6 },
    doneBtnText: { color: G.blue, fontWeight: '600', fontSize: 14 },
    list: { flexGrow: 0 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 18, paddingVertical: 14,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: G.rim0 },
    typeName: { flex: 1, color: G.text, fontSize: 15 },
    deleteBtn: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: G.redGlass, borderWidth: 1, borderColor: G.redRim,
      justifyContent: 'center', alignItems: 'center',
    },
    deleteBtnDisabled: { backgroundColor: G.glass0, borderColor: G.rim0 },
    deleteBtnText: { color: G.red, fontSize: 18, lineHeight: 20 },
    addRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 14 },
    input: {
      flex: 1, backgroundColor: G.glass2, color: G.text,
      paddingHorizontal: 14, paddingVertical: 11,
      borderRadius: G.radiusSm, fontSize: 14,
      borderWidth: 1, borderColor: G.rim1,
    },
    addBtn: {
      paddingHorizontal: 18, paddingVertical: 11,
      backgroundColor: G.blueGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.blueRim, justifyContent: 'center',
    },
    addBtnDisabled: { backgroundColor: G.glass0, borderColor: G.rim0 },
    addBtnText: { color: G.blue, fontWeight: '700', fontSize: 14 },
  });
}
