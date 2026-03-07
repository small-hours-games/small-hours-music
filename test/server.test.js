import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import request from 'supertest';

const require = createRequire(import.meta.url);

// Load the suno module and get a reference we can spy on
const suno = require('../suno');
const app = require('../server');

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TRACKS_PATH = path.join(DATA_DIR, 'tracks.json');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');

describe('GET /api/tracks', () => {
  let backedUp = false;
  let backupContent;

  beforeEach(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
  });

  it('returns [] when tracks.json does not exist', async () => {
    if (fs.existsSync(TRACKS_PATH)) fs.unlinkSync(TRACKS_PATH);
    const res = await request(app).get('/api/tracks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns tracks array when tracks.json is valid', async () => {
    const tracks = [{ sunoId: 'abc', title: 'Test' }];
    fs.writeFileSync(TRACKS_PATH, JSON.stringify(tracks));
    const res = await request(app).get('/api/tracks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(tracks);
  });

  it('returns 500 when tracks.json is malformed', async () => {
    fs.writeFileSync(TRACKS_PATH, '{invalid json!!!');
    const res = await request(app).get('/api/tracks');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to load tracks');
  });
});

describe('GET /api/tracks/:id/lyrics', () => {
  const validId = '7bc3fe4e-4850-4730-bc28-cb049f6d7b66';
  const lyricsPath = path.join(LYRICS_DIR, `${validId}.txt`);

  beforeEach(() => {
    fs.mkdirSync(LYRICS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(lyricsPath)) fs.unlinkSync(lyricsPath);
  });

  it('returns lyrics when file exists', async () => {
    fs.writeFileSync(lyricsPath, 'Hello world lyrics');
    const res = await request(app).get(`/api/tracks/${validId}/lyrics`);
    expect(res.status).toBe(200);
    expect(res.body.lyrics).toBe('Hello world lyrics');
  });

  it('returns empty string when lyrics file is missing', async () => {
    const res = await request(app).get(`/api/tracks/${validId}/lyrics`);
    expect(res.status).toBe(200);
    expect(res.body.lyrics).toBe('');
  });

  // Security: path traversal prevention
  it('rejects path traversal attempts with 400', async () => {
    const res = await request(app).get('/api/tracks/..%2F..%2F..%2Fetc%2Fpasswd/lyrics');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid track ID');
  });

  it('rejects non-UUID IDs with 400', async () => {
    const res = await request(app).get('/api/tracks/not-a-valid-id/lyrics');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid track ID');
  });

  it('rejects IDs with directory separators', async () => {
    const res = await request(app).get('/api/tracks/..%2Fsecret/lyrics');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid track ID');
  });
});

describe('POST /api/import', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when url is missing', async () => {
    const res = await request(app)
      .post('/api/import')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('url is required');
  });

  it('returns skipped when song is already imported', async () => {
    vi.spyOn(suno, 'importSong').mockResolvedValue(null);
    const res = await request(app)
      .post('/api/import')
      .send({ url: 'https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, skipped: true, message: 'Already imported' });
  });

  it('returns track on successful import', async () => {
    const track = { sunoId: 'abc', title: 'New Song' };
    vi.spyOn(suno, 'importSong').mockResolvedValue(track);
    const res = await request(app)
      .post('/api/import')
      .send({ url: 'https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, track });
  });

  it('returns 500 when importSong throws', async () => {
    vi.spyOn(suno, 'importSong').mockRejectedValue(new Error('Network failure'));
    const res = await request(app)
      .post('/api/import')
      .send({ url: 'https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Network failure');
  });
});
