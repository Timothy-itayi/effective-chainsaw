# GT7 Delta Dashboard 🏎️(｀_´)ゞ

> A local Electron-based dashboard for Gran Turismo 7, enabling offline lap storage, real-time comparison, and professional-grade telemetry analysis.

**The "Why":** Built to bridge the gap between console sim racing and PC-grade telemetry platforms (like Virtual Racing School or Track Titan). By intercepting and parsing raw UDP packets directly from a PlayStation 4/5 on a local network, this tool extracts unique data IDs (tire temps, track position, gear ratios) to provide deep, offline lap analysis without requiring a high-end PC setup.

## ( ✨・ω・) Features
* **Real-time Telemetry:** Sniffs, decrypts, and displays live GT7 telemetry data via a custom UDP listener.
* **Automated Lap Storage:** Automatically captures and stores full telemetry traces the moment you cross the line.
* **Offline Comparison:** Compare racing lines, braking points, and delta times across different tire compounds and sessions.
* **Local SQLite Database:** A lightweight, offline-first database storing all historical lap data and raw telemetry for deep-dive analysis.

## ( 💻・ω・) Prerequisites & Setup
* **Environment:** Node.js 20+ (tested with Node 24)
* **Hardware:** PlayStation 4/5 running GT7 with telemetry output enabled, sharing the same local network as your machine.

** Currently Under construction ** 
