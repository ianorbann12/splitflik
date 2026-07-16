// Create a new group, or sign in to one by special code / phone number. The
// invite code is the access boundary (docs/API.md §2). When you already have a
// local profile, signing in by code reuses it (no re-registration, no new
// profile); first-time users register with name + phone.
import { useEffect, useState } from 'react';
import type { Group, Person } from '../../types';
import { normalizePhone } from '../format';
import { getLocalProfile, setLocalProfile, type LocalProfile } from '../data/profile';
import { newInviteCode, setSession, store, useStore } from '../data/store';
import { Button, FieldLabel, Segmented, TextField } from '../ui/kit';
import { GateLayout } from './GateLayout';

type GateMode = 'create' | 'join';
type JoinMethod = 'code' | 'phone';

const MIN_CODE_LEN = 8;

function extractCode(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = /#\/join\/([^/?#]+)/i.exec(trimmed);
  return (fromUrl?.[1] ?? trimmed).toLowerCase();
}

export function GroupGate({ initialCode }: { initialCode?: string }) {
  const state = useStore();
  const authUserId = typeof state.authUserId === 'string' ? state.authUserId : 'anon';

  const [mode, setMode] = useState<GateMode>(initialCode ? 'join' : 'create');
  const [joinMethod, setJoinMethod] = useState<JoinMethod>('code');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create / register
  const [groupName, setGroupName] = useState('');
  const [myName, setMyName] = useState('');
  const [myPhone, setMyPhone] = useState('');

  // join
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [phoneJoin, setPhoneJoin] = useState('');
  const [found, setFound] = useState<{ group: Group; people: Person[] } | null>(null);

  const requirePhone = (raw: string): string | null => {
    if (!raw.trim()) return null;
    return normalizePhone(raw);
  };

  const doCreate = async () => {
    setError(null);
    if (!groupName.trim()) return setError('Poimenuj skupino.');
    if (!myName.trim()) return setError('Vnesi svoje ime.');
    const phone = requirePhone(myPhone);
    if (!phone) return setError('Vnesi veljavno telefonsko številko (npr. 031 123 456).');
    setBusy(true);
    try {
      const inviteCode = newInviteCode();
      const { groupId, personId } = await store.createGroup(groupName.trim(), inviteCode, {
        name: myName.trim(),
        phone,
        claimedBy: authUserId,
      });
      setLocalProfile({ name: myName.trim(), phone });
      setSession({ groupId, personId, inviteCode });
    } catch {
      setError('Skupine ni bilo mogoče ustvariti. Poskusi znova.');
      setBusy(false);
    }
  };

  // Sign in with a known profile — reuse it, don't create a new one.
  const joinWithProfile = async (
    res: { group: Group; people: Person[] },
    profile: LocalProfile,
  ) => {
    const pending = res.people.find((p) => p.phone === profile.phone && !p.claimedBy);
    let personId: string;
    if (pending) {
      await store.claimPersonWithName(pending.id, authUserId, profile.name, profile.avatarUrl);
      personId = pending.id;
    } else {
      personId = await store.joinAsNewPerson(
        res.group.id,
        profile.name,
        profile.phone,
        authUserId,
        profile.avatarUrl,
      );
    }
    setSession({ groupId: res.group.id, personId, inviteCode: res.group.inviteCode });
  };

  const doLookup = async (raw: string) => {
    setError(null);
    const code = extractCode(raw);
    if (code.length < MIN_CODE_LEN) {
      return setError(`Koda je prekratka — vsaj ${MIN_CODE_LEN} znakov.`);
    }
    setBusy(true);
    try {
      const res = await store.fetchGroupByInvite(code);
      if (!res) {
        setError('Skupine s to kodo ni.');
        return;
      }
      const profile = getLocalProfile();
      if (profile) await joinWithProfile(res, profile);
      else setFound(res);
    } catch {
      setError('Iskanje ni uspelo. Poskusi znova.');
    } finally {
      setBusy(false);
    }
  };

  const doPhoneJoin = async () => {
    setError(null);
    const phone = normalizePhone(phoneJoin);
    if (!phone) return setError('Telefonska številka ni veljavna.');
    setBusy(true);
    try {
      const res = await store.fetchPendingByPhone(phone);
      if (!res) {
        setError('Za to številko ni povabila v skupino.');
        return;
      }
      const profile = getLocalProfile();
      await store.claimPersonWithName(
        res.person.id,
        authUserId,
        profile?.name ?? res.person.name,
        profile?.avatarUrl,
      );
      setSession({ groupId: res.group.id, personId: res.person.id, inviteCode: res.group.inviteCode });
    } catch {
      setError('Pridružitev ni uspela.');
      setBusy(false);
    }
  };

  // arriving via an invite link → look up straight away
  useEffect(() => {
    if (initialCode) void doLookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinAsNew = async () => {
    if (!found) return;
    setError(null);
    if (!myName.trim()) return setError('Vnesi svoje ime.');
    const phone = requirePhone(myPhone);
    if (!phone) return setError('Vnesi veljavno telefonsko številko.');
    setBusy(true);
    try {
      const pending = found.people.find((p) => p.phone === phone && !p.claimedBy);
      let personId: string;
      if (pending) {
        await store.claimPersonWithName(pending.id, authUserId, myName.trim());
        personId = pending.id;
      } else {
        personId = await store.joinAsNewPerson(found.group.id, myName.trim(), phone, authUserId);
      }
      setLocalProfile({ name: myName.trim(), phone });
      setSession({ groupId: found.group.id, personId, inviteCode: found.group.inviteCode });
    } catch {
      setError('Pridružitev ni uspela.');
      setBusy(false);
    }
  };

  // first-time join via code (no saved profile): register your identity
  if (mode === 'join' && found) {
    return (
      <GateLayout title={found.group.name} subtitle="Vpiši svoje ime in telefon za pridružitev skupini.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Tvoje ime</FieldLabel>
            <TextField placeholder="Ime in priimek" value={myName} onChange={(e) => setMyName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Telefon</FieldLabel>
            <TextField placeholder="031 123 456" inputMode="tel" value={myPhone} onChange={(e) => setMyPhone(e.target.value)} />
          </div>
          {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}
          <Button variant="primary" full onClick={() => void joinAsNew()} disabled={busy} style={{ marginTop: 4 }}>
            {busy ? 'Pridružujem…' : 'Pridruži se'}
          </Button>
          <Button variant="ghost" full onClick={() => setFound(null)}>
            Nazaj
          </Button>
        </div>
      </GateLayout>
    );
  }

  return (
    <GateLayout
      title="Pripravimo skupino"
      subtitle="Ustvari novo skupino ali se pridruži obstoječi s kodo ali telefonsko številko."
    >
      <Segmented<GateMode>
        variant="block"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: 'create', label: 'Ustvari' },
          { value: 'join', label: 'Pridruži se' },
        ]}
        style={{ marginBottom: 20 }}
      />

      {mode === 'create' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Ime skupine</FieldLabel>
            <TextField placeholder="npr. Cimri" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Tvoje ime</FieldLabel>
            <TextField placeholder="Ime in priimek" value={myName} onChange={(e) => setMyName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Telefon</FieldLabel>
            <TextField placeholder="031 123 456" inputMode="tel" value={myPhone} onChange={(e) => setMyPhone(e.target.value)} />
          </div>
          {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}
          <Button variant="primary" full onClick={() => void doCreate()} disabled={busy} style={{ marginTop: 6 }}>
            {busy ? 'Ustvarjam…' : 'Ustvari skupino'}
          </Button>
        </div>
      ) : (
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
              <TextField
                placeholder="Prilepi kodo ali povezavo"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doLookup(codeInput);
                }}
              />
              <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginTop: 6 }}>
                Koda mora imeti vsaj {MIN_CODE_LEN} znakov.
              </div>
            </div>
          ) : (
            <div>
              <FieldLabel>Telefonska številka</FieldLabel>
              <TextField
                placeholder="031 123 456"
                inputMode="tel"
                value={phoneJoin}
                onChange={(e) => setPhoneJoin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doPhoneJoin();
                }}
              />
              <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginTop: 6 }}>
                Vpiši številko, s katero te je nekdo povabil v skupino.
              </div>
            </div>
          )}

          {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}

          {joinMethod === 'code' ? (
            <Button variant="primary" full onClick={() => void doLookup(codeInput)} disabled={busy}>
              {busy ? 'Iščem…' : 'Pridruži se'}
            </Button>
          ) : (
            <Button variant="primary" full onClick={() => void doPhoneJoin()} disabled={busy}>
              {busy ? 'Iščem…' : 'Pridruži se'}
            </Button>
          )}
        </div>
      )}
    </GateLayout>
  );
}
