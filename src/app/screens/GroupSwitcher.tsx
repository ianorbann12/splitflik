// Multi-group hub: switch between your groups, create a new named group (adding
// friends by selection + a shareable link), or join one by special code / phone.
// Reuses your saved profile so signing in never re-creates a profile.
import { useEffect, useState } from 'react';
import type { Group } from '../../types';
import { normalizePhone } from '../format';
import { getLocalProfile, setLocalProfile } from '../data/profile';
import { loadFriends, useFriends } from '../data/friends';
import { avatarSrcProp } from '../data/people';
import { newInviteCode, setSession, store, useStore } from '../data/store';
import { Avatar, BottomSheet, Button, FieldLabel, Segmented, TextField } from '../ui/kit';
import { IconCheck, IconPlus } from '../ui/icons';

type View = 'list' | 'create' | 'join';
type JoinMethod = 'code' | 'phone';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [myName, setMyName] = useState(profile?.name ?? '');
  const [myPhone, setMyPhone] = useState(profile?.phone ?? '');

  // join
  const [joinMethod, setJoinMethod] = useState<JoinMethod>('code');
  const [codeInput, setCodeInput] = useState(initialJoinCode ?? '');

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

  const create = async () => {
    setError(null);
    if (!groupName.trim()) return setError('Poimenuj skupino.');
    const id = identity();
    if (!id) return setError('Vnesi svoje ime in telefonsko številko.');
    setBusy(true);
    try {
      const inviteCode = newInviteCode();
      const { groupId, personId } = await store.createGroup(groupName.trim(), inviteCode, {
        name: id.name,
        phone: id.phone,
        claimedBy: userId,
      });
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

  const joinByCode = async () => {
    setError(null);
    const code = extractCode(codeInput);
    if (code.length < 8) return setError('Koda je prekratka — vsaj 8 znakov.');
    const id = identity();
    if (!id) return setError('Vnesi svoje ime in telefonsko številko.');
    setBusy(true);
    try {
      const res = await store.fetchGroupByInvite(code);
      if (!res) {
        setError('Skupine s to kodo ni.');
        setBusy(false);
        return;
      }
      const pending = res.people.find((p) => p.phone === id.phone && !p.claimedBy);
      let personId: string;
      if (pending) {
        await store.claimPersonWithName(pending.id, userId, id.name, id.avatarUrl);
        personId = pending.id;
      } else {
        personId = await store.joinAsNewPerson(res.group.id, id.name, id.phone, userId, id.avatarUrl);
      }
      setLocalProfile({ name: id.name, phone: id.phone, ...(id.avatarUrl ? { avatarUrl: id.avatarUrl } : {}) });
      setSession({ groupId: res.group.id, personId, inviteCode: res.group.inviteCode });
      onClose();
    } catch {
      setError('Pridružitev ni uspela.');
      setBusy(false);
    }
  };

  const joinByPhone = async () => {
    setError(null);
    const id = identity();
    if (!id) return setError('Vnesi svoje ime in telefonsko številko.');
    setBusy(true);
    try {
      const res = await store.fetchPendingByPhone(id.phone);
      if (!res) {
        setError('Za tvojo številko ni povabila v skupino.');
        setBusy(false);
        return;
      }
      await store.claimPersonWithName(res.person.id, userId, id.name, id.avatarUrl);
      setLocalProfile({ name: id.name, phone: id.phone, ...(id.avatarUrl ? { avatarUrl: id.avatarUrl } : {}) });
      setSession({ groupId: res.group.id, personId: res.person.id, inviteCode: res.group.inviteCode });
      onClose();
    } catch {
      setError('Pridružitev ni uspela.');
      setBusy(false);
    }
  };

  const toggleFriend = (phone: string) =>
    setSelected((cur) => (cur.includes(phone) ? cur.filter((x) => x !== phone) : [...cur, phone]));

  const title = view === 'create' ? 'Nova skupina' : view === 'join' ? 'Pridruži se skupini' : 'Tvoje skupine';
  const needIdentity = !profile;

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
              <button
                key={g.group.id}
                onClick={() => switchTo(g)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: `1px solid ${g.group.id === activeId ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 16, padding: '13px 15px', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 15px/1.2 Rubik', color: 'var(--text)' }}>{g.group.name}</div>
                  {g.group.id === activeId ? (
                    <div style={{ font: '400 12px/1.3 Rubik', color: 'var(--link)' }}>Trenutna skupina</div>
                  ) : null}
                </div>
                {g.group.id === activeId ? <IconCheck size={18} color="var(--link)" strokeWidth={2.4} /> : null}
              </button>
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
          <Button variant="primary" full onClick={() => void (joinMethod === 'code' ? joinByCode() : joinByPhone())} disabled={busy}>
            {busy ? 'Pridružujem…' : 'Pridruži se'}
          </Button>
          <Button variant="ghost" full onClick={() => setView('list')}>
            Nazaj
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}
