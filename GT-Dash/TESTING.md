# Testing GT7 UDP Connection

## Prerequisites

1. **PS4/PS5 Setup:**
   - Boot up your PlayStation
   - Launch Gran Turismo 7
   - Go to **Settings** → **Network** → **Telemetry Output**
   - Enable telemetry output
   - Note your PlayStation's IP address (Settings → Network → View Connection Status)

2. **Network Setup:**
   - Ensure your PC and PlayStation are on the same network
   - No firewall blocking UDP ports 33739-33740

## Testing Steps

### Step 1: Build the Project

```bash
cd GT-Dash
npm run build
```

### Step 2: Run the UDP Test Script

```bash
npm run test:udp <PS4_IP_ADDRESS>
```

Example:
```bash
npm run test:udp 192.168.1.100
```

Or directly:
```bash
node test-udp.js 192.168.1.100
```

### Step 3: Start GT7 Telemetry

1. In GT7, enter any race or time trial
2. The test script should start receiving packets
3. You should see output like:

```
[1] Packet received:
  Speed: 45.2 km/h
  RPM: 3500
  Gear: 3
  Throttle: 75%
  Brake: 0%
  Current Lap: 1
  Car ID: 123
  Position: (1234.56, 7890.12)
```

## Troubleshooting

### No Packets Received

**Symptoms:** Script runs but shows no packets

**Possible Causes:**
1. **GT7 telemetry not enabled**
   - Check Settings → Network → Telemetry Output is ON
   - Restart GT7 if you just enabled it

2. **Wrong IP address**
   - Verify PlayStation IP in network settings
   - Try pinging the IP: `ping <PS4_IP>`

3. **Firewall blocking UDP**
   - Check firewall settings
   - On macOS: System Settings → Firewall
   - Temporarily disable firewall to test

4. **Not in a race**
   - GT7 only sends telemetry during active gameplay
   - Enter a race, time trial, or practice session

5. **Network issues**
   - Ensure PC and PS4 are on same network
   - Check router settings (some routers block UDP multicast)

### Decryption Failed

**Symptoms:** Script shows "decryption failed" messages

**Possible Causes:**
1. **Salsa20 implementation issue**
   - The Salsa20 cipher may need adjustment
   - Check console for specific error messages

2. **Packet structure changed**
   - GT7 updates may have changed packet format
   - Verify packet length is correct (should be 332+ bytes)

### Parsing Failed

**Symptoms:** Decryption succeeds but parsing fails

**Possible Causes:**
1. **Packet structure mismatch**
   - Field offsets may be incorrect
   - Check GT7 UDP specification for updates

2. **Magic number mismatch**
   - Verify magic number is 0x47375330 ("G7S0")

## Expected Behavior

- **First packet:** Should arrive within 5-10 seconds of starting a race
- **Packet rate:** ~60 packets per second (60Hz)
- **Heartbeat:** Sent every 5 seconds to keep connection alive
- **Connection status:** Script monitors for packet timeouts

## Next Steps After Successful Connection

Once you see packets being received and parsed correctly:

1. ✅ UDP connection works
2. ✅ Salsa20 decryption works
3. ✅ Packet parsing works
4. → Ready to test full Electron app
5. → Ready to implement UI features

## Debugging Tips

- Run with verbose logging: The script shows every 60th packet by default
- Check packet count: Should increase steadily during gameplay
- Monitor connection: Script warns if no packets for 10+ seconds
- Test different scenarios: Race, time trial, practice mode

