// Live GPS (DGT-GPS-001, DGT-GPS-003) and taking marks over a settling window (DGT-POS-002, DGT-POS-003).

import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { averageFixes, DEFAULT_SETTLE_MS, isMarkComplete } from '../core/marks.ts';
import type { Fix, Mark } from '../core/types.ts';
import type { MarkTarget } from '../core/workflow.ts';

export type Permission = 'asking' | 'granted' | 'approximate' | 'denied';

export interface Gps {
  permission: Permission;
  fix: Fix | null;
  /** Called with every new fix; returns an unsubscribe function. */
  subscribe: (listener: (fix: Fix) => void) => () => void;
}

/** Watches position at the highest accuracy while the app is open (foreground only, DGT-NFR-005). */
export function useGps(): Gps {
  const [permission, setPermission] = useState<Permission>('asking');
  const [fix, setFix] = useState<Fix | null>(null);
  const listeners = useRef(new Set<(fix: Fix) => void>());

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
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          const f: Fix = {
            lat: location.coords.latitude,
            lon: location.coords.longitude,
            accuracyM: location.coords.accuracy ?? Number.POSITIVE_INFINITY,
            time: location.timestamp,
            altitudeM: location.coords.altitude ?? undefined,
          };
          setFix(f);
          for (const l of listeners.current) l(f);
        },
      );
      if (cancelled) subscription.remove();
    })().catch(() => {
      if (!cancelled) setPermission('denied');
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  const subscribe = useCallback((listener: (fix: Fix) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { permission, fix, subscribe };
}

export interface MarkInProgress {
  target: MarkTarget;
  elapsedMs: number;
  fixCount: number;
}

export interface Marker {
  marking: MarkInProgress | null;
  settleMs: number;
  /** Collect fixes until the window completes, then call `onDone` with the averaged mark (null if no fixes). */
  start: (target: MarkTarget, onDone: (mark: Mark | null) => void) => void;
  cancel: () => void;
}

export function useMarker(gps: Gps, settleMs: number = DEFAULT_SETTLE_MS): Marker {
  const [marking, setMarking] = useState<MarkInProgress | null>(null);
  const stop = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    stop.current?.();
    stop.current = null;
    setMarking(null);
  }, []);

  const start = useCallback(
    (target: MarkTarget, onDone: (mark: Mark | null) => void) => {
      stop.current?.();
      const startedAt = Date.now();
      const fixes: Fix[] = [];
      setMarking({ target, elapsedMs: 0, fixCount: 0 });
      // Allow a second for clock differences; anything older is a cached position from before the tap.
      const unsubscribe = gps.subscribe((f) => {
        if (f.time >= startedAt - 1000) fixes.push(f);
      });
      const timer = setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        if (isMarkComplete(fixes.length, elapsedMs, settleMs)) {
          clearInterval(timer);
          unsubscribe();
          stop.current = null;
          setMarking(null);
          onDone(averageFixes(fixes));
        } else {
          setMarking({ target, elapsedMs, fixCount: fixes.length });
        }
      }, 200);
      stop.current = () => {
        clearInterval(timer);
        unsubscribe();
      };
    },
    [gps.subscribe, settleMs],
  );

  useEffect(() => () => stop.current?.(), []);

  return { marking, settleMs, start, cancel };
}

/** Re-renders every second, for staleness checks. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
