// App bootstrap: read the persisted auth session, honour an /#/join/<code>
// invite link, auto-enter the demo group when running without Supabase, and
// open the active group's realtime channel once we know who + where.
import { useEffect, useRef } from 'react';
import { DEMO_SESSION } from './data/demoSeed';
import { getSession, mode, parseInviteInput, setSession, store, useSession, useStore } from './data/store';

export type BootPhase = 'loading' | 'auth' | 'ready' | 'error';

export interface BootState {
  phase: BootPhase;
  joinCode: string | undefined;
}

function joinCodeFromHash(): string | undefined {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  const match = /#\/join\/([^/?#]+)/i.exec(hash);
  if (!match?.[1]) return undefined;
  return parseInviteInput(decodeURIComponent(match[1])) ?? undefined;
}

export function useBootstrap(): BootState {
  const state = useStore();
  const session = useSession();
  const joinCode = useRef<string | undefined>(joinCodeFromHash()).current;

  // 1) read the persisted auth session (live mode); no-op in demo.
  useEffect(() => {
    store.initAuth();
  }, []);

  // 2) demo mode: drop straight into the seeded group on first load, unless the
  //    user arrived via an invite link (let them go through the join flow).
  useEffect(() => {
    if (mode === 'demo' && !getSession() && !joinCode) setSession(DEMO_SESSION);
    // once, on mount — a later manual logout must NOT bounce back in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) open the group once we have an auth user + a session.
  const inited = useRef<string | null>(null);
  useEffect(() => {
    if (typeof state.authUserId === 'string' && session) {
      if (inited.current !== session.groupId) {
        inited.current = session.groupId;
        void store.initGroup(session.groupId);
        if (joinCode && location.hash.startsWith('#/join/')) {
          history.replaceState(null, '', location.pathname + location.search);
        }
      }
    } else if (!session) {
      inited.current = null;
    }
  }, [state.authUserId, session, joinCode]);

  // Group choice is NOT mandatory at sign-in: once authenticated we enter the
  // app; the active group is optional and can be created/joined/switched later.
  let phase: BootPhase;
  if (state.authUserId === 'loading') phase = 'loading';
  else if (state.authUserId === null) phase = 'auth';
  else if (session && state.status === 'error' && !state.group) phase = 'error';
  else phase = 'ready';

  return { phase, joinCode };
}
