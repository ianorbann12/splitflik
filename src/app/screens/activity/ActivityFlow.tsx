// New-activity flow: New → Activity → Assign → Review → Sent. Creates an outing,
// adds expenses (bills), then settles via the engine + settle_outing RPC and
// hands off to Flik. One Sheet whose title/back change per step.
import { useMemo, useState } from 'react';
import type { Expense, Group, Outing, Person } from '../../../types';
import { inviteUrl, store, useSession, useStore } from '../../data/store';
import { outingExpenses, outingGrandTotal, outingNet, settlementPreview } from '../../data/derive';
import { avatarSrcProp, avatarUrlOf, firstName, initials } from '../../data/people';
import { formatEur } from '../../format';
import { useFlik } from '../../ui/FlikSheet';
import { Avatar, BottomSheet, Button, Card, EmptyState, FieldLabel, Segmented, Sheet, TextField } from '../../ui/kit';
import { IconCheck, IconCopy, IconPlus, IconQr, IconReceipt, IconShare } from '../../ui/icons';
import { QrSheet } from '../../ui/QrSheet';
import { StepAssign } from './StepAssign';

type Step = 'new' | 'activity' | 'assign' | 'review' | 'sent';

export function ActivityFlow({
  onClose,
  initialOutingId,
}: {
  onClose: () => void;
  initialOutingId?: string;
}) {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const group = state.group;

  const [step, setStep] = useState<Step>(initialOutingId ? 'activity' : 'new');
  const [outingId, setOutingId] = useState<string | null>(initialOutingId ?? null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [settledCycle, setSettledCycle] = useState<number | null>(null);

  const outing = state.outings.find((o) => o.id === outingId) ?? null;
  const participants = outing
    ? state.people.filter((p) => outing.participantIds.includes(p.id))
    : state.people;
  const bills = outing ? outingExpenses(state, outing.id, outing.currentCycle) : [];
  const editingExpense = bills.find((b) => b.id === editingExpenseId) ?? null;

  const handleCreate = (name: string, ids: string[]) => {
    const id = store.createOuting(name, ids);
    setOutingId(id);
    setStep('activity');
    store.toast('Aktivnost ustvarjena');
  };

  const title =
    step === 'new'
      ? 'Nova aktivnost'
      : step === 'activity'
        ? (outing?.name ?? 'Aktivnost')
        : step === 'assign'
          ? editingExpense
            ? 'Uredi račun'
            : 'Dodeli zneske'
          : step === 'review'
            ? 'Pregled delitve'
            : 'Poslano';

  const back = () => {
    if (step === 'assign') {
      setEditingExpenseId(null);
      setStep('activity');
    } else if (step === 'review') {
      setStep('activity');
    } else {
      onClose();
    }
  };

  return (
    <Sheet title={title} onBack={back}>
      {step === 'new' && group ? (
        <StepNew group={group} people={state.people} meId={meId} onCreate={handleCreate} />
      ) : null}

      {step === 'activity' && outing ? (
        <StepActivity
          participants={participants}
          bills={bills}
          outingName={outing.name}
          onRename={(name) => {
            store.updateOuting({ ...outing, name });
            store.toast('Aktivnost preimenovana');
          }}
          onDelete={() => {
            store.deleteOuting(outing.id);
            store.toast('Aktivnost izbrisana');
            onClose();
          }}
          onAddBill={() => {
            setEditingExpenseId(null);
            setStep('assign');
          }}
          onEditBill={(id) => {
            setEditingExpenseId(id);
            setStep('assign');
          }}
          onFinish={() => {
            if (bills.length === 0) {
              store.toast('Dodaj vsaj en račun.');
              return;
            }
            setStep('review');
          }}
        />
      ) : null}

      {step === 'assign' && outing ? (
        <StepAssign
          outing={outing}
          participants={participants}
          meId={meId}
          editingExpense={editingExpense}
          onDone={() => {
            setEditingExpenseId(null);
            setStep('activity');
          }}
        />
      ) : null}

      {step === 'review' && outing ? (
        <StepReview
          outing={outing}
          participants={participants}
          meId={meId}
          onSend={() => {
            const drafts = settlementPreview(outing, state.expenses);
            if (drafts.length === 0) {
              store.toast('Vsi računi so že poravnani.');
              return;
            }
            setSettledCycle(outing.currentCycle);
            store.settleOuting(outing, drafts);
            store.toast('Zahtevki poslani');
            setStep('sent');
          }}
        />
      ) : null}

      {step === 'sent' && outing && settledCycle !== null ? (
        <StepSent outing={outing} settledCycle={settledCycle} meId={meId} onDone={onClose} />
      ) : null}
    </Sheet>
  );
}

// -------------------------------- Step: New --------------------------------

function StepNew({
  group,
  people,
  meId,
  onCreate,
}: {
  group: Group;
  people: Person[];
  meId: string;
  onCreate: (name: string, ids: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>(people.map((p) => p.id));
  const [showQr, setShowQr] = useState(false);
  const url = inviteUrl(group.inviteCode);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      store.toast('Koda kopirana');
    } catch {
      store.toast('Kopiranje ni uspelo');
    }
  };

  const shareLink = async () => {
    const text = `Pridruži se naši skupini "${group.name}" v aplikaciji SplitFlik: ${url}`;
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'SplitFlik', text, url });
        return;
      } catch {
        // fell through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      store.toast('Povezava kopirana');
    } catch {
      store.toast('Deljenje ni na voljo');
    }
  };

  const openExternal = (href: string) => window.open(href, '_blank', 'noopener');

  return (
    <div>
      <div style={{ font: '400 14px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 18 }}>
        Poimenuj aktivnost, izberi udeležence in povabi prijatelje s kodo ali povezavo.
      </div>

      <div style={{ font: '500 13px/1 Rubik', color: 'var(--text)', marginBottom: 8 }}>Ime aktivnosti</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="npr. Kosilo v petek"
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', font: '400 15px/1 Rubik', color: 'var(--text)', background: 'var(--surface)', marginBottom: 18 }}
      />

      <div style={{ font: '500 13px/1 Rubik', color: 'var(--text)', marginBottom: 10 }}>
        Udeleženci · {selected.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {people.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'var(--accent-soft)' : 'transparent',
                borderRadius: 9999,
                padding: '5px 12px 5px 5px',
                cursor: 'pointer',
                opacity: on ? 1 : 0.55,
              }}
            >
              <Avatar name={p.name} id={p.id} size={26} {...avatarSrcProp(p.avatarUrl)} />
              <span style={{ font: '500 13px/1 Rubik', color: 'var(--text)' }}>
                {firstName(p.name)}
                {p.id === meId ? ' (ti)' : ''}
              </span>
            </button>
          );
        })}
      </div>

      <Card tone="surface2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 4 }}>Koda za povabilo</div>
          <div style={{ font: '600 15px/1.3 Rubik', color: 'var(--text)', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {group.inviteCode}
          </div>
        </div>
        <Button variant="secondary" onClick={copyCode} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10 }}>
          <IconCopy size={15} color="var(--link)" strokeWidth={2} /> Kopiraj
        </Button>
      </Card>

      <Button variant="primary" full onClick={shareLink} style={{ marginBottom: 10 }}>
        <IconShare size={17} color="var(--on-accent)" strokeWidth={2} /> Deli povezavo
      </Button>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Button variant="secondary" full onClick={() => openExternal(`https://wa.me/?text=${encodeURIComponent(url)}`)} style={{ borderRadius: 12, padding: 12, font: '500 13px/1 Rubik' }}>
          WhatsApp
        </Button>
        <Button variant="secondary" full onClick={() => openExternal(`sms:?&body=${encodeURIComponent(url)}`)} style={{ borderRadius: 12, padding: 12, font: '500 13px/1 Rubik' }}>
          SMS
        </Button>
      </div>
      <Button variant="secondary" full onClick={() => setShowQr(true)} style={{ marginBottom: 24 }}>
        <IconQr size={17} color="var(--link)" strokeWidth={2} /> Pokaži QR kodo
      </Button>

      <Button
        variant="primary"
        full
        onClick={() => {
          if (!name.trim()) return store.toast('Poimenuj aktivnost.');
          if (selected.length === 0) return store.toast('Izberi vsaj enega udeleženca.');
          onCreate(name.trim(), selected);
        }}
      >
        Ustvari aktivnost
      </Button>

      {showQr ? <QrSheet url={url} onClose={() => setShowQr(false)} /> : null}
    </div>
  );
}

