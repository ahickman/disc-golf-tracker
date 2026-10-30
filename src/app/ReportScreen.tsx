// End-of-session report (DGT-RPT-001, DGT-RPT-002).

import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { throwColour } from '../core/plot.ts';
import { sessionStats, type Summary } from '../core/stats.ts';
import { type DistanceUnit, formatCrossRange, formatDistance } from '../core/units.ts';
import { type Db, getSession, type SessionRow, sessionThrows, type ThrowRow } from './db.ts';
import { ThrowPlot } from './ThrowPlot.tsx';
import { BigButton, colours, styles, ThrowBadge, useEdgePadding } from './ui.tsx';

function time(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Row(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={styles.muted}>{props.label}</Text>
      <Text style={[styles.body, { fontWeight: '700' }]}>{props.value}</Text>
    </View>
  );
}

function SummaryBlock(props: { title: string; s: Summary; unit: DistanceUnit }) {
  const { s, unit } = props;
  if (!s.downrange || !s.crossRange) return null;
  const sd = (v: number | null) => (v === null ? '—' : formatDistance(v, unit));
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.h2}>
        {props.title} ({s.count})
      </Text>
      <Row label="Longest" value={formatDistance(s.downrange.max, unit)} />
      <Row label="Average" value={formatDistance(s.downrange.mean, unit)} />
      <Row label="Median" value={formatDistance(s.downrange.median, unit)} />
      <Row label="Distance spread (SD)" value={sd(s.downrange.sd)} />
      <Row label="Left/right bias" value={formatCrossRange(s.crossRange.mean, unit)} />
      <Row label="Left/right spread (SD)" value={sd(s.crossRange.sd)} />
      <Row label="Average miss off line" value={formatDistance(s.crossRange.meanAbs, unit)} />
      <Row
        label={`Within ±${unit === 'ft' ? '20 ft' : '6 m'} of line`}
        value={`${Math.round(s.withinCorridorPct ?? 0)}%`}
      />
    </View>
  );
}

export function ReportScreen(props: {
  db: Db;
  sessionId: number;
  unit: DistanceUnit;
  doneLabel?: string;
  onDone: () => void;
}) {
  const { db, sessionId, unit } = props;
  const [session, setSession] = useState<SessionRow | null>(null);
  const [throws, setThrows] = useState<ThrowRow[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([getSession(db, sessionId), sessionThrows(db, sessionId)])
      .then(([s, t]) => {
        if (!live) return;
        setSession(s);
        setThrows(t);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [db, sessionId]);

  const stats = sessionStats(throws);
  const edges = useEdgePadding();

  return (
    <View style={[styles.screen, edges]}>
      <ScrollView style={{ flex: 1 }}>
        <Text style={styles.h1}>Session report</Text>
        {session && (
          <Text style={styles.muted}>
            {session.disc.name} · {new Date(session.startedAt).toLocaleDateString()} {time(session.startedAt)}
            {session.endedAt !== null ? `–${time(session.endedAt)}` : ''}
          </Text>
        )}
        <View style={{ marginTop: 16 }}>
          <ThrowPlot
            unit={unit}
            current={throws
              .filter((t) => !t.deleted)
              .map((t) => ({
                key: String(t.id),
                downrangeM: t.downrangeM,
                crossRangeM: t.crossRangeM,
                label: `Throw ${t.seq} · ${formatDistance(t.downrangeM, unit)} · ${formatCrossRange(t.crossRangeM, unit)}`,
                number: t.seq,
                colour: throwColour(t.seq, throws.length),
              }))}
          />
        </View>
        <SummaryBlock title="Throws" s={stats} unit={unit} />

        <Text style={styles.h2}>All throws</Text>
        {throws.map((t) => (
          <View
            key={t.id}
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderColor: colours.faint,
              opacity: t.deleted ? 0.35 : 1,
            }}
          >
            <ThrowBadge seq={t.seq} colour={throwColour(t.seq, throws.length)} faded={t.deleted} />
            <Text style={[styles.muted, { width: 52 }]}>{time(t.time)}</Text>
            <Text style={[styles.body, { fontWeight: '700', width: 80 }]}>{formatDistance(t.downrangeM, unit)}</Text>
            <Text style={[styles.body, { flex: 1 }]}>{formatCrossRange(t.crossRangeM, unit)}</Text>
            <Text style={styles.muted}>
              {t.lowQuality ? '⚠' : ''}
              {t.deleted ? ' deleted' : ''}
            </Text>
          </View>
        ))}
        {throws.some((t) => t.lowQuality) && (
          <Text style={[styles.muted, { marginTop: 8 }]}>⚠ GPS readings were unsteady when the disc was marked.</Text>
        )}
      </ScrollView>
      <View style={{ marginTop: 16 }}>
        <BigButton label={props.doneLabel ?? 'DONE'} onPress={props.onDone} />
      </View>
    </View>
  );
}
