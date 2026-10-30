// Settings, opened from the menu icon on the start screen: things set once, such as units (DGT-UNI-001).

import { Text, View } from 'react-native';

import type { DistanceUnit } from '../core/units.ts';
import { BigButton, Choice, styles, useEdgePadding } from './ui.tsx';

const UNITS = [
  { value: 'm', label: 'Meters' },
  { value: 'ft', label: 'Feet' },
] as const;

export function SettingsScreen(props: {
  unit: DistanceUnit;
  onUnitChange: (unit: DistanceUnit) => void;
  onDone: () => void;
}) {
  const edges = useEdgePadding();
  return (
    <View style={[styles.screen, edges]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.h1}>Settings</Text>
        <Text style={styles.h2}>Units</Text>
        <Choice options={UNITS} value={props.unit} onChange={props.onUnitChange} />
        <Text style={[styles.muted, { marginTop: 8 }]}>
          Changes how distances are shown everywhere. Saved throws are not affected.
        </Text>
      </View>
      <BigButton label="DONE" onPress={props.onDone} />
    </View>
  );
}
