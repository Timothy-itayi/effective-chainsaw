# GT7 Delta Dashboard - Electron Architecture

## Overview

A standalone desktop application that bundles the GT7 telemetry receiver, lap database, and dashboard UI into a single distributable package. No Python required for end users - pure JavaScript/TypeScript stack.

---

## Why Electron

1. **Single executable** - Users download one file, double-click, done
2. **Cross-platform** - Windows, macOS, Linux from same codebase
3. **Native capabilities** - UDP sockets, SQLite, file system access
4. **Familiar stack** - React frontend, Node.js backend
5. **No Python dependency** - Rewrite UDP listener in Node.js
6. **Offline-first** - Works without internet connection

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    IPC     ┌─────────────────────────────────┐│
│  │   Main      │◄──────────►│         Renderer                ││
│  │  Process    │            │         (React App)             ││
│  │             │            │                                 ││
│  │ - UDP Server│            │ - Dashboard UI                  ││
│  │ - SQLite DB │            │ - Lap List                      ││
│  │ - Salsa20   │            │ - Comparison View               ││
│  │ - File I/O  │            │ - Settings                      ││
│  └──────┬──────┘            └─────────────────────────────────┘│
│         │                                                       │
│         │ UDP (port 33740)                                      │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
    ┌───────────┐
    │   PS4/5   │
    │   GT7     │
    └───────────┘
```

---

## Project Structure

```
gt7-delta-dashboard/
├── package.json
├── electron-builder.yml        # Build/package config
├── tsconfig.json
│
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # Entry point
│   │   ├── udp/
│   │   │   ├── listener.ts     # UDP socket handler
│   │   │   ├── parser.ts       # Packet parsing
│   │   │   └── salsa20.ts      # Decryption
│   │   ├── database/
│   │   │   ├── index.ts        # Database connection
│   │   │   ├── schema.ts       # Table definitions
│   │   │   ├── laps.ts         # Lap CRUD operations
│   │   │   └── migrations.ts   # Schema migrations
│   │   ├── ipc/
│   │   │   └── handlers.ts     # IPC message handlers
│   │   └── utils/
│   │       ├── trackDetection.ts
│   │       └── carDatabase.ts
│   │
│   ├── preload/
│   │   └── index.ts            # Context bridge API
│   │
│   ├── renderer/               # React frontend
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Dashboard/
│   │   │   ├── LapList/
│   │   │   ├── Comparison/
│   │   │   ├── Settings/
│   │   │   └── common/
│   │   ├── hooks/
│   │   │   ├── useTelemetry.ts
│   │   │   ├── useLaps.ts
│   │   │   └── useSettings.ts
│   │   ├── stores/             # Zustand or similar
│   │   │   ├── telemetryStore.ts
│   │   │   └── lapStore.ts
│   │   └── styles/
│   │
│   └── shared/                 # Shared types/constants
│       ├── types.ts
│       └── constants.ts
│
├── assets/
│   ├── icon.ico               # Windows icon
│   ├── icon.icns              # macOS icon
│   ├── icon.png               # Linux icon
│   └── cars.csv               # Car database
│
├── scripts/
│   ├── build.js
│   └── notarize.js            # macOS notarization
│
└── dist/                      # Build output
```

---

## Main Process (Node.js)

### UDP Listener (No Python!)

Rewrite the UDP listener in pure Node.js:

```typescript
// src/main/udp/listener.ts
import dgram from 'dgram';
import { decrypt } from './salsa20';
import { parsePacket } from './parser';

export class GT7Listener {
  private socket: dgram.Socket;
  private psIP: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(psIP: string) {
    this.psIP = psIP;
    this.socket = dgram.createSocket('udp4');
  }
  
  start(onPacket: (data: TelemetryPacket) => void): void {
    this.socket.bind(33740);
    
    this.socket.on('message', (msg) => {
      const decrypted = decrypt(msg);
      if (decrypted) {
        const packet = parsePacket(decrypted);
        onPacket(packet);
      }
    });
    
    // Send heartbeat every 5 seconds
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 5000);
  }
  
  private sendHeartbeat(): void {
    const msg = Buffer.from('A');
    this.socket.send(msg, 33739, this.psIP);
  }
  
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.socket.close();
  }
}
```

### Salsa20 Decryption in JavaScript

```typescript
// src/main/udp/salsa20.ts
import { Salsa20 } from 'salsa20-js'; // or implement manually

const KEY = Buffer.from('Simulator Interface Packet GT7 ver 0.0');

