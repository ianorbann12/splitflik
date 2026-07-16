// Email + password auth (Supabase). Shown only in live mode when no session
// exists; demo mode is always "signed in". Accounts are identity only — the
// invite code is the real access boundary (docs/API.md §2).
import { useState } from 'react';
import { store } from '../data/store';
import { Button, Segmented, TextField } from '../ui/kit';
import { GateLayout } from './GateLayout';

type AuthMode = 'signin' | 'signup';

export function AuthGate() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Vnesi e-pošto in geslo.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const result = await store.authSignUp(email.trim(), password);
        if (result === 'confirm') {
          setConfirm(true);
          return;
        }
      } else {
        await store.authSignIn(email.trim(), password);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/already registered|already exists|user_already_exists/i.test(msg)) {
        setError('Ta e-pošta je že registrirana — prijavi se.');
        setMode('signin');
      } else if (/at least 6|password.*(short|6)/i.test(msg)) {
        setError('Geslo mora imeti vsaj 6 znakov.');
      } else if (/invalid login credentials|invalid_credentials/i.test(msg)) {
        setError('Napačna e-pošta ali geslo.');
      } else if (/valid email|email.*invalid|invalid.*email/i.test(msg)) {
        setError('E-pošta ni v veljavni obliki.');
      } else {
        setError(msg || (mode === 'signin' ? 'Prijava ni uspela.' : 'Registracija ni uspela.'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (confirm) {
    return (
      <GateLayout
        title="Preveri e-pošto"
        subtitle={`Poslali smo potrditveno povezavo na ${email}. Potrdi jo in se nato prijavi.`}
      >
        <Button
          variant="secondary"
          full
          onClick={() => {
            setConfirm(false);
            setMode('signin');
          }}
        >
          Nazaj na prijavo
        </Button>
      </GateLayout>
    );
  }

  return (
    <GateLayout
      title={mode === 'signin' ? 'Dobrodošel nazaj' : 'Ustvari račun'}
      subtitle="Skeniraj račun, dodeli, kdo je kaj imel, in SplitFlik izračuna, kdo komu koliko dolguje."
    >
      <Segmented<AuthMode>
        variant="block"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: 'signin', label: 'Prijava' },
          { value: 'signup', label: 'Registracija' },
        ]}
        style={{ marginBottom: 18 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="E-pošta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Geslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>

      {error ? (
        <div style={{ font: '400 13px/1.4 Rubik', color: 'var(--neg)', marginTop: 12 }}>{error}</div>
      ) : null}

      <Button variant="primary" full onClick={() => void submit()} disabled={busy} style={{ marginTop: 18 }}>
        {busy ? 'Počakaj…' : mode === 'signin' ? 'Prijava' : 'Registracija'}
      </Button>
    </GateLayout>
  );
}
