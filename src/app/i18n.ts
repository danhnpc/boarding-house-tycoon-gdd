// Locale strings (GDD 9.1): one flat key/value file per language; UI never
// hardcodes player-facing text. Product owner owns and approves the strings;
// current values are draft placeholders pending that approval (tech doc Phase
// 2 open items).

import vi from '../locales/vi.json';

type LocaleTable = Record<string, string>;

const TABLES: Record<string, LocaleTable> = { vi: vi as LocaleTable };

export type Locale = keyof typeof TABLES;

export function t(
  key: string,
  params?: Record<string, string | number>,
  locale: Locale = 'vi',
): string {
  const table = TABLES[locale];
  const raw = table[key] ?? key;
  if (params === undefined) {
    return raw;
  }
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    raw,
  );
}
