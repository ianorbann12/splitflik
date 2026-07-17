// Multi-group hub: switch between your groups, create a new named group (adding
// friends by selection + a shareable link), or join one by special code / phone.
// Reuses your saved profile so signing in never re-creates a profile.
import { useEffect, useState } from 'react';
import type { Group, Person } from '../../types';
import { currencySymbol, normalizePhone, SUPPORTED_CURRENCIES } from '../format';
import { getLocalProfile, setLocalProfile } from '../data/profile';
import { loadFriends, useFriends } from '../data/friends';
import { avatarSrcProp } from '../data/people';
import { newInviteCode, setSession, store, useStore } from '../data/store';
import { maxMembers } from '../data/plan';
import { openSubscription } from '../data/subscription';
import { Avatar, BottomSheet, Button, ConfirmDialog, FieldLabel, Segmented, Select, TextField } from '../ui/kit';
import { IconCheck, IconLogout, IconPlus, IconUsers } from '../ui/icons';

type View = 'list' | 'create' | 'join';
type JoinMethod = 'code' | 'phone';

// A found-but-not-yet-joined group, so we can show its name for confirmation.
type JoinPreview = { group: Group; people?: Person[]; person?: Person };

function extractCode(raw: string): string {
  const t = raw.trim();
  const m = /#\/join\/([^/?#]+)/i.exec(t);
  return (m?.[1] ?? t).toLowerCase();
}