// ------------------------------ Step: Activity -----------------------------

function StepActivity({
  participants,
  bills,
  outingName,
  onRename,
  onDelete,
  onAddBill,
  onEditBill,
  onFinish,
}: {
  participants: Person[];
  bills: Expense[];
  outingName: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddBill: () => void;
  onEditBill: (id: string) => void;
  onFinish: () => void;
}) {
  const grand = outingGrandTotal(bills);
  const per = participants.length > 0 ? Math.round(grand / participants.length) : 0;
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(outingName);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, background: 'var(--accent)', borderRadius: 20, padding: '14px 16px' }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--on-accent-soft)', marginBottom: 6 }}>Skupaj</div>
          <div style={{ font: '700 22px/1 Rubik', color: 'var(--on-accent)' }}>{formatEur(grand)}</div>
        </div>
        <Card tone="surface2" style={{ flex: 1 }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 6 }}>Na osebo</div>
          <div style={{ font: '700 22px/1 Rubik', color: 'var(--text)' }}>{formatEur(per)}</div>
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => {
            setRenameValue(outingName);
            setEditing(true);
          }}
          style={{ background: 'none', border: 'none', color: 'var(--link)', font: '600 13px/1 Rubik', cursor: 'pointer' }}
        >
          Uredi aktivnost
        </button>
      </div>

      {editing ? (
        <BottomSheet title="Uredi aktivnost" onClose={() => setEditing(false)}>
          <FieldLabel>Ime aktivnosti</FieldLabel>
          <TextField value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={{ marginBottom: 18 }} />
          <Button
            variant="primary"
            full
            onClick={() => {
              const name = renameValue.trim();
              if (!name) {
                store.toast('Vnesi ime aktivnosti.');
                return;
              }
              onRename(name);
              setEditing(false);
            }}
          >
            Shrani
          </Button>
          <button
            onClick={() => {
              setEditing(false);
              onDelete();
            }}
            style={{ width: '100%', background: 'none', border: 'none', color: 'var(--neg)', font: '600 14px/1 Rubik', cursor: 'pointer', marginTop: 10, padding: 8 }}
          >
            Izbriši aktivnost
          </button>
        </BottomSheet>
      ) : null}

      <div style={{ font: '600 15px/1 Rubik', color: 'var(--text)', marginBottom: 11 }}>
        Udeleženci · {participants.length}
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 22 }} className="splitflik-scroll">
        {participants.map((p) => (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, width: 58 }}>
            <Avatar name={p.name} id={p.id} size={48} {...avatarSrcProp(p.avatarUrl)} />
            <span style={{ font: '400 12px/1 Rubik', color: 'var(--text)', maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firstName(p.name)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ font: '600 15px/1 Rubik', color: 'var(--text)', marginBottom: 11 }}>Računi</div>

      <button
        onClick={onAddBill}
        style={{ width: '100%', border: '2px dashed var(--dash)', borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'var(--surface2)', cursor: 'pointer', marginBottom: 12 }}
      >
        <IconReceipt size={28} color="var(--accent)" strokeWidth={1.8} />
        <span style={{ font: '600 14px/1 Rubik', color: 'var(--link)' }}>Skeniraj ali dodaj račun</span>
      </button>

      {bills.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {bills.map((b) => (
            <Card key={b.id} onClick={() => onEditBill(b.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconReceipt size={20} color="var(--accent)" strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 15px/1.2 Rubik', color: 'var(--text)' }}>{b.description}</div>
                <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)' }}>
                  {b.split.mode === 'items' ? `${b.split.items.length} postavk` : 'plačal ' + firstName(participants.find((p) => p.id === b.payerId)?.name ?? '')}
                </div>
              </div>
              <div style={{ font: '600 15px/1 Rubik', color: 'var(--text)' }}>{formatEur(b.amountCents)}</div>
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 20 }} />
      )}

      <Button variant="primary" full onClick={onFinish}>
        Pregled delitve
      </Button>
    </div>
  );
}

