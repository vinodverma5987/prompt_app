import {
  test,
  expect,
  PROMPT,
  cards,
  results,
  submitPrompt,
  loadMore,
  waitForSubmission,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('empty, whitespace and oversized prompts cannot be submitted', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') requests.push(request.url());
  });
  const input = page.getByLabel('Prompt', { exact: true });
  const submit = page.getByRole('button', { name: 'Generate insights' });
  await expect(submit).toBeDisabled();
  await input.fill('   ');
  await input.blur();
  await expect(submit).toBeDisabled();
  await expect(page.getByText('Enter a prompt to get started.', { exact: true })).toBeVisible();
  await input.fill('x'.repeat(4001));
  await expect(submit).toBeDisabled();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Keep your prompt under 4,000 characters.')).toBeVisible();
  await input.fill('x'.repeat(4000));
  await expect(submit).toBeEnabled();
  expect(requests).toEqual([]);
});

test('an example populates the composer and returns real backend insights', async ({ page }) => {
  await page.getByRole('button', { name: PROMPT, exact: true }).click();
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(PROMPT);
  const { body, request } = await submitPrompt(page);
  expect(request).toEqual({ prompt: PROMPT, targetLanguage: 'en' });
  expect(body.status).toBe('SUCCESS');
  expect(body.pagination).toMatchObject({ page: 1, pageSize: 10, totalItems: 12, hasMore: true });
  await expect(cards(page).first()).toContainText(body.insights[0].title);
  await expect(page.getByRole('navigation', { name: 'Recent requests' })).toContainText('Complete');
});

test('clarification follow-up keeps its context and creates a new request', async ({ page }) => {
  const initial = await submitPrompt(page, { prompt: 'hi' });
  expect(initial.body.status).toBe('NEEDS_CLARIFICATION');
  await expect(page.getByRole('button', { name: 'Send more details' })).toBeEnabled();
  await expect(cards(page)).toHaveCount(0);
  const followup = await submitPrompt(page);
  expect(followup.request.contextId).toBe(initial.body.contextId);
  expect(followup.body.contextId).toBe(initial.body.contextId);
  expect(followup.body.requestId).not.toBe(initial.body.requestId);
  await expect(
    page.getByRole('navigation', { name: 'Recent requests' }).getByRole('button'),
  ).toHaveCount(2);
});

test('pagination and history reuse cached pages without another POST or page-one GET', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      requests.push(
        `${request.method()} ${new URL(request.url()).pathname}${new URL(request.url()).search}`,
      );
    }
  });
  const { body } = await submitPrompt(page);
  await loadMore(page);
  await expect(page.getByRole('button', { name: 'Load more insights' })).toHaveCount(0);
  await expect(results(page).getByText('You’ve reached the end', { exact: false })).toBeVisible();
  const titles = await cards(page).getByRole('heading').allTextContents();
  expect(new Set(titles).size).toBe(12);
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue('');
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Recent requests' }).getByRole('button').click();
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(PROMPT);
  await expect(cards(page)).toHaveCount(12);
  expect(await cards(page).getByRole('heading').allTextContents()).toEqual(titles);
  expect(requests).toEqual([
    'POST /api/prompts',
    `GET /api/requests/${body.requestId}/insights?page=2`,
  ]);
});

test('search filters metadata, shows an empty state, and clears without network calls', async ({
  page,
}) => {
  await submitPrompt(page);
  await loadMore(page);
  const apiRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  const search = page.getByRole('textbox', { name: 'Search insights' });
  await search.fill('Research');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Learn from customer conversations');
  await search.fill('no matching insight exists');
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No matching insights' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(cards(page)).toHaveCount(12);
  expect(apiRequests).toEqual([]);
});

test('search waits 300 ms after the last edit before filtering', async ({ page }) => {
  // Install before the app starts using timers; use browser time, not wall-clock sleeps.
  await page.clock.install({ time: new Date('2030-01-01T10:00:00Z') });
  await page.reload();
  await submitPrompt(page);
  await page.clock.pauseAt(new Date('2030-01-01T10:01:00Z'));
  const search = page.getByRole('textbox', { name: 'Search insights' });
  await search.fill('first-run');
  await page.clock.runFor(200);
  await search.fill('time to first value');
  await page.clock.runFor(299);
  await expect(cards(page)).toHaveCount(10);
  await expect(results(page).getByRole('status')).toContainText('Searching…');
  await page.clock.runFor(1);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Measure time to first value');
  await page.clock.resume();
});

