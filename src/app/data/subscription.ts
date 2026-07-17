// Tiny global flag for the (simulated) subscription sheet, so any component —
// an ad banner, a quota prompt, a limit prompt, Profile — can open it without
// threading a callback through the tree. MainApp renders the sheet from the hook.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function openSubscription(): void {
  open = true;
  notify();
}
export function closeSubscription(): void {
  open = false;
  notify();
}
export function useSubscriptionOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => open,
  );
}
