// First build: a GPS check screen showing live accuracy against the warning threshold (DGT-GPS-001..003).
// The throw workflow (Set Tee / Set Line / Mark Disc) replaces it in milestone 2.

import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { classifyFix, DEFAULT_WARN_THRESHOLD_M, type GpsQuality } from './src/core/gps.ts';
import type { Fix } from './src/core/types.ts';
import { type DistanceUnit, formatAccuracy } from './src/core/units.ts';

const UNIT: DistanceUnit = 'm';

type Permission = 'asking' | 'granted' | 'approximate' | 'denied';

const QUALITY_LABEL: Record<GpsQuality, string> = {
  good: 'GOOD',
  marginal: 'MARGINAL',
  poor: 'POOR',
  'no-fix': 'NO FIX',
};

const QUALITY_COLOUR: Record<GpsQuality, string> = {
  good: '#0a7d2c',
  marginal: '#b36b00',
  poor: '#c0161d',
  'no-fix': '#555555',
};

export default function App() {
  const [permission, setPermission] = useState<Permission>('asking');
  const [fix, setFix] = useState<Fix | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;
    (async () => {
      const response = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (response.status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission(response.android?.accuracy === 'coarse' ? 'approximate' : 'granted');
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (location) =>
          setFix({
            lat: location.coords.latitude,
            lon: location.coords.longitude,
            accuracyM: location.coords.accuracy ?? Number.POSITIVE_INFINITY,
            time: location.timestamp,
            altitudeM: location.coords.altitude ?? undefined,
          }),
      );
      if (cancelled) subscription.remove();
    })().catch(() => {
      if (!cancelled) setPermission('denied');
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      subscription?.remove();
      clearInterval(timer);
    };
  }, []);

  const quality = classifyFix(fix, now);
  const ageS = fix === null ? null : Math.max(0, Math.round((now - fix.time) / 1000));

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>GPS check</Text>

      {permission === 'denied' && (
        <Text style={styles.warning}>Location permission denied. Allow precise location in Android settings.</Text>
      )}
      {permission === 'approximate' && (
        <Text style={styles.warning}>Only approximate location allowed. Switch to precise location in settings.</Text>
      )}

      <Text style={[styles.quality, { color: QUALITY_COLOUR[quality] }]}>{QUALITY_LABEL[quality]}</Text>
      <Text style={styles.accuracy}>
        {fix !== null && Number.isFinite(fix.accuracyM) ? formatAccuracy(fix.accuracyM, UNIT) : '—'}
      </Text>
      <Text style={styles.detail}>warning above {formatAccuracy(DEFAULT_WARN_THRESHOLD_M, UNIT)} (10 ft)</Text>

      {fix !== null && (
        <View style={styles.details}>
          <Text style={styles.detail}>
            {fix.lat.toFixed(6)}, {fix.lon.toFixed(6)}
          </Text>
          <Text style={styles.detail}>last fix {ageS} s ago</Text>
        </View>
      )}

      <Text style={styles.footer}>Throw tracking arrives in the next build.</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '600', color: '#000000', marginBottom: 32 },
  warning: { fontSize: 18, color: '#c0161d', textAlign: 'center', marginBottom: 24 },
  quality: { fontSize: 44, fontWeight: '800' },
  accuracy: { fontSize: 96, fontWeight: '800', color: '#000000' },
  details: { marginTop: 24, alignItems: 'center' },
  detail: { fontSize: 18, color: '#333333' },
  footer: { position: 'absolute', bottom: 40, fontSize: 14, color: '#777777' },
});
