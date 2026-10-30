// The field workflow (Section 2.1): Set Tee, Set Line, then Mark Disc / review / Confirm for each throw.

import { useKeepAwake } from 'expo-keep-awake';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { crossRangeSigmaAt, lineDirectionSigmaRad } from '../core/geometry.ts';
import { DEFAULT_DRIFT_LIMIT_M, gpsStatus, isLowQuality, type MarkQuality } from '../core/gps.ts';
import { teeDriftM } from '../core/marks.ts';
import { sessionStats } from '../core/stats.ts';
import type { Mark, ThrowType } from '../core/types.ts';
import { type DistanceUnit, formatCrossRange, formatDistance, roundedDistance } from '../core/units.ts';
import { initialWorkflow, type MarkTarget, type Notice, step, type WorkflowEvent } from '../core/workflow.ts';
import {
  addThrow,
  createSession,
  type Db,
  type DiscRow,
  endSession,
  type SessionRow,
  setThrowDeleted,
  type ThrowRow,
} from './db.ts';
import { type Gps, useMarker } from './gps.ts';
import { Banner, BigButton, Choice, colours, GpsBar, MarkingOverlay, SmallButton, styles } from './ui.tsx';

const THROW_TYPES = [
  { value: 'backhand', label: 'Backhand' },
  { value: 'forehand', label: 'Forehand' },
] as const;

const DEG = 180 / Math.PI;

function qualityText(quality: Exclude<MarkQuality, 'steady'>, spreadM: number, unit: DistanceUnit): string {
  switch (quality) {
    case 'unsteady':
      return `GPS readings jumped around by ${formatDistance(spreadM, unit)} while marking.`;
    case 'no-lock':
      return 'No satellite lock: the position may be far off.';
    case 'unchecked':
      return 'Too few GPS readings to check they were steady.';
  }
}

function noticeText(n: Notice, unit: DistanceUnit): string {
  switch (n.kind) {
    case 'no-fixes':
      return 'No GPS readings arrived. Check GPS is on, then try again.';
    case 'baseline-too-short':
      return `The aim point is only ${formatDistance(n.baselineM, unit)} from the tee. Walk further toward your target and set the line again.`;
    case 'mark-quality':
      return `${n.what === 'tee' ? 'Tee' : 'Aim point'}: ${qualityText(n.quality, n.spreadM, unit)} You can set it again.`;
  }
}

