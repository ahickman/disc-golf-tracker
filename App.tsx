// Field prototype (milestone 2): start screen -> session workflow -> session report, with everything saved to the
// phone as it happens.

import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DistanceUnit } from './src/core/units.ts';
import {
  type Db,
  type DiscRow,
  endSession,
  loadSettings,
  openDb,
  openSession,
  saveDisc,
  saveSetting,
  type SessionRow,
  sessionThrows,
  type Settings,
  type ThrowRow,
} from './src/app/db.ts';
import { useGps, useNow } from './src/app/gps.ts';
import { GpsTestScreen } from './src/app/GpsTestScreen.tsx';
import { HistoryScreen } from './src/app/HistoryScreen.tsx';
import { ReportScreen } from './src/app/ReportScreen.tsx';
import { SessionScreen } from './src/app/SessionScreen.tsx';
import { SettingsScreen } from './src/app/SettingsScreen.tsx';
import { StartScreen } from './src/app/StartScreen.tsx';
import { styles } from './src/app/ui.tsx';

type Unfinished = { session: SessionRow; throws: ThrowRow[] };

type Route =
  | { name: 'start' }
  | { name: 'session'; disc: DiscRow; resume: Unfinished | null }
  | { name: 'history'; disc: DiscRow }
  | { name: 'gps-test' }
  | { name: 'settings' }
  /** `from`: the disc history to go back to, when opened from there. */
  | { name: 'report'; sessionId: number; from?: DiscRow };

export default function App() {
  const gps = useGps();
  const now = useNow();
  const [db, setDb] = useState<Db | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [unfinished, setUnfinished] = useState<Unfinished | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'start' });
  const [error, setError] = useState<string | null>(null);

  const refreshUnfinished = useCallback(async (d: Db) => {
    const session = await openSession(d);
    setUnfinished(session ? { session, throws: await sessionThrows(d, session.id) } : null);
  }, []);

  useEffect(() => {
    (async () => {
      const d = await openDb();
      setSettings(await loadSettings(d));
      await refreshUnfinished(d);
      setDb(d);
    })().catch((e: unknown) => setError(String(e)));
  }, [refreshUnfinished]);

  if (error !== null) {
    return (
      <View style={[styles.screen, { paddingTop: 48 }]}>
        <Text style={styles.h1}>Something went wrong</Text>
        <Text style={styles.body}>{error}</Text>
      </View>
    );
  }
  if (db === null || settings === null) {
    return (
      <View style={[styles.screen, { paddingTop: 48 }]}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const report = (e: unknown) => setError(String(e));

  const changeSetting = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    for (const [key, value] of Object.entries(patch)) {
      saveSetting(db, key as keyof Settings, String(value)).catch(report);
    }
  };

  const backToStart = () => {
    refreshUnfinished(db)
      .then(() => setRoute({ name: 'start' }))
      .catch(report);
  };

  const start = async (name: string) => {
    if (unfinished) await endSession(db, unfinished.session.id);
    setUnfinished(null);
    const disc = await saveDisc(db, name);
    changeSetting({ lastDiscId: disc.id });
    setRoute({ name: 'session', disc, resume: null });
  };

  const endUnfinished = async () => {
    if (!unfinished) return;
    await endSession(db, unfinished.session.id);
    const id = unfinished.session.id;
    const hadThrows = unfinished.throws.length > 0;
    setUnfinished(null);
    setRoute(hadThrows ? { name: 'report', sessionId: id } : { name: 'start' });
  };

  let screen;
  switch (route.name) {
    case 'start':
      screen = (
        <StartScreen
          db={db}
          gps={gps}
          now={now}
          lastDiscId={settings.lastDiscId}
          unfinished={unfinished && { session: unfinished.session, throwCount: unfinished.throws.length }}
          onStart={(name) => {
            start(name).catch(report);
          }}
          onResume={() => unfinished && setRoute({ name: 'session', disc: unfinished.session.disc, resume: unfinished })}
          onEndUnfinished={() => {
            endUnfinished().catch(report);
          }}
          onHistory={(disc) => setRoute({ name: 'history', disc })}
          onSettings={() => setRoute({ name: 'settings' })}
          onDiscDeleted={(discId) => {
            if (settings.lastDiscId === discId) changeSetting({ lastDiscId: null });
            refreshUnfinished(db).catch(report);
          }}
        />
      );
      break;
    case 'session':
      screen = (
        <SessionScreen
          db={db}
          gps={gps}
          now={now}
          unit={settings.unit}
          disc={route.disc}
          resume={route.resume}
          overlay={settings.overlay}
          onOverlayChange={(overlay) => changeSetting({ overlay })}
          onEnd={(id) => (id === null ? backToStart() : setRoute({ name: 'report', sessionId: id }))}
        />
      );
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          unit={settings.unit}
          onUnitChange={(unit: DistanceUnit) => changeSetting({ unit })}
          onGpsTest={() => setRoute({ name: 'gps-test' })}
          onDone={backToStart}
        />
      );
      break;
    case 'gps-test':
      screen = (
        <GpsTestScreen gps={gps} now={now} unit={settings.unit} onDone={() => setRoute({ name: 'settings' })} />
      );
      break;
    case 'history': {
      const disc = route.disc;
      screen = (
        <HistoryScreen
          db={db}
          disc={disc}
          unit={settings.unit}
          onOpenSession={(sessionId) => setRoute({ name: 'report', sessionId, from: disc })}
          onDone={backToStart}
        />
      );
      break;
    }
    case 'report': {
      const from = route.from;
      screen = (
        <ReportScreen
          db={db}
          sessionId={route.sessionId}
          unit={settings.unit}
          doneLabel={from ? 'BACK' : 'DONE'}
          onDone={from ? () => setRoute({ name: 'history', disc: from }) : backToStart}
        />
      );
      break;
    }
  }

  return (
    <SafeAreaProvider>
      {screen}
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
