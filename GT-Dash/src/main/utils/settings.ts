// Settings storage using electron-store
import Store from 'electron-store';

const store = new Store<{
  selectedTrackId: string | null;
  psIP: string;
}>();

export function getSelectedTrackId(): string | null {
  return store.get('selectedTrackId', null);
}

export function setSelectedTrackId(trackId: string | null): void {
  store.set('selectedTrackId', trackId);
}

export function getPsIP(): string {
  return store.get('psIP', '');
}

export function setPsIP(psIP: string): void {
  store.set('psIP', psIP);
}

