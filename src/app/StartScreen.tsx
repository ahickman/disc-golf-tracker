// Start a session: name the disc (DGT-SES-001, DGT-DSC-003), or resume (DGT-SES-004). Units are in settings.
// Also opens a disc's history (DGT-RPT-003) and deletes discs with a long press (DGT-DSC-002).

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { type Db, deleteDisc, discUsage, type DiscRow, recentDiscs, type SessionRow } from './db.ts';
import type { Gps } from './gps.ts';
import { Banner, BigButton, colours, GpsBar, MenuButton, SmallButton, styles, useEdgePadding } from './ui.tsx';

export function StartScreen(props: {
  db: Db;
  gps: Gps;
  now: number;
  lastDiscId: number | null;
  unfinished: { session: SessionRow; throwCount: number } | null;
  onStart: (name: string) => void;
  onResume: () => void;
  onEndUnfinished: () => void;
  onHistory: (disc: DiscRow) => void;
  onDiscDeleted: (discId: number) => void;
  onSettings: () => void;
}) {
  const { db, gps, now, unfinished } = props;
  const [discs, setDiscs] = useState<DiscRow[]>([]);
  const [name, setName] = useState('');
  const [reload, setReload] = useState(0);
  const edges = useEdgePadding();

  useEffect(() => {
    let live = true;
    recentDiscs(db, 20)
      .then((list) => {
        if (!live) return;
        setDiscs(list);
        const last = list.find((d) => d.id === props.lastDiscId) ?? list[0];
        if (last) setName(last.name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [db, props.lastDiscId, reload]);

  const canStart = name.trim().length > 0;
  const selected = discs.find((d) => d.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

  const confirmDelete = (d: DiscRow) => {
    discUsage(db, d.id)
      .then((usage) => {
        const what =
          usage.sessions === 0
            ? 'It has no sessions.'
            : `This also deletes its ${usage.sessions} session${usage.sessions === 1 ? '' : 's'} and ${usage.throws} throw${usage.throws === 1 ? '' : 's'}.`;
        Alert.alert(`Delete ${d.name}?`, `${what} This cannot be undone.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteDisc(db, d.id)
                .then(() => {
                  if (d.name.toLowerCase() === name.trim().toLowerCase()) setName('');
                  props.onDiscDeleted(d.id);
                  setReload((n) => n + 1);
                })
                .catch((e: unknown) => Alert.alert('Could not delete the disc', String(e)));
            },
          },
        ]);
      })
      .catch((e: unknown) => Alert.alert('Could not delete the disc', String(e)));
  };

  return (
    <ScrollView style={{ backgroundColor: colours.background }} contentContainerStyle={[styles.screen, edges]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.h1}>Disc Golf Tracker</Text>
        <MenuButton onPress={props.onSettings} />
      </View>
      <GpsBar fix={gps.fix} now={now} permission={gps.permission} />

      {unfinished && (
        <Banner
          tone="warn"
          action={
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <SmallButton label="Resume" onPress={props.onResume} />
              <SmallButton label="End it" onPress={props.onEndUnfinished} colour={colours.muted} />
            </View>
          }
        >
          Unfinished session: {unfinished.session.disc.name}, {unfinished.throwCount} throw
          {unfinished.throwCount === 1 ? '' : 's'}
        </Banner>
      )}

      <Text style={styles.h2}>Disc</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Leopard DX"
        placeholderTextColor={colours.muted}
        autoCapitalize="words"
        style={{
          borderWidth: 2,
          borderColor: colours.border,
          borderRadius: 10,
          padding: 14,
          fontSize: 20,
          color: colours.text,
        }}
      />
      {discs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {discs.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => setName(d.name)}
              onLongPress={() => confirmDelete(d)}
              delayLongPress={500}
              style={{
                backgroundColor: d.id === selected?.id ? colours.primary : colours.faint,
                borderRadius: 16,
                paddingVertical: 8,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ fontSize: 16, color: d.id === selected?.id ? colours.onPrimary : colours.text }}>
                {d.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {discs.length > 0 && <Text style={[styles.muted, { marginTop: 8 }]}>Long-press a disc to delete it.</Text>}
      {selected && (
        <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
          <SmallButton label={`${selected.name} history`} onPress={() => props.onHistory(selected)} />
        </View>
      )}

      <View style={{ marginTop: 32 }}>
        <BigButton label="START SESSION" onPress={() => props.onStart(name)} disabled={!canStart} />
      </View>
    </ScrollView>
  );
}
