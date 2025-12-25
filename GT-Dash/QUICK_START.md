# Quick Start - Test UDP Connection

## 1. Boot Up PS4 and Enable Telemetry

1. Turn on your PS4/PS5
2. Launch Gran Turismo 7
3. Go to: **Settings** → **Network** → **Telemetry Output** → **ON**
4. Find your PS4 IP address: **Settings** → **Network** → **View Connection Status**

## 2. Build the Project

```bash
cd GT-Dash
npm run build
```

## 3. Run the Test

```bash
node test-udp.js <YOUR_PS4_IP>
```

Example:
```bash
node test-udp.js 192.168.1.100
```

## 4. Start a Race in GT7

- Enter any race, time trial, or practice session
- The script should start receiving packets within 5-10 seconds
- You'll see telemetry data printed every second

## What to Look For

✅ **Success:** You see packets with speed, RPM, gear, etc.  
❌ **Failure:** No packets or "decryption failed" messages

## Common Issues

- **No packets:** Make sure GT7 telemetry is enabled AND you're in an active race
- **Wrong IP:** Double-check the IP address in PS4 network settings
- **Firewall:** Temporarily disable firewall to test

See `TESTING.md` for detailed troubleshooting.

