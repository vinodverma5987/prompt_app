import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { createStore } from '../app/store';
import { api } from '../services/api';
import { selectInsights } from '../features/insights/selectInsights';

const insight = (id, title) => ({
  id,
  title,
  content: `Description of ${title}`,
  metadata: { category: 'Research', tags: ['onboarding'] },
});
const firstPage = {
  status: 'SUCCESS',
  requestId: 'request-one',
  contextId: 'context-one',
  targetLanguage: 'en',
  insights: [insight('1', 'Zebra discovery'), insight('2', 'Alpha activation')],
  pagination: { page: 1, pageSize: 10, totalItems: 3, totalPages: 2, hasMore: true, nextPage: 2 },
};
const secondPage = {
  ...firstPage,
  insights: [insight('3', 'Beta testing')],
  pagination: { ...firstPage.pagination, page: 2, hasMore: false, nextPage: null },
};
let postBodies = [];
let pageRequests = [];
let stores = [];
const server = setupServer(
  http.post('/api/prompts', async ({ request }) => {
    postBodies.push(await request.json());
    return HttpResponse.json(firstPage);
  }),
  http.get('/api/requests/:id/insights', ({ request }) => {
    const page = new URL(request.url).searchParams.get('page');
    pageRequests.push(page);
    return HttpResponse.json(page === '2' ? secondPage : firstPage);
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  // Unsubscribe before clearing the cache: mounted hooks would otherwise refetch.
  cleanup();
  stores.forEach((store) => store.dispatch(api.util.resetApiState()));
  server.resetHandlers();
  postBodies = [];
  pageRequests = [];
  stores = [];
  vi.useRealTimers();
});
afterAll(() => server.close());
function setup() {
  const store = createStore();
  stores.push(store);
  const user = userEvent.setup();
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  return { user, store };
}
async function submit(user, prompt = 'Improve customer onboarding') {
  await user.type(screen.getByLabelText('Prompt', { exact: true }), prompt);
  await user.click(screen.getByRole('button', { name: /Generate insights/ }));
}

test('schema validation blocks empty input and saves the request and response globally', async () => {
  const { user, store } = setup();
  expect(screen.getByRole('button', { name: /Generate insights/ })).toBeDisabled();
  await user.type(screen.getByLabelText('Prompt', { exact: true }), '   ');
  expect(screen.getByRole('button', { name: /Generate insights/ })).toBeDisabled();
  await user.clear(screen.getByLabelText('Prompt', { exact: true }));
  await submit(user);
  expect(await screen.findByText('Zebra discovery')).toBeVisible();
  expect(store.getState().requests.entries[0].input.prompt).toBe('Improve customer onboarding');
  expect(store.getState().requests.entries[0].response.status).toBe('SUCCESS');
  expect(postBodies).toHaveLength(1);
});

test('load more appends cached pages without repeating POST and history reuses the cache', async () => {
  const { user } = setup();
  await submit(user);
  await screen.findByText('Zebra discovery');
  await user.click(screen.getByRole('button', { name: /Load more insights/ }));
  expect(await screen.findByText('Beta testing')).toBeVisible();
  expect(screen.getByText('Zebra discovery')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Load more insights/ })).not.toBeInTheDocument();
  const fetchedCount = pageRequests.length;
  await user.click(screen.getByRole('button', { name: 'New request' }));
  await user.click(
    within(screen.getByRole('navigation', { name: 'Recent requests' })).getByRole('button'),
  );
  expect(await screen.findByText('Beta testing')).toBeVisible();
  expect(pageRequests).toHaveLength(fetchedCount);
  expect(postBodies).toHaveLength(1);
  expect(pageRequests).toEqual(['2']);
});

test('clarification follows up with the original context ID', async () => {
  server.use(
    http.post('/api/prompts', async ({ request }) => {
      const body = await request.json();
      postBodies.push(body);
      return HttpResponse.json(
        body.contextId
          ? firstPage
          : {
              status: 'NEEDS_CLARIFICATION',
              requestId: 'clarify',
              contextId: 'same-context',
              message: 'Please provide more details',
            },
      );
    }),
  );
  const { user } = setup();
  await submit(user, 'hi');
  expect(await screen.findByText('Please provide more details')).toBeVisible();
  await user.clear(screen.getByLabelText('Prompt', { exact: true }));
  await user.type(screen.getByLabelText('Prompt', { exact: true }), 'Improve our onboarding flow');
  await user.click(screen.getByRole('button', { name: /Send more details/ }));
  expect(await screen.findByText('Zebra discovery')).toBeVisible();
  expect(postBodies[1].contextId).toBe('same-context');
});

test('structured 4xx errors remain visible and the prompt can be corrected', async () => {
  server.use(
    http.post('/api/prompts', () =>
      HttpResponse.json(
        {
          error: 'INVALID_LANGUAGE',
          message: 'Target language is not supported',
          details: [{ field: 'targetLanguage', message: 'Choose a supported language' }],
        },
        { status: 422 },
      ),
    ),
  );
  const { user } = setup();
  await submit(user);
  expect(await screen.findByRole('alert')).toHaveTextContent('Target language is not supported');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'targetLanguage: Choose a supported language',
  );
  expect(screen.getByLabelText('Prompt', { exact: true })).toHaveValue(
    'Improve customer onboarding',
  );
  expect(screen.getByRole('button', { name: /Generate insights/ })).toBeEnabled();
});

test('failed next page preserves previous insights and can be retried', async () => {
  let fail = true;
  server.use(
    http.get('/api/requests/:id/insights', ({ request }) => {
      if (new URL(request.url).searchParams.get('page') === '1')
        return HttpResponse.json(firstPage);
      if (fail) {
        fail = false;
        return HttpResponse.json({ error: 'TEMPORARY', message: 'Please retry' }, { status: 503 });
      }
      return HttpResponse.json(secondPage);
    }),
  );
  const { user } = setup();
  await submit(user);
  await screen.findByText('Zebra discovery');
  await user.click(screen.getByRole('button', { name: /Load more insights/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please retry');
  expect(screen.getByText('Zebra discovery')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Beta testing')).toBeVisible();
});

test('search is debounced and title sorting is applied to loaded insights', async () => {
  const { user } = setup();
  await submit(user);
  await screen.findByText('Zebra discovery');
  await user.selectOptions(screen.getByLabelText('Sort insights'), 'az');
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Alpha activation');
  await user.selectOptions(screen.getByLabelText('Sort insights'), 'za');
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Zebra discovery');
  vi.useFakeTimers();
  const { fireEvent } = await import('@testing-library/react');
  fireEvent.change(screen.getByLabelText('Search insights'), { target: { value: 'alpha' } });
  expect(screen.getByText('Zebra discovery')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(299));
  expect(screen.getByText('Zebra discovery')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Zebra discovery')).not.toBeInTheDocument();
  expect(screen.getByText('Alpha activation')).toBeInTheDocument();
  vi.useRealTimers();
});

test('search includes nested metadata and sorting never mutates cached input', () => {
  const original = Object.freeze([insight('1', 'Zebra'), insight('2', 'Alpha')]);
  expect(selectInsights(original, 'onboarding', 'az').map((item) => item.title)).toEqual([
    'Alpha',
    'Zebra',
  ]);
  expect(selectInsights(original, 'missing', 'original')).toEqual([]);
  expect(original[0].title).toBe('Zebra');
});

test('network failures show actionable feedback', async () => {
  server.use(http.post('/api/prompts', () => HttpResponse.error()));
  const { user } = setup();
  await submit(user);
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the service'),
  );
});