export function GroupSwitcher({
  initialView = 'list',
  initialJoinCode,
  onClose,
}: {
  initialView?: View;
  initialJoinCode?: string;
  onClose: () => void;
}) {
  const state = useStore();
  const userId = typeof state.authUserId === 'string' ? state.authUserId : 'anon';
  const activeId = state.group?.id;
  const friends = useFriends();
  const profile = getLocalProfile();

  const [view, setView] = useState<View>(initialJoinCode ? 'join' : initialView);
  const [groups, setGroups] = useState<{ group: Group; personId: string }[]>([]);
  const [leaving, setLeaving] = useState<{ group: Group; personId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create
  const [groupName, setGroupName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [selected, setSelected] = useState<string[]>([]);
  const [myName, setMyName] = useState(profile?.name ?? '');
  const [myPhone, setMyPhone] = useState(profile?.phone ?? '');

  // join
  const [joinMethod, setJoinMethod] = useState<JoinMethod>('code');
  const [codeInput, setCodeInput] = useState(initialJoinCode ?? '');
  const [preview, setPreview] = useState<JoinPreview | null>(null);

  useEffect(() => {
    void loadFriends(userId);
    void store.fetchMyGroups(userId).then(setGroups).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const identity = (): { name: string; phone: string; avatarUrl?: string } | null => {
    const p = getLocalProfile();
    const name = (p?.name ?? myName).trim();
    const phone = normalizePhone(p?.phone ?? myPhone);
    if (!name || !phone) return null;
    return { name, phone, ...(p?.avatarUrl ? { avatarUrl: p.avatarUrl } : {}) };
  };

  const switchTo = (g: { group: Group; personId: string }) => {
    setSession({ groupId: g.group.id, personId: g.personId, inviteCode: g.group.inviteCode });
    onClose();
  };

  const doLeave = async (g: { group: Group; personId: string }) => {
    setLeaving(null);
    try {
      await store.leaveGroup(g.group.id, userId);
    } catch {
      store.toast('Skupine ni bilo mogoče zapustiti.');
      return;
    }
    store.toast(`Zapustil skupino «${g.group.name}»`);
    if (g.group.id === activeId) {
      // Left the active group → drop back to the no-group home.
      store.teardownGroup();
      setSession(null);
      onClose();
    } else {
      setGroups((cur) => cur.filter((x) => x.group.id !== g.group.id));
    }
  };

  const create = async () => {
    setError(null);
    if (!groupName.trim()) return setError('Poimenuj skupino.');
    const id = identity();
    if (!id) return setError('Vnesi svoje ime in telefonsko številko.');
    setBusy(true);
    try {
      const inviteCode = newInviteCode();
      const { groupId, personId } = await store.createGroup(
        groupName.trim(),
        inviteCode,
        { name: id.name, phone: id.phone, claimedBy: userId },
        currency,
      );
      const chosen = friends
        .filter((f) => selected.includes(f.phone))
        .map((f) => ({ phone: f.phone, ...(f.name ? { name: f.name } : {}), ...(f.avatarUrl ? { avatarUrl: f.avatarUrl } : {}) }));
      await store.addGroupMembers(groupId, chosen);
      setLocalProfile({ name: id.name, phone: id.phone, ...(id.avatarUrl ? { avatarUrl: id.avatarUrl } : {}) });
      setSession({ groupId, personId, inviteCode });
      onClose();
    } catch {
      setError('Skupine ni bilo mogoče ustvariti.');
      setBusy(false);
    }
  };

  // Step 1: look up the group so we can show its name before joining.
  const findByCode = async () => {
    setError(null);
    const code = extractCode(codeInput);
    if (code.length < 8) return setError('Koda je prekratka — vsaj 8 znakov.');
    setBusy(true);
    try {
      const res = await store.fetchGroupByInvite(code);
      if (!res) {
        setError('Skupine s to kodo ni.');
        return;
      }
      setPreview({ group: res.group, people: res.people });
    } catch {
      setError('Iskanje ni uspelo.');
    } finally {
      setBusy(false);
    }
  };

  const findByPhone = async () => {
    setError(null);
    const id = identity();
    if (!id) return setError('Vnesi svoje ime in telefonsko številko.');
    setBusy(true);
    try {
      const res = await store.fetchPendingByPhone(id.phone);
      if (!res) {
        setError('Za tvojo številko ni povabila v skupino.');
        return;
      }
      setPreview({ group: res.group, person: res.person });
    } catch {
      setError('Iskanje ni uspelo.');
    } finally {
      setBusy(false);
    }
  };

  // Step 2: confirm and actually join the previewed group.
  const finalizeJoin = async () => {
    if (!preview) return;
    setError(null);
    const id = identity();
    if (!id) return setError('Vnesi svoje ime in telefonsko številko.');
    setBusy(true);
    try {
      let personId: string;
      if (preview.person) {
        await store.claimPersonWithName(preview.person.id, userId, id.name, id.avatarUrl);
        personId = preview.person.id;
      } else {
        const pending = (preview.people ?? []).find((p) => p.phone === id.phone && !p.claimedBy);
        if (pending) {
          await store.claimPersonWithName(pending.id, userId, id.name, id.avatarUrl);
          personId = pending.id;
        } else {
          personId = await store.joinAsNewPerson(
            preview.group.id,
            id.name,
            id.phone,
            userId,
            id.avatarUrl,
          );
        }
      }
      setLocalProfile({ name: id.name, phone: id.phone, ...(id.avatarUrl ? { avatarUrl: id.avatarUrl } : {}) });
      setSession({ groupId: preview.group.id, personId, inviteCode: preview.group.inviteCode });
      onClose();
    } catch {
      setError('Pridružitev ni uspela.');
      setBusy(false);
    }
  };

  const toggleFriend = (phone: string) =>
    setSelected((cur) => {
      if (cur.includes(phone)) return cur.filter((x) => x !== phone);
      if (1 + cur.length >= maxMembers()) {
        // +1 for you (the founder); free plan caps the group at maxMembers().
        store.toast(`Brezplačno do ${maxMembers()} oseb v skupini. Nadgradi na Plus.`);
        openSubscription();
        return cur;
      }
      return [...cur, phone];
    });

  const title = view === 'create' ? 'Nova skupina' : view === 'join' ? 'Pridruži se skupini' : 'Tvoje skupine';
  const needIdentity = !(profile?.name && profile.phone);

  return (
    <BottomSheet title={title} onClose={onClose}>
      {view === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.length === 0 ? (
            <div style={{ font: '400 14px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 4 }}>
              Nimaš še skupin. Ustvari novo ali se pridruži obstoječi.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.group.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => switchTo(g)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: `1px solid ${g.group.id === activeId ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 16, padding: '13px 15px', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 15px/1.2 Rubik', color: 'var(--text)' }}>{g.group.name}</div>
                    {g.group.id === activeId ? (
                      <div style={{ font: '400 12px/1.3 Rubik', color: 'var(--link)' }}>Trenutna skupina</div>
                    ) : null}
                  </div>
                  {g.group.id === activeId ? <IconCheck size={18} color="var(--link)" strokeWidth={2.4} /> : null}
                </button>
                <button
                  onClick={() => setLeaving(g)}
                  aria-label={`Zapusti skupino ${g.group.name}`}
                  style={{ width: 46, height: 46, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <IconLogout size={17} color="var(--neg)" strokeWidth={2} />
                </button>
              </div>
            ))
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="primary" full onClick={() => setView('create')}>
              <IconPlus size={16} color="var(--on-accent)" strokeWidth={2.4} /> Ustvari
            </Button>
            <Button variant="secondary" full onClick={() => setView('join')}>
              Pridruži se
            </Button>
          </div>
        </div>
      ) : null}

      {view === 'create' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Ime skupine</FieldLabel>
            <TextField placeholder="npr. Kavica ob petkih" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Valuta</FieldLabel>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({currencySymbol(c)})
                </option>
              ))}
            </Select>
            <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginTop: 6 }}>
              Vsi zneski v tej skupini so v izbrani valuti.
            </div>
          </div>
          {needIdentity ? (
            <>
              <div>
                <FieldLabel>Tvoje ime</FieldLabel>
                <TextField placeholder="Ime in priimek" value={myName} onChange={(e) => setMyName(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Telefon</FieldLabel>
                <TextField placeholder="031 123 456" inputMode="tel" value={myPhone} onChange={(e) => setMyPhone(e.target.value)} />
              </div>
            </>
          ) : null}
          {friends.length > 0 ? (
            <div>
              <FieldLabel>Dodaj prijatelje ({selected.length})</FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {friends.map((f) => {
                  const on = selected.includes(f.phone);
                  return (
                    <button
                      key={f.phone}
                      onClick={() => toggleFriend(f.phone)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-soft)' : 'transparent', borderRadius: 9999, padding: '5px 12px 5px 5px', cursor: 'pointer', opacity: on ? 1 : 0.6 }}
                    >
                      <Avatar name={f.name ?? f.phone} id={f.phone} size={24} {...avatarSrcProp(f.avatarUrl)} />
                      <span style={{ font: '500 12px/1 Rubik', color: 'var(--text)' }}>{f.name ?? f.phone}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginTop: 6 }}>
                Ali pa jih povabi s povezavo, ko je skupina ustvarjena.
              </div>
            </div>
          ) : null}
          {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}
          <Button variant="primary" full onClick={() => void create()} disabled={busy}>
            {busy ? 'Ustvarjam…' : 'Ustvari skupino'}
          </Button>
          <Button variant="ghost" full onClick={() => setView('list')}>
            Nazaj
          </Button>
        </div>
      ) : null}

      {view === 'join' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {preview ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 16, padding: '14px 15px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconUsers size={22} color="var(--accent)" strokeWidth={2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)' }}>Pridružuješ se skupini</div>
                  <div style={{ font: '700 17px/1.25 Rubik', color: 'var(--text)' }}>{preview.group.name}</div>
                </div>
              </div>
              {needIdentity ? (
                <>
                  <div>
                    <FieldLabel>Tvoje ime</FieldLabel>
                    <TextField placeholder="Ime in priimek" value={myName} onChange={(e) => setMyName(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Telefon</FieldLabel>
                    <TextField placeholder="031 123 456" inputMode="tel" value={myPhone} onChange={(e) => setMyPhone(e.target.value)} />
                  </div>
                </>
              ) : null}
              {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}
              <Button variant="primary" full onClick={() => void finalizeJoin()} disabled={busy}>
                {busy ? 'Pridružujem…' : `Pridruži se v «${preview.group.name}»`}
              </Button>
              <Button variant="ghost" full onClick={() => { setPreview(null); setError(null); }}>
                Prekliči
              </Button>
            </>
          ) : (
            <>
              <Segmented<JoinMethod>
                value={joinMethod}
                onChange={(m) => {
                  setJoinMethod(m);
                  setError(null);
                }}
                options={[
                  { value: 'code', label: 'S kodo' },
                  { value: 'phone', label: 'S telefonom' },
                ]}
              />
              {joinMethod === 'code' ? (
                <div>
                  <FieldLabel>Posebna koda ali povezava</FieldLabel>
                  <TextField placeholder="Prilepi kodo ali povezavo" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
                  <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginTop: 6 }}>
                    Koda mora imeti vsaj 8 znakov.
                  </div>
                </div>
              ) : (
                <div style={{ font: '400 13px/1.5 Rubik', color: 'var(--text-sec)' }}>
                  Pridružiš se skupini, v katero te je nekdo povabil s tvojo telefonsko številko.
                </div>
              )}
              {joinMethod === 'phone' && needIdentity ? (
                <>
                  <div>
                    <FieldLabel>Tvoje ime</FieldLabel>
                    <TextField placeholder="Ime in priimek" value={myName} onChange={(e) => setMyName(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Telefon</FieldLabel>
                    <TextField placeholder="031 123 456" inputMode="tel" value={myPhone} onChange={(e) => setMyPhone(e.target.value)} />
                  </div>
                </>
              ) : null}
              {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}
              <Button variant="primary" full onClick={() => void (joinMethod === 'code' ? findByCode() : findByPhone())} disabled={busy}>
                {busy ? 'Iščem…' : 'Poišči skupino'}
              </Button>
              <Button variant="ghost" full onClick={() => setView('list')}>
                Nazaj
              </Button>
            </>
          )}
        </div>
      ) : null}

      {leaving ? (
        <ConfirmDialog
          title="Zapusti skupino?"
          message={`Zapustil boš skupino «${leaving.group.name}». Tvoji pretekli stroški in poravnave se ohranijo.`}
          confirmLabel="Zapusti"
          danger
          onConfirm={() => void doLeave(leaving)}
          onCancel={() => setLeaving(null)}
        />
      ) : null}
    </BottomSheet>
  );
}
