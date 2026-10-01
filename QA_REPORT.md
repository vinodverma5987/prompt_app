# Verification report — 1 October 2026

Result: No blocking functional defects found in the tested desktop React and FastAPI flows.

## Live Chrome UI checks

Tested the React app at http://127.0.0.1:5173 against the running Python API, using actual browser interactions.

| Scenario | Observed result | Status |
| --- | --- | --- |
| Initial layout | Composer, result panel, language selector and history render correctly | Pass |
| Empty prompt | Generate insights is disabled | Pass |
| Whitespace-only prompt | Submission stays disabled; field error appears on blur | Pass |
| 4,001-character prompt | Length error appears and submission stays disabled | Pass |
| Short prompt `hi` | Clarification message appears; request history shows Needs details | Pass |
| Clarification follow-up | Example prompt produces a successful response | Pass |
| Successful request | First 10 of 12 insights render with category and content | Pass |
| Load more | Last 2 insights append; 12/12 and end-of-results state appear | Pass |
| Metadata search `Research` | Only Learn from customer conversations remains | Pass |
| Clear search | All 12 loaded insights return | Pass |
| Title A–Z | Bring help into the workflow appears first | Pass |
| Title Z–A | Test one onboarding change at a time appears first | Pass |
| New request | Composer and response reset; history remains | Pass |
| Reopen history | Original prompt, language and all 12 loaded insights return | Pass |
| Spanish response | ES status, Spanish titles, content and categories render | Pass |
| API docs link | FastAPI Swagger UI loads through the frontend proxy | Pass |
| Swagger invalid language | Actual POST with targetLanguage xx returns HTTP 422, INVALID_LANGUAGE and field details | Pass |

## Automated verification

- React component integration tests: **8 passed**, using MSW HTTP mocks. Covers global request/response state, empty input, page caching without refetching page 1, history cache reuse, clarification context, structured errors, next-page retries, debounced search, sorting and network failures.
- FastAPI tests: **34 passed**. Covers strict input validation, clarification before provider calls, context continuation, snapshot pagination, boundary result counts, supported languages, malformed JSON, safe failures and persistence across application restarts.
- Live HTTP smoke test through the Vite proxy: **passed** for health, clarification, follow-up context, French localization, pagination and unsupported-language validation.
- ESLint, Ruff, and production Vite build: **passed**.

Non-blocking dependency warnings occurred: Node experimental localStorage, Starlette TestClient/httpx deprecation, and Rollup stripping dependency comment annotations. These did not fail tests or the build.

## Scope and expected behavior

- This is a deterministic demo: sufficiently detailed prompts return the same 12 customer-onboarding fixtures in the chosen language. No LLM is called.
- Search and sorting apply only to loaded pages; this scope is labeled in the UI.
- Visible history is session memory and clears on reload. SQLite persists backend snapshots.
- The 300 ms debounce timing and error/retry UI are covered by automated component tests; no outage was induced in the live service.
- Mobile layouts, other browsers, Docker, load testing and a formal accessibility audit were not verified in this pass.

The React tab is left open with a successful English request and all 12 insights loaded.

## Playwright verification — 1 October 2026

The previously manual flows now have repeatable Playwright coverage. Executed `npm run test:e2e` against dedicated React/FastAPI servers with a temporary SQLite database.

**Result: 24 passed in 10.3 seconds; 0 failures, 0 retries.**

| Project | Tests | Result |
| --- | ---: | --- |
| Desktop Chromium | 15 | Passed |
| Mobile Chromium (Pixel 7 emulation) | 1 | Passed |
| Real API through the Vite proxy | 8 | Passed |

Desktop coverage includes empty/whitespace/oversized validation, examples, clarification context, pagination, cache reuse, metadata search, empty results, exact debounce timing, both sort directions, three translated response languages, loading controls, actual FastAPI 422 rendering, network recovery, page retry and API docs. The mobile flow additionally verifies no horizontal document overflow.

The error tests distinguish real responses from injected failures: the language error comes from FastAPI after changing one outgoing payload; network failure and transient 503 responses are injected only for those cases. Success and retries use the real backend. Tests use semantic locators and response assertions, not fixed sleep delays.

Report: `frontend/playwright-report/index.html` (open with `npm run test:e2e:report`). Sources and run instructions are in the README's Playwright section. Browser traces, screenshots and videos are retained only when a test fails.

This extends the earlier desktop-only verification with mobile viewport automation; other browser engines, physical devices, Docker and load testing remain outside this pass.
