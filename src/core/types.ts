// Shared types for the throw-measurement core. Angles are degrees, distances meters, times ms since epoch.

export interface LatLon {
  lat: number;
  lon: number;
}

/** Position in the local east-north plane around some origin, in meters. */
export interface Local {
  east: number;
  north: number;
}

/** One position report from the phone's location service. */
export interface Fix extends LatLon {
  /** Reported horizontal accuracy radius, meters. */
  accuracyM: number;
  time: number;
  altitudeM?: number;
}

/** A position averaged from several fixes taken while standing still (DGT-POS-002, DGT-POS-004). */
export interface Mark extends LatLon {
  /** Reported (absolute) accuracy of the averaged fixes, meters; for information and the no-lock check. */
  accuracyM: number;
  /** RMS scatter of the fixes about their mean while standing still, meters: the mark's jitter. */
  spreadM: number;
  fixCount: number;
  /** Time of the last fix used. */
  time: number;
  altitudeM?: number;
}
