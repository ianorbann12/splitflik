// Shared UI primitives for Deli. Styling mirrors the prototype's tokens; every
// colour is a CSS variable so both themes work. Components accept a `style`
// escape hatch for the many one-off layouts in the design.
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { initials as toInitials, personColor } from '../data/people';
import { IconChevronLeft, IconClose } from './icons';

// ------------------------------- Avatar ------------------------------------

export function Avatar({
  name = '',
  id,
  size = 42,
  color,
  text,
  style,
}: {
  name?: string;
  id?: string;
  size?: number;
  color?: string;
  text?: string;
  style?: CSSProperties;
}) {
  const bg = color ?? personColor(id ?? name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: `600 ${Math.round(size * 0.36)}px/1 Rubik`,
        flexShrink: 0,
        ...style,
      }}
    >
      {text ?? toInitials(name)}
    </div>
  );
}

// ------------------------------- Card --------------------------------------

type Tone = 'surface' | 'surface2' | 'surface3';

export function Card({
  tone = 'surface',
  children,
  style,
  onClick,
}: {
  tone?: Tone;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: `var(--${tone})`,
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '14px 16px',
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// --------------------------- SectionLabel ----------------------------------

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        font: '600 13px/1 Rubik',
        color: 'var(--text-sec)',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ------------------------------- Button ------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'pay' | 'danger';

const BUTTON_BASE: CSSProperties = {
  border: 'none',
  cursor: 'pointer',
  font: '600 15px/1 Rubik',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

function variantStyle(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case 'primary':
      return { background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 9999, padding: '16px 20px', font: '700 16px/1 Rubik' };
    case 'secondary':
      return { background: 'var(--surface3)', color: 'var(--link)', borderRadius: 14, padding: '13px 18px' };
    case 'ghost':
      return { background: 'transparent', color: 'var(--link)', borderRadius: 12, padding: '10px 14px' };
    case 'pay':
      return { background: 'var(--pay)', color: '#fff', borderRadius: 9999, padding: '10px 18px', font: '600 14px/1 Rubik' };
    case 'danger':
      return { background: 'var(--surface)', color: 'var(--neg)', border: '1px solid var(--border)', borderRadius: 16, padding: '15px 18px' };
  }
}

export function Button({
  variant = 'primary',
  full,
  children,
  style,
  ...rest
}: {
  variant?: ButtonVariant;
  full?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      style={{
        ...BUTTON_BASE,
        ...variantStyle(variant),
        ...(full ? { width: '100%' } : {}),
        ...(rest.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------- SegmentedControl --------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'pill' | 'block';
  style?: CSSProperties;
}) {
  const container: CSSProperties =
    variant === 'pill'
      ? { display: 'flex', background: 'var(--surface3)', borderRadius: 9999, padding: 3 }
      : { display: 'flex', background: 'var(--surface3)', borderRadius: 12, padding: 3 };
  return (
    <div style={{ ...container, ...style }}>
      {options.map((opt) => {
        const active = opt.value === value;
        const btn: CSSProperties =
          variant === 'pill'
            ? {
                border: 'none',
                borderRadius: 9999,
                padding: '7px 15px',
                font: `${active ? 600 : 500} 13px/1 Rubik`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--on-accent)' : 'var(--text-sec)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }
            : {
                flex: 1,
                border: 'none',
                borderRadius: 10,
                padding: 10,
                font: `${active ? 600 : 500} 13px/1 Rubik`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--on-accent)' : 'var(--text-sec)',
                cursor: 'pointer',
                ...(active ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : {}),
              };
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} style={btn}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------- Fields ------------------------------------

export function FieldLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ font: '500 13px/1 Rubik', color: 'var(--text)', marginBottom: 8, ...style }}>
      {children}
    </div>
  );
}

export function TextField({
  suffix,
  style,
  ...rest
}: { suffix?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const input = (
    <input
      style={{
        width: '100%',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: suffix ? '14px 40px 14px 16px' : '14px 16px',
        font: '400 15px/1.2 Rubik',
        color: 'var(--text)',
        background: 'var(--surface)',
        ...style,
      }}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div style={{ position: 'relative' }}>
      {input}
      <span
        style={{
          position: 'absolute',
          right: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          font: '600 15px/1 Rubik',
          color: 'var(--text-sec)',
        }}
      >
        {suffix}
      </span>
    </div>
  );
}

export function Select({
  children,
  style,
  ...rest
}: { children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      style={{
        width: '100%',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '14px 16px',
        font: '400 15px/1 Rubik',
        color: 'var(--text)',
        background: 'var(--surface2)',
        appearance: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

// ------------------------------ misc ---------------------------------------

export function OrDivider({ label = 'ali' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ font: '500 13px/1 Rubik', color: 'var(--text-sec)' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '36px 20px',
        color: 'var(--text-sec)',
        gap: 8,
      }}
    >
      {icon}
      <div style={{ font: '600 16px/1.3 Rubik', color: 'var(--text)' }}>{title}</div>
      {subtitle ? <div style={{ font: '400 14px/1.5 Rubik' }}>{subtitle}</div> : null}
    </div>
  );
}

export function Spinner({ size = 20, color = 'var(--link)' }: { size?: number; color?: string }) {
  return (
    <span
      className="deli-spin"
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        display: 'inline-block',
      }}
    />
  );
}

// ---------------------------- BottomSheet ----------------------------------

/** Modal bottom sheet for short forms/actions (scrim + slide-up panel). */
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Portal to <body>: a transformed ancestor (the swipe track) would otherwise
  // become the containing block for position:fixed and mis-place the sheet.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'var(--scrim)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        animation: 'deli-fade 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="deli-scroll"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '92%',
          overflowY: 'auto',
          background: 'var(--bg)',
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          borderTop: '1px solid var(--border-soft)',
          padding: '10px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          animation: 'deli-slideup 0.28s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--border)', margin: '4px auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ font: '700 20px/1.2 Rubik', color: 'var(--text)' }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Zapri"
            style={{ width: 34, height: 34, borderRadius: 9999, border: 'none', background: 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <IconClose size={17} color="var(--text)" strokeWidth={2.2} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------- Sheet -------------------------------------

/** Full-panel slide-in overlay with a back button + title and a scroll body. */
export function Sheet({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'deli-slide 0.28s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 'calc(env(safe-area-inset-top, 0px) + 20px) 16px 12px',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Nazaj"
          style={{
            width: 38,
            height: 38,
            borderRadius: 9999,
            border: 'none',
            background: 'var(--surface3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <IconChevronLeft size={18} color="var(--text)" strokeWidth={2.2} />
        </button>
        <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)' }}>{title}</div>
      </div>
      <div className="deli-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {children}
      </div>
    </div>
  );
}
