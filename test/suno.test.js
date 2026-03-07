import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseSongId, formatDuration, parseTags, loadTracks, saveTracks, saveLyrics, loadLyrics } = require('../suno');

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TRACKS_PATH = path.join(DATA_DIR, 'tracks.json');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');

// --- P1: Pure logic tests ---

describe('parseSongId', () => {
  it('parses a raw UUID', () => {
    expect(parseSongId('7bc3fe4e-4850-4730-bc28-cb049f6d7b66'))
      .toBe('7bc3fe4e-4850-4730-bc28-cb049f6d7b66');
  });

  it('parses a direct song URL', () => {
    expect(parseSongId('https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66'))
      .toBe('7bc3fe4e-4850-4730-bc28-cb049f6d7b66');
  });

  it('parses a song URL with query params', () => {
    expect(parseSongId('https://suno.com/song/7bc3fe4e-4850-4730-bc28-cb049f6d7b66?ref=share'))
      .toBe('7bc3fe4e-4850-4730-bc28-cb049f6d7b66');
  });

  it('trims whitespace', () => {
    expect(parseSongId('  7bc3fe4e-4850-4730-bc28-cb049f6d7b66  '))
      .toBe('7bc3fe4e-4850-4730-bc28-cb049f6d7b66');
  });

  it('handles uppercase UUIDs', () => {
    expect(parseSongId('7BC3FE4E-4850-4730-BC28-CB049F6D7B66'))
      .toBe('7BC3FE4E-4850-4730-BC28-CB049F6D7B66');
  });

  it('returns null for share URLs (resolved separately)', () => {
    expect(parseSongId('https://suno.com/s/wiZGYuKCdZhYOJcG')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(parseSongId('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSongId('')).toBeNull();
  });

  it('returns null for partial UUID', () => {
    expect(parseSongId('7bc3fe4e-4850-4730')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('formats with single-digit seconds padded', () => {
    expect(formatDuration(61)).toBe('1:01');
  });

  it('formats fractional seconds (truncates)', () => {
    expect(formatDuration(189.7)).toBe('3:09');
  });

  it('formats a large value', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('handles string input', () => {
    expect(formatDuration('125')).toBe('2:05');
  });

  it('handles NaN', () => {
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('handles undefined', () => {
    expect(formatDuration(undefined)).toBe('0:00');
  });
});

describe('parseTags', () => {
  it('splits comma-separated tags', () => {
    expect(parseTags('Rock, Pop, Indie')).toEqual(['Rock', 'Pop', 'Indie']);
  });

  it('splits newline-separated tags', () => {
    expect(parseTags('Rock\nPop\nIndie')).toEqual(['Rock', 'Pop', 'Indie']);
  });

  it('handles mixed separators', () => {
    expect(parseTags('Rock,Pop\nIndie')).toEqual(['Rock', 'Pop', 'Indie']);
  });

  it('filters empty entries from consecutive separators', () => {
    expect(parseTags('Rock,,Pop,,')).toEqual(['Rock', 'Pop']);
  });

  it('trims whitespace from each tag', () => {
    expect(parseTags('  Rock , Pop  ')).toEqual(['Rock', 'Pop']);
  });

  it('returns empty array for empty string', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(parseTags(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseTags(undefined)).toEqual([]);
  });
});

// --- P3: File I/O tests ---

describe('loadTracks / saveTracks', () => {
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

  it('loadTracks returns [] when tracks.json does not exist', () => {
    if (fs.existsSync(TRACKS_PATH)) fs.unlinkSync(TRACKS_PATH);
    expect(loadTracks()).toEqual([]);
  });

  it('saveTracks then loadTracks round-trips correctly', () => {
    const tracks = [
      { sunoId: 'abc-123', title: 'Test Song', tags: ['Rock'] },
      { sunoId: 'def-456', title: 'Another Song', tags: ['Pop', 'Indie'] },
    ];
    saveTracks(tracks);
    expect(loadTracks()).toEqual(tracks);
  });

  it('saveTracks writes valid JSON with trailing newline', () => {
    saveTracks([{ title: 'Test' }]);
    const raw = fs.readFileSync(TRACKS_PATH, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe('saveLyrics / loadLyrics', () => {
  const testId = 'test-0000-0000-0000-000000000000';
  const lyricsPath = path.join(LYRICS_DIR, `${testId}.txt`);

  beforeEach(() => {
    fs.mkdirSync(LYRICS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(lyricsPath)) fs.unlinkSync(lyricsPath);
  });

  it('loadLyrics returns empty string for non-existent song', () => {
    expect(loadLyrics('nonexistent-0000-0000-0000-000000000000')).toBe('');
  });

  it('round-trips lyrics correctly', () => {
    const lyrics = 'Verse 1\nChorus\nVerse 2\n';
    saveLyrics(testId, lyrics);
    expect(loadLyrics(testId)).toBe(lyrics);
  });

  it('saveLyrics is a no-op for empty lyrics', () => {
    saveLyrics(testId, '');
    expect(fs.existsSync(lyricsPath)).toBe(false);
  });

  it('saveLyrics is a no-op for null lyrics', () => {
    saveLyrics(testId, null);
    expect(fs.existsSync(lyricsPath)).toBe(false);
  });
});