export function SessionScreen(props: {
  db: Db;
  gps: Gps;
  now: number;
  unit: DistanceUnit;
  disc: DiscRow;
  resume: { session: SessionRow; throws: ThrowRow[] } | null;
  lastThrowType: ThrowType;
  onThrowType: (t: ThrowType) => void;
  onEnd: (sessionId: number | null) => void;
}) {
  useKeepAwake(); // DGT-NFR-004
  const { db, gps, now, unit, disc, resume } = props;
  const [wf, setWf] = useState(() =>
    resume
      ? step(initialWorkflow(props.lastThrowType), { type: 'restore', tee: resume.session.tee, aim: resume.session.aim })
      : initialWorkflow(props.lastThrowType),
  );
  const [sessionId, setSessionId] = useState<number | null>(resume?.session.id ?? null);
  const [throws, setThrows] = useState<ThrowRow[]>(resume?.throws ?? []);
  const [driftM, setDriftM] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const creating = useRef(false);
  const marker = useMarker(gps);

  const dispatch = (e: WorkflowEvent) => setWf((s) => step(s, e));
  const fail = (what: string, e: unknown) => Alert.alert(`Could not ${what}`, String(e));

  // The session is saved as soon as the line is set (DGT-SES-003).
  useEffect(() => {
    const s = wf.stage;
    if (s.name !== 'throw' || sessionId !== null || creating.current) return;
    creating.current = true;
    createSession(db, disc.id, s.tee, s.aim)
      .then(setSessionId)
      .catch((e: unknown) => fail('save the session', e))
      .finally(() => {
        creating.current = false;
      });
  }, [wf.stage, sessionId, db, disc.id]);

  const mark = (target: MarkTarget, then: (m: Mark) => void) =>
    marker.start(target, (m) => (m ? then(m) : dispatch({ type: 'mark-failed', what: target })));

  const resetTee = () => {
    if (sessionId !== null) endSession(db, sessionId).catch((e: unknown) => fail('end the session', e));
    setSessionId(null);
    setThrows([]);
    setDriftM(null);
    dispatch({ type: 'reset-tee' });
  };

  const confirm = async () => {
    const s = wf.stage;
    if (s.name !== 'review' || sessionId === null || saving) return;
    setSaving(true);
    try {
      const row = await addThrow(db, {
        sessionId,
        time: s.disc.time,
        throwType: s.throwType,
        disc: s.disc,
        downrangeM: s.measurement.downrangeM,
        crossRangeM: s.measurement.crossRangeM,
        totalM: s.measurement.totalM,
        lowQuality: isLowQuality(s.disc),
      });
      setThrows((t) => [...t, row]);
      dispatch({ type: 'confirm' });
      props.onThrowType(s.throwType);
    } catch (e) {
      fail('save the throw', e);
    } finally {
      setSaving(false);
    }
  };

  const toggleDeleted = (t: ThrowRow) =>
    Alert.alert(`Throw ${t.seq}`, t.deleted ? 'Restore this throw?' : 'Delete this throw from the session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: t.deleted ? 'Restore' : 'Delete',
        style: t.deleted ? 'default' : 'destructive',
        onPress: () => {
          setThrowDeleted(db, t.id, !t.deleted)
            .then(() => setThrows((all) => all.map((x) => (x.id === t.id ? { ...x, deleted: !t.deleted } : x))))
            .catch((e: unknown) => fail('update the throw', e));
        },
      },
    ]);

  const end = () =>
    Alert.alert('End session?', throws.length === 0 ? 'No throws were logged.' : `${throws.length} throws logged.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        onPress: () => {
          const id = sessionId;
          (id === null ? Promise.resolve() : endSession(db, id))
            .then(() => props.onEnd(throws.length > 0 ? id : null))
            .catch((e: unknown) => fail('end the session', e));
        },
      },
    ]);

  const noFix = gpsStatus(gps.fix, now) === 'no-fix';
  const s = wf.stage;
  const notice = wf.notice && (
    <Banner tone="warn" action={<SmallButton label="OK" onPress={() => dispatch({ type: 'dismiss-notice' })} />}>
      {noticeText(wf.notice, unit)}
    </Banner>
  );

  let body: ReactNode;
  let primary: ReactNode;
  let secondary: ReactNode = null;

  if (s.name === 'tee') {
    body = <Text style={styles.instruction}>Stand on the tee, then tap Set Tee.</Text>;
    primary = (
      <BigButton
        label={noFix ? 'WAITING FOR GPS' : 'SET TEE'}
        disabled={noFix}
        onPress={() => mark('tee', (m) => dispatch({ type: 'tee-marked', mark: m }))}
      />
    );
    secondary = <SmallButton label="Cancel" onPress={() => props.onEnd(null)} colour={colours.muted} />;
  } else if (s.name === 'line') {
    body = (
      <Text style={styles.instruction}>
        Walk toward your target, ideally {unit === 'ft' ? '200 ft' : '60 m'} or more, then tap Set Line.
      </Text>
    );
    primary = (
      <BigButton
        label={noFix ? 'WAITING FOR GPS' : 'SET LINE'}
        disabled={noFix}
        onPress={() => mark('aim', (m) => dispatch({ type: 'aim-marked', mark: m }))}
      />
    );
    secondary = (
      <>
        <SmallButton label="Set tee again" onPress={resetTee} colour={colours.muted} />
        <SmallButton label="Cancel" onPress={() => props.onEnd(null)} colour={colours.muted} />
      </>
    );
  } else if (s.name === 'short-line') {
    const sigma = lineDirectionSigmaRad(s.tee.spreadM, s.aim.spreadM, s.line.baselineM);
    body = (
      <Banner tone="warn">
        This line is only {formatDistance(s.line.baselineM, unit)} long. Its direction is good to about ±
        {(sigma * DEG).toFixed(1)}°. Walking further makes it more precise.
      </Banner>
    );
    primary = <BigButton label="USE THIS LINE" onPress={() => dispatch({ type: 'accept-line' })} />;
    secondary = (
      <SmallButton label="Walk further, set again" onPress={() => dispatch({ type: 'redo-line' })} colour={colours.muted} />
    );
  } else if (s.name === 'throw') {
    const sigma = lineDirectionSigmaRad(s.tee.spreadM, s.aim.spreadM, s.line.baselineM);
    const atHundred = crossRangeSigmaAt(sigma, unit === 'ft' ? 91.44 : 100);
    const stats = sessionStats(throws);
    const kept = throws.filter((t) => !t.deleted);
    body = (
      <>
        <Text style={styles.muted}>
          Line {formatDistance(s.line.baselineM, unit)} at {Math.round(s.line.bearingDeg)}°, direction ±
          {(sigma * DEG).toFixed(1)}° (±{formatDistance(atHundred, unit)} at {unit === 'ft' ? '300 ft' : '100 m'})
        </Text>
        {driftM !== null && (
          <Banner
            tone={driftM > DEFAULT_DRIFT_LIMIT_M ? 'warn' : 'good'}
            action={<SmallButton label="OK" onPress={() => setDriftM(null)} />}
          >
            {driftM > DEFAULT_DRIFT_LIMIT_M
              ? `GPS has drifted ${formatDistance(driftM, unit)} since the tee was set. Measurements now carry that error; consider setting a new tee and line.`
              : `GPS has drifted ${formatDistance(driftM, unit)} since the tee was set. Measurements are still good.`}
          </Banner>
        )}
        <Text style={styles.instruction}>Throw, walk to your disc, then tap Mark Disc.</Text>
        {kept.length > 0 && stats.all.downrange && (
          <Text style={styles.body}>
            {kept.length} throw{kept.length === 1 ? '' : 's'} · best {formatDistance(stats.all.downrange.max, unit)} ·
            average {formatDistance(stats.all.downrange.mean, unit)}
          </Text>
        )}
        {[...throws].reverse().map((t) => (
          <Pressable key={t.id} onLongPress={() => toggleDeleted(t)} delayLongPress={400}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderColor: colours.faint,
                opacity: t.deleted ? 0.35 : 1,
              }}
            >
              <Text style={[styles.body, { width: 40 }]}>{t.seq}</Text>
              <Text style={[styles.body, { fontWeight: '700', width: 90 }]}>{formatDistance(t.downrangeM, unit)}</Text>
              <Text style={[styles.body, { flex: 1 }]}>{formatCrossRange(t.crossRangeM, unit)}</Text>
              <Text style={styles.muted}>
                {t.throwType === 'backhand' ? 'BH' : 'FH'}
                {t.lowQuality ? ' ⚠' : ''}
              </Text>
            </View>
          </Pressable>
        ))}
        {throws.length > 0 && <Text style={[styles.muted, { marginTop: 8 }]}>Long-press a throw to delete it.</Text>}
      </>
    );
    primary = (
      <BigButton
        label={noFix ? 'WAITING FOR GPS' : 'MARK DISC'}
        disabled={noFix}
        onPress={() => mark('disc', (m) => dispatch({ type: 'disc-marked', mark: m }))}
      />
    );
    secondary = (
      <>
        <SmallButton label="Check tee" onPress={() => mark('tee-check', (m) => setDriftM(teeDriftM(s.tee, m)))} />
        <SmallButton label="New tee" onPress={resetTee} colour={colours.muted} />
        <SmallButton label="End" onPress={end} colour={colours.muted} />
      </>
    );
  } else {
    // Review (DGT-THR-001, -002, -007, -008, -009; layout in requirements Section 4.3.1).
    const warned = s.quality !== 'steady';
    body = (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 120, fontWeight: '800', color: colours.text, marginTop: 8 }}>
          {roundedDistance(s.measurement.downrangeM, unit)}
          <Text style={{ fontSize: 44 }}> {unit}</Text>
        </Text>
        <Text style={[styles.muted, { fontSize: 20 }]}>downrange</Text>
        <Text style={[styles.body, { fontSize: 22, marginTop: 16 }]}>
          {formatCrossRange(s.measurement.crossRangeM, unit)} · total {formatDistance(s.measurement.totalM, unit)}
        </Text>
        {s.quality !== 'steady' && (
          <View style={{ alignSelf: 'stretch' }}>
            <Banner tone="warn">{qualityText(s.quality, s.disc.spreadM, unit)} Re-measure if unsure.</Banner>
          </View>
        )}
        <View style={{ alignSelf: 'stretch', marginTop: 24 }}>
          <Choice
            options={THROW_TYPES}
            value={s.throwType}
            onChange={(t) => dispatch({ type: 'set-throw-type', throwType: t })}
          />
        </View>
      </View>
    );
    primary = (
      <BigButton
        label={warned ? 'CONFIRM ANYWAY' : 'CONFIRM'}
        disabled={saving || sessionId === null}
        colour={colours.good}
        onPress={() => {
          confirm().catch(() => {});
        }}
      />
    );
    secondary = (
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
        <SmallButton
          label="Re-measure"
          onPress={() => {
            dispatch({ type: 'discard' });
            mark('disc', (m) => dispatch({ type: 'disc-marked', mark: m }));
          }}
          colour={colours.muted}
        />
        <SmallButton label="Discard" onPress={() => dispatch({ type: 'discard' })} colour={colours.bad} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingBottom: 16 }]}>
      <GpsBar fix={gps.fix} now={now} unit={unit} permission={gps.permission} />
      <Text style={[styles.h1, { fontSize: 22 }]}>
        {disc.name}
        {s.name === 'throw' || s.name === 'review' ? ` · throw ${throws.length + 1}` : ''}
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {notice}
        {body}
      </ScrollView>
      {primary}
      {secondary && <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>{secondary}</View>}
      {marker.marking && (
        <MarkingOverlay marking={marker.marking} settleMs={marker.settleMs} onCancel={marker.cancel} />
      )}
    </View>
  );
}
