const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/donate.html'));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DONATIONS_FILE = path.join(__dirname, 'donations.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaults = {
      elevenLabsKey: '',
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      modelId: 'eleven_multilingual_v2',
      minDonate: 20,
      currency: 'THB',
      streamTitle: 'Stream Donation',
      alertDuration: 8,
      emotions: {
        happy:      { stability: 0.25, similarity_boost: 0.85, style: 0.75, use_speaker_boost: true },
        sad:        { stability: 0.75, similarity_boost: 0.45, style: 0.4,  use_speaker_boost: false },
        excited:    { stability: 0.05, similarity_boost: 0.95, style: 1.0,  use_speaker_boost: true },
        angry:      { stability: 0.1,  similarity_boost: 0.8,  style: 0.9,  use_speaker_boost: true },
        neutral:    { stability: 0.5,  similarity_boost: 0.75, style: 0.0,  use_speaker_boost: true },
        whispering: { stability: 0.95, similarity_boost: 0.35, style: 0.05, use_speaker_boost: false },
      }
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE));
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function loadDonations() {
  if (!fs.existsSync(DONATIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(DONATIONS_FILE));
}

function saveDonation(d) {
  const list = loadDonations();
  list.unshift(d);
  fs.writeFileSync(DONATIONS_FILE, JSON.stringify(list.slice(0, 500), null, 2));
}

// GET config
app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  // hide key from public
  res.json({ ...cfg, elevenLabsKey: cfg.elevenLabsKey ? '***hidden***' : '' });
});

// GET config with key (dashboard only — no auth needed for local use)
app.get('/api/config/full', (req, res) => res.json(loadConfig()));

// POST save config
app.post('/api/config', (req, res) => {
  const current = loadConfig();
  const updated = { ...current, ...req.body };
  saveConfig(updated);
  res.json({ ok: true });
});

// GET donations list
app.get('/api/donations', (req, res) => res.json(loadDonations()));

// POST new donation
app.post('/api/donate', async (req, res) => {
  const cfg = loadConfig();
  const { name, amount, message, emotion = 'neutral' } = req.body;

  if (!name || !amount) return res.status(400).json({ error: 'Name and amount required' });
  if (Number(amount) < cfg.minDonate) {
    return res.status(400).json({ error: `Minimum donation is ${cfg.minDonate} ${cfg.currency}` });
  }

  const donation = {
    id: Date.now(),
    name: name.trim(),
    amount: Number(amount),
    message: (message || '').trim(),
    emotion,
    currency: cfg.currency,
    timestamp: new Date().toISOString(),
  };

  let audioBase64 = null;

  if (cfg.elevenLabsKey && donation.message) {
    try {
      const voiceSettings = cfg.emotions[emotion] || cfg.emotions.neutral;
      const emotionCues = {
        happy:      '(พูดด้วยความสุขและยิ้มแย้ม) ',
        excited:    '(พูดด้วยความตื่นเต้นและดีใจมากๆ) ',
        sad:        '(พูดด้วยความเศร้าและหดหู่ใจ) ',
        angry:      '(พูดด้วยความโกรธและไม่พอใจ) ',
        whispering: '(กระซิบเบาๆ อย่างลึกลับ) ',
        neutral:    '',
      };
      const cue = emotionCues[emotion] || '';
      const ttsText = `${cue}${donation.name} บริจาค ${donation.amount} ${donation.currency} พร้อมข้อความว่า ${donation.message}`;
      const ttsRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`,
        {
          text: ttsText,
          model_id: cfg.modelId || 'eleven_multilingual_v2',
          voice_settings: voiceSettings,
        },
        {
          headers: {
            'xi-api-key': cfg.elevenLabsKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
        }
      );
      audioBase64 = Buffer.from(ttsRes.data).toString('base64');
    } catch (e) {
      console.error('ElevenLabs error:', e.response?.data || e.message);
    }
  }

  saveDonation(donation);

  // emit to overlay
  io.emit('new_donation', { ...donation, audioBase64 });

  res.json({ ok: true, donation });
});

// POST test alert
app.post('/api/test-alert', async (req, res) => {
  const cfg = loadConfig();
  const { emotion = 'excited' } = req.body;

  const donation = {
    id: Date.now(),
    name: 'ทดสอบระบบ',
    amount: 99,
    message: 'นี่คือการทดสอบการแจ้งเตือน ElevenLabs ขอบคุณที่ใช้งาน!',
    emotion,
    currency: cfg.currency,
    timestamp: new Date().toISOString(),
    isTest: true,
  };

  let audioBase64 = null;
  if (cfg.elevenLabsKey) {
    try {
      const voiceSettings = cfg.emotions[emotion] || cfg.emotions.neutral;
      const emotionCues = {
        happy:      '(พูดด้วยความสุขและยิ้มแย้ม) ',
        excited:    '(พูดด้วยความตื่นเต้นและดีใจมากๆ) ',
        sad:        '(พูดด้วยความเศร้าและหดหู่ใจ) ',
        angry:      '(พูดด้วยความโกรธและไม่พอใจ) ',
        whispering: '(กระซิบเบาๆ อย่างลึกลับ) ',
        neutral:    '',
      };
      const cue = emotionCues[emotion] || '';
      const ttsText = `${cue}${donation.name} บริจาค ${donation.amount} ${donation.currency} พร้อมข้อความว่า ${donation.message}`;
      const ttsRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`,
        {
          text: ttsText,
          model_id: cfg.modelId || 'eleven_multilingual_v2',
          voice_settings: voiceSettings,
        },
        {
          headers: {
            'xi-api-key': cfg.elevenLabsKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
        }
      );
      audioBase64 = Buffer.from(ttsRes.data).toString('base64');
    } catch (e) {
      console.error('ElevenLabs test error:', e.response?.data || e.message);
    }
  }

  io.emit('new_donation', { ...donation, audioBase64 });
  res.json({ ok: true });
});

// GET voices list
app.get('/api/voices', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.elevenLabsKey) return res.json([]);
  try {
    const r = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': cfg.elevenLabsKey },
    });
    res.json(r.data.voices || []);
  } catch (e) {
    res.status(500).json({ error: 'Cannot fetch voices' });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🎉 Donation Server running!\n   Donate page  : http://localhost:${PORT}/donate.html\n   Overlay (OBS) : http://localhost:${PORT}/overlay.html\n   Dashboard     : http://localhost:${PORT}/dashboard.html\n`));
