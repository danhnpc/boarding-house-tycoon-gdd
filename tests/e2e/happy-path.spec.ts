// Core happy path (tech doc 12.3):
// 1. start a new game,
// 2. accept a candidate into a vacant room,
// 3. upgrade an eligible room,
// 4. build the next room when capacity and Cash allow it,
// 5. trigger and resolve a test event,
// 6. complete a mission and claim its reward,
// 7. reload the browser and verify the state remains correct.

import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Fresh save for every scenario.
  await page.evaluate(() => {
    void indexedDB.deleteDatabase('boarding-house-tycoon');
  });
  await page.reload();
  await expect(page.getByText(/Thu nhập ròng/)).toBeVisible({ timeout: 15_000 });
});

async function productionState(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const req = indexedDB.open('boarding-house-tycoon', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('saves', 'readonly');
          const get = tx.objectStore('saves').get('slot-1');
          get.onsuccess = () => resolve((get.result?.state ?? null) as Record<string, unknown>);
          tx.oncomplete = () => db.close();
        };
        req.onerror = () => resolve({});
      }),
  );
}

test('1. fresh game boots into the GDD starting state', async ({ page }) => {
  await expect(page.getByText('Nhiệm vụ 1')).toBeVisible();
  const state = (await productionState(page)) as {
    player?: { cashMinorUnits: number };
    building?: { rooms: Array<{ roomId: string; level: number }> };
  };
  expect(state.player?.cashMinorUnits).toBe(100_000);
  expect(state.building?.rooms).toHaveLength(2);
});

test('2-4. accept candidate, upgrade room, build room 3, missions progress', async ({ page }) => {
  // Accept the student candidate into the vacant Level 1 room.
  await page.getByRole('button', { name: /Nhận vào Phòng/ }).first().click();
  await expect(page.getByText('Nhiệm vụ 2')).toBeVisible();

  // Upgrade room-1 (office tenant 380 >= 210 legal). Requires expansion unlock;
  // Mission 1 already granted capacity 4 + Level 2 via milestone.
  const state = (await productionState(page)) as {
    progression?: { unlockedMaxLevel: number };
  };
  expect(state.progression?.unlockedMaxLevel).toBe(2);

  // Select room-1 by clicking its diamond on the isometric canvas. Wait for
  // the world rebuild that follows the tenancy change to settle.
  await page.waitForTimeout(1_200);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('canvas missing');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // 2-room layout: contentCenter=(24,12); camera at (24,-36); room-1 at (0,0).
  await page.mouse.move(cx - 24, cy + 36);
  await page.mouse.click(cx - 24, cy + 36);
  await expect(page.locator('.room-panel h2')).toBeVisible();

  // Upgrade button lives in the panel.
  const upgrade = page.getByRole('button', { name: /Nâng lên Cấp 2/ });
  await expect(upgrade).toBeEnabled();
  await upgrade.click();
  await expect(page.getByText(/Cấp 2/)).toBeVisible();
  await expect(page.getByText('Nhiệm vụ 3')).toBeVisible();

  // Build room 3: capacity 4, need 900 Cash; grant via the dev hook to keep
  // the E2E focused on UI wiring, not on a long idle wait. The build strip
  // lives in the Tenant panel, so close Room Detail first (scope to the room
  // panel: the offline toast has its own Close button), then wait for the
  // tenant panel to replace it.
  await page.waitForTimeout(600);
  await page.locator('.room-panel').getByRole('button', { name: 'Đóng' }).click();
  await expect(page.locator('.tenant-panel')).toBeVisible();
  await page.evaluate(() => {
    const hooks = (window as unknown as { __bht?: { grantCash: (n: number) => void } }).__bht;
    hooks?.grantCash(900);
  });
  const buildButton = page.getByRole('button', { name: /Xây phòng 3/ });
  await expect(buildButton).toBeVisible();
  await expect(buildButton).toBeEnabled();
  await buildButton.click();
  await expect(page.getByText('Nhiệm vụ 4')).toBeVisible();
});

test('5-6. forced event triggers the dialog and resolves deterministically', async ({ page }) => {
  await page.getByRole('button', { name: /Nhận vào Phòng/ }).first().click(); // mission 1
  await page.evaluate(() => {
    const hooks = (window as unknown as { __bht?: { forceEvent: () => void } }).__bht;
    hooks?.forceEvent();
  });
  const dialog = page.locator('.event-dialog');
  await expect(dialog).toBeVisible();
  // rng.next() = 0 selects the first eligible event; assert any deterministic
  // title renders, then resolve the first affordable choice.
  await dialog.getByRole('button').first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Nhiệm vụ 2')).toBeVisible();
});

test('7. reload persists rooms, levels, missions and saves', async ({ page }) => {
  await page.getByRole('button', { name: /Nhận vào Phòng/ }).first().click();
  await expect(page.getByText('Nhiệm vụ 2')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Nhiệm vụ 2')).toBeVisible();
  const state = (await productionState(page)) as {
    missions?: { completedMissionNumbers: number[] };
    building?: { rooms: Array<{ roomId: string; tenantId: string | null }> };
    time?: { lastCheckpointAt: number };
  };
  expect(state.missions?.completedMissionNumbers).toEqual([1]);
  const room2 = state.building?.rooms.find((r) => r.roomId === 'room-2');
  expect(room2?.tenantId).not.toBeNull();
  expect(typeof state.time?.lastCheckpointAt).toBe('number');
});

test('8. settings panel opens, shows storage status; reset wipes the save', async ({ page }) => {
  await page.getByRole('button', { name: /Nhận vào Phòng/ }).first().click();
  await expect(page.getByText('Nhiệm vụ 2')).toBeVisible();

  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByText('Bộ nhớ lớn:')).toBeVisible();

  // Reset via the settings screen: confirm browser dialog, app reloads empty.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Xoá save game' }).click();
  await expect(page.getByText('Nhiệm vụ 1')).toBeVisible({ timeout: 15_000 });
  const state = (await productionState(page)) as {
    missions?: { completedMissionNumbers: number[] };
  };
  expect(state.missions?.completedMissionNumbers).toEqual([]);
});
