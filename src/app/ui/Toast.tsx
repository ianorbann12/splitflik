import { useStore } from '../data/store';

/** Transient confirmation pill, bottom-centered within the frame. */
export function ToastHost() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div
      key={toast}
      style={{
        position: 'absolute',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--toast-bg)',
        color: 'var(--toast-fg)',
        font: '500 14px/1.35 Rubik',
        padding: '12px 20px',
        borderRadius: 9999,
        zIndex: 80,
        animation: 'splitflik-toast 0.25s ease',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        maxWidth: '84%',
        textAlign: 'center',
      }}
    >
      {toast}
    </div>
  );
}
