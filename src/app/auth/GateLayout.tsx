// Shared frame for the pre-app gates (auth + group). Centered card inside the
// phone frame, Deli wordmark, and a light/dark toggle so the look can be set
// before signing in.
import type { ReactNode } from 'react';
import { useTheme } from '../theme';

export function DeliLogo({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--accent)',
        color: 'var(--on-accent)',
        font: `700 ${Math.round(size * 0.5)}px/1 Rubik`,
        letterSpacing: '0.5px',
        padding: `${Math.round(size * 0.32)}px ${Math.round(size * 0.5)}px`,
        borderRadius: 9999,
      }}
    >
      Deli
    </div>
  );
}

export function GateLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="app-frame">
      <div
        className="deli-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: 'calc(env(safe-area-inset-top, 0px) + 20px) 24px calc(env(safe-area-inset-bottom, 0px) + 28px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <DeliLogo />
          <button
            onClick={toggleTheme}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--text-sec)',
              borderRadius: 9999,
              padding: '7px 14px',
              font: '500 12px/1 Rubik',
              cursor: 'pointer',
            }}
          >
            {theme === 'light' ? 'Svetlo' : 'Temno'}
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 0' }}>
          <h1 style={{ font: '700 28px/1.15 Rubik', color: 'var(--text)', margin: '0 0 8px' }}>
            {title}
          </h1>
          {subtitle ? (
            <p style={{ font: '400 15px/1.55 Rubik', color: 'var(--text-sec)', margin: '0 0 26px' }}>
              {subtitle}
            </p>
          ) : (
            <div style={{ height: 20 }} />
          )}
          {children}
        </div>

        {footer ? <div style={{ marginTop: 'auto' }}>{footer}</div> : null}
      </div>
    </div>
  );
}
