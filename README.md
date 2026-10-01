# Prompt Studio

A React (JavaScript) client and Python FastAPI middleware for submitting prompts, handling clarification, and exploring paginated insights. The application uses local, translated JSON fixtures and SQLite; it does not call an LLM or require API keys.

## Run locally

Prerequisites: Node.js 22.12+ (or 24/26), Python 3.12+, and npm.

Install once from the repository root:

```sh
npm ci --prefix frontend
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Start the API in one terminal:

```sh
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start React in a second terminal, from the repository root:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Interactive API documentation is at **http://127.0.0.1:8000/docs** (also proxied through the frontend). Vite proxies API calls to Python, so the development and production clients use the same-origin API without permissive CORS.

### Single-server build

```sh
npm run build
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Build before starting Python. FastAPI serves the built React app at **http://127.0.0.1:8000** when `frontend/dist` exists. Alternatively, `docker compose up --build` builds both parts and exposes port 8000, with SQLite in a named volume. The container configuration is provided for convenience; see validation notes below.

## Try the flows

- Submit `How can we improve onboarding for new customers?` to receive 12 insights. The first response has 10; **Load more insights** fetches the remaining 2.
- Submit `hi` or `help me` for clarification. Add details and resubmit to keep the same `contextId`.
- Select English, Spanish, French, or German to receive translated fixtures.
- Search insight titles, content, category, tags, source, or language. Search waits 300 ms after typing. Sort by title in either direction.
- Search and sort operate on **loaded results**, explicitly labeled in the UI. Load all pages to search the entire result set.
- Select a recent request to restore its submitted prompt and cached pages. **New request** starts a separate conversation.
- Empty/whitespace prompts and overlong prompts disable submission. Short, nonempty prompts are valid requests so the server can return clarification.

A direct validation example:

```sh
curl -i http://127.0.0.1:8000/api/prompts \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Improve customer onboarding","targetLanguage":"xx"}'
```

This returns HTTP 422 with an `INVALID_LANGUAGE` error. Invalid requests never call the provider.

## Architecture

```text
frontend/src/
  app/store.js                 Redux store configuration
  services/api.js              RTK Query mutation, infinite query, error normalization
  features/requests/           Zod schema, request history slice, composer and history UI
  features/insights/           Results orchestration, memoized cards, pure search/sort
  components/Notice.jsx        Shared structured status/error UI
  hooks/useDebouncedValue.js   Timer lifecycle and cleanup
  test/                       HTTP-mocked component integration tests
backend/app/
  main.py                      App factory, HTTP routes, dependency composition
  schemas.py                   Strict request and documented response contracts
  errors.py                    Consistent domain, validation, HTTP, and 500 responses
  service.py                   Clarification policy and replaceable provider interface
  repository.py                SQLite transactions and paginated reads
  data/insights.json            Local fixtures in four languages