test('A–Z and Z–A sorting order the complete loaded titles and restore original order', async ({
  page,
}) => {
  await submitPrompt(page);
  await loadMore(page);
  const original = await cards(page).getByRole('heading').allTextContents();
  const ascending = [...original].sort(
    new Intl.Collator('en', { sensitivity: 'base', numeric: true }).compare,
  );
  await page.getByLabel('Sort insights').selectOption('az');
  await expect(cards(page).getByRole('heading')).toHaveText(ascending);
  await page.getByLabel('Sort insights').selectOption('za');
  await expect(cards(page).getByRole('heading')).toHaveText([...ascending].reverse());
  await page.getByLabel('Sort insights').selectOption('original');
  await expect(cards(page).getByRole('heading')).toHaveText(original);
});

for (const [language, title] of [
  ['es', 'Comienza con un objetivo claro'],
  ['fr', 'Commencer par un objectif clair'],
  ['de', 'Mit einem klaren Ziel beginnen'],
]) {
  test(`target language ${language} renders localized backend fixtures`, async ({ page }) => {
    const { body, request } = await submitPrompt(page, { language });
    expect(request.targetLanguage).toBe(language);
    expect(body.targetLanguage).toBe(language);
    await expect(cards(page).first().getByRole('heading')).toHaveText(title);
    await expect(results(page).getByRole('list')).toHaveAttribute('lang', language);
    await expect(page.getByRole('navigation', { name: 'Recent requests' })).toContainText(
      language.toUpperCase(),
    );
  });
}

test('pending submissions disable controls and show loading until the real response arrives', async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/prompts', async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByLabel('Prompt', { exact: true }).fill(PROMPT);
  const pendingResponse = waitForSubmission(page);
  await page.getByRole('button', { name: 'Generate insights' }).click();
  try {
    await expect(page.getByRole('button', { name: 'Generating insights…' })).toBeDisabled();
    await expect(page.getByLabel('Prompt', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Target language')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'New request' })).toBeDisabled();
    await expect(results(page).getByRole('status')).toContainText('Putting your insights together');
  } finally {
    release();
  }
  expect((await pendingResponse).status()).toBe(200);
  await expect(cards(page)).toHaveCount(10);
});

test('a real backend 422 is displayed with field details and corrected submission succeeds', async ({
  page,
}) => {
  // The dropdown prevents invalid languages. Change one outgoing request to exercise
  // FastAPI's real validation response through the React error UI.
  await page.route(
    '**/api/prompts',
    (route) =>
      route.continue({
        postData: JSON.stringify({ ...route.request().postDataJSON(), targetLanguage: 'xx' }),
      }),
    { times: 1 },
  );
  await page.getByLabel('Prompt', { exact: true }).fill(PROMPT);
  const pendingResponse = waitForSubmission(page);
  await page.getByRole('button', { name: 'Generate insights' }).click();
  const response = await pendingResponse;
  expect(response.status()).toBe(422);
  expect((await response.json()).error).toBe('INVALID_LANGUAGE');
  await expect(page.getByRole('alert')).toContainText('Target language must be en, es, fr, or de.');
  await expect(page.getByRole('alert')).toContainText('targetLanguage');
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(PROMPT);
  await submitPrompt(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('network failure keeps the prompt and allows a successful retry', async ({ page }) => {
  await page.route('**/api/prompts', (route) => route.abort('failed'), { times: 1 });
  await page.getByLabel('Prompt', { exact: true }).fill(PROMPT);
  await page.getByRole('button', { name: 'Generate insights' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not reach the service');
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(PROMPT);
  await expect(page.getByRole('button', { name: 'Generate insights' })).toBeEnabled();
  await submitPrompt(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed next-page fetch keeps existing insights and retries the same page', async ({
  page,
}) => {
  await submitPrompt(page);
  const original = await cards(page).getByRole('heading').allTextContents();
  await page.route(
    '**/insights?page=2',
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: 'TEMPORARY_FAILURE',
          message: 'Temporarily unavailable. Please retry.',
          details: [],
        },
      }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Load more insights' }).click();
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable. Please retry.');
  await expect(cards(page).getByRole('heading')).toHaveText(original);
  const response = page.waitForResponse('**/insights?page=2');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(cards(page)).toHaveCount(12);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the API docs link opens Swagger and the documented routes are available', async ({
  page,
}) => {
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'API docs' }).click();
  const docs = await popup;
  await expect(docs).toHaveURL(/\/docs$/);
  // Swagger assets come from a CDN; verify the local HTML and schema without
  // making this test depend on an external script finishing its download.
  await expect(docs).toHaveTitle('Prompt Studio API - Swagger UI');
  const response = await page.request.get('/openapi.json');
  expect(response.ok()).toBeTruthy();
  const schema = await response.json();
  expect(schema.paths['/api/prompts'].post).toBeDefined();
  expect(schema.paths['/api/requests/{request_id}/insights'].get).toBeDefined();
  await docs.close();
});
