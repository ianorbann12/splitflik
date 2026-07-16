// Create a new group or join one by invite code. The invite code is the access
// boundary (docs/API.md §2). On success we persist a GroupSession and the app
// boots into the group.
import { useEffect, useState } from 'react';
import type { Group, Person } from '../../types';
import { normalizePhone } from '../format';
import {
  newInviteCode,
  parseInviteInput,
  setSession,
  store,
  useStore,
} from '../data/store';
import { Button, FieldLabel, Segmented, TextField } from '../ui/kit';
import { GateLayout } from './GateLayout';

type GateMode = 'create' | 'join';

export function GroupGate({ initialCode }: { initialCode?: string }) {
  const state = useStore();
  const authUserId = typeof state.authUserId === 'string' ? state.authUserId : 'anon';

  const [mode, setMode] = useState<GateMode>(initialCode ? 'join' : 'create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create
  const [groupName, setGroupName] = useState('');
  const [myName, setMyName] = useState('');
  const [myPhone, setMyPhone] = useState('');

  // join
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [found, setFound] = useState<{ group: Group; people: Person[] } | null>(null);

  // Phone is required for signup — it's the payee number for the Flik handoff.
  const requirePhone = (raw: string): string | null => {
    if (!raw.trim()) return null;
    return normalizePhone(raw); // null when invalid
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
      setSession({ groupId, personId, inviteCode });
    } catch {
      setError('Skupine ni bilo mogoče ustvariti. Poskusi znova.');
      setBusy(false);
    }
  };

  const doLookup = async (raw: string) => {
    setError(null);
    const code = parseInviteInput(raw);
    if (!code) return setError('Neveljavna koda ali povezava.');
    setBusy(true);
    try {
      const res = await store.fetchGroupByInvite(code);
      if (!res) setError('Skupine s to kodo ni.');
      else setFound(res);
    } catch {
      setError('Iskanje ni uspelo. Poskusi znova.');
    } finally {
      setBusy(false);
    }
  };

  // auto-lookup when arriving via an invite link
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
      // If someone already added you by phone (a pending entry), claim that
      // entry and stamp it with your real name instead of creating a duplicate.
      const pending = found.people.find((p) => p.phone === phone && !p.claimedBy);
      let personId: string;
      if (pending) {
        await store.claimPersonWithName(pending.id, authUserId, myName.trim());
        personId = pending.id;
      } else {
        personId = await store.joinAsNewPerson(found.group.id, myName.trim(), phone, authUserId);
      }
      setSession({ groupId: found.group.id, personId, inviteCode: found.group.inviteCode });
    } catch {
      setError('Pridružitev ni uspela.');
      setBusy(false);
    }
  };

  // ------- join: register your own identity (you never pick who you are) -----
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
      subtitle="Ustvari novo skupino prijateljev ali se pridruži obstoječi z vabilno kodo."
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
          <div>
            <FieldLabel>Vabilna koda ali povezava</FieldLabel>
            <TextField
              placeholder="Prilepi kodo ali povezavo"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doLookup(codeInput);
              }}
            />
          </div>
          {error ? <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)' }}>{error}</div> : null}
          <Button variant="primary" full onClick={() => void doLookup(codeInput)} disabled={busy}>
            {busy ? 'Iščem…' : 'Poišči skupino'}
          </Button>
        </div>
      )}
    </GateLayout>
  );
}
