// Lap storage using electron-store (no SQLite needed)
import Store from 'electron-store';
import { Lap, TelemetryPoint, LapFilters } from '../../shared/types';

const store = new Store<{
  laps: Lap[];
  telemetry: Record<string, TelemetryPoint[]>;
}>({
  name: 'gt7-laps',
  defaults: {
    laps: [],
    telemetry: {},
  },
});

export function saveLap(
  lap: Omit<Lap, 'id' | 'createdAt'>,
  telemetry: Omit<TelemetryPoint, 'id' | 'lapId'>[]
): string {
  const lapId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = new Date().toISOString();

  const fullLap: Lap = {
    ...lap,
    id: lapId,
    createdAt,
  };

  const laps = store.get('laps', []);
  laps.push(fullLap);
  store.set('laps', laps);

  // Save telemetry
  const telemetryWithLapId = telemetry.map((point, index) => ({
    ...point,
    lapId,
    tick: index,
  }));
  
  const allTelemetry = store.get('telemetry', {});
  allTelemetry[lapId] = telemetryWithLapId;
  store.set('telemetry', allTelemetry);

  return lapId;
}

export function getLaps(filters?: LapFilters): Lap[] {
  let laps = store.get('laps', []);

  if (filters?.trackId) {
    laps = laps.filter(lap => lap.trackId === filters.trackId);
  }

  if (filters?.carId !== undefined) {
    laps = laps.filter(lap => lap.carId === filters.carId);
  }

  if (filters?.tireCompound) {
    laps = laps.filter(lap => lap.tireCompound === filters.tireCompound);
  }

  if (filters?.dateFrom) {
    laps = laps.filter(lap => lap.createdAt >= filters.dateFrom!);
  }

  if (filters?.dateTo) {
    laps = laps.filter(lap => lap.createdAt <= filters.dateTo!);
  }

  // Sort by creation date, newest first
  return laps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getLapTelemetry(lapId: string): TelemetryPoint[] {
  const allTelemetry = store.get('telemetry', {});
  return allTelemetry[lapId] || [];
}

export function updateLapTags(
  lapId: string,
  tags: Partial<Pick<Lap, 'tireCompound' | 'setupName' | 'notes' | 'weather' | 'isReference'>>
): void {
  const laps = store.get('laps', []);
  const lapIndex = laps.findIndex(lap => lap.id === lapId);
  
  if (lapIndex === -1) {
    return;
  }

  laps[lapIndex] = {
    ...laps[lapIndex],
    ...tags,
  };

  store.set('laps', laps);
}

export function deleteLap(lapId: string): void {
  const laps = store.get('laps', []);
  const filteredLaps = laps.filter(lap => lap.id !== lapId);
  store.set('laps', filteredLaps);

  // Also delete telemetry
  const allTelemetry = store.get('telemetry', {});
  delete allTelemetry[lapId];
  store.set('telemetry', allTelemetry);
}

