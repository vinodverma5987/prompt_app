import { test, expect, cards, submitPrompt, loadMore } from './helpers';

test('mobile supports submission, pagination, search, and history without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New request' })).toBeVisible();
  await submitPrompt(page);
  await loadMore(page);
  await page.getByRole('textbox', { name: 'Search insights' }).fill('Research');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Learn from customer conversations');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(cards(page)).toHaveCount(12);
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByRole('button', { name: 'New request' }).click();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Recent requests' }).getByRole('button').click();
  await expect(cards(page)).toHaveCount(12);
});
