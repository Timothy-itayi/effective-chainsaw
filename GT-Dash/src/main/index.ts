// Electron main process entry point
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { GT7Listener } from './udp/listener';
import { saveLap, getLaps, getLapTelemetry, updateLapTags, deleteLap } from './storage/laps';
import { TelemetryPacket, ConnectionStatus, LapFilters, Lap, TelemetryPoint } from '../shared/types';
import { getCarName } from './utils/carDatabase';
import { detectTrack, getAllTracks, getTrackById, getTracksByRegion, getAllRegions } from './utils/trackDatabase';
import { calculateSectorTimes, resetSectorTimesForCar } from './utils/sectorTimes';
import { inferTireCompound } from './utils/tireCompound';
import {
  startTrackCapture,
  stopTrackCapture,
  recordTrackPoint,
  processTrackCapture,
  saveTrackMap,
  loadTrackMap,
  getAllTrackMaps,
  getCaptureStatus,
  clearCaptureSession,
  TrackMap,
} from './utils/trackCapture';
import { getSelectedTrackId, setSelectedTrackId, getPsIP, setPsIP } from './utils/settings';

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
    
    listener.start(psIP, (packet) => {
      lastPacketTime = Date.now();
      
      // Record track point if capture is active
      recordTrackPoint(packet);
      
      // Enrich packet with additional data
      const trackInfo = detectTrack(packet.position.x, packet.position.z);
      // Use manually selected track if auto-detection fails
      const manualTrack = selectedTrackId ? getTrackById(selectedTrackId) : null;
      const finalTrack = trackInfo || manualTrack;
      
      // Use lapCountRaw from parser (more reliable than currentLap)
      const sectorData = calculateSectorTimes({
        carId: packet.carId,
        lapCountRaw: packet.lapCountRaw,
        lapDistance: packet.lapDistance,
        lastLapTimeMs: packet.lastLapTime,
      });
      const tireCompound = inferTireCompound(packet.tireTemperatures);
      
      // Debug: log sector data and fuel periodically to diagnose issues
      const now = Date.now();
      if (now % 2000 < 100) {
        if (sectorData) {
          console.log('Sector data:', {
            carId: packet.carId,
            lapCountRaw: packet.lapCountRaw,
            lapDistance: packet.lapDistance.toFixed(1),
            lastLapTime: packet.lastLapTime,
            lapLengthMeters: sectorData.lapLengthMeters,
            lapFraction: sectorData.lapFraction.toFixed(3),
            currentSector: sectorData.currentSector,
            s1: sectorData.sector1Time,
            s2: sectorData.sector2Time,
            s3: sectorData.sector3Time,
          });
        } else {
          console.log('Sector data is null - carId:', packet.carId, 'lapCountRaw:', packet.lapCountRaw);
        }
        
        // Debug fuel values
        console.log('Fuel:', {
          fuelLevel: packet.fuelLevel,
          fuelCapacity: packet.fuelCapacity,
          fuelPercent: packet.fuelCapacity > 0 ? ((packet.fuelLevel / packet.fuelCapacity) * 100).toFixed(1) : (packet.fuelLevel * 100).toFixed(1),
        });
      }
      
      const enrichedPacket: TelemetryPacket = {
        ...packet,
        // Car name lookup
        carName: getCarName(packet.carId),
        // Track detection (manual selection or auto-detect)
        ...(finalTrack ? {
          trackName: finalTrack.name,
          trackRegion: finalTrack.region,
        } : {}),
        // Sector times calculation
        ...(sectorData ? {
          sector1Time: sectorData.sector1Time,
          sector2Time: sectorData.sector2Time,
          sector3Time: sectorData.sector3Time,
          currentSector: sectorData.currentSector,
        } : {}),
        // Tire compound inference
        tireCompound,
      };
      
      // Send enriched telemetry to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('telemetry', enrichedPacket);
      }

      // Reset sector times on new lap
      if (packet.currentLap !== currentLap && currentLap > 0) {
        resetSectorTimesForCar(packet.carId);
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

// Track management
ipcMain.handle('getAllTracks', async (): Promise<any[]> => {
  return getAllTracks();
});

ipcMain.handle('getTracksByRegion', async (): Promise<Record<string, any[]>> => {
  return getTracksByRegion();
});

ipcMain.handle('getAllRegions', async (): Promise<string[]> => {
  return getAllRegions();
});

ipcMain.handle('setTrack', async (_, trackId: string): Promise<void> => {
  // Store selected track in memory (could use electron-store)
  // For now, we'll use it in the next packet enrichment
  if (mainWindow && !mainWindow.isDestroyed()) {
    const track = getAllTracks().find(t => t.id === trackId);
    if (track) {
      // Broadcast track selection to renderer
      mainWindow.webContents.send('trackSelected', track);
    }
  }
});

// Settings
ipcMain.handle('getSettings', async (): Promise<any> => {
  return {
    psIP: getPsIP(),
    autoSaveLaps: true,
    defaultTireCompound: 'unknown',
    selectedTrackId: getSelectedTrackId(),
  };
});

ipcMain.handle('saveSettings', async (_, settings: any): Promise<void> => {
  if (settings.psIP !== undefined) {
    setPsIP(settings.psIP);
  }
  if (settings.selectedTrackId !== undefined) {
    setSelectedTrackId(settings.selectedTrackId);
  }
  console.log('Settings saved');
});

ipcMain.handle('getPsIP', async (): Promise<string> => {
  return getPsIP();
});

ipcMain.handle('setPsIP', async (_, psIP: string): Promise<void> => {
  setPsIP(psIP);
});

// Load persisted track selection on startup
let selectedTrackId: string | null = getSelectedTrackId();

ipcMain.handle('selectTrack', async (_, trackId: string): Promise<void> => {
  selectedTrackId = trackId || null;
  setSelectedTrackId(selectedTrackId);
  console.log('Track selected:', trackId ? getTrackById(trackId)?.name : 'None');
});

ipcMain.handle('getSelectedTrackId', async (): Promise<string | null> => {
  return getSelectedTrackId();
});

// Track capture handlers
ipcMain.handle('startTrackCapture', async (_, trackId: string): Promise<void> => {
  try {
    startTrackCapture(trackId);
    const status = getCaptureStatus();
    console.log('Track capture started:', status);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('captureStatusChanged', status);
    }
  } catch (error) {
    console.error('Error starting track capture:', error);
    throw error;
  }
});

ipcMain.handle('stopTrackCapture', async (): Promise<void> => {
  stopTrackCapture();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('captureStatusChanged', getCaptureStatus());
  }
});

ipcMain.handle('processAndSaveTrackCapture', async (): Promise<TrackMap | null> => {
  const trackMap = processTrackCapture();
  if (trackMap) {
    saveTrackMap(trackMap);
  }
  clearCaptureSession();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('captureStatusChanged', null);
  }
  return trackMap;
});

ipcMain.handle('getCaptureStatus', async (): Promise<any> => {
  return getCaptureStatus();
});

ipcMain.handle('loadTrackMap', async (_, trackId: string): Promise<TrackMap | null> => {
  return loadTrackMap(trackId);
});

ipcMain.handle('getAllTrackMaps', async (): Promise<TrackMap[]> => {
  return getAllTrackMaps();
});

ipcMain.handle('saveTrackMapSectors', async (_, trackId: string, sectorFractions: number[]): Promise<void> => {
  const trackMap = loadTrackMap(trackId);
  if (trackMap) {
    trackMap.sectorFractions = sectorFractions;
    saveTrackMap(trackMap);
  }
});

