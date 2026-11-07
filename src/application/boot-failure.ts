// Boot failure taxonomy (local-first-save-migration skill rule 8): a corrupt
// or future-version save is never silently reset — the UI shows a recoverable
// error screen and keeps the stored record until the player chooses.

export type BootFailureKind = 'corrupt' | 'newer-version';

export class BootFailure extends Error {
  readonly kind: BootFailureKind;
  readonly detail: string;

  constructor(kind: BootFailureKind, detail: string) {
    super(detail);
    this.name = 'BootFailure';
    this.kind = kind;
    this.detail = detail;
  }
}
