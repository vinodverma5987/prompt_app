import { expect, test as base } from '@playwright/test';

export const PROMPT = 'How can we improve onboarding for new customers?';

// Unexpected browser exceptions fail the test that caused them.
export const test = base.extend({
  page: async ({ page }, runTest) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await runTest(page);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  },
});
export { expect };

export function results(page) {
  return page.getByRole('region', { name: 'Room for insight.' });
}

export function cards(page) {
  return results(page).getByRole('listitem');
}

export function waitForSubmission(page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/prompts' && response.request().method() === 'POST',
  );
}

export async function submitPrompt(page, { prompt = PROMPT, language = 'en' } = {}) {
  await page.getByLabel('Prompt', { exact: true }).fill(prompt);
  await page.getByLabel('Target language').selectOption(language);
  const pendingResponse = waitForSubmission(page);
  await page.getByRole('button', { name: /Generate insights|Send more details/ }).click();
  const response = await pendingResponse;
  expect(response.status()).toBe(200);
  const body = await response.json();
  if (body.status === 'SUCCESS') {
    await expect(results(page).getByText('Request complete', { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(body.insights.length);
  } else {
    await expect(results(page).getByText(body.message, { exact: true })).toBeVisible();
  }
  return { body, request: response.request().postDataJSON() };
}

export async function loadMore(page) {
  const pendingResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/insights?page=2') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Load more insights' }).click();
  const response = await pendingResponse;
  expect(response.status()).toBe(200);
  await expect(cards(page)).toHaveCount(12);
}
