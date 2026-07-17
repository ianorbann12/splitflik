import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider } from './theme';
import { FlikProvider } from './ui/FlikSheet';
import { AppShell, type Tab } from './ui/AppShell';
import { ToastHost } from './ui/Toast';
import { Button, Spinner } from './ui/kit';
import { SplitFlikLogo } from './auth/GateLayout';
import { ActivityFlow } from './screens/activity/ActivityFlow';
import { GroupSwitcher } from './screens/GroupSwitcher';
import { AuthGate } from './auth/AuthGate';
import { useBootstrap } from './useBootstrap';
import { setSession, store, useSession, useStore } from './data/store';
import { loadFriends } from './data/friends';
import { loadRequests, useIncomingRequests } from './data/friendRequests';
import { clearLocalProfile, getLocalProfile } from './data/profile';
import { useSubscriptionOpen } from './data/subscription';
import { SubscriptionSheet } from './screens/SubscriptionSheet';
import { notifications } from './data/derive';
import { useNotifReadAt } from './data/uiPrefs';
import { Home } from './screens/Home';
import { Notifications } from './screens/Notifications';
import { Stats } from './screens/Stats';
import { Friends } from './screens/Friends';
import { Profile } from './screens/Profile';

type SwitcherView = 'list' | 'create' | 'join';

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
  if (phase === 'error') return <ErrorScreen />;
  return <MainApp {...(joinCode ? { joinCode } : {})} />;
}

function ErrorScreen() {
  const session = useSession();
  const logout = () => {
    void store.authSignOut();
    store.teardownGroup();
    clearLocalProfile();
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

function MainApp({ joinCode }: { joinCode?: string }) {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const userId = typeof state.authUserId === 'string' ? state.authUserId : '';
  const readAt = useNotifReadAt();
  const [tab, setTab] = useState<Tab>('home');
  const [activity, setActivity] = useState<ActivityLaunch>({ open: false });
  const [switcher, setSwitcher] = useState<{ open: boolean; view?: SwitcherView; code?: string }>({
    open: false,
  });

  const { unreadCount } = notifications(state, meId, readAt);
  const incoming = useIncomingRequests();
  const subOpen = useSubscriptionOpen();
  const myPhone = getLocalProfile()?.phone ?? state.people.find((p) => p.id === meId)?.phone ?? '';

  useEffect(() => {
    if (userId) void loadFriends(userId);
  }, [userId]);

  useEffect(() => {
    if (userId) void loadRequests(userId, myPhone);
  }, [userId, myPhone]);

  // Arrived via an invite link with no active group → open the join sheet.
  useEffect(() => {
    if (joinCode && !session) setSwitcher({ open: true, view: 'join', code: joinCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = useCallback(() => setActivity({ open: true }), []);
  const openOuting = useCallback((outingId: string) => setActivity({ open: true, outingId }), []);
  const closeActivity = useCallback(() => setActivity({ open: false }), []);
  // `view` may be omitted, or an onClick handler may hand us a click event —
  // only forward it when it's an actual view name.
  const openGroups = useCallback(
    (view?: SwitcherView) => setSwitcher({ open: true, ...(typeof view === 'string' ? { view } : {}) }),
    [],
  );

  const onLogout = useCallback(() => {
    void store.authSignOut();
    store.teardownGroup();
    clearLocalProfile();
    setSession(null);
    setTab('home');
  }, []);

  const panels: Record<Tab, ReactNode> = {
    home: <Home onNewActivity={openNew} onOpenActivity={openOuting} onOpenGroups={openGroups} />,
    notifs: <Notifications />,
    stats: <Stats />,
    friends: <Friends />,
    profile: <Profile onLogout={onLogout} />,
  };

  const overlay = activity.open ? (
    <ActivityFlow onClose={closeActivity} {...(activity.outingId ? { initialOutingId: activity.outingId } : {})} />
  ) : null;

  return (
    <>
      <AppShell
        tab={tab}
        onTab={setTab}
        panels={panels}
        unread={unreadCount + incoming.length}
        overlay={overlay}
        toast={<ToastHost />}
      />
      {switcher.open ? (
        <GroupSwitcher
          {...(switcher.view ? { initialView: switcher.view } : {})}
          {...(switcher.code ? { initialJoinCode: switcher.code } : {})}
          onClose={() => setSwitcher({ open: false })}
        />
      ) : null}
      {subOpen ? <SubscriptionSheet /> : null}
    </>
  );
}
