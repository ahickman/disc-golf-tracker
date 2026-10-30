// Shared types for the throw-measurement core. Angles are degrees, distances metres, times ms since epoch.

export interface LatLon {
  lat: number;
  lon: number;
}

/** Position in the local east-north plane around some origin, in metres. */
export interface Local {
  east: number;
  north: number;
}

/** One position report from the phone's location service. */
export interface Fix extends LatLon {
  /** Reported horizontal accuracy radius, metres. */
  accuracyM: number;
  time: number;
  altitudeM?: number;
}

/** A position averaged from several fixes taken while standing still (DGT-POS-002, DGT-POS-004). */
export interface Mark extends LatLon {
  /** Combined accuracy estimate of the averaged fixes, metres. */
  accuracyM: number;
  fixCount: number;
  /** Time of the last fix used. */
  time: number;
  altitudeM?: number;
}

export type ThrowType = 'backhand' | 'forehand';
