'use strict';

require('dotenv').config();

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { importSong, loadLyrics } = require('./suno');

const PORT = process.env.PORT || 3000;

const CERT_PATH = path.join(__dirname, 'certs', 'cert.pem');
const KEY_PATH  = path.join(__dirname, 'certs', 'key.pem');
const USE_HTTPS = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const HOST_IP = getLocalIP();
const SCHEME = USE_HTTPS ? 'https' : 'http';
const DOMAIN = process.env.DOMAIN ? process.env.DOMAIN.trim() : null;
const PUBLIC_HOST = DOMAIN || `${HOST_IP}:${PORT}`;
const PUBLIC_SCHEME = DOMAIN ? 'https' : SCHEME;

const app = express();
app.use(express.json());

// Serve downloaded audio and images from data/
app.use('/audio',  express.static(path.join(__dirname, 'data', 'audio')));
app.use('/images', express.static(path.join(__dirname, 'data', 'images')));

// API: list tracks
app.get('/api/tracks', (req, res) => {
  const tracksPath = path.join(__dirname, 'data', 'tracks.json');
  if (!fs.existsSync(tracksPath)) {
    return res.json([]);
  }
  try {
    const tracks = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));
    res.json(tracks);
  } catch {
    res.status(500).json({ error: 'Failed to load tracks' });
  }
});

// API: get lyrics for a track
app.get('/api/tracks/:id/lyrics', (req, res) => {
  const lyrics = loadLyrics(req.params.id);
  res.json({ lyrics });
});

// API: import a song by Suno URL or song ID
app.post('/api/import', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const track = await importSong(url);
    if (!track) return res.json({ ok: true, skipped: true, message: 'Already imported' });
    res.json({ ok: true, track });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

const server = USE_HTTPS
  ? https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, app)
  : http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nSmall Hours Music running!\n');
  console.log(`  ${PUBLIC_SCHEME}://${PUBLIC_HOST}/\n`);
});
