'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE = 'https://api.sunoapi.org/api/v1';
const AUDIO_DIR = path.join(__dirname, 'data', 'audio');
const IMAGE_DIR = path.join(__dirname, 'data', 'images');
const TRACKS_PATH = path.join(__dirname, 'data', 'tracks.json');

function getApiKey() {
  const key = process.env.SUNO_API_KEY;
  if (!key) throw new Error('SUNO_API_KEY not set');
  return key;
}

function ensureDirs() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

function loadTracks() {
  if (!fs.existsSync(TRACKS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
}

function saveTracks(tracks) {
  fs.writeFileSync(TRACKS_PATH, JSON.stringify(tracks, null, 2) + '\n');
}

// Fetch JSON from the Suno API
async function apiFetch(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${getApiKey()}` }
  });
  if (!res.ok) throw new Error(`Suno API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Download a URL to a local file, returns the local path
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const get = url.startsWith('https') ? https.get : require('http').get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
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

// Fetch task info and extract track data
async function fetchTaskInfo(taskId) {
  const result = await apiFetch(`/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!result.data) throw new Error('No data in response');
  return result.data;
}

// Import a track by task ID: fetch metadata, download audio + image, add to tracks.json
async function importTrack(taskId) {
  ensureDirs();

  console.log(`Fetching task info for ${taskId}...`);
  const taskData = await fetchTaskInfo(taskId);

  if (taskData.status !== 'SUCCESS') {
    throw new Error(`Task status is ${taskData.status}, not SUCCESS`);
  }

  const songs = taskData.response?.data || [];
  if (!songs.length) throw new Error('No songs found in task response');

  const tracks = loadTracks();
  const imported = [];

  for (const song of songs) {
    const id = song.id;

    // Skip if already imported
    if (tracks.some(t => t.sunoId === id)) {
      console.log(`  Skipping ${song.title || id} — already imported`);
      continue;
    }

    console.log(`  Importing: ${song.title || id}`);

    // Download audio
    let audioFile = '';
    if (song.audio_url) {
      const ext = song.audio_url.includes('.wav') ? 'wav' : 'mp3';
      audioFile = `${id}.${ext}`;
      console.log(`    Downloading audio...`);
      await downloadFile(song.audio_url, path.join(AUDIO_DIR, audioFile));
    }

    // Download image
    let imageFile = '';
    if (song.image_url) {
      const imgExt = song.image_url.includes('.png') ? 'png' : 'jpg';
      imageFile = `${id}.${imgExt}`;
      console.log(`    Downloading image...`);
      await downloadFile(song.image_url, path.join(IMAGE_DIR, imageFile));
    }

    const duration = song.duration
      ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}`
      : '';

    const tags = song.tags
      ? song.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const track = {
      sunoId: id,
      title: song.title || 'Untitled',
      artist: song.artist || '',
      tags,
      duration,
      sunoUrl: `https://suno.com/song/${id}`,
      audioUrl: audioFile ? `/audio/${audioFile}` : '',
      image: imageFile ? `/images/${imageFile}` : '',
    };

    tracks.push(track);
    imported.push(track);
    console.log(`    Done: ${track.title}`);
  }

  saveTracks(tracks);
  console.log(`Imported ${imported.length} track(s). Total: ${tracks.length}`);
  return imported;
}

// Check remaining API credits
async function checkCredits() {
  const result = await apiFetch('/get-credits');
  return result.data?.credits;
}

module.exports = { importTrack, fetchTaskInfo, checkCredits, loadTracks, saveTracks };
