import { useCallback, useState, type ReactNode } from 'react';
import { ThemeProvider } from './theme';
import { FlikProvider } from './ui/FlikSheet';
import { AppShell, type Tab } from './ui/AppShell';
import { ToastHost } from './ui/Toast';
import { Button, Spinner } from './ui/kit';
import { SplitFlikLogo } from './auth/GateLayout';
import { ActivityFlow } from './screens/activity/ActivityFlow';
import { AuthGate } from './auth/AuthGate';
import { GroupGate } from './auth/GroupGate';
import { useBootstrap } from './useBootstrap';
import { setSession, store, useSession, useStore } from './data/store';
import { notifications } from './data/derive';
import { useNotifReadAt } from './data/uiPrefs';
import { Home } from './screens/Home';
import { Notifications } from './screens/Notifications';
import { Stats } from './screens/Stats';
import { Friends } from './screens/Friends';
import { Profile } from './screens/Profile';

export function App() {
  return (
    <ThemeProvider>
      <FlikProvider>
        <Root />
      </FlikProvider>
    </ThemeProvider>
  );
}

function Root() {
  const { phase, joinCode } = useBootstrap();
  if (phase === 'loading') return <Splash />;
  if (phase === 'auth') return <AuthGate />;
  if (phase === 'group') return <GroupGate initialCode={joinCode} />;
  if (phase === 'error') return <ErrorScreen />;
  return <MainApp />;
}

function ErrorScreen() {
  const session = useSession();
  const logout = () => {
    void store.authSignOut();
    store.teardownGroup();
    setSession(null);
  };
  return (
    <div className="app-frame">
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '0 32px',
          textAlign: 'center',
        }}
      >
        <SplitFlikLogo size={40} />
        <div style={{ font: '600 18px/1.3 Rubik', color: 'var(--text)' }}>Nalaganje ni uspelo</div>
        <div style={{ font: '400 14px/1.5 Rubik', color: 'var(--text-sec)' }}>
          Podatkov skupine ni bilo mogoče naložiti. Preveri povezavo in poskusi znova.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280, marginTop: 8 }}>
          <Button
            variant="primary"
            full
            onClick={() => {
              if (session) void store.initGroup(session.groupId);
              else void store.refetch();
            }}
          >
            Poskusi znova
          </Button>
          <Button variant="ghost" full onClick={logout}>
            Odjava
          </Button>
        </div>
      </div>
    </div>
  );
}

function Splash() {
  return (
    <div className="app-frame">
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <SplitFlikLogo size={44} />
        <Spinner />
      </div>
    </div>
  );
}

interface ActivityLaunch {
  open: boolean;
  outingId?: string;
}

function MainApp() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const readAt = useNotifReadAt();
  const [tab, setTab] = useState<Tab>('home');
  const [activity, setActivity] = useState<ActivityLaunch>({ open: false });

  const { unreadCount } = notifications(state, meId, readAt);

  const openNew = useCallback(() => setActivity({ open: true }), []);
  const openOuting = useCallback((outingId: string) => setActivity({ open: true, outingId }), []);
  const closeActivity = useCallback(() => setActivity({ open: false }), []);

  const onLogout = useCallback(() => {
    void store.authSignOut();
    store.teardownGroup();
    setSession(null);
    setTab('home');
  }, []);

  const panels: Record<Tab, ReactNode> = {
    home: <Home onNewActivity={openNew} onOpenActivity={openOuting} />,
    notifs: <Notifications />,
    stats: <Stats />,
    friends: <Friends />,
    profile: <Profile onLogout={onLogout} />,
  };

  const overlay = activity.open ? (
    <ActivityFlow onClose={closeActivity} {...(activity.outingId ? { initialOutingId: activity.outingId } : {})} />
  ) : null;

  return (
    <AppShell
      tab={tab}
      onTab={setTab}
      panels={panels}
      unread={unreadCount}
      overlay={overlay}
      toast={<ToastHost />}
    />
  );
}
