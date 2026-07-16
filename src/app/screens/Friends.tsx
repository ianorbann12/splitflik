// Prijatelji — everyone in the group with a running balance (red = you owe,
// green = owed to you), searchable and sortable. Add / rename / remove members
// (§10, §11) via the people SDK; "Plačaj" opens the Flik handoff.
import { useState } from 'react';
import type { Person } from '../../types';
import { useSession, useStore } from '../data/store';
import { friendBalances } from '../data/derive';
import { store } from '../data/store';
import { normalizePhone, signedEur } from '../format';
import { useFlik } from '../ui/FlikSheet';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, BottomSheet, Button, Card, FieldLabel, Segmented, TextField } from '../ui/kit';
import { IconSearch } from '../ui/icons';

type Sort = 'balance' | 'alpha';
type EditState = { mode: 'add' } | { mode: 'edit'; person: Person } | null;

export function Friends() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const flik = useFlik();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('balance');
  const [edit, setEdit] = useState<EditState>(null);

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
          const owes = f.cents < 0; // I owe them
          const hint = f.cents > 0 ? 'Dolguje tebi' : f.cents < 0 ? 'Ti dolguješ' : 'Ni odprtih dolgov';
          const balColor = f.cents > 0 ? 'var(--pos)' : f.cents < 0 ? 'var(--neg)' : 'var(--text-sec)';
          return (
            <Card key={f.person.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
              <button
                onClick={() => setEdit({ mode: 'edit', person: f.person })}
                style={{ display: 'flex', alignItems: 'center', gap: 13, flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
              >
                <Avatar name={f.person.name} id={f.person.id} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '600 16px/1.2 Rubik', color: 'var(--text)' }}>{f.person.name}</div>
                  <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)' }}>{hint}</div>
                </div>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }}>
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
          onClose={() => setEdit(null)}
        />
      ) : null}
    </div>
  );
}

function FriendSheet({
  edit,
  groupId,
  onClose,
}: {
  edit: { mode: 'add' } | { mode: 'edit'; person: Person };
  groupId: string;
  onClose: () => void;
}) {
  const existing = edit.mode === 'edit' ? edit.person : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');

  const save = () => {
    if (!name.trim()) return store.toast('Vnesi ime.');
    let normalized: string | undefined;
    if (phone.trim()) {
      const n = normalizePhone(phone);
      if (!n) return store.toast('Telefonska številka ni veljavna.');
      normalized = n;
    }
    const person: Person = {
      id: existing?.id ?? crypto.randomUUID(),
      groupId,
      name: name.trim(),
      ...(normalized ? { phone: normalized } : {}),
      ...(existing?.claimedBy ? { claimedBy: existing.claimedBy } : {}),
    };
    store.savePerson(person, !existing);
    store.toast(existing ? 'Prijatelj posodobljen' : `${name.trim()} dodan v skupino`);
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    store.deletePerson(existing.id);
    store.toast('Prijatelj odstranjen');
    onClose();
  };

  return (
    <BottomSheet title={existing ? 'Uredi prijatelja' : 'Dodaj prijatelja'} onClose={onClose}>
      <FieldLabel>Ime in priimek</FieldLabel>
      <TextField placeholder="npr. Ana Krajnc" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />
      <FieldLabel>Telefon (neobvezno)</FieldLabel>
      <TextField placeholder="031 123 456" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 18 }} />
      <Button variant="primary" full onClick={save} style={{ marginBottom: existing ? 10 : 0 }}>
        {existing ? 'Shrani' : 'Dodaj prijatelja'}
      </Button>
      {existing ? (
        <button onClick={remove} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--neg)', font: '600 14px/1 Rubik', cursor: 'pointer', padding: 8 }}>
          Odstrani prijatelja
        </button>
      ) : null}
    </BottomSheet>
  );
}
