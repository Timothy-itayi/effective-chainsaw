// Track capture and mapping utilities
// Used for replay-based track mapping workflow

import { TelemetryPacket } from '../../shared/types';
import Store from 'electron-store';

const store = new Store();

export interface TrackPoint {
  x: number;
  z: number;
  d: number; // distance along track
  speed?: number; // km/h
  timestamp?: number;
}

export interface TrackMap {
  trackId: string;
  lengthMeters: number;
  centerline: TrackPoint[];
  sectorFractions: number[]; // e.g., [0.32, 0.67] for sector boundaries
  capturedAt: string;
}

export interface CaptureSession {
  trackId: string;
  isActive: boolean;
  points: TrackPoint[];
  startTime: number;
}

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

  // Only record if speed > 5 km/h (filter out stationary/very slow points)
  if (packet.speedKmh <= 5) {
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
    return null;
  }

  const points = captureSession.points;
  
  // Filter: only points with speed > 5 km/h
  const filteredPoints = points.filter(p => (p.speed || 0) > 5);
  
  if (filteredPoints.length === 0) {
    return null;
  }

  // Downsample: keep every Nth point (approximately every 0.5-1.0m)
  // Simple approach: keep every point that's at least 0.5m further along
  const downsampled: TrackPoint[] = [];
  let lastDistance = -Infinity;
  
  for (const point of filteredPoints) {
    if (point.d - lastDistance >= 0.5) {
      downsampled.push(point);
      lastDistance = point.d;
    }
  }

  // Calculate track length (use max distance or sum of distances)
  const trackLength = downsampled.length > 0
    ? Math.max(...downsampled.map(p => p.d))
    : 0;

  // Normalize distances along track (0 to 1)
  const centerline: TrackPoint[] = downsampled.map((point, index) => ({
    x: point.x,
    z: point.z,
    d: trackLength > 0 ? point.d / trackLength : index / downsampled.length,
    speed: point.speed,
    timestamp: point.timestamp,
  }));

  const trackMap: TrackMap = {
    trackId: captureSession.trackId,
    lengthMeters: trackLength,
    centerline,
    sectorFractions: [], // Will be set manually after sector boundary discovery
    capturedAt: new Date().toISOString(),
  };

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

