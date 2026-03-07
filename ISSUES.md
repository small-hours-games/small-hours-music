# Open Issues — Test Coverage Improvements

These issues track remaining test coverage work that was identified but not implemented in the initial test setup.

---

## Issue 1: Add tests for network functions with mocked HTTP

**Priority:** P4 — Medium value, medium effort

The network functions in `suno.js` make real HTTP requests and need mocked `fetch`/`https.get` to test.

### Functions to test

**`fetchFromApi(songId)`**
- Returns `null` when `SUNO_API_URL` env var is unset
- Returns structured metadata on 200 response
- Returns `null` on non-200 response
- Returns `null` on network error (graceful fallback)
- Sends `Authorization` header when `SUNO_API_KEY` is set

**`resolveShareUrl(url)`**
- Follows 3xx redirect and extracts song ID from `Location` header
- Handles relative redirects
- Rejects when no redirect leads to a song ID

**`fetchPageMeta(songId)`**
- Extracts `og:title` and `og:image` from HTML
- Parses `/style/` links into tags array
- Falls back to defaults on missing metadata

**`downloadFile(url, destPath)`**
- Follows redirect chains
- Rejects on non-200 status codes
- Cleans up partial files on error

### Approach
Mock `fetch` globally with `vi.spyOn(globalThis, 'fetch')` and mock `https.get` per test.

---

## Issue 2: Add integration tests for importSong pipeline

**Priority:** P5 — Medium value, high effort

### Description

`importSong(input)` in `suno.js` orchestrates the full import pipeline: resolve ID, fetch metadata, download audio/image, save lyrics, update tracks.json. An integration test (with mocked network) would verify the entire flow.

### Test cases
- Full import: resolves ID → fetches metadata → downloads audio/image → saves track
- Returns `null` for already-imported songs
- Falls back from API to page scraping when API is unavailable
- Correctly builds the track object with all fields

### Also covers
- `bulk-import.js` — counts imported/skipped/failed correctly, continues past failures
- `fetch-lyrics.js` — skips existing lyrics, updates track metadata

---

## Issue 3: Extract and test frontend JavaScript

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

## Issue 4: Add import URL validation

**Priority:** Low — Security hardening

### Description

`POST /api/import` accepts any string as the URL. While `parseSongId` and `resolveShareUrl` limit what gets processed, there's no explicit validation that the input is a Suno URL. Consider rejecting non-Suno domains upfront to prevent SSRF-like concerns.

### Suggested fix
Add validation in the `/api/import` handler:
```js
const SUNO_URL_RE = /^https?:\/\/(www\.)?suno\.com\//i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!SUNO_URL_RE.test(url) && !UUID_RE.test(url.trim())) {
  return res.status(400).json({ error: 'Invalid Suno URL or song ID' });
}
```

---

## Issue 5: Add CI/CD pipeline with automated testing

**Priority:** Medium — Infrastructure

### Description

Set up a GitHub Actions workflow to run tests on push/PR. Suggested config:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm test
```

Also consider adding coverage reporting with `vitest --coverage` and a coverage threshold.

---

## Issue 6: Handle corrupted tracks.json in loadTracks()

**Priority:** Low — Bug fix

### Description

`loadTracks()` in `suno.js:18-20` does `JSON.parse(fs.readFileSync(...))` without a try/catch. If `tracks.json` is corrupted, the entire application crashes. The server's `/api/tracks` endpoint handles this gracefully, but direct callers of `loadTracks()` (like `importSong`, `bulk-import.js`, `fetch-lyrics.js`) will crash.

### Suggested fix
Wrap in try/catch and either return `[]` or log a warning and return `[]`.
