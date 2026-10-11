import { err, ok, type Result } from './result';

export const LIST_COLORS = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#d9a400',
  green: '#2f9e44',
  teal: '#0f9b8e',
  blue: '#2563eb',
  purple: '#7c4dff',
  pink: '#d6409f',
  gray: '#6b7280',
} as const;

export type ListColor = keyof typeof LIST_COLORS;

export const COLOR_NAMES = Object.keys(LIST_COLORS) as ListColor[];

export interface ListInput {
  name: string;
  emoji: string;
  color: ListColor;
}

export interface List extends ListInput {
  id: string;
  order: number;
}

export const MAX_NAME_LENGTH = 40;

/** Created once on first run so the app is useful straight away. */
export const STARTER_LISTS: readonly ListInput[] = [
  { name: 'Fitness', emoji: '🏋️', color: 'orange' },
  { name: 'Work', emoji: '💼', color: 'blue' },
  { name: 'Side Business', emoji: '🚀', color: 'purple' },
  { name: 'Personal', emoji: '🏠', color: 'green' },
];

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Extended_Pictographic covers emoji (including skin-tone and joined sequences),
// but not flags (regional indicators) or keycaps (a digit plus U+20E3).
const EMOJI_MARK = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** True for exactly one emoji; digits, letters and symbols like "#" are not emoji here. */
export function isSingleEmoji(value: string): boolean {
  return [...graphemes.segment(value)].length === 1 && EMOJI_MARK.test(value);
}

export function validateListInput(input: {
  name: string;
  emoji: string;
  color: string;
}): Result<ListInput> {
  const name = input.name.trim();
  const emoji = input.emoji.trim();

  if (name === '') return err("List name can't be empty");
  if (name.length > MAX_NAME_LENGTH) {
    return err(`List name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  if (!isSingleEmoji(emoji)) return err('Pick exactly one emoji');
  if (!COLOR_NAMES.includes(input.color as ListColor)) return err('Pick one of the listed colors');

  return ok({ name, emoji, color: input.color as ListColor });
}

export type Direction = 'up' | 'down';

/** Returns a new order with `id` moved one place; unchanged at the edges or for unknown ids. */
export function moveInOrder(ids: readonly string[], id: string, direction: Direction): string[] {
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ids.length) return [...ids];

  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
