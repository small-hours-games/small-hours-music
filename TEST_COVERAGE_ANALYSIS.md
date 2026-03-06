# Test Coverage Analysis

## Current State

**Coverage: 0%** — The codebase has no tests, no test framework, no test scripts, and no CI/CD pipeline.

| File | Lines | Coverage | Risk Level |
|------|-------|----------|------------|
| `suno.js` | 266 | 0% | **High** |
| `server.js` | 89 | 0% | **High** |
| `fetch-lyrics.js` | 65 | 0% | Medium |
| `bulk-import.js` | 99 | 0% | Medium |
| `public/index.html` (JS) | ~245 | 0% | Medium |

---

## Recommended Test Infrastructure

**Framework:** [Vitest](https://vitest.dev/) — fast, zero-config, native ESM & CJS support, built-in coverage via `c8`/`istanbul`.

```jsonc
// Additions to package.json
"devDependencies": {
  "vitest": "^3.x",
  "supertest": "^7.x"   // for HTTP endpoint testing
}
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## Priority 1 — Pure Logic in `suno.js` (High Value, Easy to Test)

These are pure/near-pure functions with no network or filesystem side-effects. They should be tested first because they are the backbone of the import pipeline and are trivial to unit test.

### `parseSongId(input)` — lines 63-74

Parses three distinct input formats. Any regression here silently breaks all imports.

**Suggested test cases:**
- Raw UUID: `"7bc3fe4e-4850-4730-bc28-cb049f6d7b66"` → returns UUID
- Direct song URL: `"https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66"` → returns UUID
- Share URL: `"https://suno.com/s/wiZGYuKCdZhYOJcG"` → returns `null` (deferred to resolveShareUrl)
- Whitespace padding: `"  7bc3fe4e-4850-4730-bc28-cb049f6d7b66  "` → returns UUID
- Invalid input: `"not-a-url"` → returns `null`
- Case insensitivity: uppercase UUID should still match
- URL with trailing slash or query params

### Duration formatting (inside `fetchFromApi` lines 117-121, `fetchPageMeta` lines 158-163)

The duration-seconds-to-`"M:SS"` conversion is duplicated in two places and has no dedicated function. This is a refactoring opportunity: extract a `formatDuration(seconds)` helper and test it.

**Suggested test cases:**
- `0` → `"0:00"`
- `61` → `"1:01"`
- `189.7` → `"3:09"`
- `3600` → `"60:00"`

### Tag parsing (inside `fetchFromApi` line 126)

`song.tags.split(/[,\n]+/).map(t => t.trim()).filter(Boolean)` — also duplicated in `fetch-lyrics.js:46`. Worth extracting and testing.

**Suggested test cases:**
- `"Rock, Pop, Indie"` → `["Rock", "Pop", "Indie"]`
- `"Rock\nPop\nIndie"` → `["Rock", "Pop", "Indie"]`
- `"Rock,,Pop,,"` → `["Rock", "Pop"]`
- `""` → `[]`

---

## Priority 2 — API Endpoints in `server.js` (High Value, Moderate Effort)

Use `supertest` to test the Express app without starting a real server.

### `GET /api/tracks` — lines 45-56

**Suggested test cases:**
- Returns `[]` when `tracks.json` doesn't exist
- Returns parsed JSON array when `tracks.json` is valid
- Returns `500` when `tracks.json` contains malformed JSON

### `GET /api/tracks/:id/lyrics` — lines 59-62

**Suggested test cases:**
- Returns lyrics text when lyrics file exists
- Returns empty string when lyrics file doesn't exist
- Handles special characters in song ID (path traversal prevention — **security concern**)

### `POST /api/import` — lines 65-76

**Suggested test cases:**
- Returns `400` when `url` body field is missing
- Returns `{ ok: true, skipped: true }` for already-imported song
- Returns `{ ok: true, track }` on successful import (mock `importSong`)
- Returns `500` with error message when `importSong` throws

---

## Priority 3 — File I/O Functions in `suno.js` (Medium Value)

### `loadTracks()` / `saveTracks(tracks)` — lines 18-25

**Suggested test cases (use a temp directory):**
- `loadTracks()` returns `[]` when file doesn't exist
- `saveTracks([...])` writes valid JSON; `loadTracks()` round-trips correctly
- `loadTracks()` throws on corrupted JSON (currently unhandled — potential bug)

### `saveLyrics(songId, lyrics)` / `loadLyrics(songId)` — lines 169-180

**Suggested test cases:**
- Round-trip: save then load returns same content
- `loadLyrics()` returns `""` for non-existent song
- `saveLyrics()` with empty/null lyrics is a no-op

---

## Priority 4 — Network Functions (Medium Value, Requires Mocking)

These functions make real HTTP requests. Test with mocked `fetch`/`https.get`.

### `resolveShareUrl(url)` — lines 77-95
- Follows 3xx redirects and extracts song ID from final location
- Returns error when redirect doesn't resolve to a song ID
- Handles relative redirects

### `fetchFromApi(songId)` — lines 99-141
- Returns structured metadata on success
- Returns `null` when `SUNO_API_URL` is unset
- Returns `null` on non-200 response
- Returns `null` on network error (graceful fallback)

### `fetchPageMeta(songId)` — lines 145-166
- Extracts title from `og:title` meta tag
- Extracts image from `og:image` meta tag
- Extracts tags from `/style/` links
- Falls back to defaults on missing metadata

### `downloadFile(url, destPath)` — lines 28-57
- Follows redirects
- Rejects on non-200 status
- Cleans up partial file on error

---

## Priority 5 — Integration / Orchestration (Lower Priority)

### `importSong(input)` — lines 183-248
End-to-end integration test (with mocked network):
- Full import pipeline: resolves ID → fetches metadata → downloads audio/image → saves track
- Skips already-imported songs
- Correctly builds the track object

### `bulk-import.js` — `main()`
- Counts imported/skipped/failed correctly
- Continues past individual failures

### `fetch-lyrics.js` — `main()`
- Skips songs with existing lyrics files
- Updates track metadata (hasLyrics, prompt, tags, duration)

---

## Priority 6 — Frontend JavaScript (Lower Priority)

The ~245 lines of JS in `public/index.html` are embedded inline, making them hard to test directly. Recommended approach:

1. **Extract** the JS into `public/app.js`
2. **Test** with a DOM testing library (e.g., `jsdom` via Vitest)

### Key functions to test:
- `formatTime(s)` — time formatting (`0` → `"0:00"`, `NaN` → `"0:00"`, `125` → `"2:05"`)
- `renderTracks()` — generates correct DOM structure for track list
- `playTrack(index)` — sets audio source, updates UI state
- `doImport()` — sends correct API request, handles success/error/skip responses
- Navigation: prev/next wrap-around behavior

---

## Security Gaps Worth Testing

1. **Path traversal in lyrics endpoint**: `GET /api/tracks/:id/lyrics` passes `req.params.id` directly to `loadLyrics()` which constructs a file path. A malicious ID like `../../etc/passwd` could read arbitrary files. Add a test to verify this is rejected.

2. **XSS in track rendering**: Track titles and tags are inserted via `innerHTML` without escaping. A malicious title like `<img onerror=alert(1) src=x>` would execute. Add a test to verify HTML entities are escaped.

3. **Import URL validation**: `POST /api/import` accepts any URL string. There's no validation that it's actually a Suno URL. Add a test that non-Suno URLs are rejected or handled safely.

---

## Summary of Recommendations

| Priority | Area | Effort | Impact |
|----------|------|--------|--------|
| **P1** | `parseSongId` + extracted helpers | Low | High — prevents silent import failures |
| **P2** | API endpoint tests with supertest | Medium | High — catches regressions in the web interface |
| **P3** | File I/O round-trip tests | Low | Medium — ensures data persistence works |
| **P4** | Network functions with mocking | Medium | Medium — validates external API integration |
| **P5** | Integration tests for import pipeline | High | Medium — end-to-end confidence |
| **P6** | Frontend JS (after extraction) | High | Low — UI logic is straightforward |
| **Security** | Path traversal, XSS, input validation | Low | **Critical** — security vulnerabilities |

### Quick Wins
1. Install `vitest` + `supertest`
2. Write tests for `parseSongId()` — 30 minutes, catches the most common failure mode
3. Write tests for API endpoints — 1 hour, covers the entire server surface area
4. Add path traversal test for the lyrics endpoint — immediate security value
