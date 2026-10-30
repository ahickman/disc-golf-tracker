// One disc's history (DGT-RPT-003): all-time figures, every throw on the plot, and its sessions, newest first.
// Tap a session to open its report.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { sessionStats } from '../core/stats.ts';
import { type DistanceUnit, formatCrossRange, formatDistance } from '../core/units.ts';
import { type Db, type DiscRow, discSessions, type PastThrow, pastThrows, type SessionSummary } from './db.ts';
import { ThrowPlot } from './ThrowPlot.tsx';
import { BigButton, colours, styles, useEdgePadding } from './ui.tsx';

function dateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function HistoryScreen(props: {
  db: Db;
  disc: DiscRow;
  unit: DistanceUnit;
  onOpenSession: (sessionId: number) => void;
  onDone: () => void;
}) {
  const { db, disc, unit } = props;
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [throws, setThrows] = useState<PastThrow[]>([]);
  const edges = useEdgePadding();

  useEffect(() => {
    let live = true;
    Promise.all([discSessions(db, disc.id), pastThrows(db, null, disc.id, 5000)])
      .then(([s, t]) => {
        if (!live) return;
        setSessions(s);
        setThrows(t);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [db, disc.id]);

  const stats = sessionStats(throws.map((t) => ({ ...t, lowQuality: false, deleted: false })));
  const withThrows = (sessions ?? []).filter((s) => s.throwCount > 0);

  return (
    <View style={[styles.screen, edges]}>
      <ScrollView style={{ flex: 1 }}>
        <Text style={styles.h1}>{disc.name}</Text>
        <Text style={styles.muted}>
          {withThrows.length} session{withThrows.length === 1 ? '' : 's'} · {stats.count} throw
          {stats.count === 1 ? '' : 's'}
        </Text>

        {stats.downrange && stats.crossRange && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <View>
              <Text style={styles.muted}>Longest</Text>
              <Text style={[styles.body, { fontSize: 24, fontWeight: '800' }]}>
                {formatDistance(stats.downrange.max, unit)}
              </Text>
            </View>
            <View>
              <Text style={styles.muted}>Average</Text>
              <Text style={[styles.body, { fontSize: 24, fontWeight: '800' }]}>
                {formatDistance(stats.downrange.mean, unit)}
              </Text>
            </View>
            <View>
              <Text style={styles.muted}>Average miss</Text>
              <Text style={[styles.body, { fontSize: 24, fontWeight: '800' }]}>
                {formatDistance(stats.crossRange.meanAbs, unit)}
              </Text>
            </View>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <ThrowPlot
            unit={unit}
            current={throws.map((t) => ({
              key: String(t.id),
              downrangeM: t.downrangeM,
              crossRangeM: t.crossRangeM,
              label: `${dateTime(t.time)} · ${formatDistance(t.downrangeM, unit)} · ${formatCrossRange(t.crossRangeM, unit)}`,
            }))}
          />
        </View>

        <Text style={styles.h2}>Sessions</Text>
        {sessions === null && <Text style={styles.muted}>Loading…</Text>}
        {sessions !== null && withThrows.length === 0 && <Text style={styles.muted}>No throws logged yet.</Text>}
        {withThrows.map((s) => (
          <Pressable key={s.id} onPress={() => props.onOpenSession(s.id)}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: colours.faint,
              }}
            >
              <View>
                <Text style={[styles.body, { fontWeight: '700' }]}>{dateTime(s.startedAt)}</Text>
                <Text style={styles.muted}>
                  {s.throwCount} throw{s.throwCount === 1 ? '' : 's'}
                  {s.endedAt === null ? ' · unfinished' : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.body}>best {s.bestM === null ? '—' : formatDistance(s.bestM, unit)}</Text>
                <Text style={styles.muted}>avg {s.averageM === null ? '—' : formatDistance(s.averageM, unit)}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ marginTop: 16 }}>
        <BigButton label="BACK" onPress={props.onDone} />
      </View>
    </View>
  );
}
