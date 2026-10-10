import { test, expect, _electron as electron } from '@playwright/test';
test('production desktop opens', async () => {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHORTCUT_DEV: '0' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'ShortCut Studio' })).toBeVisible();
    await page.screenshot({ path: 'test-results/desktop.png' });
  } finally { await app.close(); }
});
