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

const DEFAULTS = {
  theme: 'purple-galaxy',
  ttsProvider: 'elevenlabs',
  minDonate: 20,
  currency: 'THB',
  streamTitle: 'Stream Donation',
  alertDuration: 8,
  elevenLabsKey: '',
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  modelId: 'eleven_multilingual_v2',
  emotions: {
    happy:      { stability: 0.25, similarity_boost: 0.85, style: 0.75, use_speaker_boost: true },
    sad:        { stability: 0.75, similarity_boost: 0.45, style: 0.4,  use_speaker_boost: false },
    excited:    { stability: 0.05, similarity_boost: 0.95, style: 1.0,  use_speaker_boost: true },
    angry:      { stability: 0.1,  similarity_boost: 0.8,  style: 0.9,  use_speaker_boost: true },
    neutral:    { stability: 0.5,  similarity_boost: 0.75, style: 0.0,  use_speaker_boost: true },
    whispering: { stability: 0.95, similarity_boost: 0.35, style: 0.05, use_speaker_boost: false },
  },
  googleTtsKey: '',
  googleVoice: 'th-TH-Neural2-C',
  googleLang: 'th-TH',
  googleEmotions: {
    neutral:    { speakingRate: 1.0,  pitch: 0,   volumeGainDb: 0  },
    happy:      { speakingRate: 1.1,  pitch: 3,   volumeGainDb: 1  },
    excited:    { speakingRate: 1.35, pitch: 5,   volumeGainDb: 3  },
    sad:        { speakingRate: 0.85, pitch: -3,  volumeGainDb: -2 },
    angry:      { speakingRate: 1.2,  pitch: -2,  volumeGainDb: 4  },
    whispering: { speakingRate: 0.8,  pitch: -4,  volumeGainDb: -6 },
  },
};

const EMOTION_CUES = {
  happy:      '(พูดด้วยความสุขและยิ้มแย้ม) ',
  excited:    '(พูดด้วยความตื่นเต้นและดีใจมากๆ) ',
  sad:        '(พูดด้วยความเศร้าและหดหู่ใจ) ',
  angry:      '(พูดด้วยความโกรธและไม่พอใจ) ',
  whispering: '(กระซิบเบาๆ อย่างลึกลับ) ',
  neutral:    '',
};

function loadConfig() {
  let cfg;
  if (!fs.existsSync(CONFIG_FILE)) {
    cfg = JSON.parse(JSON.stringify(DEFAULTS));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } else {
    // Deep-merge: keep defaults for any missing nested keys
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE));
    cfg = {
      ...DEFAULTS,
      ...saved,
      emotions:      { ...DEFAULTS.emotions,      ...(saved.emotions || {}) },
      googleEmotions:{ ...DEFAULTS.googleEmotions, ...(saved.googleEmotions || {}) },
    };
  }

  // ── Environment variable overrides ──────────────────────────
  // Set these in Railway Variables panel for persistent storage.
  // They always take priority over config.json.
  const e = process.env;
  if (e.ELEVENLABS_API_KEY) cfg.elevenLabsKey = e.ELEVENLABS_API_KEY;
  if (e.ELEVEN_VOICE_ID)    cfg.voiceId       = e.ELEVEN_VOICE_ID;
  if (e.ELEVEN_MODEL_ID)    cfg.modelId       = e.ELEVEN_MODEL_ID;
  if (e.GOOGLE_TTS_KEY)     cfg.googleTtsKey  = e.GOOGLE_TTS_KEY;
  if (e.GOOGLE_VOICE)       cfg.googleVoice   = e.GOOGLE_VOICE;
  if (e.GOOGLE_LANG)        cfg.googleLang    = e.GOOGLE_LANG;
  if (e.TTS_PROVIDER)       cfg.ttsProvider   = e.TTS_PROVIDER;
  if (e.MIN_DONATE)         cfg.minDonate     = Number(e.MIN_DONATE);
  if (e.CURRENCY)           cfg.currency      = e.CURRENCY;
  if (e.STREAM_TITLE)       cfg.streamTitle   = e.STREAM_TITLE;
  if (e.ALERT_DURATION)     cfg.alertDuration = Number(e.ALERT_DURATION);
  if (e.THEME)              cfg.theme         = e.THEME;

  return cfg;
}

