// Shared look and building blocks: high contrast for sunlight, large touch targets (DGT-NFR-002, DGT-NFR-003).

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gpsStatus } from '../core/gps.ts';
import type { Fix } from '../core/types.ts';
import { type DistanceUnit, formatAccuracy } from '../core/units.ts';
import type { MarkInProgress, Permission } from './gps.ts';

export const colours = {
  background: '#ffffff',
  text: '#000000',
  muted: '#4a4a4a',
  faint: '#f1f1f1',
  border: '#c8c8c8',
  primary: '#0b57d0',
  onPrimary: '#ffffff',
  good: '#0a7d2c',
  warn: '#a35f00',
  bad: '#c0161d',
};

/**
 * Padding that keeps a screen clear of Android's status bar and navigation buttons: the app is drawn edge to edge,
 * under both.
 */
export function useEdgePadding(): { paddingTop: number; paddingBottom: number } {
  const insets = useSafeAreaInsets();
  return { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 };
}

export function BigButton(props: { label: string; onPress: () => void; disabled?: boolean; colour?: string }) {
  const { label, onPress, disabled = false, colour = colours.primary } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.big,
        { backgroundColor: disabled ? colours.border : colour, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={styles.bigLabel}>{label}</Text>
    </Pressable>
  );
}

export function SmallButton(props: { label: string; onPress: () => void; colour?: string }) {
  const { label, onPress, colour = colours.primary } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.small, { borderColor: colour, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.smallLabel, { color: colour }]}>{label}</Text>
    </Pressable>
  );
}

/** A row of mutually exclusive options. */
export function Choice<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceRow}>
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => props.onChange(o.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Banner(props: { tone: 'warn' | 'bad' | 'good'; children: ReactNode; action?: ReactNode }) {
  const colour = colours[props.tone];
  return (
    <View style={[styles.banner, { borderColor: colour }]}>
      <Text style={[styles.bannerText, { color: colour }]}>{props.children}</Text>
      {props.action}
    </View>
  );
}

/** Persistent GPS indicator (DGT-GPS-001). Reported accuracy is shown for information only. */
export function GpsBar(props: { fix: Fix | null; now: number; unit: DistanceUnit; permission: Permission }) {
  const { fix, now, unit, permission } = props;
  if (permission === 'denied') {
    return <Banner tone="bad">Location permission denied. Allow precise location for this app in Android settings.</Banner>;
  }
  if (permission === 'approximate') {
    return <Banner tone="bad">Only approximate location is allowed. Switch to precise location in Android settings.</Banner>;
  }
  const status = gpsStatus(fix, now);
  const colour = status === 'ok' ? colours.good : status === 'no-lock' ? colours.warn : colours.bad;
  const label = status === 'ok' ? 'GPS OK' : status === 'no-lock' ? 'NO SATELLITE LOCK' : 'NO GPS FIX';
  const accuracy = fix !== null && Number.isFinite(fix.accuracyM) ? formatAccuracy(fix.accuracyM, unit) : '';
  return (
    <View style={styles.gpsBar}>
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <Text style={[styles.gpsLabel, { color: colour }]}>{label}</Text>
      <Text style={styles.gpsAccuracy}>{status === 'no-fix' ? '' : accuracy}</Text>
    </View>
  );
}

const TARGET_LABEL = { tee: 'tee', aim: 'aim point', disc: 'disc', 'tee-check': 'tee check' } as const;

/** Full-screen "hold still" overlay while a mark is taken (DGT-POS-003). */
export function MarkingOverlay(props: { marking: MarkInProgress; settleMs: number; onCancel: () => void }) {
  const { marking, settleMs, onCancel } = props;
  const remaining = Math.max(0, Math.ceil((settleMs - marking.elapsedMs) / 1000));
  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>HOLD STILL</Text>
      <Text style={styles.overlayCount}>{remaining > 0 ? remaining : '…'}</Text>
      <Text style={styles.overlayDetail}>
        Marking {TARGET_LABEL[marking.target]} · {marking.fixCount} GPS readings
      </Text>
      {remaining === 0 && <Text style={styles.overlayDetail}>Waiting for more readings</Text>}
      <View style={{ marginTop: 48 }}>
        <SmallButton label="Cancel" onPress={onCancel} colour={colours.muted} />
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background, paddingHorizontal: 16 },
  h1: { fontSize: 28, fontWeight: '800', color: colours.text },
  h2: { fontSize: 20, fontWeight: '700', color: colours.text, marginTop: 20, marginBottom: 8 },
  body: { fontSize: 18, color: colours.text },
  muted: { fontSize: 16, color: colours.muted },
  instruction: { fontSize: 24, fontWeight: '600', color: colours.text, textAlign: 'center', marginVertical: 24 },
  big: { borderRadius: 14, paddingVertical: 26, alignItems: 'center', justifyContent: 'center' },
  bigLabel: { color: colours.onPrimary, fontSize: 28, fontWeight: '800', letterSpacing: 1 },
  small: { borderWidth: 2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  smallLabel: { fontSize: 17, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    borderWidth: 2,
    borderColor: colours.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  choiceSelected: { borderColor: colours.primary, backgroundColor: colours.primary },
  choiceLabel: { fontSize: 17, fontWeight: '700', color: colours.text },
  choiceLabelSelected: { color: colours.onPrimary },
  banner: { borderWidth: 2, borderRadius: 10, padding: 12, marginVertical: 8, gap: 8 },
  bannerText: { fontSize: 17, fontWeight: '600' },
  gpsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  gpsLabel: { fontSize: 17, fontWeight: '800' },
  gpsAccuracy: { fontSize: 17, color: colours.muted },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colours.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayTitle: { fontSize: 36, fontWeight: '800', color: colours.text },
  overlayCount: { fontSize: 140, fontWeight: '800', color: colours.primary },
  overlayDetail: { fontSize: 18, color: colours.muted, marginTop: 8 },
});
