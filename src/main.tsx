import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';

// No StrictMode: the SDK opens a Supabase realtime channel and reads the auth
// session in effects; dev double-invocation would churn the channel. Effects
// here are idempotent enough in production either way.
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
