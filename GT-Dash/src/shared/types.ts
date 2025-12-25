// Shared types between main and renderer processes

export interface TelemetryPacket {
  // Core position and movement
  position: {
    x: number;
    y: number;
    z: number;
  };
  speedKmh: number;
  rpm: number;
  gear: number;
  
  // Inputs
  throttle: number;
  brake: number;
  
  // Lap tracking
  currentLap: number;
  lapDistance: number;
  lastLapTime: number;
  bestLapTime: number;
  
  // Car info
  carId: number;
  fuelCapacity: number;
  fuelLevel: number;
  
  // Tire data
  tireTemperatures?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  tireCompound?: 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet' | 'unknown';
  
  // Session info
  sessionType?: 'race' | 'time_trial' | 'practice' | 'qualifying' | 'unknown';
  
  // Sector times (calculated)
  sector1Time?: number;
  sector2Time?: number;
  sector3Time?: number;
  currentSector?: 1 | 2 | 3;
  
  // Track info (detected)
  trackName?: string;
  trackRegion?: string;
  
  // Car name (looked up)
  carName?: string;
  
  // Additional useful fields
  packetId: number;
  timestamp: number;
}

export interface Lap {
  id: string;
  createdAt: string;
  trackId: string | null;
  carId: number;
  lapTimeMs: number;
  tireCompound: 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet' | 'unknown' | null;
  fuelStart: number | null;
  fuelEnd: number | null;
  setupName: string | null;
  notes: string | null;
  weather: 'dry' | 'wet' | 'mixed' | 'unknown' | null;
  isValid: boolean;
  isReference: boolean;
  sessionId: string | null;
}

export interface TelemetryPoint {
  id?: number;
  lapId: string;
  tick: number;
  posX: number;
  posZ: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  lapDistance: number;
  deltaToReference: number | null;
}

export interface ConnectionStatus {
  connected: boolean;
  psIP: string | null;
  lastPacketTime: number | null;
}

export interface LapFilters {
  trackId?: string;
  carId?: number;
  tireCompound?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface Settings {
  psIP: string;
  autoSaveLaps: boolean;
  defaultTireCompound: string;
}

export interface TrackPoint {
  x: number;
  z: number;
  d: number; // normalized distance along track (0-1)
  speed?: number;
  timestamp?: number;
}

export interface TrackMap {
  trackId: string;
  lengthMeters: number;
  centerline: TrackPoint[];
  sectorFractions: number[]; // [s1End, s2End] as fractions 0-1
  capturedAt: string;
}

export interface CaptureSession {
  trackId: string;
  points: TrackPoint[];
  startTime: number;
  isActive: boolean;
}
