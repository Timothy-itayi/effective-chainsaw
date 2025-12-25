// Salsa20 decryption for GT7 UDP packets
import { SALSA20_KEY, GT7_MAGIC } from '../../shared/constants';

/**
 * Decrypt GT7 UDP packet using Salsa20
 * GT7 uses a custom IV derivation from the packet
 */
export function decrypt(data: Buffer): Buffer | null {
  if (data.length < 0x44) {
    return null;
  }

  // Extract IV from packet (bytes 0x40-0x44)
  const iv1 = data.readUInt32LE(0x40);
  const iv2 = (iv1 ^ 0xDEADBEAF) >>> 0; // Note: BEAF not BEEF

  // Build 8-byte nonce for Salsa20: [iv2 (LE), iv1 (LE)]
  const nonce = Buffer.allocUnsafe(8);
  nonce.writeUInt32LE(iv2, 0);
  nonce.writeUInt32LE(iv1, 4);

  try {
    const decrypted = salsa20Crypt(data, SALSA20_KEY.slice(0, 32), nonce);
    
    // Verify magic number at offset 0
    const magic = decrypted.readUInt32LE(0);
    if (magic !== GT7_MAGIC) {
      return null;
    }

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Rotate left for 32-bit unsigned integers
 */
function rotl(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

/**
 * Salsa20 quarter round - the core mixing function
 */
function quarterRound(y: Uint32Array, a: number, b: number, c: number, d: number): void {
  y[b] = (y[b] ^ rotl((y[a] + y[d]) >>> 0, 7)) >>> 0;
  y[c] = (y[c] ^ rotl((y[b] + y[a]) >>> 0, 9)) >>> 0;
  y[d] = (y[d] ^ rotl((y[c] + y[b]) >>> 0, 13)) >>> 0;
  y[a] = (y[a] ^ rotl((y[d] + y[c]) >>> 0, 18)) >>> 0;
}

/**
 * Generate a 64-byte keystream block using Salsa20 core
 * 
 * Correct Salsa20 state layout (16 x 32-bit words in diagonal pattern):
 *   [0]="expa"  [1]=k0     [2]=k1     [3]=k2
 *   [4]=k3      [5]="nd 3" [6]=n0     [7]=n1
 *   [8]=ctr0    [9]=ctr1   [10]="2-by" [11]=k4
 *   [12]=k5     [13]=k6    [14]=k7    [15]="te k"
 */
function salsa20Block(key: Buffer, nonce: Buffer, counter: bigint): Buffer {
  const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
  
  const state = new Uint32Array(16);
  
  // Read key as 8 little-endian 32-bit words
  const k = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    k[i] = key.readUInt32LE(i * 4);
  }
  
  // Read nonce
  const n0 = nonce.readUInt32LE(0);
  const n1 = nonce.readUInt32LE(4);
  
  // Split counter
  const ctr0 = Number(counter & 0xFFFFFFFFn) >>> 0;
  const ctr1 = Number((counter >> 32n) & 0xFFFFFFFFn) >>> 0;
  
  // Diagonal layout - this is the critical fix
  state[0] = SIGMA[0];   // "expa"
  state[1] = k[0];
  state[2] = k[1];
  state[3] = k[2];
  state[4] = k[3];
  state[5] = SIGMA[1];   // "nd 3"
  state[6] = n0;
  state[7] = n1;
  state[8] = ctr0;
  state[9] = ctr1;
  state[10] = SIGMA[2];  // "2-by"
  state[11] = k[4];
  state[12] = k[5];
  state[13] = k[6];
  state[14] = k[7];
  state[15] = SIGMA[3];  // "te k"
  
  const working = new Uint32Array(state);
  
  // 20 rounds (10 double-rounds)
  for (let i = 0; i < 10; i++) {
    // Column rounds
    quarterRound(working, 0, 4, 8, 12);
    quarterRound(working, 5, 9, 13, 1);
    quarterRound(working, 10, 14, 2, 6);
    quarterRound(working, 15, 3, 7, 11);
    // Row rounds
    quarterRound(working, 0, 1, 2, 3);
    quarterRound(working, 5, 6, 7, 4);
    quarterRound(working, 10, 11, 8, 9);
    quarterRound(working, 15, 12, 13, 14);
  }
  
  // Add original state
  for (let i = 0; i < 16; i++) {
    working[i] = (working[i] + state[i]) >>> 0;
  }
  
  const output = Buffer.alloc(64);
  for (let i = 0; i < 16; i++) {
    output.writeUInt32LE(working[i], i * 4);
  }
  
  return output;
}

/**
 * Salsa20 stream cipher - XOR data with keystream
 */
function salsa20Crypt(data: Buffer, key: Buffer, nonce: Buffer): Buffer {
  const output = Buffer.alloc(data.length);
  let counter = 0n;
  
  for (let offset = 0; offset < data.length; offset += 64) {
    const block = salsa20Block(key, nonce, counter);
    const remaining = Math.min(64, data.length - offset);
    
    for (let i = 0; i < remaining; i++) {
      output[offset + i] = data[offset + i] ^ block[i];
    }
    
    counter++;
  }
  
  return output;
}
