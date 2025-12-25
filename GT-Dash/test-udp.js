// Standalone UDP connection test for GT7
// Run with: node test-udp.js <PS4_IP_ADDRESS>

const dgram = require('dgram');
const { decrypt } = require('./dist/main/udp/salsa20');
const { parsePacket } = require('./dist/main/udp/parser');

const UDP_PORT = 33740;
const UDP_SEND_PORT = 33739;
const HEARTBEAT_INTERVAL_MS = 5000;

const psIP = process.argv[2];
if (!psIP) {
  console.error('Usage: node test-udp.js <PS4_IP_ADDRESS>');
  process.exit(1);
}

const EPS = {
  speedKmh: 0.2,
  rpm: 50,
  pedal: 0.01,
  pos: 0.05,
};

const LIMITS = {
  minIntervalMs: 250, // max 4Hz printing
  maxSilenceMs: 2000, // print at least once every 2s
};

let packetCount = 0;
let lastPacketTime = null;
let heartbeatInterval = null;

let lastPrinted = null;
let lastPrintTs = 0;

function changed(prev, next) {
  if (Math.abs(prev.speedKmh - next.speedKmh) > EPS.speedKmh) return true;
  if (Math.abs(prev.rpm - next.rpm) > EPS.rpm) return true;
  if (prev.gear !== next.gear) return true;
  if (Math.abs(prev.throttle - next.throttle) > EPS.pedal) return true;
  if (Math.abs(prev.brake - next.brake) > EPS.pedal) return true;
  if (prev.currentLap !== next.currentLap) return true;
  if (prev.carId !== next.carId) return true;
  if (Math.abs(prev.position.x - next.position.x) > EPS.pos) return true;
  if (Math.abs(prev.position.z - next.position.z) > EPS.pos) return true;
  return false;
}

function shouldPrint(next) {
  const now = Date.now();

  if (!lastPrinted) {
    lastPrinted = next;
    lastPrintTs = now;
    return true;
  }

  const since = now - lastPrintTs;
  const isChanged = changed(lastPrinted, next);

  if (isChanged && since >= LIMITS.minIntervalMs) {
    lastPrinted = next;
    lastPrintTs = now;
    return true;
  }

  if (since >= LIMITS.maxSilenceMs) {
    lastPrinted = next;
    lastPrintTs = now;
    return true;
  }

  return false;
}

function fmtPct(v) {
  return `${Math.round(v * 100)}%`;
}

function printPacket(idx, p) {
  const variant = p.packetVariant ? ` ${p.packetVariant}` : '';
  const len = p.packetByteLength ? ` ${p.packetByteLength}b` : '';

  console.log(`\n[${idx}] Packet${variant}${len}:`);
  console.log(`  Speed: ${p.speedKmh.toFixed(1)} km/h`);
  console.log(`  RPM: ${Math.round(p.rpm)}`);
  console.log(`  Gear: ${p.gear === -1 ? 'R' : p.gear === 0 ? 'N' : p.gear}`);
  console.log(`  Throttle: ${fmtPct(p.throttle)}`);
  console.log(`  Brake: ${fmtPct(p.brake)}`);
  console.log(`  LapCountRaw: ${p.lapCountRaw ?? 0}`);
  console.log(`  Current Lap: ${p.currentLap}`);
  console.log(`  Car ID: ${p.carId}`);
  console.log(`  Position: (${p.position.x.toFixed(2)}, ${p.position.z.toFixed(2)})`);
}

const socket = dgram.createSocket('udp4');

socket.bind(UDP_PORT, (error) => {
  if (error) {
    console.error('Error binding socket:', error);
    cleanup();
    process.exit(1);
  }
  console.log(`✓ UDP socket bound to port ${UDP_PORT}`);
  console.log('Waiting for GT7 packets...\n');
});

socket.on('message', (msg) => {
  packetCount++;
  lastPacketTime = Date.now();

  const decrypted = decrypt(msg);
  if (!decrypted) return;

  const packet = parsePacket(decrypted);
  if (!packet) return;

  if (shouldPrint(packet)) {
    printPacket(packet.packetId ?? packetCount, packet);
  }
});

socket.on('error', (error) => {
  console.error('UDP socket error:', error);
  cleanup();
  process.exit(1);
});

// Heartbeat: you're requesting packet type "A"
function sendHeartbeat() {
  const msg = Buffer.from('A');
  socket.send(msg, UDP_SEND_PORT, psIP, (error) => {
    if (error) console.error('Error sending heartbeat:', error.message);
  });
}

sendHeartbeat();
heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
console.log('✓ Heartbeat started (sending every 5 seconds)\n');

setInterval(() => {
  if (!lastPacketTime) return;
  const timeSinceLastPacket = Date.now() - lastPacketTime;
  if (timeSinceLastPacket > 10000) {
    console.warn(`⚠ No packets received for ${Math.round(timeSinceLastPacket / 1000)} seconds`);
    console.warn('   Check that GT7 is running and telemetry is enabled\n');
  }
}, 5000);

function cleanup() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  socket.close();
}

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  console.log(`Total packets received: ${packetCount}`);
  cleanup();
  process.exit(0);
});
