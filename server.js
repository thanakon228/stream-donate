const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Multer — memory storage (no disk writes, Railway-safe)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('ต้องเป็นไฟล์รูปภาพเท่านั้น'));
    cb(null, true);
  },
});

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
  bot: {
    enabled: false,
    intervalMinutes: 5,
    botName: '🤖 DonateBot',
    minAmount: 20,
    maxAmount: 99,
    messages: [
      { id:1, text:'วันนี้สตรีมถึงกี่โมงครับ?',               emotion:'neutral'  },
      { id:2, text:'ชื่นชอบเกมนี้ยังไงบ้างครับ?',               emotion:'happy'    },
      { id:3, text:'เล่นเกมนี้มากี่ปีแล้วครับ?',               emotion:'neutral'  },
      { id:4, text:'มีแผนอะไรสนุกๆ ในสตรีมวันนี้ไหมครับ?',    emotion:'excited'  },
      { id:5, text:'ตอนนี้อยู่ส่วนไหนของเกมครับ?',             emotion:'neutral'  },
      { id:6, text:'ทำไมถึงชอบเกมประเภทนี้ครับ?',             emotion:'happy'    },
      { id:7, text:'มี tips อะไรสำหรับมือใหม่ไหมครับ?',       emotion:'neutral'  },
      { id:8, text:'เกมนี้ยากแค่ไหนครับ เทียบกับเกมอื่นๆ?', emotion:'neutral'  },
    ],
  },
  // ── Slip Verification ──
  easySlipKey: '',
  slipVerify: {
    enabled:         false,  // show slip upload on donate page
    required:        false,  // block submission if slip not verified
    minAmountForTts: 20,     // verified amount must be >= this to show TTS picker
  },
  // ── Payment Accounts ──
  paymentAccounts: {
    showOnGate:    true,   // show payment info on the slip gate
    showOnOverlay: true,   // show payment info in OBS overlay alert
    accounts: [],          // [{ id, type, bankName, accountNumber, accountName, phone, display }]
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
      emotions:       { ...DEFAULTS.emotions,       ...(saved.emotions || {}) },
      googleEmotions: { ...DEFAULTS.googleEmotions, ...(saved.googleEmotions || {}) },
      bot: {
        ...DEFAULTS.bot,
        ...(saved.bot || {}),
        messages: saved.bot?.messages ?? DEFAULTS.bot.messages,
      },
      slipVerify: { ...DEFAULTS.slipVerify, ...(saved.slipVerify || {}) },
      paymentAccounts: {
        ...DEFAULTS.paymentAccounts,
        ...(saved.paymentAccounts || {}),
        accounts: saved.paymentAccounts?.accounts ?? [],
      },
    };
  }

  // ── Environment variable overrides ──────────────────────────
  // Set these in Railway Variables panel for persistent storage.
  // They always take priority over config.json.
  const e = process.env;
  if (e.EASYSLIP_KEY)       cfg.easySlipKey   = e.EASYSLIP_KEY;
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
    easySlipKey:   !!e.EASYSLIP_KEY,
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
    easySlipKey:          cfg.easySlipKey   ? '***hidden***' : '',
    elevenLabsAvailable:  !!cfg.elevenLabsKey,
    googleTtsAvailable:   !!cfg.googleTtsKey,
    easySlipAvailable:    !!cfg.easySlipKey,
    _envFlags: getEnvFlags(),
  });
});

app.get('/api/config/full', (req, res) => {
  res.json({ ...loadConfig(), _envFlags: getEnvFlags() });
});