export function decrypt(data: Buffer): Buffer | null {
  if (data.length < 0x44) return null;
  
  // Extract IV from packet
  const oiv = data.slice(0x40, 0x44);
  const iv1 = oiv.readUInt32LE(0);
  const iv2 = iv1 ^ 0xDEADBEAF;
  
  // Build 8-byte nonce
  const iv = Buffer.alloc(8);
  iv.writeUInt32LE(iv2, 0);
  iv.writeUInt32LE(iv1, 4);
  
  // Decrypt
  const cipher = new Salsa20(KEY.slice(0, 32), iv);
  const decrypted = cipher.decrypt(data);
  
  // Verify magic number
  const magic = decrypted.readUInt32LE(0);
  if (magic !== 0x47375330) return null;
  
  return decrypted;
}
```

### SQLite with better-sqlite3

```typescript
// src/main/database/index.ts
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'gt7_laps.db');
const db = new Database(dbPath);

// Synchronous API - fast and simple
export function saveLap(lap: Lap, telemetry: TelemetryPoint[]): string {
  const id = crypto.randomUUID();
  
  const insertLap = db.prepare(`
    INSERT INTO laps (id, track_id, car_id, lap_time_ms, tire_compound, ...)
    VALUES (?, ?, ?, ?, ?, ...)
  `);
  
  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry_points (lap_id, tick, pos_x, pos_z, speed_kmh, ...)
    VALUES (?, ?, ?, ?, ?, ...)
  `);
  
  const transaction = db.transaction(() => {
    insertLap.run(id, lap.trackId, lap.carId, lap.lapTimeMs, lap.compound);
    for (const point of telemetry) {
      insertTelemetry.run(id, point.tick, point.posX, point.posZ, point.speed);
    }
  });
  
  transaction();
  return id;
}
```

---

## Preload Script (Context Bridge)

Securely expose main process APIs to renderer:

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gt7', {
  // Telemetry
  onTelemetry: (callback: (data: TelemetryPacket) => void) => {
    ipcRenderer.on('telemetry', (_, data) => callback(data));
  },
  
  // Connection
  connect: (psIP: string) => ipcRenderer.invoke('connect', psIP),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  getConnectionStatus: () => ipcRenderer.invoke('getConnectionStatus'),
  
  // Laps
  getLaps: (filters?: LapFilters) => ipcRenderer.invoke('getLaps', filters),
  saveLapTags: (lapId: string, tags: LapTags) => ipcRenderer.invoke('saveLapTags', lapId, tags),
  deleteLap: (lapId: string) => ipcRenderer.invoke('deleteLap', lapId),
  getLapTelemetry: (lapId: string) => ipcRenderer.invoke('getLapTelemetry', lapId),
  compareLaps: (lapIds: string[]) => ipcRenderer.invoke('compareLaps', lapIds),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings: Settings) => ipcRenderer.invoke('saveSettings', settings),
  
  // Events
  onLapComplete: (callback: (lap: Lap) => void) => {
    ipcRenderer.on('lapComplete', (_, lap) => callback(lap));
  },
  onConnectionChange: (callback: (status: ConnectionStatus) => void) => {
    ipcRenderer.on('connectionChange', (_, status) => callback(status));
  },
});
```

### TypeScript Declarations

```typescript
// src/shared/types.ts
export interface GT7API {
  onTelemetry: (callback: (data: TelemetryPacket) => void) => void;
  connect: (psIP: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  getLaps: (filters?: LapFilters) => Promise<Lap[]>;
  saveLapTags: (lapId: string, tags: LapTags) => Promise<void>;
  // ... etc
}

declare global {
  interface Window {
    gt7: GT7API;
  }
}
```

---

## Renderer Process (React)

### Using the API

```tsx
// src/renderer/hooks/useTelemetry.ts
import { useEffect, useState } from 'react';

export function useTelemetry() {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [connected, setConnected] = useState(false);
  
  useEffect(() => {
    window.gt7.onTelemetry((data) => {
      setTelemetry(data);
    });
    
    window.gt7.onConnectionChange((status) => {
      setConnected(status.connected);
    });
  }, []);
  
  const connect = async (psIP: string) => {
    return window.gt7.connect(psIP);
  };
  
  return { telemetry, connected, connect };
}
```

---

## IPC Message Flow

```
┌──────────────┐                              ┌──────────────┐
│   Renderer   │                              │     Main     │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  ipcRenderer.invoke('connect', '192.168.1.5')
       │────────────────────────────────────────────►│
       │                                             │ Start UDP listener
       │                                             │ Begin heartbeat
       │◄────────────────────────────────────────────│
       │  Promise resolves: true                     │
       │                                             │
       │                                             │ UDP packet received
       │  ipcRenderer.on('telemetry', data)          │
       │◄────────────────────────────────────────────│
       │                                             │
       │                                             │ Lap detected
       │  ipcRenderer.on('lapComplete', lap)         │
       │◄────────────────────────────────────────────│
       │                                             │
       │  ipcRenderer.invoke('saveLapTags', id, tags)│
       │────────────────────────────────────────────►│
       │                                             │ Write to SQLite
       │◄────────────────────────────────────────────│
       │  Promise resolves                           │
       ▼                                             ▼
```

---

## Build & Distribution

### electron-builder.yml

```yaml
appId: com.gt7delta.app
productName: GT7 Delta Dashboard
copyright: Copyright © 2024

directories:
  output: dist
  buildResources: assets

files:
  - "build/**/*"
  - "node_modules/**/*"
  - "package.json"

# Windows
win:
  target:
    - target: nsis
      arch: [x64]
  icon: assets/icon.ico
  artifactName: GT7-Delta-Setup-${version}.exe

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

# macOS
mac:
  target:
    - target: dmg
      arch: [x64, arm64]  # Intel + Apple Silicon
  icon: assets/icon.icns
  category: public.app-category.utilities
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  artifactName: GT7-Delta-${version}-${arch}.dmg

# Linux
linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  icon: assets/icon.png
  category: Utility
  artifactName: GT7-Delta-${version}.${ext}

# Auto-update (optional)
publish:
  provider: github
  owner: yourusername
  repo: gt7-delta-dashboard
```

### Build Scripts

```json
// package.json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "electron-builder",
    "package:win": "electron-builder --win",
    "package:mac": "electron-builder --mac",
    "package:linux": "electron-builder --linux",
    "package:all": "electron-builder -mwl"
  }
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "electron-store": "^8.0.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0",
    "electron-vite": "^2.0.0",
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "@types/react": "^18.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Salsa20 Options

