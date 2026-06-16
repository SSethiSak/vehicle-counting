import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, PanResponder, StyleSheet,
  useWindowDimensions, Animated,
} from 'react-native';
import { computeMovement } from '../modules/direction/DirectionCalculator';
import { GestureConfig } from '../modules/gesture/GestureConfig';
import {
  hapticLight, hapticMedium, hapticHeavy, hapticSelection,
} from '../modules/haptics/HapticService';
import { Movement } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ThemeTokens } from '../theme';

interface Props {
  legs?: string[] | null;
  vehicleTypes: string[];
  onDrag: (from: string, movement: Movement, vehicleType: string) => void;
  paused?: boolean;
  gestureConfig?: GestureConfig;
  pedTotal?: number;
  onPedestrian?: () => void;
  total?: number;
  onUndo?: () => void;
  onPedUndo?: () => void;
}

const DOUBLE_TAP_MS = 300;
const RIPPLE_SIZE   = 110;

// Simple grid: 4 fixed nodes (N/E/S/W) arranged in a cross pattern.
const NODE_SIZE_RATIO = 0.28;
const MAX_NODE_SIZE = 170;  // increased from 160

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function IntersectionDragMap({
  legs, vehicleTypes, onDrag, paused,
  gestureConfig, pedTotal, onPedestrian,
  total, onUndo, onPedUndo,
}: Props) {
  const G = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isCompact = Math.min(screenW, screenH) < 400;
  const isLandscape = screenW > screenH;
  const styles = useMemo(() => createStyles(G, isCompact, isLandscape), [G, isCompact, isLandscape]);

  const resolvedLegs = legs && legs.length > 0 ? legs : ['N', 'E', 'S', 'W'];

  const [anchorIdx, setAnchorIdx]       = useState(0);
  const [dragFrom,  setDragFrom]        = useState<{ leg: string; vehicleType: string } | null>(null);
  const [dragTo,    setDragTo]          = useState<string | null>(null);
  const [containerW, setContainerW]     = useState(320);
  const [containerH, setContainerH]     = useState(480);
  const [rippleVisible, setRippleVisible] = useState(false);
  const [ripplePos,   setRipplePos]     = useState({ x: 0, y: 0 });

  // Ripple animation
  const rippleAnim   = useRef(new Animated.Value(0)).current;
  const rippleScale  = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 3.5] });
  const rippleOpacity = rippleAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.65, 0.45, 0] });

  const fireRippleRef = useRef<(x: number, y: number) => void>(() => {});
  const fireRipple = (x: number, y: number) => {
    setRipplePos({ x, y });
    setRippleVisible(true);
    rippleAnim.setValue(0);
    Animated.timing(rippleAnim, { toValue: 1, duration: 500, useNativeDriver: true })
      .start(() => setRippleVisible(false));
  };
  fireRippleRef.current = fireRipple;

  // Stable refs for PanResponder callbacks
  const dragFromRef      = useRef<{ leg: string; vehicleType: string } | null>(null);
  const dragToRef        = useRef<string | null>(null);
  const anchorIdxRef     = useRef(0);
  const resolvedLegsRef  = useRef(resolvedLegs);
  const containerWRef    = useRef(320);
  const containerHRef    = useRef(480);
  const onDragRef        = useRef(onDrag);
  const vehicleTypesRef  = useRef(vehicleTypes);
  const pausedRef        = useRef(false);
  const gestureConfigRef = useRef<GestureConfig | undefined>(undefined);
  const onPedestrianRef  = useRef<(() => void) | undefined>(undefined);
  const maxFingersRef    = useRef(1);
  const lastDeadTapRef   = useRef(0);

  anchorIdxRef.current    = anchorIdx;
  resolvedLegsRef.current = resolvedLegs;
  containerWRef.current   = containerW;
  containerHRef.current   = containerH;
  onDragRef.current       = onDrag;
  vehicleTypesRef.current = vehicleTypes;
  pausedRef.current       = paused ?? false;
  gestureConfigRef.current  = gestureConfig;
  onPedestrianRef.current   = onPedestrian;

  // ── Grid layout helpers ────────────────────────────────────────────────────

  function getNodeSize() {
    const cw = containerWRef.current;
    const ch = containerHRef.current;
    const baseSize = Math.min(cw, ch) * NODE_SIZE_RATIO;
    return Math.round(Math.min(baseSize, MAX_NODE_SIZE));
  }

  // Returns {x, y} center position for each leg in a simple cross grid.
  // Rotates so the selected anchor (standing-at) leg is always at the bottom, facing the user.
  function getGridPositions(): Record<string, { x: number; y: number }> {
    const cw = containerWRef.current;
    const ch = containerHRef.current;
    const cx = cw / 2;
    const cy = ch / 2;
    const ns = getNodeSize();
    const gap = ns * 0.6 + 60; // space between nodes (base spacing + 60px)

    const legs = resolvedLegsRef.current;
    const anchor = anchorIdxRef.current;
    const result: Record<string, { x: number; y: number }> = {};

    // Slot positions: 0=top, 1=right, 2=bottom, 3=left
    const slotPositions = [
      { x: cx, y: cy - gap },   // 0: top
      { x: cx + gap, y: cy },   // 1: right
      { x: cx, y: cy + gap },   // 2: bottom — anchor always goes here
      { x: cx - gap, y: cy },   // 3: left
    ];

    // Rotate ring so anchor leg lands at slot 2 (bottom)
    for (let i = 0; i < Math.min(legs.length, 4); i++) {
      const slot = (i - anchor + 2 + 4) % 4;
      result[legs[i]] = slotPositions[slot];
    }

    return result;
  }

  // Check if a point is inside a node's bounds
  function findNodeAtPoint(x: number, y: number): string | null {
    const ns = getNodeSize();
    const positions = getGridPositions();
    for (const [leg, { x: cx, y: cy }] of Object.entries(positions)) {
      if (Math.abs(x - cx) <= ns / 2 && Math.abs(y - cy) <= ns / 2) return leg;
    }
    return null;
  }

  // Find which vehicle button was tapped within a node
  function findVehicleInNode(leg: string, x: number, y: number): string | null {
    const ns = getNodeSize();
    const positions = getGridPositions();
    const center = positions[leg];
    if (!center) return null;

    const dx = x - center.x;
    const dy = y - center.y;
    if (Math.abs(dx) > ns / 2 || Math.abs(dy) > ns / 2) return null;

    const types = vehicleTypesRef.current;
    if (!types.length) return null;

    const nCols = 2;
    const nRows = Math.ceil(types.length / nCols);
    const col = Math.min(nCols - 1, Math.floor((dx + ns / 2) / (ns / nCols)));
    const row = Math.min(nRows - 1, Math.floor((dy + ns / 2) / (ns / nRows)));
    return types[Math.min(row * nCols + col, types.length - 1)];
  }

  // Nearest-node detection: finds the closest node to finger position.
  // Bulletproof — no zones, no misses.
  function findNearestNode(x: number, y: number, excludeLeg?: string): string | null {
    const positions = getGridPositions();
    let nearest: string | null = null;
    let minDist = Infinity;

    for (const [leg, { x: cx, y: cy }] of Object.entries(positions)) {
      if (leg === excludeLeg) continue;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = leg;
      }
    }
    return nearest;
  }

  // Check if tap is in dead space (for pedestrian double-tap)
  function isInDeadSpace(x: number, y: number): boolean {
    return findNodeAtPoint(x, y) === null;
  }

  // ── Pan responder ──────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (evt) => {
        if (pausedRef.current) return;
        maxFingersRef.current = evt.nativeEvent.touches.length;
        const { locationX, locationY } = evt.nativeEvent;

        const leg = findNodeAtPoint(locationX, locationY);
        if (leg) {
          const vt = findVehicleInNode(leg, locationX, locationY);
          if (vt) {
            hapticLight();
            dragFromRef.current = { leg, vehicleType: vt };
            setDragFrom({ leg, vehicleType: vt });
          }
        }
        dragToRef.current = null;
        setDragTo(null);
      },

      onPanResponderMove: (evt) => {
        const fingerCount = evt.nativeEvent.touches.length;
        if (fingerCount > maxFingersRef.current) {
          maxFingersRef.current = fingerCount;
          const cfg = gestureConfigRef.current;
          if (fingerCount >= 2 && dragFromRef.current && cfg) {
            const slot = fingerCount >= 3 ? cfg.slot3 : cfg.slot2;
            if (slot.vehicleTypes.length > 0) {
              const updated = { leg: dragFromRef.current.leg, vehicleType: slot.vehicleTypes[0] };
              dragFromRef.current = updated;
              setDragFrom(updated);
            }
          }
        }

        if (!dragFromRef.current) return;

        const { locationX, locationY } = evt.nativeEvent;
        const nearest = findNearestNode(locationX, locationY, dragFromRef.current.leg);
        dragToRef.current = nearest;
        setDragTo(nearest);
      },

      onPanResponderRelease: (evt) => {
        const from   = dragFromRef.current;
        const to     = dragToRef.current;
        const maxFin = maxFingersRef.current;
        const cfg    = gestureConfigRef.current;

        if (from && to) {
          const movement = computeMovement(from.leg, to, resolvedLegsRef.current);
          if (maxFin >= 2 && cfg) {
            const slot = maxFin >= 3 ? cfg.slot3 : cfg.slot2;
            if (cfg.enhancedEnabled) {
              hapticHeavy();
              for (const vt of slot.vehicleTypes) onDragRef.current(from.leg, movement, vt);
            } else {
              hapticMedium();
              onDragRef.current(from.leg, movement, slot.vehicleTypes[0] ?? from.vehicleType);
            }
          } else {
            hapticMedium();
            onDragRef.current(from.leg, movement, from.vehicleType);
          }
        } else if (!from) {
          // Check for dead-space double-tap (pedestrian)
          const { locationX, locationY } = evt.nativeEvent;
          if (isInDeadSpace(locationX, locationY)) {
            const now = Date.now();
            if (now - lastDeadTapRef.current < DOUBLE_TAP_MS) {
              hapticSelection();
              fireRippleRef.current(locationX, locationY);
              onPedestrianRef.current?.();
              lastDeadTapRef.current = 0;
            } else {
              lastDeadTapRef.current = now;
            }
          }
        }

        dragFromRef.current   = null;
        dragToRef.current     = null;
        maxFingersRef.current = 1;
        setDragFrom(null);
        setDragTo(null);
      },

      onPanResponderTerminate: () => {
        dragFromRef.current   = null;
        dragToRef.current     = null;
        maxFingersRef.current = 1;
        setDragFrom(null);
        setDragTo(null);
      },
    })
  ).current;

  // ── Derived values ─────────────────────────────────────────────────────────

  const nodeSize = getNodeSize();
  const gridPositions = getGridPositions();
  const rows = chunk(vehicleTypes, 2);
  const anchorLeg = resolvedLegs[anchorIdx];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Control row ──────────────────────────────────────────────── */}
      <View style={styles.controlRow}>
        <Text style={styles.anchorLabel}>{isLandscape || isCompact ? 'AT' : 'STANDING AT'}</Text>
        <View style={styles.anchorBtns}>
          {resolvedLegs.map((leg, idx) => (
            <TouchableOpacity
              key={leg}
              style={[styles.anchorBtn, anchorIdx === idx && styles.anchorBtnActive]}
              onPress={() => { hapticSelection(); setAnchorIdx(idx); }}
            >
              <Text style={[styles.anchorBtnText, anchorIdx === idx && styles.anchorBtnTextActive]}>
                {leg}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flex: 1, minWidth: 6 }} />

        {total !== undefined && (
          <View style={styles.counterPill}>
            <Text style={styles.counterNum}>{total}</Text>
            {onUndo && (
              <TouchableOpacity
                testID="undo-btn"
                onPress={() => { hapticHeavy(); onUndo(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.undoGlyph}>↩</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {pedTotal !== undefined && (
          <View style={styles.pedPill}>
            <Text style={styles.pedGlyph}>👣</Text>
            <Text style={styles.pedNum}>{pedTotal}</Text>
            {onPedUndo && (
              <TouchableOpacity
                onPress={() => { hapticHeavy(); onPedUndo(); }}
                disabled={pedTotal === 0}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.undoGlyph, pedTotal === 0 && styles.undoGlyphDim]}>↩</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Grid canvas ──────────────────────────────────────────────── */}
      <View
        style={styles.canvas}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setContainerW(width);
          setContainerH(height);
        }}
        {...panResponder.panHandlers}
      >
        {/* Grid nodes */}
        {Object.entries(gridPositions).map(([leg, { x, y }]) => {
          const isAnchor = leg === anchorLeg;
          const isFrom   = dragFrom?.leg === leg;
          const isTo     = dragTo === leg;
          return (
            <View
              key={`node-${leg}`}
              pointerEvents="none"
              style={[
                styles.gridNode,
                {
                  left:   x - nodeSize / 2,
                  top:    y - nodeSize / 2,
                  width:  nodeSize,
                  height: nodeSize,
                },
                isFrom && styles.gridNodeFrom,
                isTo   && styles.gridNodeTo,
                !isFrom && !isTo && isAnchor && styles.gridNodeAnchor,
              ]}
            >
              <View style={[styles.dirBadge, isAnchor && !isFrom && !isTo && styles.dirBadgeAnchor]}>
                <Text style={[styles.dirBadgeText, isAnchor && !isFrom && !isTo && styles.dirBadgeTextAnchor]}>
                  {leg}{isAnchor ? ' ·' : ''}
                </Text>
              </View>
              <View style={styles.vehicleGrid}>
                {rows.map((pair, rowIdx) => (
                  <View key={rowIdx} style={styles.vehicleRow}>
                    {pair.map((vt) => {
                      const isActiveBtn = isFrom && dragFrom?.vehicleType === vt;
                      return (
                        <View
                          key={vt}
                          style={[
                            styles.vehicleBtn,
                            isTo        && styles.vehicleBtnTo,
                            isActiveBtn && styles.vehicleBtnActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vehicleBtnText,
                              isTo        && styles.vehicleBtnTextTo,
                              isActiveBtn && styles.vehicleBtnTextActive,
                            ]}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                          >
                            {vt}
                          </Text>
                        </View>
                      );
                    })}
                    {pair.length < 2 && <View style={{ flex: 1 }} />}
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Ripple */}
        {rippleVisible && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ripple,
              {
                left:      ripplePos.x - RIPPLE_SIZE / 2,
                top:       ripplePos.y - RIPPLE_SIZE / 2,
                transform: [{ scale: rippleScale }],
                opacity:   rippleOpacity,
              },
            ]}
          />
        )}

        {/* Paused overlay */}
        {paused && (
          <View pointerEvents="none" style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>PAUSED</Text>
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        {dragFrom
          ? `${dragFrom.leg} · ${dragFrom.vehicleType} — drag to exit`
          : paused
            ? 'Tap ▶ to resume'
            : onPedestrian
              ? '👣 Double-tap dead space for pedestrians · Swipe from vehicle to count'
              : 'Swipe from vehicle to count'}
      </Text>
    </View>
  );
}

function createStyles(G: ThemeTokens, compact: boolean, landscape: boolean) {
  return StyleSheet.create({
    root: { flex: 1, gap: compact ? 4 : 6, minHeight: 0 },

    // ── Control row ──────────────────────────────────────────────────
    controlRow: { flexDirection: 'row', alignItems: 'center', gap: compact ? 4 : 6 },
    anchorLabel: {
      color: G.textMute, fontSize: (compact || landscape) ? 9 : 10,
      fontWeight: '700', letterSpacing: 1.2, flexShrink: 0,
    },
    anchorBtns: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', flexShrink: 1 },
    anchorBtn: {
      paddingHorizontal: (compact || landscape) ? 8 : 10,
      paddingVertical: (compact || landscape) ? 3 : 5,
      borderRadius: G.radiusSm, borderWidth: 1, borderColor: G.rim1,
      backgroundColor: G.glass1,
    },
    anchorBtnActive:     { borderColor: G.blueRim, backgroundColor: G.blueGlass },
    anchorBtnText:       { color: G.textMute, fontSize: landscape ? 11 : 12, fontWeight: '700' },
    anchorBtnTextActive: { color: G.blue },

    counterPill: {
      flexDirection: 'row', alignItems: 'center', gap: landscape ? 4 : 6, flexShrink: 0,
      backgroundColor: G.glass2, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.rim1,
      paddingHorizontal: landscape ? 6 : 8,
      paddingVertical: (compact || landscape) ? 3 : 5,
    },
    counterNum: {
      color: G.text, fontSize: landscape ? 16 : (compact ? 18 : 22),
      fontWeight: '800', minWidth: 22, textAlign: 'right',
    },
    pedPill: {
      flexDirection: 'row', alignItems: 'center', gap: landscape ? 3 : 4, flexShrink: 0,
      backgroundColor: G.greenGlass, borderRadius: G.radiusSm,
      borderWidth: 1, borderColor: G.greenRim,
      paddingHorizontal: landscape ? 6 : 8,
      paddingVertical: (compact || landscape) ? 3 : 5,
    },
    pedGlyph:     { fontSize: landscape ? 12 : (compact ? 12 : 14) },
    pedNum:       { color: G.green, fontSize: landscape ? 14 : (compact ? 14 : 16), fontWeight: '700' },
    undoGlyph:    { color: G.textSub, fontSize: landscape ? 13 : 14 },
    undoGlyphDim: { color: G.rim1 },

    // ── Canvas ───────────────────────────────────────────────────────
    canvas: { flex: 1, minHeight: 0, overflow: 'hidden' },

    // ── Grid nodes ───────────────────────────────────────────────────
    gridNode: {
      position: 'absolute', borderRadius: G.radiusSm,
      backgroundColor: 'transparent', overflow: 'hidden',
    },
    gridNodeAnchor: { backgroundColor: G.blueGlass },
    gridNodeFrom:   { backgroundColor: 'rgba(255,159,10,0.18)' },
    gridNodeTo:     { backgroundColor: G.greenGlass },

    dirBadge: {
      position: 'absolute', top: 3, right: 4, zIndex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4,
      paddingHorizontal: 4, paddingVertical: 1,
    },
    dirBadgeAnchor:     { backgroundColor: G.blueGlass },
    dirBadgeText:       { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
    dirBadgeTextAnchor: { color: '#000' },

    vehicleGrid: { flex: 1, padding: 3, gap: 3 },
    vehicleRow:  { flex: 1, flexDirection: 'row', gap: 3 },
    vehicleBtn: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      borderRadius: G.radiusXs,
      backgroundColor: '#FFD60A',
      borderWidth: 1.5, borderColor: '#B8960A',
    },
    vehicleBtnActive: { backgroundColor: '#FF9F0A' },
    vehicleBtnTo:     { backgroundColor: G.green },
    vehicleBtnText:       { color: '#000', fontSize: 12, fontWeight: '700', textAlign: 'center' },
    vehicleBtnTextActive: { color: '#000' },
    vehicleBtnTextTo:     { color: '#fff' },

    // ── Pedestrian hint ──────────────────────────────────────────────
    pedHint: {
      position: 'absolute',
      top: '50%', left: '50%',
      transform: [{ translateX: -100 }, { translateY: -10 }],
      width: 200,
    },
    pedHintText: { color: G.green, fontSize: 11, opacity: 0.35, textAlign: 'center' },

    // ── Ripple ───────────────────────────────────────────────────────
    ripple: {
      position: 'absolute',
      width:  RIPPLE_SIZE,
      height: RIPPLE_SIZE,
      borderRadius: RIPPLE_SIZE / 2,
      backgroundColor: G.green,
    },

    // ── Paused overlay ───────────────────────────────────────────────
    pausedOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(128,128,128,0.45)',
      justifyContent: 'center', alignItems: 'center',
    },
    pausedText: { color: G.orange, fontSize: 18, fontWeight: '700', letterSpacing: 3 },

    hint: { color: G.textMute, fontSize: 11, textAlign: 'center' },
  });
}
