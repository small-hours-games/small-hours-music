# Test Coverage Analysis

## Current State

**Coverage: 0%** — The codebase has zero tests, no test framework, no test scripts, and no CI/CD pipeline.

| File | Lines | Functions | Coverage | Risk |
|------|-------|-----------|----------|------|
| `suno.js` | 266 | 10 exported/internal | 0% | **High** |
| `server.js` | 89 | 3 routes + 1 helper | 0% | **High** |
| `fetch-lyrics.js` | 65 | 2 | 0% | Medium |
| `bulk-import.js` | 99 | 1 | 0% | Medium |
| `public/index.html` (inline JS) | ~245 | ~12 | 0% | Medium |

---

## Recommended Test Infrastructure

**Framework:** [Vitest](https://vitest.dev/) — fast, zero-config, built-in coverage, great Node.js support.

```jsonc
// package.json additions
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
},
"devDependencies": {
  "vitest": "^3.x",
  "supertest": "^7.x"
}
```

Suggested file structure:
```
test/
  suno.test.js          # Unit tests for suno.js
  server.test.js        # API endpoint tests
  fetch-lyrics.test.js  # fetch-lyrics.js tests
```

---

## Priority 1 — Pure Logic in `suno.js` (High Value, Low Effort)

These functions have no side effects and are the backbone of the import pipeline. Bugs here silently break all imports.

### 1a. `parseSongId(input)` — suno.js:63-74

Parses three input formats (raw UUID, song URL, share URL). Already exported.

| Input | Expected Output |
|-------|-----------------|
| `"7bc3fe4e-4850-4730-bc28-cb049f6d7b66"` | `"7bc3fe4e-4850-4730-bc28-cb049f6d7b66"` |
| `"https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66"` | `"7bc3fe4e-..."` |
| `"https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66?extra=1"` | `"7bc3fe4e-..."` |
| `"  7bc3fe4e-4850-4730-bc28-cb049f6d7b66  "` (whitespace) | `"7bc3fe4e-..."` |
| `"7BC3FE4E-4850-4730-BC28-CB049F6D7B66"` (uppercase) | returns UUID |
| `"https://suno.com/s/wiZGYuKCdZhYOJcG"` (share URL) | `null` |
| `"not-a-url"` | `null` |
| `""` | `null` |

### 1b. Duration formatting (duplicated in 2 places — refactor candidate)

The seconds-to-`"M:SS"` conversion appears in both `fetchFromApi` (suno.js:117-121) and `fetchPageMeta` (suno.js:158-163), and again in `fetch-lyrics.js:48-49`. **Recommend extracting** a `formatDuration(seconds)` helper, then testing:

| Input | Expected |
|-------|----------|
| `0` | `"0:00"` |
| `61` | `"1:01"` |
| `189.7` | `"3:09"` |
| `3600` | `"60:00"` |
| `NaN` | `"0:00"` or handled |

### 1c. Tag parsing (duplicated in 2 places — refactor candidate)

`song.tags.split(/[,\n]+/).map(t => t.trim()).filter(Boolean)` appears in both `fetchFromApi` (suno.js:126) and `fetch-lyrics.js:46`. Extract a `parseTags(tagString)` helper.

| Input | Expected |
|-------|----------|
| `"Rock, Pop, Indie"` | `["Rock", "Pop", "Indie"]` |
| `"Rock\nPop\nIndie"` | `["Rock", "Pop", "Indie"]` |
| `"Rock,,Pop,,"` | `["Rock", "Pop"]` |
| `""` | `[]` |

---

## Priority 2 — API Endpoints in `server.js` (High Value, Medium Effort)

Use `supertest` against the Express `app` (export it separately from `server.listen`).

### 2a. `GET /api/tracks` — server.js:45-56

- Returns `[]` when `data/tracks.json` doesn't exist
- Returns parsed array when file is valid JSON
- Returns `500` when file contains malformed JSON

### 2b. `GET /api/tracks/:id/lyrics` — server.js:59-62

- Returns lyrics content when lyrics file exists for given ID
- Returns empty string `""` when lyrics file is missing
- **SECURITY**: Rejects path traversal attempts (e.g., `../../etc/passwd`) — see Security section

### 2c. `POST /api/import` — server.js:65-76

- Returns `400` when `url` field is missing from body
- Returns `{ ok: true, skipped: true }` for already-imported songs (mock `importSong` returning `null`)
- Returns `{ ok: true, track: {...} }` on successful import (mock `importSong`)
- Returns `500` with error message when `importSong` throws

**Note:** To test the Express app with `supertest`, the `app` object needs to be exported separately from the `server.listen()` call. This requires a small refactor: move `app` creation to a separate export, and only call `listen()` when `require.main === module`.

---

## Priority 3 — File I/O Functions in `suno.js` (Medium Value, Low Effort)

Use a temporary directory (`fs.mkdtempSync`) so tests don't touch real data.

### 3a. `loadTracks()` / `saveTracks(tracks)` — suno.js:18-25

- `loadTracks()` returns `[]` when file doesn't exist
- `saveTracks([...])` followed by `loadTracks()` round-trips correctly
- **Bug to test:** `loadTracks()` on corrupted JSON currently throws unhandled — should this return `[]` or throw?

### 3b. `saveLyrics(songId, lyrics)` / `loadLyrics(songId)` — suno.js:169-180

- Round-trip: save then load returns identical text
- `loadLyrics()` returns `""` for non-existent song ID
- `saveLyrics()` with empty/null lyrics is a no-op (per the guard on line 170)

---

## Priority 4 — Network Functions (Medium Value, Requires Mocking)

Mock `fetch` and `https.get` to avoid real network calls.

### 4a. `fetchFromApi(songId)` — suno.js:99-141

- Returns `null` when `SUNO_API_URL` env var is unset
- Returns structured `{ title, tags, duration, imageUrl, lyrics, prompt }` on 200 response
- Returns `null` on non-200 response
- Returns `null` on network error (graceful fallback to scraping)
- Sends `Authorization` header when `SUNO_API_KEY` is set

### 4b. `resolveShareUrl(url)` — suno.js:77-95

- Follows 3xx redirect and extracts song ID from `Location` header
- Handles relative redirects (prefixes protocol/host)
- Rejects when no redirect leads to a song ID

### 4c. `fetchPageMeta(songId)` — suno.js:145-166

- Extracts `og:title` from HTML
- Extracts `og:image` from HTML
- Parses `/style/` links into tags array
- Falls back to `"Untitled"` / empty values when metadata is missing

### 4d. `downloadFile(url, destPath)` — suno.js:28-57

- Follows redirect chains
- Rejects on non-200 status codes
- Cleans up partial files on error
- Handles both HTTP and HTTPS URLs

---

## Priority 5 — Integration Tests (Higher Effort)

### 5a. `importSong(input)` — suno.js:183-248

Full pipeline test with mocked network:
- Resolves ID → fetches metadata → downloads audio/image → saves track → returns track object
- Returns `null` for already-imported songs
- Handles fallback from API to page scraping

### 5b. `bulk-import.js` and `fetch-lyrics.js`

- Script-level tests: verify counters (imported/skipped/failed) are correct
- Verify that individual failures don't halt the loop

---

## Priority 6 — Frontend JavaScript (Lower Priority)

The ~245 lines of inline JS in `public/index.html` would need to be extracted to `public/app.js` before testing. Key functions:

| Function | What to test |
|----------|-------------|
| `formatTime(s)` | `0` → `"0:00"`, `NaN` → `"0:00"`, `125` → `"2:05"` |
| `renderTracks()` | Generates correct DOM elements for track list |
| `playTrack(index)` | Sets `audio.src`, updates player UI |
| `doImport()` | Sends correct POST, handles success/error/skip |
| prev/next buttons | Wraps around at boundaries |

---

## Security Gaps Worth Testing

These should be high priority despite being listed separately — they represent real vulnerabilities.

### S1. Path Traversal in Lyrics Endpoint (Critical)

`GET /api/tracks/:id/lyrics` passes `req.params.id` directly into `loadLyrics()` which builds a file path:
```js
const lyricsPath = path.join(LYRICS_DIR, `${songId}.txt`);
```

An attacker could request `/api/tracks/..%2F..%2F..%2Fetc%2Fpasswd/lyrics` to read arbitrary files. **Fix:** validate that `songId` matches the UUID format before constructing the path.

### S2. XSS via Track Metadata (Medium)

In `index.html`, track titles and tags are injected via `innerHTML` without escaping:
```js
el.innerHTML = `<div class="track-title">${t.title || 'Untitled'}</div>`;
```

A malicious track title like `<img onerror=alert(1) src=x>` would execute JavaScript. **Fix:** use `textContent` or escape HTML entities.

### S3. Import URL Validation (Low)

`POST /api/import` accepts any string as the URL. While `parseSongId` + `resolveShareUrl` limit what can be processed, there's no explicit validation that the input is a Suno URL. Consider rejecting non-Suno domains upfront.

---

## Summary

| Priority | Area | Effort | Impact | Files |
|----------|------|--------|--------|-------|
| **P1** | `parseSongId` + extract helpers | Low | High | `test/suno.test.js` |
| **P2** | API endpoint tests | Medium | High | `test/server.test.js` |
| **P3** | File I/O round-trips | Low | Medium | `test/suno.test.js` |
| **P4** | Network functions (mocked) | Medium | Medium | `test/suno.test.js` |
| **P5** | Integration / orchestration | High | Medium | `test/integration.test.js` |
| **P6** | Frontend JS (after extraction) | High | Low | `test/frontend.test.js` |
| **S1-S3** | Security tests | **Low** | **Critical** | `test/security.test.js` |

### Recommended First Steps

1. `npm install --save-dev vitest supertest`
2. Add test scripts to `package.json`
3. Refactor `server.js` to export `app` separately from `server.listen()`
4. Extract `formatDuration()` and `parseTags()` helpers from duplicated code in `suno.js`
5. Write P1 tests for `parseSongId`, `formatDuration`, `parseTags` — highest value for lowest effort
6. Write S1 path traversal test + fix — immediate security value
7. Write P2 API endpoint tests with supertest
