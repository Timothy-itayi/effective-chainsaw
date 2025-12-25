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

