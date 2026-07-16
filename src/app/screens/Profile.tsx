// Profil — account details, appearance toggle (light / glossy dark), the group's
// invite code, and logout.
import { useRef, useState } from 'react';
import type { Person } from '../../types';
import { useSession, useStore } from '../data/store';
import { store } from '../data/store';
import { fileToAvatarDataUrl } from '../data/image';
import { getLocalProfile, setLocalProfile } from '../data/profile';
import { currencySymbol, formatPhone, normalizePhone, SUPPORTED_CURRENCIES } from '../format';
import { initials } from '../data/people';
import { useTheme, type Theme } from '../theme';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, BottomSheet, Button, FieldLabel, SectionLabel, Segmented, TextField } from '../ui/kit';
import { IconCheck, IconPencil } from '../ui/icons';

export function Profile({ onLogout }: { onLogout: () => void }) {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const me = state.people.find((p) => p.id === meId);
  const group = state.group;
  // Fall back to the local profile (set at registration) so a freshly-registered
  // user without an active group still sees their own name/phone/photo here.
  const local = getLocalProfile();
  const userId = typeof state.authUserId === 'string' ? state.authUserId : '';
  const dispName = me?.name ?? local?.name ?? '';
  const dispPhone = me?.phone ?? local?.phone ?? '';
  const dispAvatar = me?.avatarUrl ?? local?.avatarUrl;
  const { theme, setTheme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currentCurrency = group?.currency ?? 'EUR';

  const copyInvite = async () => {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      store.toast('Koda kopirana');
    } catch {
      store.toast('Kopiranje ni uspelo');
    }
  };

  const infoRows: { label: string; value: string; onClick?: () => void }[] = [
    { label: 'Ime in priimek', value: dispName || '—' },
    { label: 'Telefon', value: dispPhone ? formatPhone(dispPhone) : '—' },
    { label: 'Skupina', value: group?.name ?? '—' },
    { label: 'Vabilna koda', value: group?.inviteCode ?? '—', onClick: copyInvite },
  ];

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)', marginBottom: 20 }}>Profil</div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={dispName} id={meId || userId || 'me'} size={92} text={initials(dispName || '?')} {...(dispAvatar ? { src: dispAvatar } : {})} />
          <button
            onClick={() => setEditing(true)}
            aria-label="Uredi profil"
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 30,
              height: 30,
              borderRadius: 9999,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <IconPencil size={14} color="var(--accent)" strokeWidth={2} />
          </button>
        </div>
        <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)', marginTop: 12 }}>{dispName || 'Uporabnik'}</div>
      </div>

      <SectionLabel>Videz</SectionLabel>
      <Segmented<Theme>
        variant="block"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: 'Svetlo' },
          { value: 'glossy', label: 'Glossy dark' },
        ]}
        style={{ marginBottom: 22 }}
      />

      <SectionLabel>Osebni podatki</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden', marginBottom: 22 }}>
        {infoRows.map((r, i) => (
          <div
            key={r.label}
            onClick={r.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: i < infoRows.length - 1 ? '1px solid var(--border-soft)' : 'none',
              gap: 12,
              ...(r.onClick ? { cursor: 'pointer' } : {}),
            }}
          >
            <span style={{ font: '400 14px/1 Rubik', color: 'var(--text-sec)', flexShrink: 0 }}>{r.label}</span>
            <span
              style={{
                font: '500 15px/1.3 Rubik',
                color: r.onClick ? 'var(--link)' : 'var(--text)',
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                ...(r.label === 'Vabilna koda' ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } : {}),
              }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>

      <SectionLabel>Nastavitve</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden', marginBottom: 22 }}>
        <div
          onClick={() => group && setCurrencyOpen(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-soft)', cursor: group ? 'pointer' : 'default' }}
        >
          <span style={{ font: '500 15px/1 Rubik', color: 'var(--text)' }}>Valuta</span>
          <span style={{ font: '400 14px/1 Rubik', color: group ? 'var(--link)' : 'var(--text-sec)' }}>
            {currentCurrency} ({currencySymbol(currentCurrency)})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <span style={{ font: '500 15px/1 Rubik', color: 'var(--text)' }}>Jezik</span>
          <span style={{ font: '400 14px/1 Rubik', color: 'var(--text-sec)' }}>Slovenščina</span>
        </div>
      </div>

      <Button variant="danger" full onClick={onLogout}>
        Odjava
      </Button>

      {editing ? (
        <ProfileEditSheet
          initial={{ name: dispName, phone: dispPhone, ...(dispAvatar ? { avatarUrl: dispAvatar } : {}) }}
          me={me ?? null}
          userId={userId}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {currencyOpen && group ? (
        <BottomSheet title="Valuta skupine" onClose={() => setCurrencyOpen(false)}>
          <div style={{ font: '400 13px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 14 }}>
            Vsi zneski v skupini «{group.name}» bodo prikazani v izbrani valuti.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUPPORTED_CURRENCIES.map((c) => {
              const on = c === currentCurrency;
              return (
                <button
                  key={c}
                  onClick={() => {
                    store.setGroupCurrency(group.id, c);
                    store.toast('Valuta posodobljena');
                    setCurrencyOpen(false);
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: on ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 14, padding: '13px 15px', cursor: 'pointer' }}
                >
                  <span style={{ font: '600 15px/1 Rubik', color: 'var(--text)' }}>
                    {c} ({currencySymbol(c)})
                  </span>
                  {on ? <IconCheck size={18} color="var(--link)" strokeWidth={2.4} /> : null}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}

function ProfileEditSheet({
  initial,
  me,
  userId,
  onClose,
}: {
  initial: { name: string; phone: string; avatarUrl?: string };
  me: Person | null;
  userId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(initial.avatarUrl);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarId = me?.id ?? userId ?? 'me';

  const pickImage = async (file: File) => {
    setBusy(true);
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file));
    } catch {
      store.toast('Slike ni bilo mogoče obdelati.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!name.trim()) return store.toast('Vnesi ime.');
    let normalized: string | undefined;
    if (phone.trim()) {
      const n = normalizePhone(phone);
      if (!n) return store.toast('Telefonska številka ni veljavna.');
      normalized = n;
    }
    // Update the group roster entry only when there is one.
    if (me) {
      store.savePerson(
        {
          id: me.id,
          groupId: me.groupId,
          name: name.trim(),
          ...(normalized ? { phone: normalized } : {}),
          ...(me.claimedBy ? { claimedBy: me.claimedBy } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        },
        false,
      );
    }
    setLocalProfile({
      name: name.trim(),
      phone: normalized ?? initial.phone ?? '',
      ...(avatarUrl ? { avatarUrl } : {}),
    });
    // Keep the canonical server profile in sync (best-effort).
    if (userId) {
      void store.updateProfile(userId, {
        name: name.trim(),
        ...(normalized ? { phone: normalized } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      });
    }
    store.toast('Profil posodobljen');
    onClose();
  };

  return (
    <BottomSheet title="Uredi profil" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Avatar name={name} id={avatarId} size={80} {...(avatarUrl ? { src: avatarUrl } : {})} />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickImage(f);
            e.target.value = '';
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--link)', font: '600 14px/1 Rubik', cursor: 'pointer' }}>
            {busy ? 'Obdelujem…' : avatarUrl ? 'Zamenjaj sliko' : 'Dodaj sliko'}
          </button>
          {avatarUrl ? (
            <button onClick={() => setAvatarUrl(undefined)} style={{ background: 'none', border: 'none', color: 'var(--text-sec)', font: '600 14px/1 Rubik', cursor: 'pointer' }}>
              Odstrani
            </button>
          ) : null}
        </div>
      </div>
      <FieldLabel>Ime in priimek</FieldLabel>
      <TextField value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />
      <FieldLabel>Telefon</FieldLabel>
      <TextField placeholder="031 123 456" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 18 }} />
      <Button variant="primary" full onClick={save}>
        Shrani
      </Button>
    </BottomSheet>
  );
}
