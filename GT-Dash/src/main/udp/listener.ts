// UDP listener for GT7 telemetry packets
import dgram from 'dgram';
import { decrypt } from './salsa20';
import { parsePacket } from './parser';
import { TelemetryPacket } from '../../shared/types';
import { UDP_PORT, UDP_SEND_PORT, HEARTBEAT_INTERVAL_MS } from '../../shared/constants';

export class GT7Listener {
  private socket: dgram.Socket | null = null;
  private psIP: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private onPacketCallback: ((packet: TelemetryPacket) => void) | null = null;
  private isRunning: boolean = false;

  /**
   * Start listening for GT7 UDP packets
   */
  start(psIP: string, onPacket: (packet: TelemetryPacket) => void): void {
    if (this.isRunning) {
      this.stop();
    }

    this.psIP = psIP;
    this.onPacketCallback = onPacket;
    this.isRunning = true;

    // Create UDP socket
    this.socket = dgram.createSocket('udp4');

    // Bind to receive port
    this.socket.bind(UDP_PORT, () => {
      console.log(`UDP listener bound to port ${UDP_PORT}`);
    });

    // Handle incoming messages
    this.socket.on('message', (msg: Buffer) => {
      try {
        // Decrypt packet
        const decrypted = decrypt(msg);
        if (!decrypted) {
          return;
        }

        // Parse packet
        const packet = parsePacket(decrypted);
        if (!packet) {
          return;
        }

        // Callback with parsed packet
        if (this.onPacketCallback) {
          this.onPacketCallback(packet);
        }
      } catch (error) {
        console.error('Error processing UDP packet:', error);
      }
    });

    // Handle errors
    this.socket.on('error', (error) => {
      console.error('UDP socket error:', error);
    });

    // Start heartbeat
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Send heartbeat to GT7 to keep connection alive
   */
  private sendHeartbeat(): void {
    if (!this.socket || !this.psIP) {
      return;
    }

    try {
      const msg = Buffer.from('A');
      this.socket.send(msg, UDP_SEND_PORT, this.psIP, (error) => {
        if (error) {
          console.error('Error sending heartbeat:', error);
        }
      });
    } catch (error) {
      console.error('Error in sendHeartbeat:', error);
    }
  }

  /**
   * Stop listening and clean up
   */
  stop(): void {
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.psIP = null;
    this.onPacketCallback = null;
  }

  /**
   * Check if listener is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

