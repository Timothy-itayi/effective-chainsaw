// Track detection and lookup
// Offline GT7 track list (explicit layouts, no fingerprints assumed)

export interface TrackInfo {
  id: string;
  name: string;
  region: string;
  fingerprintX?: number;
  fingerprintZ?: number;
}

const tracks: TrackInfo[] = [
  // ─────────────────────────────
  // Europe
  // ─────────────────────────────
  { id: 'brands_hatch_gp', name: 'Brands Hatch GP Circuit', region: 'UK' },
  { id: 'brands_hatch_indy', name: 'Brands Hatch Indy Circuit', region: 'UK' },

  { id: 'monza', name: 'Autodromo Nazionale Monza', region: 'Italy' },

  { id: 'spa', name: 'Circuit de Spa-Francorchamps', region: 'Belgium' },

  { id: 'le_mans', name: 'Circuit de la Sarthe', region: 'France' },
  { id: 'le_mans_no_chicane', name: 'Circuit de la Sarthe (No Chicane)', region: 'France' },

  { id: 'barcelona_gp', name: 'Circuit de Barcelona-Catalunya GP', region: 'Spain' },
  { id: 'barcelona_national', name: 'Circuit de Barcelona-Catalunya National', region: 'Spain' },

  { id: 'red_bull_ring', name: 'Red Bull Ring', region: 'Austria' },

  { id: 'goodwood', name: 'Goodwood Motor Circuit', region: 'UK' },

  { id: 'nurburgring_gp', name: 'Nürburgring GP', region: 'Germany' },
  { id: 'nurburgring_gp_no_chicane', name: 'Nürburgring GP (No Chicane)', region: 'Germany' },
  { id: 'nurburgring_nordschleife', name: 'Nürburgring Nordschleife', region: 'Germany' },
  { id: 'nurburgring_24h', name: 'Nürburgring 24h', region: 'Germany' },

  // ─────────────────────────────
  // Americas
  // ─────────────────────────────
  { id: 'laguna_seca', name: 'WeatherTech Raceway Laguna Seca', region: 'USA' },

  { id: 'daytona_road', name: 'Daytona Road Course', region: 'USA' },
  { id: 'daytona_tri_oval', name: 'Daytona Tri-Oval', region: 'USA' },

  { id: 'watkins_glen', name: 'Watkins Glen International', region: 'USA' },

  { id: 'willow_springs_big', name: 'Willow Springs Big Willow', region: 'USA' },
  { id: 'willow_springs_streets', name: 'Streets of Willow Springs', region: 'USA' },
  { id: 'willow_springs_horse_thief', name: 'Horse Thief Mile', region: 'USA' },

  { id: 'interlagos', name: 'Autódromo José Carlos Pace', region: 'Brazil' },

  // ─────────────────────────────
  // Asia / Oceania
  // ─────────────────────────────
  { id: 'suzuka', name: 'Suzuka Circuit', region: 'Japan' },
  { id: 'suzuka_east', name: 'Suzuka East Course', region: 'Japan' },

  { id: 'fuji', name: 'Fuji Speedway', region: 'Japan' },

  { id: 'autopolis', name: 'Autopolis International Racing Course', region: 'Japan' },
  { id: 'autopolis_short', name: 'Autopolis Short Course', region: 'Japan' },

  { id: 'tsukuba', name: 'Tsukuba Circuit', region: 'Japan' },

  { id: 'mount_panorama', name: 'Mount Panorama Motor Racing Circuit', region: 'Australia' },

  { id: 'yas_marina', name: 'Yas Marina Circuit', region: 'UAE' },

  // ─────────────────────────────
  // City / Street Circuits
  // ─────────────────────────────
  { id: 'tokyo_expressway_central', name: 'Tokyo Expressway – Central', region: 'Japan' },
  { id: 'tokyo_expressway_east', name: 'Tokyo Expressway – East', region: 'Japan' },
  { id: 'tokyo_expressway_south', name: 'Tokyo Expressway – South', region: 'Japan' },

  { id: 'high_speed_ring', name: 'High Speed Ring', region: 'Fictional' },

  // ─────────────────────────────
  // Gran Turismo Originals
  // ─────────────────────────────
  { id: 'deep_forest', name: 'Deep Forest Raceway', region: 'Fictional' },
  { id: 'trial_mountain', name: 'Trial Mountain Circuit', region: 'Fictional' },
  { id: 'grand_valley', name: 'Grand Valley Highway 1', region: 'Fictional' },
  { id: 'broad_bean', name: 'Broad Bean Raceway', region: 'Fictional' },

  // ─────────────────────────────
  // Dirt / Rally (Offline)
  // ─────────────────────────────
  { id: 'fishermans_ranch', name: "Fisherman's Ranch", region: 'Fictional' },
  { id: 'sardegna_rally', name: 'Sardegna Windmills', region: 'Italy' },
  { id: 'colorado_springs', name: 'Colorado Springs', region: 'USA' },

  // ─────────────────────────────
  // Special
  // ─────────────────────────────
  { id: 'northern_isle', name: 'Northern Isle Speedway', region: 'Fictional' },
];

export function detectTrack(x: number, z: number): TrackInfo | null {
  // Placeholder for coordinate fingerprint detection
  // Intentionally returns null until fingerprints are established
  return null;
}

export function getTrackById(id: string): TrackInfo | undefined {
  return tracks.find(t => t.id === id);
}

export function getAllTracks(): TrackInfo[] {
  return tracks;
}

/**
 * Get tracks grouped by region
 */
export function getTracksByRegion(): Record<string, TrackInfo[]> {
  const grouped: Record<string, TrackInfo[]> = {};
  
  for (const track of tracks) {
    if (!grouped[track.region]) {
      grouped[track.region] = [];
    }
    grouped[track.region].push(track);
  }
  
  return grouped;
}

/**
 * Get all unique regions
 */
export function getAllRegions(): string[] {
  const regions = new Set(tracks.map(t => t.region));
  return Array.from(regions).sort();
}
