// Profil — personal data (edited via the "Osebni podatki" section), profile
// photo (changed via the avatar only), appearance, subscription, and logout.
// Group name + invite code live with the group, not on the individual profile.
import { useRef, useState } from 'react';
import type { Person } from '../../types';
import { useSession, useStore } from '../data/store';
import { store } from '../data/store';
import { fileToAvatarDataUrl } from '../data/image';
import { getLocalProfile, setLocalProfile } from '../data/profile';
import { usePlan } from '../data/plan';
import { openSubscription } from '../data/subscription';
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const currentCurrency = group?.currency ?? 'EUR';
  const plan = usePlan();

  // The avatar pencil changes ONLY the photo (personal data is edited from the
  // "Osebni podatki" section). Name/phone are preserved.
  const changePhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      const url = await fileToAvatarDataUrl(file);
      if (me) store.savePerson({ ...me, avatarUrl: url }, false);
      setLocalProfile({ name: dispName || 'Uporabnik', phone: dispPhone, avatarUrl: url });
      if (userId) void store.updateProfile(userId, { name: dispName, phone: dispPhone, avatarUrl: url });
      store.toast('Profilna slika posodobljena');
    } catch {
      store.toast('Slike ni bilo mogoče obdelati.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const infoRows: { label: string; value: string }[] = [
    { label: 'Ime in priimek', value: dispName || '—' },
    { label: 'Telefon', value: dispPhone ? formatPhone(dispPhone) : '—' },
  ];

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)', marginBottom: 20 }}>Profil</div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={dispName} id={meId || userId || 'me'} size={92} text={initials(dispName || '?')} {...(dispAvatar ? { src: dispAvatar } : {})} />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void changePhoto(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => photoRef.current?.click()}
            disabled={photoBusy}
            aria-label="Spremeni profilno sliko"
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
          { value: 'glossy', label: 'Temno' },
        ]}
        style={{ marginBottom: 22 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Osebni podatki</SectionLabel>
        <button
          onClick={() => setEditing(true)}
          style={{ background: 'none', border: 'none', color: 'var(--link)', font: '600 13px/1 Rubik', cursor: 'pointer', marginBottom: 10 }}
        >
          Uredi
        </button>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden', marginBottom: 22 }}>
        {infoRows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: i < infoRows.length - 1 ? '1px solid var(--border-soft)' : 'none',
              gap: 12,
            }}
          >
            <span style={{ font: '400 14px/1 Rubik', color: 'var(--text-sec)', flexShrink: 0 }}>{r.label}</span>
            <span style={{ font: '500 15px/1.3 Rubik', color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>

      <SectionLabel>Naročnina</SectionLabel>
      <div
        onClick={() => openSubscription()}
        style={{ cursor: 'pointer', background: plan === 'paid' ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${plan === 'paid' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 20, padding: '14px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 15px/1.2 Rubik', color: 'var(--text)' }}>SplitFlik Plus</div>
          <div style={{ font: '400 13px/1.35 Rubik', color: 'var(--text-sec)', marginTop: 3 }}>
            {plan === 'paid'
              ? 'Aktivno · brez oglasov, neomejeno oseb'
              : '30 računov/teden, neomejeno oseb, brez oglasov'}
          </div>
        </div>
        <span
          style={{ font: '600 13px/1 Rubik', flexShrink: 0, color: plan === 'paid' ? 'var(--link)' : 'var(--on-accent)', background: plan === 'paid' ? 'transparent' : 'var(--accent)', borderRadius: 9999, padding: plan === 'paid' ? 0 : '9px 14px' }}
        >
          {plan === 'paid' ? 'Upravljaj' : 'Nadgradi'}
        </span>
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
  const avatar = initial.avatarUrl; // photo is changed separately (avatar pencil)

  const save = () => {
    if (!name.trim()) return store.toast('Vnesi ime.');
    let normalized: string | undefined;
    if (phone.trim()) {
      const n = normalizePhone(phone);
      if (!n) return store.toast('Telefonska številka ni veljavna.');
      normalized = n;
    }
    // Update the group roster entry only when there is one; keep the photo as-is.
    if (me) {
      store.savePerson(
        {
          id: me.id,
          groupId: me.groupId,
          name: name.trim(),
          ...(normalized ? { phone: normalized } : {}),
          ...(me.claimedBy ? { claimedBy: me.claimedBy } : {}),
          ...(avatar ? { avatarUrl: avatar } : {}),
        },
        false,
      );
    }
    setLocalProfile({
      name: name.trim(),
      phone: normalized ?? initial.phone ?? '',
      ...(avatar ? { avatarUrl: avatar } : {}),
    });
    // Keep the canonical server profile in sync (best-effort).
    if (userId) {
      void store.updateProfile(userId, {
        name: name.trim(),
        ...(normalized ? { phone: normalized } : {}),
        ...(avatar ? { avatarUrl: avatar } : {}),
      });
    }
    store.toast('Profil posodobljen');
    onClose();
  };

  return (
    <BottomSheet title="Uredi osebne podatke" onClose={onClose}>
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
