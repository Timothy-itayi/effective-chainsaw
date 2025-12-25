// Preload script - exposes secure API to renderer
import { contextBridge, ipcRenderer } from 'electron';
import { TelemetryPacket, ConnectionStatus, Lap, TelemetryPoint, LapFilters, Settings } from '../shared/types';

export interface GT7API {
  // Telemetry
  onTelemetry: (callback: (data: TelemetryPacket) => void) => void;
  removeTelemetryListener: () => void;

  // Connection
  connect: (psIP: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  getConnectionStatus: () => Promise<ConnectionStatus>;
  onConnectionChange: (callback: (status: ConnectionStatus) => void) => void;
  removeConnectionChangeListener: () => void;

  // Laps
  getLaps: (filters?: LapFilters) => Promise<Lap[]>;
  saveLapTags: (lapId: string, tags: Partial<Lap>) => Promise<void>;
  deleteLap: (lapId: string) => Promise<void>;
  getLapTelemetry: (lapId: string) => Promise<TelemetryPoint[]>;
  compareLaps: (lapIds: string[]) => Promise<any>;

  // Events
  onLapComplete: (callback: (lap: Lap) => void) => void;
  removeLapCompleteListener: () => void;

  // Settings
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
}

const api: GT7API = {
  onTelemetry: (callback) => {
    ipcRenderer.on('telemetry', (_, data) => callback(data));
  },
  removeTelemetryListener: () => {
    ipcRenderer.removeAllListeners('telemetry');
  },

  connect: (psIP: string) => ipcRenderer.invoke('connect', psIP),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  getConnectionStatus: () => ipcRenderer.invoke('getConnectionStatus'),
  onConnectionChange: (callback) => {
    ipcRenderer.on('connectionChange', (_, status) => callback(status));
  },
  removeConnectionChangeListener: () => {
    ipcRenderer.removeAllListeners('connectionChange');
  },

  getLaps: (filters?: LapFilters) => ipcRenderer.invoke('getLaps', filters),
  saveLapTags: (lapId: string, tags: Partial<Lap>) => ipcRenderer.invoke('saveLapTags', lapId, tags),
  deleteLap: (lapId: string) => ipcRenderer.invoke('deleteLap', lapId),
  getLapTelemetry: (lapId: string) => ipcRenderer.invoke('getLapTelemetry', lapId),
  compareLaps: (lapIds: string[]) => ipcRenderer.invoke('compareLaps', lapIds),

  onLapComplete: (callback) => {
    ipcRenderer.on('lapComplete', (_, lap) => callback(lap));
  },
  removeLapCompleteListener: () => {
    ipcRenderer.removeAllListeners('lapComplete');
  },

  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings: Settings) => ipcRenderer.invoke('saveSettings', settings),
};

contextBridge.exposeInMainWorld('gt7', api);

// TypeScript declarations for renderer
declare global {
  interface Window {
    gt7: GT7API;
  }
}

