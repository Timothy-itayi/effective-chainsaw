// Track capture and mapping utilities
// Used for replay-based track mapping workflow

import { TelemetryPacket, TrackPoint, TrackMap, CaptureSession } from '../../shared/types';
import Store from 'electron-store';

const store = new Store();

// Re-export types for backwards compatibility
export type { TrackPoint, TrackMap, CaptureSession };

let captureSession: CaptureSession | null = null;

/**
 * Start a new track capture session
 */
export function startTrackCapture(trackId: string): void {
  captureSession = {
    trackId,
    isActive: true,
    points: [],
    startTime: Date.now(),
  };
  console.log(`Started track capture for: ${trackId}`);
}

/**
 * Stop the current track capture session
 */
export function stopTrackCapture(): void {
  if (captureSession) {
    captureSession.isActive = false;
    console.log(`Stopped track capture. Captured ${captureSession.points.length} points.`);
  }
}

/**
 * Record a telemetry point during capture
 */
export function recordTrackPoint(packet: TelemetryPacket): void {
  if (!captureSession || !captureSession.isActive) {
    return;
  }

  // Debug: log every 100th packet during capture
  if (captureSession.points.length % 100 === 0) {
    console.log(`[TrackCapture] Point ${captureSession.points.length}: pos=(${packet.position?.x?.toFixed(2)}, ${packet.position?.z?.toFixed(2)}), speed=${packet.speedKmh?.toFixed(1)}, lapDist=${packet.lapDistance?.toFixed(1)}`);
  }

  // Only record if speed > 5 km/h (filter out stationary/very slow points)
  if (packet.speedKmh <= 5) {
    return;
  }

  // Skip if position data is missing or zeroed
  if (!packet.position || (packet.position.x === 0 && packet.position.z === 0)) {
    console.log(`[TrackCapture] Skipping point - no position data`);
    return;
  }

  const point: TrackPoint = {
    x: packet.position.x,
    z: packet.position.z,
    d: packet.lapDistance || 0,
    speed: packet.speedKmh,
    timestamp: packet.timestamp,
  };

  captureSession.points.push(point);
}

/**
 * Process captured points into a track map
 */
export function processTrackCapture(): TrackMap | null {
  if (!captureSession || captureSession.points.length === 0) {
    console.log(`[TrackCapture] No capture session or no points`);
    return null;
  }

  const points = captureSession.points;
  console.log(`[TrackCapture] Processing ${points.length} total points`);
  
  // Debug: log first few points
  for (let i = 0; i < Math.min(5, points.length); i++) {
    const p = points[i];
    console.log(`[TrackCapture] Point ${i}: x=${p.x?.toFixed(2)}, z=${p.z?.toFixed(2)}, d=${p.d?.toFixed(2)}, speed=${p.speed?.toFixed(1)}`);
  }
  
  // Filter: only points with speed > 5 km/h
  const filteredPoints = points.filter(p => (p.speed || 0) > 5);
  console.log(`[TrackCapture] After speed filter: ${filteredPoints.length} points`);
  
  if (filteredPoints.length === 0) {
    console.log(`[TrackCapture] No points after filtering`);
    return null;
  }

  // Calculate distance between consecutive points using (x, z) coordinates
  // This is more reliable than lapDistance for replay mapping
  let cumulativeDistance = 0;
  const pointsWithDistance: Array<TrackPoint & { cumulativeD: number }> = [];
  
  for (let i = 0; i < filteredPoints.length; i++) {
    const point = filteredPoints[i];
    if (i > 0) {
      const prev = filteredPoints[i - 1];
      const dx = point.x - prev.x;
      const dz = point.z - prev.z;
      const segmentDistance = Math.sqrt(dx * dx + dz * dz);
      cumulativeDistance += segmentDistance;
    }
    pointsWithDistance.push({ ...point, cumulativeD: cumulativeDistance });
  }

  const trackLength = cumulativeDistance;

  // Downsample: keep points approximately every 0.5-1.0m
  const downsampled: TrackPoint[] = [];
  let lastCumulativeD = -Infinity;
  
  for (const point of pointsWithDistance) {
    if (point.cumulativeD - lastCumulativeD >= 0.5) {
      downsampled.push({
        x: point.x,
        z: point.z,
        d: point.cumulativeD / trackLength, // Normalized 0-1
        speed: point.speed,
        timestamp: point.timestamp,
      });
      lastCumulativeD = point.cumulativeD;
    }
  }

  // If downsampling removed too many points, use all points
  const centerline = downsampled.length > 10 
    ? downsampled 
    : pointsWithDistance.map(p => ({
        x: p.x,
        z: p.z,
        d: p.cumulativeD / trackLength,
        speed: p.speed,
        timestamp: p.timestamp,
      }));

  // Validate track length (should be reasonable for a race track)
  if (trackLength < 100 || trackLength > 50000) {
    console.warn(`Track length ${trackLength.toFixed(1)}m seems invalid. Expected 100-50000m.`);
    // Still return it, but log a warning
  }

  const trackMap: TrackMap = {
    trackId: captureSession.trackId,
    lengthMeters: trackLength,
    centerline,
    sectorFractions: [], // Will be set manually after sector boundary discovery
    capturedAt: new Date().toISOString(),
  };

  console.log(`Processed track map: ${trackMap.trackId}, length: ${trackLength.toFixed(1)}m, points: ${centerline.length}`);
  return trackMap;
}

