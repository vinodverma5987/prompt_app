import { test, expect } from '@playwright/test';

const valid = { prompt: 'Improve customer onboarding', targetLanguage: 'en' };

test('health and immutable pagination work through the frontend proxy', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok', provider: 'local-fixture' });
  const response = await request.post('/api/prompts', { data: valid });
  expect(response.status()).toBe(200);
  const first = await response.json();
  expect(first.insights).toHaveLength(10);
  expect(first.pagination).toEqual({
    page: 1,
    pageSize: 10,
    totalItems: 12,
    totalPages: 2,
    hasMore: true,
    nextPage: 2,
  });
  const url = `/api/requests/${first.requestId}/insights`;
  const pageTwo = await request.get(`${url}?page=2`);
  expect(pageTwo.status()).toBe(200);
  const second = await pageTwo.json();
  expect(second.insights).toHaveLength(2);
  expect(second.pagination).toMatchObject({ page: 2, hasMore: false, nextPage: null });
  expect(new Set([...first.insights, ...second.insights].map((item) => item.id)).size).toBe(12);
  expect(await (await request.get(url)).json()).toEqual(first);
  const invalidPage = await request.get(`${url}?page=3`);
  expect(invalidPage.status()).toBe(404);
  expect((await invalidPage.json()).error).toBe('PAGE_NOT_FOUND');
});

test('clarification and its follow-up share one context', async ({ request }) => {
  const response = await request.post('/api/prompts', { data: { ...valid, prompt: 'hi' } });
  expect(response.status()).toBe(200);
  const clarification = await response.json();
  expect(clarification.status).toBe('NEEDS_CLARIFICATION');
  expect(clarification.insights).toBeUndefined();
  const responsePage = await request.get(`/api/requests/${clarification.requestId}/insights`);
  expect(responsePage.status()).toBe(409);
  const followup = await request.post('/api/prompts', {
    data: { ...valid, contextId: clarification.contextId },
  });
  expect(followup.status()).toBe(200);
  const success = await followup.json();
  expect(success.status).toBe('SUCCESS');
  expect(success.contextId).toBe(clarification.contextId);
  expect(success.requestId).not.toBe(clarification.requestId);
});

for (const { name, data, error } of [
  { name: 'missing prompt', data: { targetLanguage: 'en' }, error: 'INVALID_REQUEST' },
  { name: 'empty prompt', data: { ...valid, prompt: '' }, error: 'INVALID_REQUEST' },
  { name: 'whitespace prompt', data: { ...valid, prompt: '   ' }, error: 'INVALID_REQUEST' },
  { name: 'non-string prompt', data: { ...valid, prompt: 123 }, error: 'INVALID_REQUEST' },
  {
    name: 'unsupported language',
    data: { ...valid, targetLanguage: 'xx' },
    error: 'INVALID_LANGUAGE',
  },
  { name: 'invalid UUID', data: { ...valid, contextId: 'not-a-uuid' }, error: 'INVALID_REQUEST' },
]) {
  test(`strict validation rejects ${name}`, async ({ request }) => {
    const response = await request.post('/api/prompts', { data });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error).toBe(error);
    expect(body.message).toEqual(expect.any(String));
    expect(body.details.length).toBeGreaterThan(0);
  });
}
