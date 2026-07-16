// "Dodeli zneske" — the expense editor. Three ways to split, all mapping to the
// engine's SplitSpec: equal, exact ("po meri"), or per-item (from a scanned
// receipt). Confirming saves one Expense via the SDK.
import { useMemo, useRef, useState } from 'react';
import type { Expense, Person, SplitSpec } from '../../../types';
import { computeShares, equalSplit } from '../../../engine/shares';
import { store } from '../../data/store';
import { parseReceipt } from '../../data/receipt';
import { avatarSrcProp, avatarUrlOf, firstName } from '../../data/people';
import { currencySymbol, formatEur, formatEurPlain, parseEur } from '../../format';
import { Avatar, Button, ConfirmDialog, FieldLabel, Segmented, Spinner, TextField } from '../../ui/kit';
import { IconCamera, IconPlus, IconTrash } from '../../ui/icons';

type Mode = 'equal' | 'exact' | 'items';

/**
 * Resolves an "exact" split where the user typed amounts for only SOME people:
 * blank participants share the remaining total equally (largest-remainder via
 * the engine). Non-empty-but-invalid inputs are treated as blank.
 */
function resolveExact(
  totalCents: number,
  ids: string[],
  inputs: Record<string, string>,
): { shares: Map<string, number>; fixedSum: number; remainder: number; autoIds: string[] } {
  const shares = new Map<string, number>();
  const autoIds: string[] = [];
  let fixedSum = 0;
  for (const id of ids) {
    const raw = (inputs[id] ?? '').trim();
    const c = raw === '' ? null : parseEur(raw);
    if (c === null) {
      autoIds.push(id);
      continue;
    }
    shares.set(id, c);
    fixedSum += c;
  }
  const remainder = totalCents - fixedSum;
  if (autoIds.length > 0 && remainder > 0) {
    for (const [id, c] of equalSplit(remainder, autoIds)) shares.set(id, c);
  }
  return { shares, fixedSum, remainder, autoIds };
}

interface DraftItem {
  key: string;
  label: string;
  /** Raw input string (parsed to cents only on confirm — never reformatted mid-type). */
  amountInput: string;
  participantIds: string[];
}

function initialMode(expense: Expense | null): Mode {
  if (!expense) return 'equal';
  if (expense.split.mode === 'items') return 'items';
  if (expense.split.mode === 'exact' || expense.split.mode === 'weights') return 'exact';
  return 'equal';
}