backend/tests/                 API, provider-gate, pagination and persistence tests
```

### State ownership and performance

- **RTK Query** owns remote pages, fetching/error state, request deduplication, and a five-minute unused cache. An infinite query is keyed by immutable `requestId`. The POST response seeds page 1; subsequent GETs append to that cache. Failed page requests preserve previously fetched pages. Returning to history reuses the same cache while available.
- **The request slice** keeps the last 30 submitted inputs and their first response or structured error. Endpoint lifecycle matchers capture pending, success, clarification and failure consistently; late results update their own request entry without changing selection.
- **Component state** owns editable drafts, search, and sort. Typing in the composer does not rerender the results or history. Debouncing has cleanup; `useMemo` handles page flattening and filtered/sorted results; `React.memo` keeps unchanged insight cards from rerendering.
- Sorting copies the array and uses `Intl.Collator` for the response language. Cached data is never mutated. Stable insight IDs are React keys.
- Pagination belongs to the backend: SQLite queries use indexed `(request_id, position)` ordering with `LIMIT/OFFSET`. A request snapshots generated insights exactly once, so paging never calls the provider again. The demo is small and bounded; a large production feed would benefit from cursor pagination, list virtualization and server-side search.

### Conversation and persistence semantics

`contextId` groups related requests. Both clarification and success return it. Follow-ups create a new immutable request within that context. Unknown contexts return a structured 404. The local provider intentionally does not infer answers or conversational context: it returns a fixed customer-onboarding dataset in the requested language for every sufficiently detailed prompt. This is disclosed in the UI.

SQLite stores prompts, conversations and result snapshots across API restarts. The UI history and RTK Query cache are session memory; refreshing the page clears the visible history. No prompt is written to browser local storage. `DATABASE_PATH` configures the SQLite file (default `data/prompt-studio.sqlite3`, relative to the API working directory). `FRONTEND_DIST` optionally overrides the static build directory.

The clarification heuristic runs before the provider: trimmed prompts under five characters, fewer than two word tokens, and a small explicit set of vague phrases require details. It is a transparent demonstration rule, not a semantic language model. Production language-aware intent handling can replace this policy without changing routes or UI contracts.

## API contract

### `POST /api/prompts`

```json
{
  "prompt": "Improve customer onboarding",
  "targetLanguage": "en",
  "contextId": "optional existing UUID"
}
```

Omit `contextId` for a new conversation. `prompt` is a strict string, trimmed, 1–4,000 characters. Supported language codes are exactly `en`, `es`, `fr`, `de`. Unexpected fields, non-string prompts, and malformed UUIDs are rejected.

Success (HTTP 200):

```json
{
  "status": "SUCCESS",
  "requestId": "<uuid>",
  "contextId": "<uuid>",
  "targetLanguage": "en",
  "insights": [{"id":"insight-01","title":"...","content":"...","metadata":{"category":"Activation","tags":["onboarding"],"source":"Local demo dataset","language":"en"}}],
  "pagination": {"page":1,"pageSize":10,"totalItems":12,"totalPages":2,"hasMore":true,"nextPage":2}
}
```

Clarification (HTTP 200):

```json
{
  "status": "NEEDS_CLARIFICATION",
  "requestId": "<uuid>",
  "contextId": "<uuid>",
  "message": "Please add a topic and what you want to learn or improve. ..."
}
```

Structured error (HTTP 422, with similar envelopes for 404/409/500):

```json
{
  "error": "INVALID_LANGUAGE",
  "message": "Target language must be en, es, fr, or de.",
  "details": [{"field":"targetLanguage","message":"..."}]
}
```

### `GET /api/requests/{requestId}/insights?page=2`

Returns the same success shape for the requested snapshot page. Page size is fixed at 10. Unknown requests and out-of-range pages return 404; malformed page numbers return 422; clarification-only requests return 409. Empty result sets have a valid empty page 1 and no next page.

### `GET /api/health`

Returns `{"status":"ok","provider":"local-fixture"}`.

## Verification

From the repository root:

```sh
npm test
npm run lint
npm run build
cd backend
.venv/bin/python -m pytest -q
.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
```

Tests cover validation and provider-call ordering; malformed JSON and safe errors; localization; conversation continuation; immutable pagination and boundary counts; database persistence; RTK Query page caching; retry without losing prior results; structured and network errors; global request/response state; debounced search and immutable sorting.

This is an assessment/local application. Authentication, multi-user ownership, request quotas, automatic data retention and model integration are outside the requested scope. Docker configuration is included but should be verified on a machine with Docker available before deployment.

Reference documentation: [RTK Query infinite queries](https://redux-toolkit.js.org/rtk-query/usage/infinite-queries), [FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/).

## Playwright end-to-end tests

The Playwright suite runs real browser interactions against React and FastAPI. It starts its own frontend on port **5174** and API on **8001**, using a fresh temporary SQLite database. Your development servers on 5173/8000 and normal database are not reused. Both test servers stop when the run finishes; graceful API shutdown removes the temporary database. The two test ports must be free.

After installing the frontend and Python dependencies as described above, install the test browser once:

```sh
cd frontend
npx playwright install chromium
cd ..
```

Run from the repository root:

```sh
npm run test:e2e
```

Useful commands:

```sh
# Desktop Chromium only
npm run test:e2e -- --project=chromium

# Mobile viewport only
npm run test:e2e -- --project=mobile-chromium

# Direct HTTP API checks through the frontend proxy
npm run test:e2e -- --project=api

# Watch the browser or use Playwright's interactive runner
npm run test:e2e:headed
npm run test:e2e:ui

# View the report from the last run
npm run test:e2e:report
```

The configuration expects the Python virtual environment at `backend/.venv`. On Linux CI, install browser system dependencies with `npx playwright install --with-deps chromium` from `frontend` before running tests.

Test files:

- `frontend/e2e/workspace.spec.js`: input validation and character limit, example prompts, clarification context, pagination/cache reuse, metadata search and empty results, exact debounce timing, title sorting, Spanish/French/German responses, pending controls, structured errors, network recovery, page retry and API docs.
- `frontend/e2e/mobile.spec.js`: the primary journey, history restoration and horizontal-overflow check with a Pixel 7 viewport in Chromium. This is viewport/device emulation, not a physical-device test.
- `frontend/e2e/api.spec.js`: real HTTP health, pagination, clarification and strict validation checks.
- `frontend/e2e/helpers.js`: shared semantic locators, response synchronization and uncaught-browser-error assertions.
- `frontend/playwright.config.js` and `backend/e2e_server.py`: browser projects, isolated servers and disposable database lifecycle.

Successful journeys use real backend responses. The loading test holds an outgoing request before allowing it through. The 422 UI test modifies one outgoing language value and renders FastAPI's actual validation response. Only network failure and transient page-error tests inject failures; subsequent retries reach the real backend. Search debounce uses Playwright's clock, with no arbitrary sleeps.

HTML reports are saved to `frontend/playwright-report/`. Failure screenshots, videos and traces are saved to `frontend/test-results/`. These generated files are ignored by Git, ESLint and Prettier; Vitest is restricted to `src/**/*.test.{js,jsx}` so it does not collect Playwright specs.

Playwright references: [multiple web servers](https://playwright.dev/docs/test-webserver), [clock control](https://playwright.dev/docs/clock).
