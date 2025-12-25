# GT7 Delta Dashboard

A local Electron-based dashboard for Gran Turismo 7 telemetry data, enabling offline lap storage, comparison, and analysis.

## Features

- **Real-time Telemetry**: Receive and display GT7 telemetry data via UDP
- **Lap Storage**: Automatically capture and store laps with full telemetry traces
- **Offline Comparison**: Compare laps across different tire compounds and sessions
- **SQLite Database**: Local storage for all lap data and telemetry

## Prerequisites

- Node.js 20+ (tested with Node 24)
- GT7 running on PlayStation 4/5 with telemetry enabled
- PlayStation and PC on the same network

## Installation

```bash
npm install
npm run build
```

## Development

```bash
# Build TypeScript
npm run build

# Start Electron app
npm start
```

## Usage

1. Start GT7 on your PlayStation
2. Enable telemetry in GT7 settings
3. Launch the Electron app
4. Enter your PlayStation's IP address
5. Click "Connect"
6. The dashboard will display real-time telemetry data

## Project Structure

```
GT-Dash/
├── src/
│   ├── main/           # Electron main process
│   │   ├── udp/        # UDP listener and packet parsing
│   │   ├── database/   # SQLite database operations
│   │   └── ipc/       # IPC handlers
│   ├── preload/       # Context bridge API
│   ├── renderer/      # React frontend
│   └── shared/        # Shared types and constants
├── dist/              # Compiled output
└── assets/            # Static assets
```

## Current Status

✅ Core architecture implemented
✅ UDP listener and packet parsing
✅ Salsa20 decryption (basic implementation)
✅ SQLite database schema
✅ React frontend (basic dashboard)
✅ IPC communication

⚠️ **Note**: The Salsa20 implementation may need verification against actual GT7 packets. The packet parser offsets are based on the GT7 UDP specification but may require adjustment.

## Next Steps

- [ ] Add Vite/Webpack for React build system
- [ ] Implement lap list and comparison views
- [ ] Add track auto-detection
- [ ] Implement lap tagging UI
- [ ] Add delta graph visualization
- [ ] Test with actual GT7 telemetry data

## References

- [GT7 UDP Specification](https://github.com/MacManley/gt7-udp)
- [GT7 Car Database](https://github.com/ddm999/gt7info)

