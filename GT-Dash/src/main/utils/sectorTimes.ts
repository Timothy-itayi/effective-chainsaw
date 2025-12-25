// sectorTimes.ts
import { TrackMap, TrackPoint } from '../../shared/types';

export interface SectorData {
  sector1Time?: number; // ms (undefined until sector 1 is complete)
  sector2Time?: number; // ms (undefined until sector 2 is complete)
  sector3Time?: number; // ms (undefined until sector 3 is complete)
  currentSector: 1 | 2 | 3;
  lapFraction: number; // 0..1
  lapLengthMeters?: number;
}

/**
 * Find the normalized distance (0-1) along the track for a given position
 * Returns the lap fraction based on nearest centerline point
 */
function getDistanceAlongTrack(centerline: TrackPoint[], posX: number, posZ: number): number {
  if (!centerline || centerline.length === 0) {
    return 0;
  }

  // Find nearest point on centerline
  let minDistSq = Infinity;
  let nearestFraction = 0;

  for (const point of centerline) {
    const dx = posX - point.x;
    const dz = posZ - point.z;
    const distSq = dx * dx + dz * dz;
    
    if (distSq < minDistSq) {
      minDistSq = distSq;
      nearestFraction = point.d; // d is already normalized 0-1
    }
  }

  return nearestFraction;
}

interface SectorState {
  // Lap tracking
  lastLapCountRaw: number;       // completed laps counter (0x74)
  lapStartTs: number;

  // Track length estimation
  lapLengthMeters?: number;
  lastLastLapTimeMs: number;

  // Sector boundaries (fractions)
  s1End: number;
  s2End: number;

  // Sector timing
  currentSector: 1 | 2 | 3;
  s1Ts?: number;
  s2Ts?: number;
  s3Ts?: number;

  sector1TimeMs: number;
  sector2TimeMs: number;
  sector3TimeMs: number;

  // Anti-jitter
  lastLapDistance: number;
}

const states = new Map<number, SectorState>(); // keyed by carId (good enough for single car)

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function calculateSectorTimes(input: {
  carId: number;
  lapCountRaw: number;     // use parser lapCountRaw (0x74)
  lapDistance: number;     // parser lapDistance (may be 0 in some modes)
  lastLapTimeMs: number;   // parser lastLapTime (ms)
  positionX?: number;      // position.x for track map lookup
  positionZ?: number;      // position.z for track map lookup
  trackMap?: TrackMap;     // full track map with centerline for position-based distance
  now?: number;
}): SectorData | null {
  const now = input.now ?? Date.now();
  const { carId, lapCountRaw, lapDistance, lastLapTimeMs, trackMap, positionX, positionZ } = input;

  if (!carId) return null;

  let st = states.get(carId);
  if (!st) {
    st = {
      lastLapCountRaw: lapCountRaw,
      lapStartTs: now,
      lapLengthMeters: undefined,
      lastLastLapTimeMs: 0,
      s1End: 0.33,
      s2End: 0.66,
      currentSector: 1,
      sector1TimeMs: 0,
      sector2TimeMs: 0,
      sector3TimeMs: 0,
      lastLapDistance: lapDistance,
    };
    states.set(carId, st);
  }

  // Use track map if available (more accurate than learning from lapDistance)
  if (trackMap && trackMap.lengthMeters > 0) {
    st.lapLengthMeters = trackMap.lengthMeters;
    // Use track map sector fractions if available
    if (trackMap.sectorFractions && trackMap.sectorFractions.length >= 2) {
      st.s1End = trackMap.sectorFractions[0];
      st.s2End = trackMap.sectorFractions[1];
    }
  }
  
  // Detect lap completion via lapCountRaw increment
  // lapCountRaw is usually "completed laps", which is stable for timing.
  if (lapCountRaw !== st.lastLapCountRaw) {
    // Lap rolled over. If lastLapTimeMs is updated, we can learn lap length.
    // Use the lapDistance observed near rollover as a lap length estimate.
    // Only do this if we don't have a track map
    if (!trackMap && lastLapTimeMs > 0 && lastLapTimeMs !== st.lastLastLapTimeMs) {
      // Only accept sane lap lengths
      if (lapDistance > 500 && lapDistance < 50000) {
        st.lapLengthMeters = lapDistance;
      }
      st.lastLastLapTimeMs = lastLapTimeMs;
    } else if (trackMap) {
      // Track map provides length, just update last lap time
      st.lastLastLapTimeMs = lastLapTimeMs;
    }

    // Reset sector timing for new lap
    st.lastLapCountRaw = lapCountRaw;
    st.lapStartTs = now;
    st.currentSector = 1;
    st.s1Ts = undefined;
    st.s2Ts = undefined;
    st.s3Ts = undefined;
    st.sector1TimeMs = 0;
    st.sector2TimeMs = 0;
    st.sector3TimeMs = 0;
  }

  // If lapDistance ever goes backwards hard (telemetry reset), restart lap timing
  if (lapDistance + 50 < st.lastLapDistance) {
    st.lapStartTs = now;
    st.currentSector = 1;
    st.s1Ts = undefined;
    st.s2Ts = undefined;
    st.s3Ts = undefined;
    st.sector1TimeMs = 0;
    st.sector2TimeMs = 0;
    st.sector3TimeMs = 0;
  }
  st.lastLapDistance = lapDistance;

  // Compute lap fraction - prefer position-based when lapDistance is 0
  let lapFraction = 0;
  if (trackMap?.centerline && positionX !== undefined && positionZ !== undefined) {
    // Use position-based distance from track map centerline
    lapFraction = getDistanceAlongTrack(trackMap.centerline, positionX, positionZ);
  } else if (st.lapLengthMeters && lapDistance > 0) {
    // Fall back to lapDistance if available
    lapFraction = clamp01(lapDistance / st.lapLengthMeters);
  }

  // Sector transitions: only meaningful once we have a way to compute lap fraction
  if (st.lapLengthMeters && (lapFraction > 0 || (trackMap?.centerline && trackMap.centerline.length > 0))) {
    if (st.currentSector === 1 && lapFraction >= st.s1End) {
      st.sector1TimeMs = now - st.lapStartTs;
      st.s1Ts = now;
      st.currentSector = 2;
    } else if (st.currentSector === 2 && lapFraction >= st.s2End) {
      st.sector2TimeMs = st.s1Ts ? now - st.s1Ts : 0;
      st.s2Ts = now;
      st.currentSector = 3;
    }
  }

  // Current sector running time
  let runningMs = 0;
  if (st.currentSector === 1) runningMs = now - st.lapStartTs;
  if (st.currentSector === 2) runningMs = st.s1Ts ? now - st.s1Ts : 0;
  if (st.currentSector === 3) runningMs = st.s2Ts ? now - st.s2Ts : 0;

  // Update sector 3 time when in sector 3 (even if not at end of lap yet)
  if (st.currentSector === 3 && st.s2Ts) {
    st.sector3TimeMs = runningMs;
  }

  return {
    sector1Time: st.sector1TimeMs > 0 ? st.sector1TimeMs : undefined,
    sector2Time: st.sector2TimeMs > 0 ? st.sector2TimeMs : undefined,
    sector3Time: st.sector3TimeMs > 0 ? st.sector3TimeMs : undefined,
    currentSector: st.currentSector,
    lapFraction,
    lapLengthMeters: st.lapLengthMeters,
  };
}

export function resetSectorTimesForCar(carId: number) {
  states.delete(carId);
}