export function StepAssign({
  outing,
  participants,
  meId,
  editingExpense,
  onDone,
}: {
  outing: { id: string; groupId: string; currentCycle: number; participantIds: string[] };
  participants: Person[];
  meId: string;
  editingExpense: Expense | null;
  onDone: () => void;
}) {
  const allIds = participants.map((p) => p.id);
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'Neznan';

  const [description, setDescription] = useState(editingExpense?.description ?? '');
  // Default the payer to a valid participant (me if I'm in the outing, else the first).
  const [payerId, setPayerId] = useState<string>(
    editingExpense?.payerId ?? (allIds.includes(meId) ? meId : (allIds[0] ?? '')),
  );
  const [mode, setMode] = useState<Mode>(initialMode(editingExpense));
  const [totalInput, setTotalInput] = useState(
    editingExpense ? formatEurPlain(editingExpense.amountCents) : '',
  );
  const [equalIds, setEqualIds] = useState<string[]>(
    editingExpense?.split.mode === 'equal' ? editingExpense.split.participantIds : allIds,
  );
  const [exactInputs, setExactInputs] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const split = editingExpense?.split;
    if (split?.mode === 'exact') {
      for (const e of split.entries) out[e.personId] = formatEurPlain(e.amountCents);
    } else if (split?.mode === 'weights' && editingExpense) {
      // Reverse-map a weighted split to concrete per-person amounts via the engine.
      try {
        for (const [id, cents] of computeShares(editingExpense)) out[id] = formatEurPlain(cents);
      } catch {
        // leave blank on invalid data
      }
    }
    return out;
  });
  const [items, setItems] = useState<DraftItem[]>(() => {
    if (editingExpense?.split.mode === 'items') {
      return editingExpense.split.items.map((it, i) => ({
        key: `it-${i}`,
        label: it.label,
        amountInput: formatEurPlain(it.amountCents),
        participantIds: it.participantIds,
      }));
    }
    return [];
  });
  const [scanning, setScanning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const itemCents = (it: DraftItem) => parseEur(it.amountInput) ?? 0;
  const itemsTotal = items.reduce((s, it) => s + itemCents(it), 0);
  const totalCents = mode === 'items' ? itemsTotal : parseEur(totalInput) ?? 0;

  const equalPreview = useMemo(() => {
    if (mode !== 'equal' || totalCents <= 0 || equalIds.length === 0) return null;
    try {
      return equalSplit(totalCents, equalIds);
    } catch {
      return null;
    }
  }, [mode, totalCents, equalIds]);

  const exactResolve = resolveExact(totalCents, allIds, exactInputs);

  const onScan = async (file: File) => {
    setScanning(true);
    try {
      const parsed = await parseReceipt(file);
      const next: DraftItem[] = parsed.items.map((it, i) => ({
        key: `scan-${i}-${it.label}`,
        label: it.label,
        amountInput: formatEurPlain(it.totalCents),
        participantIds: [...allIds],
      }));
      const sum = parsed.items.reduce((s, it) => s + it.totalCents, 0);
      if (parsed.totalCents && parsed.totalCents > sum) {
        next.push({ key: 'scan-rest', label: 'Ostalo', amountInput: formatEurPlain(parsed.totalCents - sum), participantIds: [...allIds] });
      }
      setItems(next);
      setMode('items');
      if (!description.trim()) setDescription('Skeniran račun');
      store.toast(parsed.mocked ? 'Uporabljen vzorčni račun (parser ni na voljo)' : 'Račun razčlenjen');
    } catch {
      store.toast('Branje računa ni uspelo. Vnesi ročno.');
    } finally {
      setScanning(false);
    }
  };

  const toggleEqual = (id: string) =>
    setEqualIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const toggleItemParticipant = (key: string, id: string) =>
    setItems((cur) =>
      cur.map((it) =>
        it.key === key
          ? {
              ...it,
              participantIds: it.participantIds.includes(id)
                ? it.participantIds.filter((x) => x !== id)
                : [...it.participantIds, id],
            }
          : it,
      ),
    );

  const deleteBill = () => {
    if (!editingExpense) return;
    store.deleteExpense(editingExpense.id);
    store.toast('Račun izbrisan');
    onDone();
  };

  const confirm = () => {
    if (!description.trim()) return store.toast('Vnesi opis računa.');
    if (!allIds.includes(payerId)) return store.toast('Izberi, kdo je plačal.');

    let amountCents: number;
    let split: SplitSpec;

    if (mode === 'items') {
      const clean = items
        .map((it) => ({ label: it.label.trim() || 'Postavka', amountCents: itemCents(it), participantIds: it.participantIds }))
        .filter((it) => it.amountCents > 0 && it.participantIds.length > 0);
      if (clean.length === 0) return store.toast('Dodaj vsaj eno postavko z osebami.');
      amountCents = clean.reduce((s, it) => s + it.amountCents, 0);
      split = { mode: 'items', items: clean };
    } else if (mode === 'equal') {
      const parsed = parseEur(totalInput);
      if (!parsed || parsed <= 0) return store.toast('Vnesi skupni znesek.');
      if (equalIds.length === 0) return store.toast('Izberi vsaj eno osebo.');
      amountCents = parsed;
      split = { mode: 'equal', participantIds: equalIds };
    } else {
      const parsed = parseEur(totalInput);
      if (!parsed || parsed <= 0) return store.toast('Vnesi skupni znesek.');
      const r = resolveExact(parsed, allIds, exactInputs);
      if (r.remainder < 0) return store.toast(`Vnosi presegajo znesek za ${formatEur(-r.remainder)}`);
      // Everyone has a fixed amount but they don't add up — nobody to absorb the rest.
      if (r.autoIds.length === 0 && r.remainder > 0)
        return store.toast(`Manjka še ${formatEur(r.remainder)}`);
      const entries = allIds
        .map((id) => ({ personId: id, amountCents: r.shares.get(id) ?? 0 }))
        .filter((e) => e.amountCents > 0);
      if (entries.length === 0) return store.toast('Vnesi zneske po osebah.');
      amountCents = parsed;
      split = { mode: 'exact', entries };
    }

    const expense: Expense = {
      id: editingExpense?.id ?? crypto.randomUUID(),
      outingId: outing.id,
      groupId: outing.groupId,
      description: description.trim(),
      amountCents,
      payerId,
      split,
      cycle: editingExpense?.cycle ?? outing.currentCycle,
      createdAt: editingExpense?.createdAt ?? Date.now(),
    };

    try {
      computeShares(expense); // validate against the engine before persisting
    } catch {
      return store.toast('SplitFliktev ni veljavna. Preveri zneske.');
    }

    store.saveExpense(expense, !editingExpense);
    store.toast(editingExpense ? 'Račun posodobljen' : 'Račun dodan');
    onDone();
  };

  return (
    <div>
      <FieldLabel>Trgovina / lokal</FieldLabel>
      <TextField
        placeholder="npr. Mercator, Hood Burger…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      <FieldLabel>Kdo je plačal račun</FieldLabel>
      <div style={{ position: 'relative', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={nameOf(payerId)} id={payerId} size={40} {...avatarSrcProp(avatarUrlOf(participants, payerId))} />
        <select
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', font: '400 15px/1 Rubik', color: 'var(--text)', background: 'var(--surface2)', appearance: 'none' }}
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {firstName(p.name)}
              {p.id === meId ? ' (ti)' : ''}
            </option>
          ))}
        </select>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onScan(f);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={scanning}
        style={{ width: '100%', border: '2px dashed var(--dash)', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'var(--surface2)', cursor: 'pointer', marginBottom: 18 }}
      >
        {scanning ? <Spinner /> : <IconCamera size={28} color="var(--accent)" strokeWidth={1.8} />}
        <span style={{ font: '600 14px/1 Rubik', color: 'var(--link)' }}>
          {scanning ? 'Berem račun…' : 'Skeniraj račun'}
        </span>
      </button>

      {mode === 'items' ? (
        <ItemsEditor
          items={items}
          participants={participants}
          onLabel={(key, label) => setItems((c) => c.map((it) => (it.key === key ? { ...it, label } : it)))}
          onAmountInput={(key, amountInput) => setItems((c) => c.map((it) => (it.key === key ? { ...it, amountInput } : it)))}
          onToggle={toggleItemParticipant}
          onRemove={(key) => setItems((c) => c.filter((it) => it.key !== key))}
          onAdd={() =>
            setItems((c) => [
              ...c,
              { key: `it-${c.length}-${Date.now()}`, label: '', amountInput: '', participantIds: [...allIds] },
            ])
          }
          total={itemsTotal}
          onSwitchManual={() => setMode('equal')}
        />
      ) : (
        <ManualEditor
          mode={mode}
          setMode={setMode}
          totalInput={totalInput}
          setTotalInput={setTotalInput}
          participants={participants}
          meId={meId}
          equalIds={equalIds}
          toggleEqual={toggleEqual}
          equalPreview={equalPreview}
          exactInputs={exactInputs}
          setExactInputs={setExactInputs}
          exactResolve={exactResolve}
          totalCents={totalCents}
        />
      )}

      <Button variant="primary" full onClick={confirm} style={{ marginTop: 20 }}>
        {editingExpense ? 'Shrani račun' : 'Potrdi račun'}
      </Button>
      {editingExpense ? (
        <button
          onClick={() => setConfirmDelete(true)}
          style={{ width: '100%', background: 'none', border: 'none', color: 'var(--neg)', font: '600 14px/1 Rubik', cursor: 'pointer', marginTop: 14, padding: 8 }}
        >
          Izbriši račun
        </button>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Izbriši račun?"
          message="Ta račun bo trajno izbrisan iz aktivnosti."
          confirmLabel="Izbriši"
          danger
          onConfirm={() => {
            setConfirmDelete(false);
            deleteBill();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

// ------------------------------- items mode --------------------------------

function ParticipantChips({
  participants,
  selected,
  onToggle,
}: {
  participants: Person[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {participants.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            onClick={() => onToggle(p.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-soft)' : 'transparent', borderRadius: 9999, padding: '5px 10px 5px 5px', cursor: 'pointer', opacity: on ? 1 : 0.55 }}
          >
            <Avatar name={p.name} id={p.id} size={24} {...avatarSrcProp(p.avatarUrl)} />
            <span style={{ font: '500 12px/1 Rubik', color: 'var(--text)' }}>{firstName(p.name)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ItemsEditor({
  items,
  participants,
  onLabel,
  onAmountInput,
  onToggle,
  onRemove,
  onAdd,
  total,
  onSwitchManual,
}: {
  items: DraftItem[];
  participants: Person[];
  onLabel: (key: string, label: string) => void;
  onAmountInput: (key: string, amountInput: string) => void;
  onToggle: (key: string, id: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  total: number;
  onSwitchManual: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <FieldLabel style={{ marginBottom: 0 }}>Postavke · vsaki dodeli osebe</FieldLabel>
        <button onClick={onSwitchManual} style={{ background: 'none', border: 'none', color: 'var(--link)', font: '600 13px/1 Rubik', cursor: 'pointer' }}>
          Razdeli ročno
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it) => (
          <div key={it.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <TextField value={it.label} placeholder="Postavka" onChange={(e) => onLabel(it.key, e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: 12 }} />
              <div style={{ position: 'relative', width: 96 }}>
                <input
                  value={it.amountInput}
                  onChange={(e) => onAmountInput(it.key, e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 24px 10px 10px', font: '600 14px/1 Rubik', color: 'var(--text)', background: 'var(--surface)', textAlign: 'right' }}
                />
                <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', font: '500 13px/1 Rubik', color: 'var(--text-sec)' }}>{currencySymbol()}</span>
              </div>
              <button onClick={() => onRemove(it.key)} aria-label="Odstrani" style={{ border: 'none', background: 'var(--surface3)', borderRadius: 12, width: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconTrash size={16} color="var(--text-sec)" strokeWidth={2} />
              </button>
            </div>
            <ParticipantChips participants={participants} selected={it.participantIds} onToggle={(id) => onToggle(it.key, id)} />
          </div>
        ))}
      </div>
      <button onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--link)', font: '600 14px/1 Rubik', cursor: 'pointer', marginTop: 12 }}>
        <IconPlus size={16} color="var(--link)" strokeWidth={2.2} /> Dodaj postavko
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, font: '600 15px/1 Rubik', color: 'var(--text)' }}>
        <span>Skupaj</span>
        <span>{formatEur(total)}</span>
      </div>
    </div>
  );
}

// ------------------------------- manual mode -------------------------------

function ManualEditor({
  mode,
  setMode,
  totalInput,
  setTotalInput,
  participants,
  meId,
  equalIds,
  toggleEqual,
  equalPreview,
  exactInputs,
  setExactInputs,
  exactResolve,
  totalCents,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  totalInput: string;
  setTotalInput: (v: string) => void;
  participants: Person[];
  meId: string;
  equalIds: string[];
  toggleEqual: (id: string) => void;
  equalPreview: Map<string, number> | null;
  exactInputs: Record<string, string>;
  setExactInputs: (fn: (cur: Record<string, string>) => Record<string, string>) => void;
  exactResolve: { shares: Map<string, number>; fixedSum: number; remainder: number; autoIds: string[] };
  totalCents: number;
}) {
  const { shares, remainder, autoIds } = exactResolve;
  const auto = autoIds.length > 0;
  const over = remainder < 0;
  return (
    <div>
      <FieldLabel>Skupni znesek računa</FieldLabel>
      <TextField value={totalInput} onChange={(e) => setTotalInput(e.target.value)} inputMode="decimal" placeholder="0,00" suffix={currencySymbol()} style={{ font: '600 17px/1 Rubik', marginBottom: 16 }} />

      <Segmented<Mode>
        variant="block"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'equal', label: 'Razdeli enakomerno' },
          { value: 'exact', label: 'Po meri' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {mode === 'equal' ? (
        <div>
          <FieldLabel>Kdo deli ta račun</FieldLabel>
          <ParticipantChips participants={participants} selected={equalIds} onToggle={toggleEqual} />
          {equalPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {participants.filter((p) => equalIds.includes(p.id)).map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={p.name} id={p.id} size={30} {...avatarSrcProp(p.avatarUrl)} />
                  <span style={{ flex: 1, font: '500 14px/1 Rubik', color: 'var(--text)' }}>
                    {firstName(p.name)}
                    {p.id === meId ? ' (ti)' : ''}
                  </span>
                  <span style={{ font: '600 14px/1 Rubik', color: 'var(--text)' }}>{formatEur(equalPreview.get(p.id) ?? 0)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <FieldLabel>Znesek na osebo</FieldLabel>
          <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginBottom: 10 }}>
            Vnesi zneske za nekatere; preostale pusti prazne in preostanek razdelimo mednje.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {participants.map((p) => {
              const isAuto = autoIds.includes(p.id);
              const share = shares.get(p.id) ?? 0;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={p.name} id={p.id} size={40} {...avatarSrcProp(p.avatarUrl)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ font: '500 15px/1 Rubik', color: 'var(--text)' }}>
                      {firstName(p.name)}
                      {p.id === meId ? ' (ti)' : ''}
                    </span>
                    {isAuto && totalCents > 0 && !over && share > 0 ? (
                      <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--link)', marginTop: 2 }}>
                        samodejno {formatEur(share)}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ position: 'relative', width: 100 }}>
                    <input
                      value={exactInputs[p.id] ?? ''}
                      onChange={(e) => setExactInputs((cur) => ({ ...cur, [p.id]: e.target.value }))}
                      inputMode="decimal"
                      placeholder="samodej."
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 26px 10px 12px', font: '600 15px/1 Rubik', color: 'var(--text)', background: 'var(--surface)', textAlign: 'right' }}
                    />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', font: '500 14px/1 Rubik', color: 'var(--text-sec)' }}>
                      {currencySymbol()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {totalCents > 0 ? (
            (() => {
              const good = !over && (remainder === 0 || auto);
              const color = good ? (remainder === 0 ? 'var(--pos)' : 'var(--link)') : 'var(--neg)';
              const bg = good ? 'var(--accent-soft)' : 'rgba(224,65,63,0.12)';
              const text = over
                ? `Vnosi presegajo znesek za ${formatEur(-remainder)}`
                : remainder === 0
                  ? 'Zneski se ujemajo z računom'
                  : auto
                    ? `Preostanek ${formatEur(remainder)} razdeljen med ${autoIds.length} ${autoIds.length === 1 ? 'osebo' : 'oseb'}`
                    : `Manjka še ${formatEur(remainder)}`;
              return (
                <div style={{ background: bg, borderRadius: 12, padding: '12px 14px', marginTop: 14 }}>
                  <span style={{ font: '500 13px/1.35 Rubik', color }}>{text}</span>
                </div>
              );
            })()
          ) : null}
        </div>
      )}
    </div>
  );
}