/**
 * Save a track map to storage
 */
export function saveTrackMap(trackMap: TrackMap): void {
  const key = `trackMap:${trackMap.trackId}`;
  store.set(key, trackMap);
  console.log(`Saved track map for ${trackMap.trackId}`);
}

/**
 * Load a track map from storage
 */
export function loadTrackMap(trackId: string): TrackMap | null {
  const key = `trackMap:${trackId}`;
  const map = store.get(key) as TrackMap | undefined;
  return map || null;
}

/**
 * Find the normalized distance (0-1) along the track for a given position
 * Returns the lap fraction based on nearest centerline point
 */
export function getDistanceAlongTrack(trackMap: TrackMap, posX: number, posZ: number): number {
  if (!trackMap.centerline || trackMap.centerline.length === 0) {
    return 0;
  }

  // Find nearest point on centerline
  let minDistSq = Infinity;
  let nearestFraction = 0;

  for (const point of trackMap.centerline) {
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

/**
 * Get all saved track maps
 */
export function getAllTrackMaps(): TrackMap[] {
  const maps: TrackMap[] = [];
  const keys = store.store;
  
  for (const key in keys) {
    if (key.startsWith('trackMap:')) {
      const map = keys[key] as TrackMap;
      maps.push(map);
    }
  }
  
  return maps;
}

/**
 * Get current capture session status
 */
export function getCaptureStatus(): CaptureSession | null {
  return captureSession;
}

/**
 * Clear current capture session
 */
export function clearCaptureSession(): void {
  captureSession = null;
}

/**
 * Calculate distance along track for a given position
 * Uses nearest point on centerline
 */
export function distanceAlongTrack(x: number, z: number, trackMap: TrackMap): number {
  if (trackMap.centerline.length === 0) {
    return 0;
  }

  // Find nearest point on centerline
  let minDistance = Infinity;
  let nearestPoint: TrackPoint | null = null;

  for (const point of trackMap.centerline) {
    const dx = point.x - x;
    const dz = point.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = point;
    }
  }

  if (!nearestPoint) {
    return 0;
  }

  // Return distance along track (d is normalized 0-1, multiply by length)
  return nearestPoint.d * trackMap.lengthMeters;
}

/**
 * Get lap fraction from position
 */
export function getLapFraction(x: number, z: number, trackMap: TrackMap): number {
  if (trackMap.lengthMeters === 0) {
    return 0;
  }

  const distance = distanceAlongTrack(x, z, trackMap);
  return Math.max(0, Math.min(1, distance / trackMap.lengthMeters));
}

