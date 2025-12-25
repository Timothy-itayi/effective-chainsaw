// Electron main process entry point
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { GT7Listener } from './udp/listener';
import { saveLap, getLaps, getLapTelemetry, updateLapTags, deleteLap } from './storage/laps';
import { TelemetryPacket, ConnectionStatus, LapFilters, Lap, TelemetryPoint } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let listener: GT7Listener | null = null;
let currentLap: number = 0;
let lapTelemetry: TelemetryPoint[] = [];
let lastPacketTime: number = 0;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Need to allow some Node APIs in preload
    },
  });

  // Load the React app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173'); // Vite dev server
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (listener) {
    listener.stop();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Connection management
ipcMain.handle('connect', async (_, psIP: string): Promise<boolean> => {
  try {
    if (listener) {
      listener.stop();
    }

    listener = new GT7Listener();
    
    listener.start(psIP, (packet: TelemetryPacket) => {
      lastPacketTime = Date.now();
      
      // Send telemetry to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('telemetry', packet);
      }

      // Detect lap completion
      if (packet.currentLap !== currentLap) {
        if (currentLap > 0 && lapTelemetry.length > 0) {
          // Save previous lap
          const lap: Omit<Lap, 'id' | 'createdAt'> = {
            trackId: null, // Will be auto-detected later
            carId: packet.carId,
            lapTimeMs: packet.lastLapTime,
            tireCompound: null,
            fuelStart: null,
            fuelEnd: null,
            setupName: null,
            notes: null,
            weather: null,
            isValid: true,
            isReference: false,
            sessionId: null,
          };

          const telemetryWithLapId = lapTelemetry.map((point, index) => ({
            ...point,
            tick: index,
          }));

          const lapId = saveLap(lap, telemetryWithLapId);

          // Notify renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lapComplete', {
              ...lap,
              id: lapId,
              createdAt: new Date().toISOString(),
            });
          }
        }

        // Start new lap
        currentLap = packet.currentLap;
        lapTelemetry = [];
      }

      // Accumulate telemetry for current lap
      lapTelemetry.push({
        lapId: '', // Will be set when lap is saved
        tick: lapTelemetry.length,
        posX: packet.position.x,
        posZ: packet.position.z,
        speedKmh: packet.speedKmh,
        rpm: packet.rpm,
        gear: packet.gear,
        throttle: packet.throttle,
        brake: packet.brake,
        lapDistance: packet.lapDistance,
        deltaToReference: null,
      });
    });

    // Update connection status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connectionChange', {
        connected: true,
        psIP,
        lastPacketTime: Date.now(),
      } as ConnectionStatus);
    }

    return true;
  } catch (error) {
    console.error('Connection error:', error);
    return false;
  }
});

ipcMain.handle('disconnect', async (): Promise<void> => {
  if (listener) {
    listener.stop();
    listener = null;
  }

  currentLap = 0;
  lapTelemetry = [];

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('connectionChange', {
      connected: false,
      psIP: null,
      lastPacketTime: null,
    } as ConnectionStatus);
  }
});

ipcMain.handle('getConnectionStatus', async (): Promise<ConnectionStatus> => {
  return {
    connected: listener?.isActive() ?? false,
    psIP: null, // Could store this
    lastPacketTime: lastPacketTime > 0 ? lastPacketTime : null,
  };
});

// Lap operations
ipcMain.handle('getLaps', async (_, filters?: LapFilters): Promise<Lap[]> => {
  return getLaps(filters);
});

ipcMain.handle('getLapTelemetry', async (_, lapId: string): Promise<TelemetryPoint[]> => {
  return getLapTelemetry(lapId);
});

ipcMain.handle('saveLapTags', async (_, lapId: string, tags: any): Promise<void> => {
  updateLapTags(lapId, tags);
});

ipcMain.handle('deleteLap', async (_, lapId: string): Promise<void> => {
  deleteLap(lapId);
});

ipcMain.handle('compareLaps', async (_, lapIds: string[]): Promise<any> => {
  // Get telemetry for all laps
  const telemetryData = lapIds.map(lapId => ({
    lapId,
    telemetry: getLapTelemetry(lapId),
  }));

  return {
    laps: getLaps().filter(lap => lapIds.includes(lap.id)),
    telemetry: telemetryData,
  };
});

// Settings (using electron-store would be better, but keeping it simple for now)
ipcMain.handle('getSettings', async (): Promise<any> => {
  // Return default settings
  return {
    psIP: '',
    autoSaveLaps: true,
    defaultTireCompound: 'unknown',
  };
});

ipcMain.handle('saveSettings', async (_, settings: any): Promise<void> => {
  // Store settings (would use electron-store in production)
  console.log('Settings saved:', settings);
});

