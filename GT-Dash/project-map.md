# GT7 Offline Lap Database & Comparison System

## Feature Overview

Build a local lap storage and comparison system that fills the gap left by GT7's Spec 3 telemetry dashboard - specifically enabling **offline lap comparisons** across different tire compounds, setups, and sessions.

---

## Problem Statement

GT7 Spec 3 introduced a telemetry dashboard, but it only allows lap comparisons when **online**. You cannot:
- Compare your own laps offline
- Compare the same car on different tire compounds
- Compare across different tuning setups
- Track improvement over multiple sessions

**Our solution:** A local SQLite database that captures every lap with full telemetry and metadata, enabling rich offline analysis.

---

## Core Features

### 1. Automatic Lap Capture
- Detect lap completion via `current_lap` field change
- Store full telemetry trace (position, speed, inputs) at ~60Hz
- Auto-tag with car ID and track (derived from coordinates)
- Calculate and store lap time from telemetry

### 2. Lap Metadata & Tagging
```
Lap {
  id: UUID
  timestamp: DateTime
  track_id: String (auto-detected)
  car_id: Int (from GT7 packet)
  lap_time_ms: Int
  tire_compound: Enum (soft/medium/hard/intermediate/wet) [manual tag]
  fuel_start: Float
  fuel_end: Float
  setup_name: String [optional manual tag]
  notes: String [optional]
  weather: Enum (dry/wet/mixed) [manual tag]
  is_valid: Bool (no cuts/penalties)
  telemetry_blob: JSON (full trace data)
}
```

### 3. Track Auto-Detection
- Build coordinate fingerprints for each track
- Match lap start position against known tracks
- Fallback: manual track selection in UI

### 4. Comparison Queries
Example queries the system should support:
- "All Abu Dhabi laps in AMG GT3 '23"
- "Compare Hard vs Medium compound on same track/car"
- "Best lap per tire compound"
- "Progression over last 7 days"
- "All laps within 2 seconds of my PB"

### 5. Visual Comparison
- Overlay multiple lap traces on delta graph
- Color-code by compound or session
- Speed trace comparison
- Throttle/brake overlay
- Sector time breakdown

---

## Data Model

### SQLite Schema

```sql
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  length_km REAL,
  fingerprint_x REAL,  -- Start/finish X coord for detection
  fingerprint_z REAL   -- Start/finish Z coord for detection
);

CREATE TABLE cars (
  id INTEGER PRIMARY KEY,  -- GT7 car_id
  name TEXT,
  manufacturer TEXT,
  category TEXT
);

CREATE TABLE laps (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  track_id TEXT REFERENCES tracks(id),
  car_id INTEGER REFERENCES cars(id),
  lap_time_ms INTEGER NOT NULL,
  tire_compound TEXT CHECK(tire_compound IN ('soft', 'medium', 'hard', 'intermediate', 'wet', 'unknown')),
  fuel_start REAL,
  fuel_end REAL,
  setup_name TEXT,
  notes TEXT,
  weather TEXT CHECK(weather IN ('dry', 'wet', 'mixed', 'unknown')),
  is_valid BOOLEAN DEFAULT 1,
  is_reference BOOLEAN DEFAULT 0,  -- User-marked as reference lap
  session_id TEXT  -- Group laps from same session
);

CREATE TABLE telemetry_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lap_id TEXT REFERENCES laps(id) ON DELETE CASCADE,
  tick INTEGER,  -- Sequence within lap
  pos_x REAL,
  pos_z REAL,
  speed_kmh REAL,
  rpm REAL,
  gear INTEGER,
  throttle REAL,
  brake REAL,
  lap_distance REAL,
  delta_to_reference REAL  -- Calculated field
);

-- Indexes for fast queries
CREATE INDEX idx_laps_track ON laps(track_id);
CREATE INDEX idx_laps_car ON laps(car_id);
CREATE INDEX idx_laps_compound ON laps(tire_compound);
CREATE INDEX idx_telemetry_lap ON telemetry_points(lap_id);
```

---

## UI Components

### 1. Lap List Panel
- Sortable table of all laps
- Columns: Date, Track, Car, Time, Compound, Gap to PB
- Filter dropdowns: Track, Car, Compound, Date range
- Multi-select for comparison
- Right-click context menu: Set as reference, Delete, Edit tags

### 2. Quick Tag Modal
Appears after each lap completion:
```
┌─────────────────────────────────────┐
│  Lap Complete: 2:01.234             │
│                                     │
│  Tire Compound: [Hard ▼]            │
│  Setup Name:    [_______________]   │
│  Notes:         [_______________]   │
│  Weather:       [Dry ▼]             │
│                                     │
│  [ ] Mark as Reference Lap          │
│                                     │
│  [Save]  [Skip]                     │
└─────────────────────────────────────┘
```