Choose one:
1. **salsa20-js** - Pure JS, no native deps
2. **tweetnacl** - Has Salsa20, well audited
3. **Manual implementation** - ~50 lines, no deps

Recommend **tweetnacl** for security + simplicity.

---

## Native Dependencies Handling

`better-sqlite3` has native bindings. electron-builder handles this via:

```json
// package.json
{
  "build": {
    "npmRebuild": true,
    "nodeGypRebuild": false
  }
}
```

Or use `@electron/rebuild`:
```bash
npx @electron/rebuild -f -w better-sqlite3
```

---

## Auto-Updates (Optional)

```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';
import { app, dialog } from 'electron';

export function initAutoUpdater(): void {
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: 'A new version is available. It will be downloaded in the background.',
    });
  });
  
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart to apply?',
      buttons: ['Restart', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
}
```

---

## Development Workflow

### 1. Initial Setup
```bash
npm create electron-vite@latest gt7-delta-dashboard
cd gt7-delta-dashboard
npm install
npm install better-sqlite3 tweetnacl
```

### 2. Development
```bash
npm run dev
# Opens app with hot reload
```

### 3. Testing UDP Locally
- Run GT7 on PS4/PS5
- Enter console IP in app settings
- Click Connect

### 4. Build for Distribution
```bash
# Current platform
npm run package

# All platforms (on macOS with CI)
npm run package:all
```

---

## Distribution Checklist

### Windows
- [ ] Code signing certificate (optional but recommended)
- [ ] Test on Windows 10/11
- [ ] Firewall permissions for UDP

### macOS
- [ ] Apple Developer account ($99/year)
- [ ] Code signing
- [ ] Notarization (required for Gatekeeper)
- [ ] Test on Intel + Apple Silicon

### Linux
- [ ] Test AppImage on Ubuntu/Fedora
- [ ] Ensure better-sqlite3 builds correctly

---

## Security Considerations

1. **Context Isolation** - Enabled by default, use preload script
2. **Node Integration** - Disabled in renderer
3. **Sandbox** - Enable for renderer process
4. **CSP** - Strict Content Security Policy

```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

---

## File Locations

| Data | Location |
|------|----------|
| SQLite DB | `%APPDATA%/gt7-delta-dashboard/gt7_laps.db` (Win) |
| Settings | `%APPDATA%/gt7-delta-dashboard/settings.json` |
| Logs | `%APPDATA%/gt7-delta-dashboard/logs/` |
| Exports | User-selected via save dialog |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| App startup | < 2 seconds |
| Telemetry latency | < 20ms |
| Lap query (1000 laps) | < 100ms |
| Memory usage | < 200MB |
| Package size | < 100MB |

---

## Future Enhancements

1. **Cloud Sync** - Optional backup to cloud storage
2. **Community Leaderboards** - Compare with other users
3. **Twitch Integration** - Stream overlay mode
4. **Voice Callouts** - Audio delta announcements
5. **Hardware Support** - Direct LED strip / button box control
6. **Multi-sim Support** - ACC, iRacing, etc. (separate listeners)

---

## References

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-vite](https://electron-vite.org/)
- [electron-builder](https://www.electron.build/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [GT7 UDP Parser Reference](https://github.com/MacManley/gt7-udp)