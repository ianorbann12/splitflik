// The phone shell: a horizontally-swipeable 5-tab track plus the bottom nav,
// exactly the interaction model from the prototype (drag with finger tracking,
// commit past ~18% of the width, rubber-band at the edges). Screens are passed
// in as an ordered map; the active tab drives the track transform.
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { IconBell, IconHome, IconStats, IconUser, IconUsers } from './icons';

export type Tab = 'notifs' | 'stats' | 'home' | 'friends' | 'profile';

export const NAV_ORDER: Tab[] = ['notifs', 'stats', 'home', 'friends', 'profile'];

/** Standard page padding for a scroll panel (clears status bar + bottom nav). */
export const PAGE_PADDING =
  'calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 104px)';

interface NavItem {
  tab: Tab;
  label: string;
  Icon: (p: { size?: number; color?: string; strokeWidth?: number }) => ReactNode;
}

const NAV: NavItem[] = [
  { tab: 'notifs', label: 'Obvestila', Icon: IconBell },
  { tab: 'stats', label: 'Statistika', Icon: IconStats },
  { tab: 'home', label: 'Domov', Icon: IconHome },
  { tab: 'friends', label: 'Prijatelji', Icon: IconUsers },
  { tab: 'profile', label: 'Profil', Icon: IconUser },
];

const COMMIT_RATIO = 0.18;
const RUBBER = 0.3;

export function AppShell({
  tab,
  onTab,
  panels,
  unread = 0,
  overlay,
  toast,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  panels: Record<Tab, ReactNode>;
  unread?: number;
  overlay?: ReactNode;
  toast?: ReactNode;
}) {
  const idx = NAV_ORDER.indexOf(tab);
  const [drag, setDrag] = useState<{ x: number; active: boolean }>({ x: 0, active: false });
  const start = useRef<{ x: number; y: number; w: number; axis: 'x' | 'y' | null; id: number } | null>(
    null,
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = {
      x: e.clientX,
      y: e.clientY,
      w: e.currentTarget.getBoundingClientRect().width,
      axis: null,
      id: e.pointerId,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') {
        try {
          e.currentTarget.setPointerCapture(s.id);
        } catch {
          // capture is best-effort
        }
      }
    }
    if (s.axis === 'x') {
      let d = dx;
      if ((idx === 0 && d > 0) || (idx === NAV_ORDER.length - 1 && d < 0)) d *= RUBBER;
      setDrag({ x: d, active: true });
    }
  };

  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (s?.axis === 'x') {
      const w = s.w || 360;
      let next = idx;
      if (drag.x < -w * COMMIT_RATIO && idx < NAV_ORDER.length - 1) next = idx + 1;
      else if (drag.x > w * COMMIT_RATIO && idx > 0) next = idx - 1;
      const nextTab = NAV_ORDER[next];
      if (next !== idx && nextTab) onTab(nextTab);
    }
    setDrag({ x: 0, active: false });
  };

  const track: CSSProperties = {
    display: 'flex',
    width: '500%',
    height: '100%',
    transform: `translateX(calc(${-idx * 20}% + ${drag.active ? drag.x : 0}px))`,
    transition: drag.active ? 'none' : 'transform 0.34s cubic-bezier(0.22,1,0.36,1)',
    willChange: 'transform',
  };

  return (
    <div className="app-frame">
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={track}>
          {NAV_ORDER.map((t) => (
            <div
              key={t}
              className="splitflik-scroll"
              style={{ width: '20%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}
            >
              {panels[t]}
            </div>
          ))}
        </div>
      </div>

      <nav
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-around',
          padding: '10px 8px calc(env(safe-area-inset-bottom, 0px) + 16px)',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
          position: 'relative',
          zIndex: 6,
        }}
      >
        {NAV.map(({ tab: t, label, Icon }) => {
          const active = t === tab;
          return (
            <button
              key={t}
              onClick={() => onTab(t)}
              aria-label={label}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                cursor: 'pointer',
                width: 62,
                color: active ? 'var(--link)' : 'var(--text-sec)',
                position: 'relative',
              }}
            >
              <Icon size={25} strokeWidth={1.9} />
              {t === 'notifs' && unread > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: 12,
                    minWidth: 17,
                    height: 17,
                    padding: '0 4px',
                    borderRadius: 9999,
                    background: 'var(--neg)',
                    color: '#fff',
                    font: '600 10px/17px Rubik',
                    textAlign: 'center',
                  }}
                >
                  {unread}
                </span>
              ) : null}
              <span style={{ font: '500 10px/1 Rubik' }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {overlay}
      {toast}
    </div>
  );
}