### 3. Comparison View
- Select 2-5 laps to compare
- Delta graph with all laps overlaid
- Legend with lap metadata
- Sector breakdown table
- Speed trace overlay
- Mini track map with racing lines colored by lap

### 4. Stats Dashboard
- Personal bests per track/car/compound
- Improvement trends over time
- Consistency metrics (std deviation of lap times)
- Compound performance comparison

---

## Technical Implementation

### Backend Changes (server.py)

```python
# New dependencies
import sqlite3
import uuid
from datetime import datetime

class LapDatabase:
    def __init__(self, db_path="gt7_laps.db"):
        self.conn = sqlite3.connect(db_path)
        self._init_schema()
    
    def save_lap(self, lap_data: dict, telemetry: list):
        """Save completed lap with telemetry trace"""
        pass
    
    def get_laps(self, filters: dict) -> list:
        """Query laps with optional filters"""
        pass
    
    def get_lap_telemetry(self, lap_id: str) -> list:
        """Retrieve full telemetry for a lap"""
        pass
    
    def compare_laps(self, lap_ids: list) -> dict:
        """Generate comparison data for multiple laps"""
        pass
    
    def detect_track(self, start_x: float, start_z: float) -> str:
        """Match coordinates to known track"""
        pass
```

### Frontend Changes (React)

New components needed:
- `<LapList />` - Filterable lap table
- `<LapTagModal />` - Post-lap tagging popup
- `<ComparisonView />` - Multi-lap overlay
- `<StatsPanel />` - Personal records and trends

New state:
```javascript
const [laps, setLaps] = useState([]);
const [selectedLaps, setSelectedLaps] = useState([]);
const [filters, setFilters] = useState({
  track: null,
  car: null,
  compound: null,
  dateRange: null
});
const [showTagModal, setShowTagModal] = useState(false);
const [pendingLap, setPendingLap] = useState(null);
```

### WebSocket Messages

New message types:
```javascript
// Server -> Client: Lap completed, prompt for tagging
{ type: 'lap_complete', data: { lap_id, lap_time_ms, car_id, track_id } }

// Client -> Server: Save lap with tags
{ type: 'save_lap', data: { lap_id, compound, setup_name, notes, weather } }

// Client -> Server: Query laps
{ type: 'get_laps', filters: { track_id, car_id, compound } }

// Server -> Client: Lap list response
{ type: 'laps', data: [...] }

// Client -> Server: Request comparison
{ type: 'compare_laps', lap_ids: [...] }

// Server -> Client: Comparison data
{ type: 'comparison', data: { laps: [...], delta_traces: [...] } }
```

---

## Track Database (Initial)

Seed with common GT7 tracks - fingerprints to be captured on first visit:

| Track | Country | Length |
|-------|---------|--------|
| Spa-Francorchamps | Belgium | 7.004 km |
| Nürburgring GP | Germany | 5.148 km |
| Nürburgring Nordschleife | Germany | 20.832 km |
| Suzuka | Japan | 5.807 km |
| Laguna Seca | USA | 3.602 km |
| Mount Panorama | Australia | 6.213 km |
| Tsukuba | Japan | 2.045 km |
| Deep Forest | Fictional | 3.525 km |
| Trial Mountain | Fictional | 4.583 km |
| Yas Marina (Abu Dhabi) | UAE | 5.281 km |
| Monza | Italy | 5.793 km |
| Brands Hatch | UK | 3.908 km |
| Interlagos | Brazil | 4.309 km |
| Le Mans | France | 13.626 km |
| Daytona Road Course | USA | 5.729 km |
| Watkins Glen | USA | 5.430 km |
| Red Bull Ring | Austria | 4.318 km |
| Barcelona-Catalunya | Spain | 4.655 km |
| Fuji Speedway | Japan | 4.563 km |
| Autopolis | Japan | 4.674 km |

*Note: Fingerprints (X/Z at start/finish) need to be captured empirically.*

---

## Car Database

GT7 provides `car_id` in the packet. Community has mapped these:
- Source: https://github.com/ddm999/gt7info
- ~450+ cars with IDs

Import CSV into SQLite on first run.

---

## Implementation Phases

### Phase 1: Core Storage (Day 1)
- [ ] SQLite schema setup
- [ ] Lap detection & auto-save
- [ ] Basic lap list UI
- [ ] Manual compound tagging

### Phase 2: Track Detection (Day 2)
- [ ] Fingerprint capture mode
- [ ] Auto-detect logic
- [ ] Manual track selection fallback
- [ ] Import car database

