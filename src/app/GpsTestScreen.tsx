// GPS test (DGT-GPS-007): stand on one spot, record every fix, then show how much marks taken 30 s apart disagree
// with 5, 15 and 30 s holds, and a scatter of where GPS placed the phone.

import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { analyseGpsTest, centred, type GpsTestResult, MIN_TEST_MS, simulateMarks } from '../core/gpsTest.ts';
import type { Fix } from '../core/types.ts';
import { type DistanceUnit, feet, formatDistance } from '../core/units.ts';
import type { Gps } from './gps.ts';
import { BigButton, Choice, colours, GpsBar, SmallButton, styles, useEdgePadding } from './ui.tsx';

const DURATIONS = [
  { value: '2', label: '2 min' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
] as const;

type Duration = (typeof DURATIONS)[number]['value'];

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Where GPS placed the phone: every reading (grey) and the simulated 5 s marks (blue), around their centre. */
function ScatterPlot(props: { fixes: readonly Fix[]; unit: DistanceUnit }) {
  const { fixes, unit } = props;
  const [width, setWidth] = useState(0);
  const raw = centred(fixes);
  const marks = centred(simulateMarks(fixes, 5000));
  // Rings at 3 ft and 10 ft, or 1 m and 3 m.
  const rings = unit === 'ft' ? [feet(3), feet(10)] : [1, 3];
  const extent = Math.max(rings[1] * 1.25, ...raw.map((p) => Math.hypot(p.east, p.north) * 1.1));
  const scale = width / (2 * extent);
  const c = width / 2;
  return (
    <View
      style={{ aspectRatio: 1, borderWidth: 1, borderColor: colours.border, borderRadius: 10, overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Svg width={width} height={width}>
          <Line x1={c} x2={c} y1={0} y2={width} stroke={colours.faint} strokeWidth={1} />
          <Line x1={0} x2={width} y1={c} y2={c} stroke={colours.faint} strokeWidth={1} />
          {rings.map((r) => (
            <Circle key={r} cx={c} cy={c} r={r * scale} fill="none" stroke={colours.border} strokeWidth={1.5} />
          ))}
          {rings.map((r) => (
            <SvgText key={`t${r}`} x={c + r * scale * 0.71 + 4} y={c - r * scale * 0.71 - 4} fontSize={13} fill={colours.muted}>
              {formatDistance(r, unit)}
            </SvgText>
          ))}
          {raw.map((p, i) => (
            <Circle key={`r${i}`} cx={c + p.east * scale} cy={c - p.north * scale} r={2.5} fill="#9aa3ad" />
          ))}
          {marks.map((p, i) => (
            <Circle
              key={`m${i}`}
              cx={c + p.east * scale}
              cy={c - p.north * scale}
              r={7}
              fill={colours.primary}
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

function Results(props: { result: GpsTestResult; fixes: readonly Fix[]; unit: DistanceUnit }) {
  const { result, fixes, unit } = props;
  const h5 = result.holds.find((h) => h.holdMs === 5000);
  const h30 = result.holds.find((h) => h.holdMs === 30000);
  const helps = h5 && h30 && h30.rmsM < 0.7 * h5.rmsM;
  return (
    <View>
      <Text style={styles.h2}>Results ({clock(result.durationMs)}, {result.fixCount} readings)</Text>
      {h5 && (
        <Text style={[styles.body, { fontSize: 20 }]}>
          With a 5 s hold, marks on the same spot were typically{' '}
          <Text style={{ fontWeight: '800' }}>{formatDistance(h5.rmsM, unit)}</Text> off, and up to{' '}
          <Text style={{ fontWeight: '800' }}>{formatDistance(h5.worstSwingM, unit)}</Text> apart.
        </Text>
      )}

      <View style={{ flexDirection: 'row', marginTop: 16, paddingBottom: 6, borderBottomWidth: 1, borderColor: colours.border }}>
        <Text style={[styles.muted, { flex: 1 }]}>Hold</Text>
        <Text style={[styles.muted, { flex: 1, textAlign: 'right' }]}>Typical</Text>
        <Text style={[styles.muted, { flex: 1, textAlign: 'right' }]}>Worst swing</Text>
      </View>
      {result.holds.map((h) => (
        <View key={h.holdMs} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: colours.faint }}>
          <Text style={[styles.body, { flex: 1 }]}>
            {h.holdMs / 1000} s <Text style={styles.muted}>({h.marks} marks)</Text>
          </Text>
          <Text style={[styles.body, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>
            {formatDistance(h.rmsM, unit)}
          </Text>
          <Text style={[styles.body, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>
            {formatDistance(h.worstSwingM, unit)}
          </Text>
        </View>
      ))}
      <Text style={[styles.body, { marginTop: 12 }]}>
        Drift from the first to the last 30 s: {formatDistance(result.driftM, unit)}.
      </Text>
      {h5 && h30 && (
        <Text style={[styles.body, { marginTop: 8 }]}>
          {helps
            ? 'Holding longer helps noticeably on this phone here.'
            : 'Holding longer barely helps: the error is slow wander, not jitter.'}
        </Text>
      )}

      <Text style={styles.h2}>Where GPS put you</Text>
      <ScatterPlot fixes={fixes} unit={unit} />
      <Text style={[styles.muted, { marginTop: 6 }]}>
        Grey: every reading. Blue: a 5 s mark every 30 s. You never moved, so all spread is GPS error.
      </Text>
    </View>
  );
}

export function GpsTestScreen(props: { gps: Gps; now: number; unit: DistanceUnit; onDone: () => void }) {
  useKeepAwake();
  const { gps, now, unit } = props;
  const edges = useEdgePadding();
  const [duration, setDuration] = useState<Duration>('5');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [result, setResult] = useState<GpsTestResult | null | 'too-short'>(null);
  const recorded = useRef<Fix[]>([]);
  const unsubscribe = useRef<(() => void) | null>(null);

  const finish = () => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    const all = [...recorded.current];
    setFixes(all);
    setStartedAt(null);
    setResult(analyseGpsTest(all) ?? 'too-short');
  };

  const start = () => {
    recorded.current = [];
    setFixes([]);
    setResult(null);
    const t0 = Date.now();
    setStartedAt(t0);
    unsubscribe.current = gps.subscribe((f) => {
      if (f.time >= t0 - 1000) recorded.current.push(f);
    });
  };

  // Stop on time, and refresh the reading count while recording.
  const totalMs = Number(duration) * 60_000;
  useEffect(() => {
    if (startedAt === null) return;
    if (now - startedAt >= totalMs) finish();
    else setFixes([...recorded.current]);
  }, [now]);

  useEffect(() => () => unsubscribe.current?.(), []);

  const recording = startedAt !== null;

  return (
    <View style={[styles.screen, edges]}>
      <GpsBar fix={gps.fix} now={now} permission={gps.permission} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={styles.h1}>GPS test</Text>
        {!recording && result === null && (
          <>
            <Text style={[styles.body, { marginTop: 12 }]}>
              Stand on one spot and hold the phone the way you do when marking a disc. The app records GPS the
              whole time, then shows how far apart marks taken 30 s apart would be, with 5, 15 and 30 s holds.
            </Text>
            <Text style={styles.h2}>Length</Text>
            <Choice options={DURATIONS} value={duration} onChange={setDuration} />
          </>
        )}
        {recording && (
          <View style={{ alignItems: 'center', marginTop: 32 }}>
            <Text style={styles.instruction}>Stay on this spot</Text>
            <Text style={{ fontSize: 72, fontWeight: '800', color: colours.primary }}>
              {clock(totalMs - (now - startedAt))}
            </Text>
            <Text style={styles.muted}>{fixes.length} readings so far</Text>
          </View>
        )}
        {result === 'too-short' && (
          <Text style={[styles.body, { marginTop: 16 }]}>
            The test needs at least {MIN_TEST_MS / 60_000} minute of readings. Run it again and let it finish.
          </Text>
        )}
        {result !== null && result !== 'too-short' && <Results result={result} fixes={fixes} unit={unit} />}
      </ScrollView>

      {recording ? (
        <BigButton label="STOP" colour={colours.bad} onPress={finish} />
      ) : (
        <BigButton label={result === null ? 'START TEST' : 'RUN AGAIN'} onPress={start} />
      )}
      {!recording && (
        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <SmallButton label="Back" onPress={props.onDone} colour={colours.muted} />
        </View>
      )}
    </View>
  );
}