// Track which keys came from env vars (so dashboard can show the indicator)
function getEnvFlags() {
  const e = process.env;
  return {
    elevenLabsKey: !!e.ELEVENLABS_API_KEY,
    voiceId:       !!e.ELEVEN_VOICE_ID,
    modelId:       !!e.ELEVEN_MODEL_ID,
    googleTtsKey:  !!e.GOOGLE_TTS_KEY,
    googleVoice:   !!e.GOOGLE_VOICE,
    googleLang:    !!e.GOOGLE_LANG,
    ttsProvider:   !!e.TTS_PROVIDER,
    minDonate:     !!e.MIN_DONATE,
    currency:      !!e.CURRENCY,
    streamTitle:   !!e.STREAM_TITLE,
    alertDuration: !!e.ALERT_DURATION,
    theme:         !!e.THEME,
  };
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

// ─── TTS Helper ─────────────────────────────────────────────────────────────

async function generateTTS(cfg, text, emotion) {
  const provider = cfg.ttsProvider || 'elevenlabs';
  const cue = EMOTION_CUES[emotion] || '';
  const fullText = `${cue}${text}`;

  // ── ElevenLabs ──
  if (provider === 'elevenlabs') {
    if (!cfg.elevenLabsKey) return null;
    const voiceSettings = (cfg.emotions || {})[emotion] || cfg.emotions?.neutral || {};
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`,
      {
        text: fullText,
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
    return Buffer.from(res.data).toString('base64');
  }

  // ── Google TTS ──
  if (provider === 'google') {
    if (!cfg.googleTtsKey) return null;
    const emo = (cfg.googleEmotions || {})[emotion] || cfg.googleEmotions?.neutral || {};
    const res = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${cfg.googleTtsKey}`,
      {
        input: { text: fullText },
        voice: {
          languageCode: cfg.googleLang || 'th-TH',
          name: cfg.googleVoice || 'th-TH-Neural2-C',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: emo.speakingRate ?? 1.0,
          pitch:        emo.pitch ?? 0,
          volumeGainDb: emo.volumeGainDb ?? 0,
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return res.data.audioContent || null;
  }

  return null;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({
    ...cfg,
    elevenLabsKey:        cfg.elevenLabsKey ? '***hidden***' : '',
    googleTtsKey:         cfg.googleTtsKey  ? '***hidden***' : '',
    elevenLabsAvailable:  !!cfg.elevenLabsKey,
    googleTtsAvailable:   !!cfg.googleTtsKey,
    _envFlags: getEnvFlags(),
  });
});

app.get('/api/config/full', (req, res) => {
  res.json({ ...loadConfig(), _envFlags: getEnvFlags() });
});

app.post('/api/config', (req, res) => {
  const updated = { ...loadConfig(), ...req.body };
  saveConfig(updated);
  res.json({ ok: true });
});

app.get('/api/donations', (req, res) => res.json(loadDonations()));

// POST new donation
app.post('/api/donate', async (req, res) => {
  const cfg = loadConfig();
  const { name, amount, message, emotion = 'neutral', ttsProvider: donorProvider } = req.body;

  if (!name || !amount) return res.status(400).json({ error: 'Name and amount required' });
  if (Number(amount) < cfg.minDonate) {
    return res.status(400).json({ error: `Minimum donation is ${cfg.minDonate} ${cfg.currency}` });
  }

  // Resolve which TTS provider to use — donor's choice takes priority if that provider is configured
  const resolvedProvider = (() => {
    if (donorProvider === 'elevenlabs' && cfg.elevenLabsKey) return 'elevenlabs';
    if (donorProvider === 'google'     && cfg.googleTtsKey)  return 'google';
    return cfg.ttsProvider; // fallback to default
  })();

  const donation = {
    id: Date.now(),
    name: name.trim(),
    amount: Number(amount),
    message: (message || '').trim(),
    emotion,
    currency: cfg.currency,
    ttsProvider: resolvedProvider,
    timestamp: new Date().toISOString(),
  };

  let audioBase64 = null;
  if (donation.message) {
    try {
      const ttsText = `${donation.name} บริจาค ${donation.amount} ${donation.currency} พร้อมข้อความว่า ${donation.message}`;
      audioBase64 = await generateTTS({ ...cfg, ttsProvider: resolvedProvider }, ttsText, emotion);
    } catch (e) {
      console.error('TTS error:', e.response?.data || e.message);
    }
  }

  saveDonation(donation);
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
    message: 'นี่คือการทดสอบการแจ้งเตือน ขอบคุณที่ใช้งาน!',
    emotion,
    currency: cfg.currency,
    ttsProvider: cfg.ttsProvider,
    timestamp: new Date().toISOString(),
    isTest: true,
  };

  let audioBase64 = null;
  try {
    const ttsText = `${donation.name} บริจาค ${donation.amount} ${donation.currency} พร้อมข้อความว่า ${donation.message}`;
    audioBase64 = await generateTTS(cfg, ttsText, emotion);
  } catch (e) {
    console.error('TTS test error:', e.response?.data || e.message);
  }

  io.emit('new_donation', { ...donation, audioBase64 });
  res.json({ ok: true });
});

// GET ElevenLabs voices
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

// GET Google TTS voices
app.get('/api/google-voices', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.googleTtsKey) return res.json([]);
  try {
    const r = await axios.get(
      `https://texttospeech.googleapis.com/v1/voices?key=${cfg.googleTtsKey}`
    );
    const voices = (r.data.voices || []).filter(v =>
      v.languageCodes?.some(lc => lc.startsWith('th') || lc.startsWith('en'))
    );
    res.json(voices);
  } catch (e) {
    res.status(500).json({ error: 'Cannot fetch Google voices' });
  }
});

// ─── Socket ──────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`\n🎉 Donation Server running!\n   Donate page  : http://localhost:${PORT}/donate.html\n   Overlay (OBS) : http://localhost:${PORT}/overlay.html\n   Dashboard     : http://localhost:${PORT}/dashboard.html\n`)
);
