// Import guard (game-domain-pure-logic skill, rule 2): the domain layer stays
// framework-free. Any forbidden import or global breaks this test.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DOMAIN_DIR = fileURLToPath(new URL('../../src/domain', import.meta.url));

const FORBIDDEN_IMPORTS = [
  /from\s+['"]react['"]/,
  /from\s+['"]phaser['"]/,
  /from\s+['"]zustand['"]/,
  /from\s+['"][@]capacitor/,
  /from\s+['"]idb['"]/,
  /from\s+['"]dexie['"]/,
];

// Date.now and Math.random are banned inside the domain; only type-level
// TimeProvider/RNG abstractions may appear (handled above shared/time.ts).
// The single systemTimeProvider adapter deliberately lives in src/platform.
const FORBIDDEN_GLYPHS = [
  { pattern: /\bDate\.now\b/, label: 'Date.now (inject TimeProvider instead)' },
  { pattern: /\bMath\.random\b/, label: 'Math.random (inject a seeded RNG instead)' },
  { pattern: /\bindexedDB\b/, label: 'indexedDB (persistence is not a domain concern)' },
  { pattern: /\blocalStorage\b/, label: 'localStorage' },
  { pattern: /\bnavigator\b/, label: 'navigator' },
  { pattern: /\bwindow\./, label: 'window' },
  { pattern: /\bdocument\./, label: 'document' },
  { pattern: /from\s+['"]node:/, label: 'node: import in domain' },
];

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) {
      files.push(...collectFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('domain import guard', () => {
  it('src/domain contains no forbidden imports or browser globals', () => {
    const violations: string[] = [];
    for (const file of collectFiles(DOMAIN_DIR)) {
      const code = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IMPORTS) {
        if (pattern.test(code)) {
          violations.push(`${file}: forbidden import (${pattern})`);
        }
      }
      for (const { pattern, label } of FORBIDDEN_GLYPHS) {
        if (pattern.test(code)) {
          violations.push(`${file}: ${label}`);
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('the domain directory actually has source files', () => {
    expect(collectFiles(DOMAIN_DIR).length).toBeGreaterThan(5);
  });
});
