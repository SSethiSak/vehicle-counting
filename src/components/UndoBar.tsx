import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

interface Props {
  total: number;
  onUndo: () => void;
}

export default function UndoBar({ total, onUndo }: Props) {
  const G = useTheme();
  const styles = useMemo(() => createStyles(G), [G]);
  return (
    <View style={styles.row}>
      <TouchableOpacity testID="undo-btn" style={styles.undoBtn} onPress={onUndo}>
        <Text style={styles.undoLabel}>↩ Undo</Text>
      </TouchableOpacity>
      <Text style={styles.total}>{total}</Text>
    </View>
  );
}

function createStyles(G: ThemeTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 12,
      backgroundColor: G.glass1, borderRadius: G.radius,
      borderWidth: 1, borderColor: G.rim1,
    },
    undoBtn: {
      paddingVertical: 9, paddingHorizontal: 16,
      backgroundColor: G.redGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.redRim,
    },
    undoLabel: { color: G.red, fontWeight: '600', fontSize: 14 },
    total: { color: G.text, fontSize: 38, fontWeight: '700' },
  });
}