### Phase 3: Comparison (Day 3)
- [ ] Multi-lap selection
- [ ] Delta trace overlay
- [ ] Speed comparison graph
- [ ] Sector breakdown

### Phase 4: Polish (Day 4)
- [ ] Stats dashboard
- [ ] Export/import sessions
- [ ] Lap invalidation detection
- [ ] Performance optimization

---

## Open Questions

1. **Tire compound detection** - Can we infer from tire temp patterns? Or always manual?
2. **Setup tracking** - Should we store tune parameters if user exports them?
3. **Session grouping** - Auto-group by time gap, or manual session naming?
4. **Cloud sync** - Future feature to sync across devices?
5. **Replay capture** - Support capturing laps from GT7 replay mode?

---

## Success Criteria

- [ ] Save and retrieve laps offline
- [ ] Compare laps across different compounds
- [ ] See delta graph with multiple reference laps
- [ ] Filter laps by any metadata field
- [ ] Track personal bests per track/car/compound combo
- [ ] Sub-100ms UI response for lap queries

---

GT-Dash/
├─ assets/                          # app icons, static images, etc
├─ dist/                            # build output (generated)
├─ node_modules/                    # generated
├─ src/
│  ├─ main/                         # Electron main process (Node)
│  │  ├─ index.ts                   # main entry: createWindow, init subsystems
│  │  ├─ ipc/                       # IPC handlers (main <-> renderer)
│  │  │  ├─ index.ts                # register all IPC routes
│  │  │  └─ telemetry.ipc.ts         # telemetry-related IPC endpoints
│  │  ├─ udp/                       # GT7 UDP ingest + decode
│  │  │  ├─ index.ts                # exports (public API for udp module)
│  │  │  ├─ listener.ts             # UDP socket bind + heartbeat send
│  │  │  ├─ decrypt/                # crypto isolated from logic
│  │  │  │  ├─ salsa20.ts           # salsa20 implementation
│  │  │  │  └─ gt7Decrypt.ts        # GT7 IV/nonce derivation + magic check
│  │  │  ├─ parse/                  # parsing isolated
│  │  │  │  ├─ parser.ts            # parsePacket()
│  │  │  │  └─ offsets.ts           # offsets per variant (A/B/~), constants
│  │  │  ├─ stream/                 # control “what gets emitted”
│  │  │  │  ├─ telemetry.ts         # startTelemetryReceiver() / orchestration
│  │  │  │  ├─ changeFilter.ts      # epsilon + debounce “only emit changes”
│  │  │  │  └─ smoothing.ts         # optional: EMA / rolling avg (later)
│  │  │  └─ debug/                  # dev-only helpers
│  │  │     ├─ hexdump.ts           # packet dumps for offset hunting
│  │  │     └─ stats.ts             # recv/decrypt/parse counters
│  │  ├─ database/                  # sqlite/lowdb/whatever you’re using
│  │  └─ utils/                     # main-process utils only
│  │
│  ├─ preload/                      # Electron preload (bridge)
│  │  ├─ index.ts                   # contextBridge exposure
│  │  └─ api.ts                     # typed API surface (telemetry subscribe, etc.)
│  │
│  ├─ renderer/                     # React/Vite UI (browser)
│  │  ├─ index.tsx                  # renderer entry
│  │  ├─ app/                       # app shell/layout/routes
│  │  ├─ features/
│  │  │  └─ telemetry/
│  │  │     ├─ TelemetryPanel.tsx   # UI component
│  │  │     ├─ useTelemetry.ts      # hook: subscribe + store
│  │  │     └─ format.ts            # formatting helpers
│  │  └─ styles/
│  │
│  ├─ shared/                       # shared types/constants (safe for both sides)
│  │  ├─ types/
│  │  │  └─ telemetry.ts            # TelemetryPacket type
│  │  ├─ constants/
│  │  │  └─ gt7.ts                  # GT7_MAGIC, SALSA20_KEY, ports, etc.
│  │  └─ index.ts
│  │
│  └─ tests/                        # unit tests for parser/filter (optional)
│
├─ main.js                           # if still used as electron entry (legacy)
├─ test-udp.js                        # standalone runner (keep at root)
├─ README.md
├─ TESTING.md
├─ QUICK_START.md
├─ tsconfig.json
├─ package.json
└─ package-lock.json


## References

- GT7 Telemetry Packet Structure: https://github.com/MacManley/gt7-udp
- Car ID Database: https://github.com/ddm999/gt7info
- Existing Dashboard: https://github.com/snipem/gt7dashboard
- GTPlanet Telemetry Thread: https://www.gtplanet.net/forum/threads/overview-of-gt7-telemetry-software.418011/