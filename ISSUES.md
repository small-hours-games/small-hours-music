# Open Issues — Test Coverage Improvements

Only one remaining issue not yet implemented.

---

## Issue: Extract and test frontend JavaScript

**Priority:** P6 — Lower value, high effort

### Description

The ~245 lines of JavaScript in `public/index.html` are embedded inline, making them untestable. Extract to `public/app.js` and test with Vitest's jsdom environment.

### Functions to test
- `formatTime(s)` — time display formatting
- `renderTracks()` — generates correct DOM structure
- `playTrack(index)` — sets audio source, updates UI
- `doImport()` — sends correct API request, handles responses
- prev/next navigation — wraps around at boundaries

### Steps
1. Extract `<script>` content from `index.html` to `public/app.js`
2. Add `<script src="/app.js"></script>` to `index.html`
3. Refactor to make functions testable (avoid relying on global DOM queries at module load)
4. Add vitest environment config: `// @vitest-environment jsdom`
5. Write tests

---

## Resolved Issues

The following issues from the original analysis have been implemented:

- **Issue 1: Network function tests** — `test/network.test.js` covers `fetchFromApi`, `fetchPageMeta`, `downloadFile`, and `resolveShareUrl`
- **Issue 2: Integration tests** — `importSong` end-to-end with mocked network (API path and scraping fallback)
- **Issue 4: Import URL validation** — `POST /api/import` now rejects non-Suno URLs
- **Issue 5: CI/CD pipeline** — GitHub Actions workflow at `.github/workflows/test.yml`
- **Issue 6: loadTracks() error handling** — Now returns `[]` on corrupted JSON instead of crashing
