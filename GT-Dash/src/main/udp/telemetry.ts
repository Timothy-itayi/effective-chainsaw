// src/telemetry/udpTelemetry.ts
import dgram from 'dgram';
import { parsePacket } from './parser';
import type { TelemetryPacket } from '../../shared/types';

// Replace this import with your real decrypt function.
import { decrypt } from './salsa20';

type TelemetryWithDebug = TelemetryPacket & {
  packetByteLength?: number;
  packetVariant?: 'A' | 'B' | '~' | 'unknown';
};

const EPS = {
  speedKmh: 0.2,
  rpm: 50,
  pedal: 0.01,
  pos: 0.05,
};

function changed(prev: TelemetryWithDebug, next: TelemetryWithDebug): boolean {
  if (Math.abs(prev.speedKmh - next.speedKmh) > EPS.speedKmh) return true;
  if (Math.abs(prev.rpm - next.rpm) > EPS.rpm) return true;
  if (prev.gear !== next.gear) return true;
  if (Math.abs(prev.throttle - next.throttle) > EPS.pedal) return true;
  if (Math.abs(prev.brake - next.brake) > EPS.pedal) return true;

  if (prev.currentLap !== next.currentLap) return true;
  if (prev.carId !== next.carId) return true;

  // Position tends to be stable when paused, so it’s a good “is the sim frozen” indicator
  if (Math.abs(prev.position.x - next.position.x) > EPS.pos) return true;
  if (Math.abs(prev.position.z - next.position.z) > EPS.pos) return true;

  return false;
}

type DisplayState = {
  lastPrinted?: TelemetryWithDebug;
  lastPrintTs: number;
};

const state: DisplayState = {
  lastPrinted: undefined,
  lastPrintTs: 0,
};

function shouldPrint(next: TelemetryWithDebug, now = Date.now()): boolean {
  const minIntervalMs = 250;  // don’t print more than 4Hz even if changing constantly
  const maxSilenceMs = 2000;  // print at least once every 2s even if unchanged

  if (!state.lastPrinted) {
    state.lastPrinted = next;
    state.lastPrintTs = now;
    return true;
  }

  const since = now - state.lastPrintTs;
  const isChanged = changed(state.lastPrinted, next);

  if (isChanged && since >= minIntervalMs) {
    state.lastPrinted = next;
    state.lastPrintTs = now;
    return true;
  }

  if (since >= maxSilenceMs) {
    state.lastPrinted = next;
    state.lastPrintTs = now;
    return true;
  }

  return false;
}

function fmtPct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function fmtPos(p: { x: number; y: number; z: number }) {
  return `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
}

function printPacket(idx: number, p: TelemetryWithDebug) {
  const variant = p.packetVariant ? ` ${p.packetVariant}` : '';
  const len = p.packetByteLength ? ` ${p.packetByteLength}b` : '';

  console.log(`\n[${idx}] Packet${variant}${len}:`);
  console.log(`  Speed: ${p.speedKmh.toFixed(1)} km/h`);
  console.log(`  RPM: ${Math.round(p.rpm)}`);
  console.log(`  Gear: ${p.gear}`);
  console.log(`  Throttle: ${fmtPct(p.throttle)}`);
  console.log(`  Brake: ${fmtPct(p.brake)}`);
  console.log(`  Current Lap: ${p.currentLap}`);
  console.log(`  Car ID: ${p.carId}`);
  console.log(`  Position: ${fmtPos(p.position)}`);
}

export function startTelemetryReceiver(psIp: string, options?: {
  listenPort?: number;      // your local UDP listen port
  gt7Port?: number;         // GT7 telemetry port (if you need to send heartbeat later)
  bindAddress?: string;     // usually "0.0.0.0"
}) {
  const listenPort = options?.listenPort ?? 33740;
  const bindAddress = options?.bindAddress ?? '0.0.0.0';

  const sock = dgram.createSocket('udp4');

  let received = 0;
  let decryptedOk = 0;
  let parsedOk = 0;

  sock.on('message', (msg) => {
    received += 1;

    const decrypted = decrypt(msg);
    if (!decrypted) return;
    decryptedOk += 1;

    const parsed = parsePacket(decrypted);
    if (!parsed) return;
    parsedOk += 1;

    // Always keep your latest telemetry somewhere (store/cache),
    // but only print when it changes.
    if (shouldPrint(parsed)) {
      printPacket(parsed.packetId ?? received, parsed);
    }
  });

  sock.on('listening', () => {
    const addr = sock.address();
    console.log(`Telemetry receiver listening on ${typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`}`);
    console.log(`Target console IP: ${psIp}`);
  });

  sock.on('error', (err) => {
    console.error('UDP socket error:', err);
  });

  sock.bind(listenPort, bindAddress);

  // Optional: periodic health log so you know it’s alive without spamming packets
  setInterval(() => {
    console.log(
      `\n[health] recv=${received} decrypted=${decryptedOk} parsed=${parsedOk} ` +
      `(printing is change-filtered)`
    );
  }, 5000);

  return () => {
    sock.close();
  };
}