// ------------------------------ Step: Review -------------------------------

function StepReview({
  outing,
  participants,
  meId,
  onSend,
}: {
  outing: Outing;
  participants: Person[];
  meId: string;
  onSend: () => void;
}) {
  const state = useStore();
  const [view, setView] = useState<'people' | 'transfers'>('people');
  const net = useMemo(() => outingNet(outing, state.expenses), [outing, state.expenses]);
  const transfers = useMemo(() => settlementPreview(outing, state.expenses), [outing, state.expenses]);
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'Neznan';

  return (
    <div>
      <div style={{ font: '400 14px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 16 }}>
        Preveri poravnavo, preden pošlješ zahtevke. Kdor je plačal, dobi denar nazaj.
      </div>

      <Segmented
        value={view}
        onChange={setView}
        variant="block"
        options={[
          { value: 'people', label: 'Po osebah' },
          { value: 'transfers', label: 'Plačila' },
        ]}
        style={{ marginBottom: 18 }}
      />

      {view === 'people' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {participants.map((p) => {
            const n = net.get(p.id) ?? 0;
            const color = n < 0 ? 'var(--neg)' : n > 0 ? 'var(--pos)' : 'var(--text-sec)';
            const sub = n < 0 ? 'dolguje' : n > 0 ? 'dobi nazaj' : 'poravnano';
            return (
              <Card key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
                <Avatar name={p.name} id={p.id} size={42} {...avatarSrcProp(p.avatarUrl)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 15px/1.2 Rubik', color: 'var(--text)' }}>
                    {firstName(p.name)}
                    {p.id === meId ? ' (ti)' : ''}
                  </div>
                  <div style={{ font: '400 12px/1.3 Rubik', color: 'var(--text-sec)', marginTop: 2 }}>{sub}</div>
                </div>
                <span style={{ font: '600 16px/1 Rubik', color }}>{formatEur(Math.abs(n))}</span>
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {transfers.length === 0 ? (
            <EmptyState title="Ni odprtih dolgov" subtitle="Vsi računi so že poravnani." />
          ) : (
            transfers.map((t, i) => (
              <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px' }}>
                <Avatar name={nameOf(t.fromId)} id={t.fromId} size={36} text={initials(nameOf(t.fromId))} {...avatarSrcProp(avatarUrlOf(state.people, t.fromId))} />
                <span style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)' }}>→</span>
                <Avatar name={nameOf(t.toId)} id={t.toId} size={36} text={initials(nameOf(t.toId))} {...avatarSrcProp(avatarUrlOf(state.people, t.toId))} />
                <div style={{ flex: 1, minWidth: 0, font: '500 14px/1.3 Rubik', color: 'var(--text)' }}>
                  {firstName(nameOf(t.fromId))} → {firstName(nameOf(t.toId))}
                </div>
                <span style={{ font: '600 15px/1 Rubik', color: 'var(--text)' }}>{formatEur(t.amountCents)}</span>
              </Card>
            ))
          )}
        </div>
      )}

      <Button variant="primary" full onClick={onSend}>
        Pošlji zahtevke
      </Button>
    </div>
  );
}

// ------------------------------- Step: Sent --------------------------------

function StepSent({
  outing,
  settledCycle,
  meId,
  onDone,
}: {
  outing: Outing;
  settledCycle: number;
  meId: string;
  onDone: () => void;
}) {
  const state = useStore();
  const flik = useFlik();
  const rows = state.settlements.filter((s) => s.outingId === outing.id && s.cycle === settledCycle);
  const nameOf = (id: string) => state.people.find((p) => p.id === id)?.name ?? 'Neznan';
  const phoneOf = (id: string) => state.people.find((p) => p.id === id)?.phone;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 9999,
            background: 'var(--accent-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
            animation: 'splitflik-pop 0.5s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <IconCheck size={44} color="var(--pos)" strokeWidth={2.6} />
        </div>
        <div style={{ font: '700 24px/1.2 Rubik', color: 'var(--text)', marginBottom: 6 }}>Poslano!</div>
        <div style={{ font: '400 14px/1.4 Rubik', color: 'var(--text-sec)', textAlign: 'center', marginBottom: 26 }}>
          Zahtevki za plačilo so bili poslani vsem udeležencem.
        </div>
      </div>

      {rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {rows.map((s) => {
            const iOwe = s.fromId === meId;
            return (
              <Card key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
                <Avatar name={nameOf(s.fromId)} id={s.fromId} size={42} {...avatarSrcProp(avatarUrlOf(state.people, s.fromId))} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 15px/1.2 Rubik', color: 'var(--text)' }}>
                    {firstName(nameOf(s.fromId))}
                    {iOwe ? ' (ti)' : ''} → {firstName(nameOf(s.toId))}
                  </div>
                  <div style={{ font: '400 12px/1.3 Rubik', color: 'var(--text-sec)', marginTop: 2 }}>
                    {iOwe ? 'ti dolguješ' : 'zahtevek poslan'}
                  </div>
                </div>
                {iOwe ? (
                  <Button
                    variant="pay"
                    onClick={() =>
                      flik.open({
                        toName: nameOf(s.toId),
                        ...(phoneOf(s.toId) ? { toPhone: phoneOf(s.toId) as string } : {}),
                        amountCents: s.amountCents,
                        settlementId: s.id,
                      })
                    }
                  >
                    Plačaj {formatEur(s.amountCents)}
                  </Button>
                ) : (
                  <span style={{ font: '600 15px/1 Rubik', color: 'var(--pend)' }}>{formatEur(s.amountCents)}</span>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<IconPlus size={26} color="var(--text-sec)" />} title="Ni odprtih plačil" subtitle="Vse je poravnano." />
      )}

      <Button variant="primary" full onClick={onDone}>
        Končaj
      </Button>
    </div>
  );
}
