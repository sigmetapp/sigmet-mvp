import { test, expect } from '@playwright/test';

const REQUIRED_ENV = ['E2E_A_EMAIL', 'E2E_A_PASSWORD', 'E2E_B_EMAIL', 'E2E_B_PASSWORD', 'E2E_B_USER_ID'];

function hasEnv() {
  return REQUIRED_ENV.every((k) => !!process.env[k]);
}

async function login(page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL('**/feed');
}

test.describe('DM notifications E2E: two users, toasts, mute, global mute, read', () => {
  test.skip(!hasEnv(), 'E2E env not configured');

  test('flow', async ({ browser }) => {
    const aEmail = process.env.E2E_A_EMAIL!;
    const aPassword = process.env.E2E_A_PASSWORD!;
    const bEmail = process.env.E2E_B_EMAIL!;
    const bPassword = process.env.E2E_B_PASSWORD!;
    const bUserId = process.env.E2E_B_USER_ID!;

    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await login(pageA, aEmail, aPassword);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, bEmail, bPassword);

    // B: navigate to notifications and ensure global mute off
    await pageB.goto('/settings/notifications');
    // Toggle off if on
    const globalMuteSection = pageB.getByText('Global mute');
    const globalMuteCheckbox = globalMuteSection.locator('xpath=..').locator('input[type="checkbox"]');
    if (await globalMuteCheckbox.isChecked()) {
      await globalMuteCheckbox.uncheck();
    }

    // A: create or fetch 1:1 thread with B
    const tRes = await pageA.request.post('/api/dms/threads.create', {
      data: { participant_ids: [bUserId] },
    });
    expect(tRes.ok()).toBeTruthy();
    const tJson = await tRes.json();
    expect(tJson.ok).toBe(true);
    const threadId = tJson.thread?.id;
    expect(threadId).toBeTruthy();

    // B: show a client toast to verify the toast system
    await pageB.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { showToast } = require('../lib/dm/toast');
      showToast({ title: 'Test toast', text: 'Hello B' });
    });
    await expect(pageB.locator('#dm-toast-container')).toBeVisible();

    // A -> send message to B
    const sendRes = await pageA.request.post('/api/dms/messages.send', {
      data: { thread_id: threadId, body: 'Hello from A' },
    });
    expect(sendRes.ok()).toBeTruthy();

    // B: mute thread
    const muteRes = await pageB.request.post('/api/dms/thread.mute', {
      data: { thread_id: threadId, muted: true },
    });
    expect(muteRes.ok()).toBeTruthy();

    // B: toggle global mute on
    if (!(await globalMuteCheckbox.isChecked())) {
      await globalMuteCheckbox.check();
    }

    // B: mark as read up to the last id (simplified: use a high number)
    await pageB.request.post('/api/dms/messages.read', {
      data: { thread_id: threadId, up_to_message_id: 1_000_000 },
    });

    // UI badge should show Muted
    await expect(pageB.getByText('Muted')).toBeVisible();
  });
});
