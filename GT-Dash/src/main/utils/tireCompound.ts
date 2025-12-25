// Tire compound detection
// GT7 doesn't provide compound directly in UDP packets (not discovered yet)
// Temperature-based inference is unreliable and has been removed

export type TireCompound = 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet' | 'unknown';

export function inferTireCompound(
  temps: { frontLeft: number; frontRight: number; rearLeft: number; rearRight: number } | undefined
): TireCompound | undefined {
  // Tire compound cannot be reliably inferred from temperature alone.
  // GT7 UDP packet structure doesn't expose compound directly (not yet discovered).
  // Return undefined - UI will show "UNKNOWN" until we discover the actual field.
  return undefined;
}

