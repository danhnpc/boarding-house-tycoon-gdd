// Asset manifest (visual-direction 13, open-questions E4): stable typed keys.
// The MVP starts under the approved placeholder policy (GDD 10): every entry
// marked `placeholder: true` renders via code-drawn shapes with these stable
// keys, and tags that fail Visual Direction section 13 until production art
// replaces them by key.

export type AssetKey =
  | 'room-level-01-base'
  | 'room-level-02-improved'
  | 'room-level-03-premium'
  | 'tenant-student-marker'
  | 'tenant-office-worker-marker'
  | 'tenant-messy-marker'
  | 'tenant-student-idle'
  | 'tenant-office-worker-idle'
  | 'tenant-messy-idle'
  | 'ui-icon-cash'
  | 'ui-icon-mission'
  | 'ui-icon-event';

export interface AssetEntry {
  key: AssetKey;
  placeholder: boolean;
  /** Anchor/origin convention documented once per family (visual-direction 11.3). */
  anchor: 'ground-center' | 'center';
}

export const ASSET_MANIFEST: readonly AssetEntry[] = [
  { key: 'room-level-01-base', placeholder: true, anchor: 'ground-center' },
  { key: 'room-level-02-improved', placeholder: true, anchor: 'ground-center' },
  { key: 'room-level-03-premium', placeholder: true, anchor: 'ground-center' },
  { key: 'tenant-student-marker', placeholder: true, anchor: 'center' },
  { key: 'tenant-office-worker-marker', placeholder: true, anchor: 'center' },
  { key: 'tenant-messy-marker', placeholder: true, anchor: 'center' },
  { key: 'tenant-student-idle', placeholder: true, anchor: 'ground-center' },
  { key: 'tenant-office-worker-idle', placeholder: true, anchor: 'ground-center' },
  { key: 'tenant-messy-idle', placeholder: true, anchor: 'ground-center' },
  { key: 'ui-icon-cash', placeholder: true, anchor: 'center' },
  { key: 'ui-icon-mission', placeholder: true, anchor: 'center' },
  { key: 'ui-icon-event', placeholder: true, anchor: 'center' },
];
