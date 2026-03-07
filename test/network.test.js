import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const suno = require('../suno');

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TRACKS_PATH = path.join(DATA_DIR, 'tracks.json');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const IMAGE_DIR = path.join(DATA_DIR, 'images');

// Helper: create a local HTTP server
function createTestServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// --- fetchFromApi tests ---

describe('fetchFromApi', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns null when SUNO_API_URL is unset', async () => {
    delete process.env.SUNO_API_URL;
    const result = await suno.fetchFromApi('some-id');
    expect(result).toBeNull();
  });

  it('returns structured metadata on 200 response', async () => {
    const apiData = [{
      title: 'My Song',
      tags: 'Rock, Pop',
      duration: 185.5,
      image_url: 'https://example.com/img.jpg',
      lyric: 'Hello world',
      gpt_description_prompt: 'A rock song',
    }];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => apiData,
    });

    process.env.SUNO_API_URL = 'https://api.example.com';
    const result = await suno.fetchFromApi('test-id');

    expect(result).toEqual({
      title: 'My Song',
      tags: ['Rock', 'Pop'],
      duration: '3:05',
      imageUrl: 'https://example.com/img.jpg',
      lyrics: 'Hello world',
      prompt: 'A rock song',
    });
  });

  it('returns null on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false });
    process.env.SUNO_API_URL = 'https://api.example.com';
    const result = await suno.fetchFromApi('test-id');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    process.env.SUNO_API_URL = 'https://api.example.com';
    const result = await suno.fetchFromApi('test-id');
    expect(result).toBeNull();
  });

  it('sends Authorization header when SUNO_API_KEY is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ title: 'Test' }],
    });

    process.env.SUNO_API_URL = 'https://api.example.com';
    process.env.SUNO_API_KEY = 'test-key-123';
    await suno.fetchFromApi('test-id');

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer test-key-123');
  });

  it('handles empty array response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    process.env.SUNO_API_URL = 'https://api.example.com';
    const result = await suno.fetchFromApi('test-id');
    expect(result).toBeNull();
  });

  it('uses defaults for missing fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{}],
    });
    process.env.SUNO_API_URL = 'https://api.example.com';
    const result = await suno.fetchFromApi('test-id');
    expect(result.title).toBe('Untitled');
    expect(result.tags).toEqual([]);
    expect(result.duration).toBe('');
    expect(result.imageUrl).toBe('');
  });
});

// --- fetchPageMeta tests ---

describe('fetchPageMeta', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts og:title from HTML', async () => {
    const html = '<html><head><meta property="og:title" content="Cool Song"></head></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => html });
    const result = await suno.fetchPageMeta('test-id');
    expect(result.title).toBe('Cool Song');
  });

  it('extracts og:image from HTML', async () => {
    const html = '<html><head><meta property="og:image" content="https://img.example.com/cover.jpg"></head></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => html });
    const result = await suno.fetchPageMeta('test-id');
    expect(result.imageUrl).toBe('https://img.example.com/cover.jpg');
  });

  it('parses /style/ links into tags', async () => {
    const html = '<a href="/style/Dream%20Pop">Dream Pop</a><a href="/style/Indie">Indie</a>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => html });
    const result = await suno.fetchPageMeta('test-id');
    expect(result.tags).toEqual(['Dream Pop', 'Indie']);
  });

  it('deduplicates tags', async () => {
    const html = '<a href="/style/Rock">Rock</a><a href="/style/Rock">Rock</a>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => html });
    const result = await suno.fetchPageMeta('test-id');
    expect(result.tags).toEqual(['Rock']);
  });

  it('parses duration from JSON in HTML', async () => {
    const html = '"duration": 191.5';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => html });
    const result = await suno.fetchPageMeta('test-id');
    expect(result.duration).toBe('3:11');
  });

  it('falls back to defaults on empty HTML', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => '<html></html>' });
    const result = await suno.fetchPageMeta('test-id');
    expect(result.title).toBe('Untitled');
    expect(result.imageUrl).toBe('');
    expect(result.tags).toEqual([]);
    expect(result.duration).toBe('');
    expect(result.lyrics).toBe('');
  });
});

// --- downloadFile tests (using real HTTP test server) ---

