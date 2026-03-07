'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { loadTracks, saveTracks, formatDuration, parseTags } = require('./suno');

const LYRICS_DIR = path.join(__dirname, 'data', 'lyrics');
const API_URL = process.env.SUNO_API_URL;

async function fetchLyrics(songId) {
  const url = `${API_URL.replace(/\/+$/, '')}/api/get?ids=${songId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const song = Array.isArray(data) ? data[0] : data;
  if (!song) return null;
  return {
    lyrics: song.lyric || '',
    prompt: song.gpt_description_prompt || '',
    tags: song.tags || '',
    duration: song.duration || 0,
  };
}

async function main() {
  if (!API_URL) { console.error('SUNO_API_URL not set'); process.exit(1); }
  fs.mkdirSync(LYRICS_DIR, { recursive: true });

  const tracks = loadTracks();
  let fetched = 0, skipped = 0, failed = 0;

  for (const track of tracks) {
    const lyricsPath = path.join(LYRICS_DIR, `${track.sunoId}.txt`);
    if (fs.existsSync(lyricsPath)) { skipped++; continue; }

    try {
      console.log(`Fetching: ${track.title} (${track.sunoId})`);
      const meta = await fetchLyrics(track.sunoId);
      if (!meta || !meta.lyrics) { failed++; console.log('  No lyrics found'); continue; }

      fs.writeFileSync(lyricsPath, meta.lyrics);
      track.hasLyrics = true;
      if (meta.prompt) track.prompt = meta.prompt;
      if (meta.tags) track.tags = parseTags(meta.tags);
      if (meta.duration) track.duration = formatDuration(meta.duration);
      fetched++;
      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      failed++;
      console.log(`  Error: ${err.message}`);
    }
  }

  saveTracks(tracks);
  console.log(`\nDone! Fetched: ${fetched}, Skipped: ${skipped}, Failed: ${failed}`);
}

main();
