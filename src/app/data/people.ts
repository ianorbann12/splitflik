// Avatar colours + name helpers. The prototype gave each person a fixed avatar
// colour; real people get a deterministic colour hashed from their id so the
// same person is always the same colour across devices.
import type { Person } from '../../types';

export const AVATAR_COLORS = [
  '#0E7C86',
  '#7A5EA6',
  '#B5651D',
  '#5B6B8C',
  '#4A6FA5',
  '#2E9E63',
  '#C0567B',
  '#3F7E68',
  '#8A6D3B',
  '#6A5ACD',
  '#A24C6B',
  '#4C7A34',
] as const;

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function personColor(id: string): string {
  return AVATAR_COLORS[hash(id) % AVATAR_COLORS.length] as string;
}

/** "Nina Kovač" → "NK"; single word → first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

/** First token of a full name, for compact labels. */
export function firstName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? name;
}

export function personName(people: Person[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? 'Neznan';
}

export function avatarUrlOf(people: Person[], id: string): string | undefined {
  return people.find((p) => p.id === id)?.avatarUrl;
}

/** Spreadable `src` prop for <Avatar> — omitted when there's no picture. */
export function avatarSrcProp(url: string | undefined): { src?: string } {
  return url ? { src: url } : {};
}