describe('downloadFile', () => {
  let tmpDir;

  beforeEach(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    tmpDir = fs.mkdtempSync(path.join(DATA_DIR, '.tmp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('downloads a file successfully', async () => {
    const { server, url } = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello file content');
    });

    const dest = path.join(tmpDir, 'test.txt');
    await suno.downloadFile(url, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello file content');
    await closeServer(server);
  });

  it('follows redirects', async () => {
    let reqCount = 0;
    const { server, url } = await createTestServer((req, res) => {
      reqCount++;
      if (reqCount === 1) {
        res.writeHead(302, { Location: `${url}/final` });
        res.end();
      } else {
        res.writeHead(200);
        res.end('redirected content');
      }
    });

    const dest = path.join(tmpDir, 'redirect.txt');
    await suno.downloadFile(url, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('redirected content');
    await closeServer(server);
  });

  it('rejects on non-200 status', async () => {
    const { server, url } = await createTestServer((req, res) => {
      res.writeHead(404);
      res.end('not found');
    });

    const dest = path.join(tmpDir, 'fail.txt');
    await expect(suno.downloadFile(url, dest)).rejects.toThrow('Download failed: 404');
    expect(fs.existsSync(dest)).toBe(false);
    await closeServer(server);
  });

  it('cleans up partial file on error', async () => {
    const { server, url } = await createTestServer((req, res) => {
      res.writeHead(500);
      res.end();
    });

    const dest = path.join(tmpDir, 'partial.txt');
    await expect(suno.downloadFile(url, dest)).rejects.toThrow();
    expect(fs.existsSync(dest)).toBe(false);
    await closeServer(server);
  });
});

// --- resolveShareUrl tests ---

describe('resolveShareUrl', () => {
  it('rejects when URL does not redirect to a song ID', async () => {
    // resolveShareUrl uses https.get so we can't easily test with HTTP server
    // Test the error case: non-HTTPS URL will fail
    await expect(suno.resolveShareUrl('http://localhost:1')).rejects.toThrow();
  });
});

// --- importSong integration tests ---

describe('importSong integration', () => {
  const originalEnv = { ...process.env };
  let backedUp = false;
  let backupContent;

  beforeEach(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    fs.mkdirSync(LYRICS_DIR, { recursive: true });

    if (fs.existsSync(TRACKS_PATH)) {
      backupContent = fs.readFileSync(TRACKS_PATH, 'utf8');
      backedUp = true;
    }
  });

  afterEach(() => {
    if (backedUp) {
      fs.writeFileSync(TRACKS_PATH, backupContent);
    } else if (fs.existsSync(TRACKS_PATH)) {
      fs.unlinkSync(TRACKS_PATH);
    }
    backedUp = false;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();

    // Clean up test files
    const testId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    for (const f of [
      path.join(AUDIO_DIR, `${testId}.mp3`),
      path.join(IMAGE_DIR, `${testId}.jpeg`),
      path.join(LYRICS_DIR, `${testId}.txt`),
    ]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('returns null for already-imported songs', async () => {
    const songId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    suno.saveTracks([{ sunoId: songId, title: 'Existing' }]);
    const result = await suno.importSong(songId);
    expect(result).toBeNull();
  });

  it('imports a song by UUID with mocked network', async () => {
    const songId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    suno.saveTracks([]);

    // Mock fetch for fetchFromApi
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{
        title: 'Integration Test Song',
        tags: 'Test, Integration',
        duration: 120,
        image_url: 'https://example.com/img.jpg',
        lyric: 'Test lyrics here',
        gpt_description_prompt: 'A test prompt',
      }],
    });

    // Create a test HTTP server for downloadFile
    const { server, url } = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end('fake binary content');
    });

    // Monkey-patch the CDN URLs to point to our test server
    const origHttpsGet = require('https').get;
    const httpGet = require('http').get;
    // downloadFile uses http.get for http:// URLs, so we need to intercept
    // We'll set SUNO_API_URL and mock downloadFile by intercepting https.get
    process.env.SUNO_API_URL = 'https://api.example.com';

    // Since downloadFile is internal (not going through module.exports),
    // we can't spy on it. Instead, write small stub files to the expected paths.
    const audioPath = path.join(AUDIO_DIR, `${songId}.mp3`);
    const imagePath = path.join(IMAGE_DIR, `${songId}.jpeg`);

    // Override https.get to redirect to our HTTP test server
    const httpsModule = require('https');
    vi.spyOn(httpsModule, 'get').mockImplementation((opts, cb) => {
      // Redirect to our test HTTP server
      const testUrl = `${url}${opts.path || '/'}`;
      return httpGet(testUrl, cb);
    });

    const track = await suno.importSong(songId);

    expect(track).not.toBeNull();
    expect(track.sunoId).toBe(songId);
    expect(track.title).toBe('Integration Test Song');
    expect(track.tags).toEqual(['Test', 'Integration']);
    expect(track.duration).toBe('2:00');
    expect(track.hasLyrics).toBe(true);
    expect(track.audioUrl).toBe(`/audio/${songId}.mp3`);
    expect(track.image).toBe(`/images/${songId}.jpeg`);

    // Verify tracks.json was updated
    const tracks = suno.loadTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].sunoId).toBe(songId);

    // Verify lyrics were saved
    expect(suno.loadLyrics(songId)).toBe('Test lyrics here');

    await closeServer(server);
  });

  it('falls back to page scraping when API is unavailable', async () => {
    const songId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    suno.saveTracks([]);

    delete process.env.SUNO_API_URL;

    const scrapedHtml = `
      <html>
        <head>
          <meta property="og:title" content="Scraped Song">
          <meta property="og:image" content="https://example.com/img.jpg">
        </head>
        <body>
          <a href="/style/Rock">Rock</a>
          "duration": 90
        </body>
      </html>`;

    // Mock fetch for fetchPageMeta (scraping)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () => scrapedHtml,
    });

    // Mock https.get for downloadFile (CDN downloads)
    const { server, url } = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end('fake content');
    });

    const httpsModule = require('https');
    const httpGet = require('http').get;
    vi.spyOn(httpsModule, 'get').mockImplementation((opts, cb) => {
      return httpGet(`${url}${opts.path || '/'}`, cb);
    });

    const track = await suno.importSong(songId);
    expect(track.title).toBe('Scraped Song');
    expect(track.tags).toEqual(['Rock']);
    expect(track.duration).toBe('1:30');

    await closeServer(server);
  });
});