app.post('/api/config', (req, res) => {
  const current = loadConfig();
  let updated = { ...current, ...req.body };
  // Deep-merge bot sub-object so partial saves don't wipe messages
  if (req.body.bot !== undefined) {
    updated.bot = { ...(current.bot || {}), ...req.body.bot };
    if (req.body.bot.messages !== undefined) updated.bot.messages = req.body.bot.messages;
    // Restart bot when its config changes
    updated.bot.enabled ? startBot(updated.bot) : stopBot();
  }
  // Deep-merge slipVerify
  if (req.body.slipVerify !== undefined) {
    updated.slipVerify = { ...(current.slipVerify || {}), ...req.body.slipVerify };
  }
  // Deep-merge paymentAccounts
  if (req.body.paymentAccounts !== undefined) {
    updated.paymentAccounts = {
      ...(current.paymentAccounts || {}),
      ...req.body.paymentAccounts,
      accounts: req.body.paymentAccounts.accounts ?? current.paymentAccounts?.accounts ?? [],
    };
  }
  saveConfig(updated);
  res.json({ ok: true });
});

app.get('/api/donations', (req, res) => res.json(loadDonations()));

// POST new donation
app.post('/api/donate', async (req, res) => {
  const cfg = loadConfig();
  const { name, amount, message, emotion = 'neutral', ttsProvider: donorProvider, slipRef } = req.body;

  if (!name || !amount) return res.status(400).json({ error: 'Name and amount required' });
  if (Number(amount) < cfg.minDonate) {
    return res.status(400).json({ error: `Minimum donation is ${cfg.minDonate} ${cfg.currency}` });
  }
  // Slip verification gate — block if required and no ref provided
  if (cfg.slipVerify?.enabled && cfg.slipVerify?.required && !slipRef) {
    return res.status(400).json({ error: 'กรุณาแนบสลิปและยืนยันก่อนส่งการบริจาค' });
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
    slipRef: slipRef || null,
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
  const { emotion = 'excited', name, amount, message } = req.body;

  const donation = {
    id: Date.now(),
    name:    (name    || 'ทดสอบระบบ').trim(),
    amount:  Number(amount) || 99,
    message: message !== undefined ? String(message).trim() : 'นี่คือการทดสอบการแจ้งเตือน ขอบคุณที่ใช้งาน!',
    emotion,
    currency: cfg.currency,
    ttsProvider: cfg.ttsProvider,
    timestamp: new Date().toISOString(),
    isTest: true,
  };

  let audioBase64 = null;
  if (donation.message) {
    try {
      const ttsText = `${donation.name} บริจาค ${donation.amount} ${donation.currency} พร้อมข้อความว่า ${donation.message}`;
      audioBase64 = await generateTTS(cfg, ttsText, emotion);
    } catch (e) {
      console.error('TTS test error:', e.response?.data || e.message);
    }
  }

  io.emit('new_donation', { ...donation, audioBase64 });
  res.json({ ok: true });
});

// POST verify slip via EasySlip API
app.post('/api/verify-slip', upload.single('slip'), async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.easySlipKey) {
    return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า EasySlip API Key ในหน้า Dashboard' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'ไม่พบไฟล์สลิป กรุณาแนบรูปสลิป' });
  }

  try {
    // Use Node 18+ native fetch + FormData
    const formData = new FormData();
    formData.append(
      'files',
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname || 'slip.jpg'
    );

    const response = await fetch('https://developer.easyslip.com/api/v1/verify', {
      method:  'POST',
      headers: { Authorization: `Bearer ${cfg.easySlipKey}` },
      body:    formData,
    });

    const json = await response.json();

    if (!response.ok || json.status !== 200) {
      const msg = json.message || json.error || 'ไม่สามารถยืนยันสลิปได้';
      return res.status(400).json({ error: msg });
    }

    const slip        = json.data || {};
    const amount      = slip.amount?.amount ?? slip.amount?.local?.amount ?? 0;
    const transRef    = slip.transRef  || '';
    const senderName  = slip.sender?.account?.name?.th   || slip.sender?.account?.name?.en   || 'ไม่ระบุ';
    const receiverName= slip.receiver?.account?.name?.th || slip.receiver?.account?.name?.en || 'ไม่ระบุ';
    const senderBank  = slip.sender?.bank?.name   || slip.sender?.bank?.short   || '';
    const receiverBank= slip.receiver?.bank?.name || slip.receiver?.bank?.short || '';
    const date        = slip.date || '';

    res.json({
      ok:           true,
      amount,
      transRef,
      senderName,
      senderBank,
      receiverName,
      receiverBank,
      date,
      minAmountForTts: cfg.slipVerify?.minAmountForTts ?? 20,
    });
  } catch (e) {
    console.error('EasySlip error:', e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ EasySlip: ' + e.message });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
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

// ─── Bot Engine ─────────────────────────────────────────────────────────────

let botTimer        = null;
let botLastFireTime = null;
let botIntervalMs   = 0;

function startBot(botCfg) {
  stopBot();
  const bot = botCfg || loadConfig().bot || {};
  if (!bot.enabled)           return console.log('🤖 Bot disabled — not starting.');
  if (!bot.messages?.length)  return console.log('🤖 Bot has no messages — not starting.');
  botIntervalMs   = (bot.intervalMinutes || 5) * 60 * 1000;
  botLastFireTime = Date.now();
  botTimer = setInterval(async () => {
    botLastFireTime = Date.now();
    await fireBotDonation();
  }, botIntervalMs);
  console.log(`🤖 Bot started — fires every ${bot.intervalMinutes} min`);
}

function stopBot() {
  if (botTimer) { clearInterval(botTimer); botTimer = null; }
  botIntervalMs   = 0;
  botLastFireTime = null;
}

async function fireBotDonation() {
  const cfg = loadConfig();
  const bot = cfg.bot || {};
  const msgs = bot.messages || [];
  if (!msgs.length) return;

  const msg    = msgs[Math.floor(Math.random() * msgs.length)];
  const minAmt = Number(bot.minAmount) || 20;
  const maxAmt = Number(bot.maxAmount) || 99;
  const amount = Math.floor(Math.random() * (maxAmt - minAmt + 1)) + minAmt;

  const donation = {
    id:          Date.now(),
    name:        bot.botName || '🤖 DonateBot',
    amount,
    message:     typeof msg === 'string' ? msg : (msg.text || ''),
    emotion:     (typeof msg === 'object' ? msg.emotion : null) || 'neutral',
    currency:    cfg.currency,
    ttsProvider: cfg.ttsProvider,
    timestamp:   new Date().toISOString(),
    isBot:       true,
  };

  let audioBase64 = null;
  if (donation.message) {
    try {
      const ttsText = `${donation.name} บริจาค ${donation.amount} ${donation.currency} พร้อมข้อความว่า ${donation.message}`;
      audioBase64 = await generateTTS(cfg, ttsText, donation.emotion);
    } catch (e) { console.error('Bot TTS error:', e.message); }
  }

  saveDonation(donation);
  io.emit('new_donation', { ...donation, audioBase64 });
  console.log(`🤖 Bot fired: "${donation.message}"`);
}

// GET bot status
app.get('/api/bot/status', (req, res) => {
  const bot = loadConfig().bot || {};
  const running   = botTimer !== null;
  const nextFireIn = (running && botLastFireTime && botIntervalMs)
    ? Math.max(0, botIntervalMs - (Date.now() - botLastFireTime))
    : null;
  res.json({
    running,
    enabled:         !!bot.enabled,
    intervalMinutes: bot.intervalMinutes || 5,
    botName:         bot.botName || '🤖 DonateBot',
    messageCount:    (bot.messages || []).length,
    nextFireIn,
  });
});

app.post('/api/bot/start', (req, res) => {
  startBot();
  res.json({ ok: true, running: botTimer !== null });
});

app.post('/api/bot/stop', (req, res) => {
  stopBot();
  res.json({ ok: true, running: false });
});

app.post('/api/bot/fire', async (req, res) => {
  await fireBotDonation();
  res.json({ ok: true });
});

// ─── Socket ──────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎉 Donation Server running!\n   Donate page  : http://localhost:${PORT}/donate.html\n   Overlay (OBS) : http://localhost:${PORT}/overlay.html\n   Dashboard     : http://localhost:${PORT}/dashboard.html\n`);
  // Auto-start bot if it was enabled
  const botCfg = loadConfig().bot;
  if (botCfg?.enabled && botCfg?.messages?.length) startBot(botCfg);
});
