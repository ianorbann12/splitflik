import { useSyncExternalStore } from 'react';
import { getState, subscribe } from './storage';
import type { AppState } from './storage';

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}
