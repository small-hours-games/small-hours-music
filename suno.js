'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const AUDIO_DIR = path.join(__dirname, 'data', 'audio');
const IMAGE_DIR = path.join(__dirname, 'data', 'images');
const LYRICS_DIR = path.join(__dirname, 'data', 'lyrics');
const TRACKS_PATH = path.join(__dirname, 'data', 'tracks.json');

function ensureDirs() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.mkdirSync(LYRICS_DIR, { recursive: true });
}

function loadTracks() {
  if (!fs.existsSync(TRACKS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
}

function saveTracks(tracks) {
  fs.writeFileSync(TRACKS_PATH, JSON.stringify(tracks, null, 2) + '\n');
}

// Download a URL to a local file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    const get = url.startsWith('https') ? https.get : require('http').get;
    get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Extract song ID from various Suno URL formats:
//   https://suno.com/s/wiZGYuKCdZhYOJcG          (share link — needs redirect)
//   https://suno.com/song/7bc3fe4e-...             (direct song page)
//   7bc3fe4e-4850-4730-bc28-cb049f6d7b66           (raw UUID)
function parseSongId(input) {
  input = input.trim();
  // Raw UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    return input;
  }
  // Direct song URL
  const songMatch = input.match(/suno\.com\/song\/([0-9a-f-]{36})/i);
  if (songMatch) return songMatch[1];
  // Share URL — we'll resolve it later
  return null;
}

// Follow a share URL redirect to get the song ID
function resolveShareUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      res.resume(); // drain
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        // Handle relative redirects
        if (loc.startsWith('/')) {
          const base = new URL(url);
          loc = `${base.protocol}//${base.host}${loc}`;
        }
        const id = parseSongId(loc);
        if (id) return resolve(id);
        return resolveShareUrl(loc).then(resolve, reject);
      }
      reject(new Error('Could not resolve share URL to a song ID'));
    }).on('error', reject);
  });
}

// Fetch song metadata from the self-hosted suno-api (gcui-art/suno-api)
// Returns { title, tags, duration, imageUrl, lyrics, prompt } or null if unavailable
async function fetchFromApi(songId) {
  const apiUrl = process.env.SUNO_API_URL;
  if (!apiUrl) return null;

  const url = `${apiUrl.replace(/\/+$/, '')}/api/get?ids=${songId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.SUNO_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.SUNO_API_KEY}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const song = Array.isArray(data) ? data[0] : data;
    if (!song) return null;

    // Parse duration from seconds
    let duration = '';
    if (song.duration) {
      const secs = parseFloat(song.duration);
      duration = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    }

    // Parse tags from comma/space-separated string
    let tags = [];
    if (song.tags) {
      tags = song.tags.split(/[,\n]+/).map(t => t.trim()).filter(Boolean);
    }

    return {
      title: song.title || 'Untitled',
      tags,
      duration,
      imageUrl: song.image_url || '',
      lyrics: song.lyric || song.prompt || '',
      prompt: song.gpt_description_prompt || '',
    };
  } catch (err) {
    console.log(`  Suno API unavailable (${err.message}), falling back to scraping`);
    return null;
  }
}

// Scrape metadata from a Suno song page (fallback when API is unavailable)
// Returns { title, tags, duration, imageUrl, lyrics, prompt }
async function fetchPageMeta(songId) {
  const url = `https://suno.com/song/${songId}`;
  const res = await fetch(url);
  const html = await res.text();

  const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || 'Untitled';
  const imageUrl = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || '';

  // Tags from style links: /style/Dream%20Pop etc
  const tagMatches = [...html.matchAll(/\/style\/([^"]+)"/g)];
  const tags = [...new Set(tagMatches.map(m => decodeURIComponent(m[1])))];

  // Duration from the playbar area (e.g. "3:11")
  const durationMatch = html.match(/"duration":\s*"?(\d+(?:\.\d+)?)"?/);
  let duration = '';
  if (durationMatch) {
    const secs = parseFloat(durationMatch[1]);
    duration = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  }

  return { title, tags, duration, imageUrl, lyrics: '', prompt: '' };
}

// Save lyrics to a separate file for clean storage
function saveLyrics(songId, lyrics) {
  if (!lyrics) return;
  const lyricsPath = path.join(LYRICS_DIR, `${songId}.txt`);
  fs.writeFileSync(lyricsPath, lyrics);
}

// Load lyrics for a song
function loadLyrics(songId) {
  const lyricsPath = path.join(LYRICS_DIR, `${songId}.txt`);
  if (!fs.existsSync(lyricsPath)) return '';
  return fs.readFileSync(lyricsPath, 'utf8');
}

// Import a song by URL, song ID, or share link
async function importSong(input) {
  ensureDirs();

  let songId = parseSongId(input);
  if (!songId) {
    // Must be a share URL
    console.log('Resolving share URL...');
    songId = await resolveShareUrl(input);
  }
  console.log(`Song ID: ${songId}`);

  const tracks = loadTracks();
  if (tracks.some(t => t.sunoId === songId)) {
    console.log('Already imported, skipping.');
    return null;
  }

  // Try suno-api first, fall back to scraping
  console.log('Fetching metadata...');
  let meta = await fetchFromApi(songId);
  if (!meta) {
    meta = await fetchPageMeta(songId);
  }
  console.log(`  Title: ${meta.title}`);
  console.log(`  Tags: ${meta.tags.join(', ')}`);
  if (meta.lyrics) console.log(`  Lyrics: ${meta.lyrics.substring(0, 60)}...`);
  if (meta.prompt) console.log(`  Prompt: ${meta.prompt.substring(0, 60)}...`);

  // Download audio from CDN
  const audioFile = `${songId}.mp3`;
  const audioUrl = `https://cdn1.suno.ai/${songId}.mp3`;
  console.log('Downloading audio...');
  await downloadFile(audioUrl, path.join(AUDIO_DIR, audioFile));

  // Download cover image
  let imageFile = '';
  const imageUrl = `https://cdn2.suno.ai/image_${songId}.jpeg`;
  {
    imageFile = `${songId}.jpeg`;
    console.log('Downloading image...');
    await downloadFile(imageUrl, path.join(IMAGE_DIR, imageFile));
  }

  // Save lyrics to file
  if (meta.lyrics) {
    saveLyrics(songId, meta.lyrics);
  }

  const track = {
    sunoId: songId,
    title: meta.title,
    artist: '',
    tags: meta.tags,
    duration: meta.duration,
    sunoUrl: `https://suno.com/song/${songId}`,
    audioUrl: `/audio/${audioFile}`,
    image: imageFile ? `/images/${imageFile}` : '',
    hasLyrics: !!meta.lyrics,
    prompt: meta.prompt,
  };

  tracks.push(track);
  saveTracks(tracks);
  console.log(`Imported: ${track.title}`);
  return track;
}

module.exports = { importSong, loadTracks, saveTracks, parseSongId, loadLyrics };

// CLI: node suno.js <url-or-id>
if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.log('Usage: node suno.js <suno-url-or-song-id>');
    process.exit(1);
  }
  importSong(input).then(track => {
    if (track) console.log('\nDone! Restart the server to see it.');
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
