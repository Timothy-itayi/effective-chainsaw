// udp/parser.ts
import { TelemetryPacket } from '../../shared/types';

const MIN_PACKET_LEN = 296;

function has(data: Buffer, offset: number, bytes: number): boolean {
  return data.length >= offset + bytes;
}

function guessVariant(len: number): 'A' | 'B' | '~' | 'unknown' {
  if (len >= 344) return '~';
  if (len >= 316) return 'B';
  if (len >= 296) return 'A';
  return 'unknown';
}

export type ParsedTelemetry = TelemetryPacket & {
  packetByteLength: number;
  packetVariant: 'A' | 'B' | '~' | 'unknown';
  lapCountRaw: number; // debug: what we read at 0x74
};

export function parsePacket(data: Buffer): ParsedTelemetry | null {
  if (data.length < MIN_PACKET_LEN) return null;

  const packetVariant = guessVariant(data.length);

  const position = {
    x: has(data, 0x04, 4) ? data.readFloatLE(0x04) : 0,
    y: has(data, 0x08, 4) ? data.readFloatLE(0x08) : 0,
    z: has(data, 0x0C, 4) ? data.readFloatLE(0x0C) : 0,
  };

  const rpm = has(data, 0x3C, 4) ? data.readFloatLE(0x3C) : 0;

  const fuelLevel = has(data, 0x44, 4) ? data.readFloatLE(0x44) : 0;
  const fuelCapacity = has(data, 0x48, 4) ? data.readFloatLE(0x48) : 0;

  const speedMs = has(data, 0x4C, 4) ? data.readFloatLE(0x4C) : 0;
  const speedKmh = speedMs * 3.6;

  const packetId = has(data, 0x70, 4) ? data.readInt32LE(0x70) : 0;

  // Lap count at 0x74 is much more reliable for packet "A"
  const lapCountRaw = has(data, 0x74, 2) ? data.readInt16LE(0x74) : 0;

  const bestLapTime = has(data, 0x78, 4) ? data.readInt32LE(0x78) : 0;
  const lastLapTime = has(data, 0x7C, 4) ? data.readInt32LE(0x7C) : 0;

  // Gears packed byte
  let gear = 0;
  if (has(data, 0x90, 1)) {
    const gearsByte = data.readUInt8(0x90);
    const current = gearsByte & 0x0f;
    gear = current === 15 ? 0 : current;
  }

  const throttle = has(data, 0x91, 1) ? data.readUInt8(0x91) / 255.0 : 0;
  const brake = has(data, 0x92, 1) ? data.readUInt8(0x92) / 255.0 : 0;

  // Tire temperatures (offset 0x60-0x6F: FL, FR, RL, RR as floats)
  // Note: GT7 may use different offsets - if temps are always undefined, check alternative offsets
  let tireTemperatures: { frontLeft: number; frontRight: number; rearLeft: number; rearRight: number } | undefined;
  if (has(data, 0x60, 16)) {
    const fl = data.readFloatLE(0x60);
    const fr = data.readFloatLE(0x64);
    const rl = data.readFloatLE(0x68);
    const rr = data.readFloatLE(0x6C);
    
    // Include if values are reasonable (not NaN, not Infinity)
    // Allow 0 and negative values as they might be valid (cold tires, etc.)
    if (!isNaN(fl) && !isNaN(fr) && !isNaN(rl) && !isNaN(rr) &&
        isFinite(fl) && isFinite(fr) && isFinite(rl) && isFinite(rr)) {
      // Additional sanity check: tire temps should be in reasonable range (-50 to 200°C)
      if (fl >= -50 && fl <= 200 && fr >= -50 && fr <= 200 &&
          rl >= -50 && rl <= 200 && rr >= -50 && rr <= 200) {
        tireTemperatures = { frontLeft: fl, frontRight: fr, rearLeft: rl, rearRight: rr };
      }
    }
  }

  // Flags at 0x8E - bit 0 might indicate race mode
  const flags = has(data, 0x8E, 2) ? data.readUInt16LE(0x8E) : 0;
  // Simplified session type detection - may need refinement
  const sessionType = (flags & 0x01) ? 'race' : 'time_trial';

  // Optional "bigger packet" fields (guarded)
  const currentLapAlt = has(data, 0x120, 2) ? data.readInt16LE(0x120) : 0;
  const carId = has(data, 0x124, 4) ? data.readInt32LE(0x124) : 0;
  const lapDistance = has(data, 0x12C, 4) ? data.readFloatLE(0x12C) : 0;

  // Pick the best lap indicator:
  // - If 0x120 gives a non-zero, trust it
  // - Otherwise fall back to lapCountRaw
  // NOTE: depending on mode, lapCountRaw might be “completed laps”.
  // If it stays 0 while driving your first lap in TT, that’s expected.
  const currentLap = currentLapAlt > 0 ? currentLapAlt : Math.max(0, lapCountRaw);

  return {
    position,
    speedKmh,
    rpm,
    gear,
    throttle,
    brake,
    currentLap,
    lapDistance,
    lastLapTime: lastLapTime === -1 ? 0 : lastLapTime,
    bestLapTime: bestLapTime === -1 ? 0 : bestLapTime,
    carId,
    fuelCapacity,
    fuelLevel,
    tireTemperatures,
    sessionType,
    packetId,
    timestamp: Date.now(),

    packetByteLength: data.length,
    packetVariant,
    lapCountRaw,
  };
}
