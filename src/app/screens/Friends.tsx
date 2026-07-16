// Prijatelji — everyone in your circle with a running balance. You add a friend
// by phone number: that creates a PENDING entry and sends them an invite (a
// request). They confirm by opening the invite and claiming their entry when
// they join — at which point claimedBy is set and they become a real friend.
// You can't conjure a confirmed friend out of thin air.
import { useState } from 'react';
import type { Person } from '../../types';
import { friendBalances } from '../data/derive';
import { inviteUrl, store, useSession, useStore } from '../data/store';
import { normalizePhone, signedEur } from '../format';
import { useFlik } from '../ui/FlikSheet';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, BottomSheet, Button, Card, FieldLabel, Segmented, TextField } from '../ui/kit';
import { IconSearch } from '../ui/icons';

type Sort = 'balance' | 'alpha';
type EditState = { mode: 'add' } | { mode: 'edit'; person: Person } | null;

const isConfirmed = (p: Person) => Boolean(p.claimedBy);

function sendRequest(phone: string, name: string, inviteCode: string) {
  const url = inviteUrl(inviteCode);
  const msg = `Živjo${name ? ' ' + name : ''}! Pridruži se mi v SplitFlik, da razdeliva stroške: ${url}`;
  // SMS deep link on mobile; harmless no-op elsewhere (we also copy the link).
  try {
    window.open(`sms:${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
  } catch {
    // ignore
  }
  navigator.clipboard?.writeText(url).catch(() => {});
}

export function Friends() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const flik = useFlik();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('balance');
  const [edit, setEdit] = useState<EditState>(null);

  const inviteCode = state.group?.inviteCode ?? '';

  let friends = friendBalances(state, meId);
  const q = query.trim().toLowerCase();
  if (q) friends = friends.filter((f) => f.person.name.toLowerCase().includes(q));
  friends = [...friends].sort((a, b) =>
    sort === 'balance'
      ? Math.abs(b.cents) - Math.abs(a.cents)
      : a.person.name.localeCompare(b.person.name, 'sl'),
  );

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)', marginBottom: 16 }}>Prijatelji</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface3)', borderRadius: 12, padding: '10px 13px', marginBottom: 14 }}>
        <IconSearch size={17} color="var(--text-sec)" strokeWidth={2.2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Išči prijatelja"
          style={{ flex: 1, border: 'none', background: 'transparent', font: '400 15px/1 Rubik', color: 'var(--text)' }}
        />
      </div>

      <Segmented<Sort>
        value={sort}
        onChange={setSort}
        options={[
          { value: 'balance', label: 'Po znesku' },
          { value: 'alpha', label: 'Abecedno' },
        ]}
        style={{ marginBottom: 16, width: 'fit-content' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {friends.map((f) => {
          const pending = !isConfirmed(f.person);
          const owes = f.cents < 0; // I owe them
          const balColor = f.cents > 0 ? 'var(--pos)' : f.cents < 0 ? 'var(--neg)' : 'var(--text-sec)';
          const hint = pending
            ? 'Čaka na potrditev'
            : f.cents > 0
              ? 'Dolguje tebi'
              : f.cents < 0
                ? 'Ti dolguješ'
                : 'Ni odprtih dolgov';
          return (
            <Card key={f.person.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', ...(pending ? { opacity: 0.85 } : {}) }}>
              <button
                onClick={() => setEdit({ mode: 'edit', person: f.person })}
                style={{ display: 'flex', alignItems: 'center', gap: 13, flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
              >
                <Avatar name={f.person.name} id={f.person.id} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '600 16px/1.2 Rubik', color: 'var(--text)' }}>{f.person.name}</div>
                  <div style={{ font: '400 13px/1.3 Rubik', color: pending ? 'var(--pend)' : 'var(--text-sec)' }}>{hint}</div>
                </div>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }}>
                {pending ? (
                  f.person.phone ? (
                    <button
                      onClick={() => {
                        sendRequest(f.person.phone as string, f.person.name, inviteCode);
                        store.toast(`Zahtevek ponovno poslan · ${f.person.name}`);
                      }}
                      style={{ border: '1px solid var(--border)', borderRadius: 9999, padding: '8px 14px', font: '600 13px/1 Rubik', background: 'transparent', color: 'var(--link)', cursor: 'pointer' }}
                    >
                      Pošlji znova
                    </button>
                  ) : null
                ) : (
                  <>
                    <div style={{ font: '600 16px/1 Rubik', color: balColor }}>
                      {f.cents === 0 ? 'Poravnano' : signedEur(f.cents)}
                    </div>
                    {owes ? (
                      <Button
                        variant="pay"
                        onClick={() =>
                          flik.open({
                            toName: f.person.name,
                            ...(f.person.phone ? { toPhone: f.person.phone } : {}),
                            amountCents: -f.cents,
                          })
                        }
                      >
                        Plačaj
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          onClick={() => setEdit({ mode: 'add' })}
          aria-label="Dodaj prijatelja"
          style={{ width: 52, height: 52, borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 28, fontWeight: 300, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(18,82,179,0.3)' }}
        >
          +
        </button>
      </div>

      {edit ? (
        <FriendSheet
          edit={edit}
          groupId={state.group?.id ?? ''}
          inviteCode={inviteCode}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </div>
  );
}

function FriendSheet({
  edit,
  groupId,
  inviteCode,
  onClose,
}: {
  edit: { mode: 'add' } | { mode: 'edit'; person: Person };
  groupId: string;
  inviteCode: string;
  onClose: () => void;
}) {
  const existing = edit.mode === 'edit' ? edit.person : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');

  const addByPhone = () => {
    if (!name.trim()) return store.toast('Vnesi ime prijatelja.');
    const normalized = normalizePhone(phone);
    if (!normalized) return store.toast('Vnesi veljavno telefonsko številko.');
    // Pending friend: no claimedBy until they confirm by claiming their entry.
    store.savePerson({ id: crypto.randomUUID(), groupId, name: name.trim(), phone: normalized }, true);
    sendRequest(normalized, name.trim(), inviteCode);
    store.toast(`Zahtevek poslan · ${name.trim()} mora potrditi`);
    onClose();
  };

  const saveEdit = () => {
    if (!existing) return;
    if (!name.trim()) return store.toast('Vnesi ime.');
    let normalized: string | undefined;
    if (phone.trim()) {
      const n = normalizePhone(phone);
      if (!n) return store.toast('Telefonska številka ni veljavna.');
      normalized = n;
    }
    store.savePerson(
      {
        id: existing.id,
        groupId,
        name: name.trim(),
        ...(normalized ? { phone: normalized } : {}),
        ...(existing.claimedBy ? { claimedBy: existing.claimedBy } : {}),
      },
      false,
    );
    store.toast('Prijatelj posodobljen');
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    store.deletePerson(existing.id);
    store.toast('Prijatelj odstranjen');
    onClose();
  };

  if (!existing) {
    return (
      <BottomSheet title="Dodaj prijatelja" onClose={onClose}>
        <div style={{ font: '400 13px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 16 }}>
          Prijatelja dodaš z njegovo telefonsko številko. Poslali mu bomo zahtevek — v prijatelje se doda,
          ko ga potrdi.
        </div>
        <FieldLabel>Ime prijatelja</FieldLabel>
        <TextField placeholder="npr. Ana Krajnc" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />
        <FieldLabel>Telefonska številka</FieldLabel>
        <TextField placeholder="031 123 456" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 18 }} />
        <Button variant="primary" full onClick={addByPhone}>
          Pošlji zahtevek
        </Button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title="Uredi prijatelja" onClose={onClose}>
      <FieldLabel>Ime in priimek</FieldLabel>
      <TextField value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />
      <FieldLabel>Telefon</FieldLabel>
      <TextField placeholder="031 123 456" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 18 }} />
      <Button variant="primary" full onClick={saveEdit} style={{ marginBottom: 10 }}>
        Shrani
      </Button>
      <button onClick={remove} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--neg)', font: '600 14px/1 Rubik', cursor: 'pointer', padding: 8 }}>
        Odstrani prijatelja
      </button>
    </BottomSheet>
  );
}
