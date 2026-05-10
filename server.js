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

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: allowedOrigins.length ? { origin: allowedOrigins } : { origin: '*' },
  transports: ['websocket', 'polling'],
});

app.use(cors(
  allowedOrigins.length
    ? { origin: (origin, cb) => { if (!origin || allowedOrigins.includes(origin)) cb(null, true); else cb(new Error('CORS not allowed')); } }
    : {}
));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/donate.html'));

const CONFIG_FILE    = path.join(__dirname, 'config.json');
const DONATIONS_FILE = path.join(__dirname, 'donations.json');

// ── In-memory set of recently-verified slip refs ──────────────────────────────
// Prevents the same slip being verified twice in the gap before a donation is saved
const recentlyVerifiedRefs = new Map();   // transRef → verifiedAt (ms)
const SLIP_LOCK_MS = 60 * 60 * 1000;     // 1 hour lock window

const DEFAULTS = {
  theme: 'purple-galaxy',
  ttsProvider: 'elevenlabs',
  minDonate: 20,
  currency: 'THB',
  streamTitle: 'Stream Donation',
  alertDuration: 8,
  elevenLabsKey: '',
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  modelId: 'eleven_v3',
  elevenLabsStyle: 0.45,             // 0-1: expressiveness (0=stable, 1=very expressive) — eleven_v3 only
  googleTtsKey: '',
  geminiApiKey: '',                  // Google AI Studio key (aistudio.google.com) — required for Gemini TTS
  googleTtsModel: '',               // '' = legacy Neural2  |  'gemini-2.5-flash-preview-tts' etc. = Gemini TTS
  googleTtsGeminiMin: 50,           // donations >= this amount use Gemini; below uses legacy (free)
  googleVoice: 'Kore',              // Gemini voice name
  googleLegacyVoice: 'th-TH-Neural2-C',  // Neural2 voice for small donations (free tier)
  googleLang: 'th-TH',
  geminiTtsStyle: '',               // optional style instruction prepended to Gemini TTS text
  bot: {
    enabled: false,
    intervalMinutes: 5,
    botName: '🤖 DonateBot',
    minAmount: 20,
    maxAmount: 99,
    messages: [
      { id:1, text:'วันนี้สตรีมถึงกี่โมงครับ?' },
      { id:2, text:'ชื่นชอบเกมนี้ยังไงบ้างครับ?' },
      { id:3, text:'เล่นเกมนี้มากี่ปีแล้วครับ?' },
      { id:4, text:'มีแผนอะไรสนุกๆ ในสตรีมวันนี้ไหมครับ?' },
      { id:5, text:'ตอนนี้อยู่ส่วนไหนของเกมครับ?' },
      { id:6, text:'ทำไมถึงชอบเกมประเภทนี้ครับ?' },
      { id:7, text:'มี tips อะไรสำหรับมือใหม่ไหมครับ?' },
      { id:8, text:'เกมนี้ยากแค่ไหนครับ เทียบกับเกมอื่นๆ?' },
    ],
  },
  // ── Slip Verification ──
  easySlipKey:        '',
  easySlipApiVersion: 'v1',  // 'v1' = multipart file upload, 'v2' = JSON base64
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
  // ── Donation Tiers ──
  tiers: [
    { id:'basic', minAmount:0,   name:'ทั่วไป',  color:'#6b7280', icon:'💝', animation:'slideUp',  features:[] },
    { id:'nice',  minAmount:20,  name:'น้ำใจ',    color:'#7c3aed', icon:'💜', animation:'bounceIn', features:['emoji'] },
    { id:'good',  minAmount:50,  name:'ใจดี',     color:'#3b82f6', icon:'💙', animation:'sparkle',  features:['emoji'] },
    { id:'super', minAmount:100, name:'ซูเปอร์',  color:'#10b981', icon:'💚', animation:'burst',    features:['emoji','longMsg'] },
    { id:'vip',   minAmount:200, name:'วีไอพี',   color:'#f59e0b', icon:'👑', animation:'vip',      features:['emoji','longMsg','vip'] },
    { id:'boss',  minAmount:500, name:'บอส',      color:'#ef4444', icon:'🔥', animation:'boss',     features:['emoji','longMsg','vip','boss'] },
  ],
  // ── TTS Read Settings ──
  ttsRead: {
    name:    true,
    amount:  true,
    message: true,
  },
  // ── Lock Amount ──
  lockAmount: false,
  // ── Overlay Position ──
  overlayPosition: 'bottom-center', // top-left/top-center/top-right/middle-*/bottom-*
  // ── Epic Alerts ──
  epicAlert: {
    enabled:   false,
    minAmount: 50,
    style:     'random',  // 'random' | '1'-'5'
  },
  // ── Webhook ──
  webhook: {
    enabled: false,
    url:     '',
    secret:  '',  // HMAC-SHA256 signing secret (optional)
  },
};


function deepMerge(base, saved) {
  return {
    ...base,
    ...saved,
    bot: {
      ...base.bot,
      ...(saved.bot || {}),
      messages: saved.bot?.messages ?? base.bot.messages,
    },
    slipVerify: { ...base.slipVerify, ...(saved.slipVerify || {}) },
    paymentAccounts: {
      ...base.paymentAccounts,
      ...(saved.paymentAccounts || {}),
      accounts: saved.paymentAccounts?.accounts ?? [],
    },
    tiers:      saved.tiers ?? base.tiers,
    ttsRead:    { ...base.ttsRead,    ...(saved.ttsRead    || {}) },
    epicAlert:  { ...base.epicAlert,  ...(saved.epicAlert  || {}) },
    webhook:    { ...base.webhook,    ...(saved.webhook    || {}) },
  };
}

function loadConfig() {
  const e = process.env;

  // ── Priority 1: CONFIG env var (full JSON, set via Railway Variables) ──
  // This is the recommended way to persist ALL settings on Railway.
  // Export from Dashboard → "📋 Copy Raw Config" button.
  let base = JSON.parse(JSON.stringify(DEFAULTS));
  if (e.CONFIG) {
    try {
      const fromEnv = JSON.parse(e.CONFIG);
      base = deepMerge(base, fromEnv);
    } catch(err) {
      console.error('⚠️  CONFIG env var is not valid JSON, ignoring:', err.message);
    }
  }

  // ── Priority 2: config.json on disk (overrides CONFIG env var) ──
  let cfg;
  if (!fs.existsSync(CONFIG_FILE)) {
    cfg = base;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } else {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE));
      cfg = deepMerge(base, saved);
    } catch (err) {
      console.error('⚠️  config.json is corrupted, resetting to defaults:', err.message);
      try { fs.renameSync(CONFIG_FILE, CONFIG_FILE + '.bak'); } catch (_) {}
      cfg = base;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    }
  }

  // ── Priority 3: individual env vars (highest priority, override everything) ──
  if (e.EASYSLIP_KEY)            cfg.easySlipKey        = e.EASYSLIP_KEY;
  if (e.EASYSLIP_API_VERSION)    cfg.easySlipApiVersion = e.EASYSLIP_API_VERSION;
  if (e.ELEVENLABS_API_KEY)      cfg.elevenLabsKey      = e.ELEVENLABS_API_KEY;
  if (e.ELEVEN_VOICE_ID)         cfg.voiceId            = e.ELEVEN_VOICE_ID;
  if (e.ELEVEN_MODEL_ID)         cfg.modelId            = e.ELEVEN_MODEL_ID;
  if (e.GOOGLE_TTS_KEY)          cfg.googleTtsKey       = e.GOOGLE_TTS_KEY;
  if (e.GEMINI_API_KEY)          cfg.geminiApiKey       = e.GEMINI_API_KEY;
  if (e.GOOGLE_VOICE)            cfg.googleVoice        = e.GOOGLE_VOICE;
  if (e.GOOGLE_LANG)             cfg.googleLang         = e.GOOGLE_LANG;
  if (e.TTS_PROVIDER)            cfg.ttsProvider        = e.TTS_PROVIDER;
  if (e.MIN_DONATE)              cfg.minDonate          = Number(e.MIN_DONATE);
  if (e.CURRENCY)                cfg.currency           = e.CURRENCY;
  if (e.STREAM_TITLE)            cfg.streamTitle        = e.STREAM_TITLE;
  if (e.ALERT_DURATION)          cfg.alertDuration      = Number(e.ALERT_DURATION);
  if (e.THEME)                   cfg.theme              = e.THEME;

  return cfg;
}

function buildTtsText(cfg, donation) {
  const r = cfg.ttsRead || {};
  const parts = [];
  if (r.name    !== false && donation.name)    parts.push(donation.name);
  if (r.amount  !== false && donation.amount)  parts.push(`บริจาค ${donation.amount} ${donation.currency || 'THB'}`);
  if (r.message !== false && donation.message) parts.push(`พร้อมข้อความว่า ${donation.message}`);
  return parts.join(' ') || donation.message || '';
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
    geminiApiKey:  !!e.GEMINI_API_KEY,
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
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}

function loadDonations() {
  if (!fs.existsSync(DONATIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(DONATIONS_FILE));
}

function saveDonation(d) {
  const list = loadDonations();
  list.unshift(d);
  const tmp = DONATIONS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, 500), null, 2));
  fs.renameSync(tmp, DONATIONS_FILE);
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

const crypto = require('crypto');

async function dispatchWebhook(event, data) {
  const cfg = loadConfig();
  if (!cfg.webhook?.enabled || !cfg.webhook?.url) return;
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  const headers = { 'Content-Type': 'application/json', 'X-Stream-Donate-Event': event };
  if (cfg.webhook.secret) {
    const sig = crypto.createHmac('sha256', cfg.webhook.secret).update(payload).digest('hex');
    headers['X-Stream-Donate-Signature'] = `sha256=${sig}`;
  }
  try {
    const r = await fetch(cfg.webhook.url, { method: 'POST', headers, body: payload });
    console.log(`[Webhook] ${event} → ${cfg.webhook.url} (${r.status})`);
  } catch (e) {
    console.error(`[Webhook] ${event} failed:`, e.message);
  }
}

// ─── Queue Pause State ────────────────────────────────────────────────────────

let queuePaused = false;

// ─── Auth & Rate Limiting ────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next(); // ถ้าไม่ได้ตั้ง ADMIN_TOKEN → เปิดอยู่ (แจ้งเตือนตอน startup)
  const provided = req.headers['x-admin-token'] || req.query.token;
  if (provided !== token) return res.status(403).json({ error: 'Unauthorized — ต้องใช้ ADMIN_TOKEN' });
  next();
}

const _rateLimitMap = new Map();
function makeRateLimit(windowMs, max) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const hits = (_rateLimitMap.get(key) || []).filter(t => now - t < windowMs);
    hits.push(now);
    _rateLimitMap.set(key, hits);
    if (hits.length > max) return res.status(429).json({ error: 'Too many requests — กรุณารอสักครู่' });
    next();
  };
}
const limitDonate = makeRateLimit(60_000, 10);  // 10 ครั้ง/นาที
const limitTts    = makeRateLimit(60_000, 15);  // 15 ครั้ง/นาที

// ─── TTS Helper ─────────────────────────────────────────────────────────────

// Strip [action] stage-direction tags — used for providers that don't support them
function stripActionTags(text) {
  return text.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

// Map donor-chosen style to provider-specific prefix/tag
// elevenTag  → prepended to text for eleven_v3 (supports action tags)
// geminiPrefix → natural-language instruction prepended for Gemini TTS
const STYLE_MAP = {
  // ── Positive / Upbeat ───────────────────────────────────────────────────────
  excited:    { elevenTag: '[excited] ',     geminiPrefix: 'Speak with excitement and high energy: ' },
  happy:      { elevenTag: '[laughs] ',      geminiPrefix: 'Speak cheerfully and joyfully: ' },
  cheerful:   { elevenTag: '',               geminiPrefix: 'Speak in an upbeat, bubbly, cheerful tone: ' },
  proud:      { elevenTag: '',               geminiPrefix: 'Speak with confidence and pride: ' },
  romantic:   { elevenTag: '',               geminiPrefix: 'Speak in a warm, tender, romantic tone: ' },
  cute:       { elevenTag: '',               geminiPrefix: 'Speak in an adorable, sweet, cute tone: ' },
  heartfelt:  { elevenTag: '',               geminiPrefix: 'Speak warmly and with heartfelt sincerity: ' },
  // ── Negative / Emotional ────────────────────────────────────────────────────
  sad:        { elevenTag: '[sighs] ',       geminiPrefix: 'Speak with sadness and deep emotion: ' },
  crying:     { elevenTag: '[sobbing] ',     geminiPrefix: 'Speak while crying, voice trembling with emotion: ' },
  angry:      { elevenTag: '[angry] ',       geminiPrefix: 'Speak with frustration and restrained anger: ' },
  scared:     { elevenTag: '[gasps] ',       geminiPrefix: 'Speak in a fearful, trembling, scared voice: ' },
  nervous:    { elevenTag: '',               geminiPrefix: 'Speak nervously and anxiously, with hesitation: ' },
  // ── Surprised / Dramatic ────────────────────────────────────────────────────
  surprised:  { elevenTag: '[gasps] ',       geminiPrefix: 'Speak with genuine surprise and astonishment: ' },
  dramatic:   { elevenTag: '',               geminiPrefix: 'Speak in an extremely dramatic, theatrical way: ' },
  epic:       { elevenTag: '',               geminiPrefix: 'Speak in a grand, powerful, cinematic epic tone: ' },
  // ── Playful / Comic ─────────────────────────────────────────────────────────
  funny:      { elevenTag: '[laughs] ',      geminiPrefix: 'Speak in a humorous and playful tone: ' },
  sarcastic:  { elevenTag: '',               geminiPrefix: 'Speak sarcastically with dry ironic humor: ' },
  // ── Calm / Quiet ────────────────────────────────────────────────────────────
  whisper:    { elevenTag: '[whispering] ',  geminiPrefix: 'Speak in a soft, intimate whisper: ' },
  mysterious: { elevenTag: '[whispering] ',  geminiPrefix: 'Speak in a mysterious, enigmatic, low tone: ' },
  sleepy:     { elevenTag: '[yawns] ',       geminiPrefix: 'Speak in a slow, drowsy, half-asleep tone: ' },
};

// All style keys that can be chosen randomly (excludes '' / normal)
const STYLE_KEYS = Object.keys(STYLE_MAP);

// Wrap raw PCM audio (from Gemini API) in a WAV container for browser playback
// Gemini TTS returns s16le PCM at 24 kHz mono
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
  const dataSize   = pcmBuffer.length;
  const byteRate   = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  const header     = Buffer.alloc(44);
  header.write('RIFF',                 0, 'ascii');
  header.writeUInt32LE(36 + dataSize,  4);
  header.write('WAVE',                 8, 'ascii');
  header.write('fmt ',                12, 'ascii');
  header.writeUInt32LE(16,            16);   // PCM sub-chunk size
  header.writeUInt16LE(1,             20);   // AudioFormat = PCM
  header.writeUInt16LE(numChannels,   22);
  header.writeUInt32LE(sampleRate,    24);
  header.writeUInt32LE(byteRate,      28);
  header.writeUInt16LE(blockAlign,    32);
  header.writeUInt16LE(bitDepth,      34);
  header.write('data',                36, 'ascii');
  header.writeUInt32LE(dataSize,      40);
  return Buffer.concat([header, pcmBuffer]);
}

// amount = donation amount; used by Google TTS for tiered model selection
// ttsStyle = donor-chosen style key (e.g. 'excited', 'sad') — applied per provider
// Returns base64 string (MP3 for ElevenLabs/Neural2, WAV for Gemini)
async function generateTTS(cfg, text, amount = 0, ttsStyle = '') {
  const provider = cfg.ttsProvider || 'elevenlabs';
  // 'random' → pick a random style from STYLE_KEYS each call
  const resolvedStyle = ttsStyle === 'random'
    ? STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)]
    : ttsStyle;
  const styleInfo = STYLE_MAP[resolvedStyle] || {};

  // ── ElevenLabs ──
  // eleven_v3 supports [laughs] [sighs] [gasps] etc.; earlier models do not
  if (provider === 'elevenlabs') {
    if (!cfg.elevenLabsKey) return null;
    // Prepend action tag for selected style (eleven_v3 only; ignored on older models)
    const styledText = styleInfo.elevenTag ? styleInfo.elevenTag + text : text;
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`,
      {
        text: styledText,
        model_id: cfg.modelId || 'eleven_v3',
        voice_settings: {
          stability:        0.5,
          similarity_boost: 0.75,
          // style 0-1: expressiveness level — higher = more emotional/varied delivery
          style:            Number(cfg.elevenLabsStyle) >= 0 ? Number(cfg.elevenLabsStyle) : 0.45,
          use_speaker_boost: true,
        },
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

    const geminiModel = cfg.googleTtsModel || '';
    const geminiMin   = Number(cfg.googleTtsGeminiMin) >= 0 ? Number(cfg.googleTtsGeminiMin) : 50;
    // Use Gemini only when model is configured AND donation meets the threshold
    const useGemini   = geminiModel.startsWith('gemini') && amount >= geminiMin;

    const voiceName   = useGemini
      ? (cfg.googleVoice       || 'Kore')
      : (cfg.googleLegacyVoice || 'th-TH-Neural2-C');

    console.log(`[TTS] Google ${useGemini ? `Gemini(${geminiModel})` : 'Neural2'} | ฿${amount} | voice:${voiceName}`);

    // ── Gemini TTS — Google AI Studio API (generativelanguage.googleapis.com) ──
    // Requires a Gemini API key from aistudio.google.com (different from Cloud TTS key)
    // Cloud TTS API keys cannot auth Vertex AI predictions — use Generative Language API instead
    // Returns raw PCM → we wrap it in WAV for browser playback
    if (useGemini) {
      const geminiKey = cfg.geminiApiKey || '';
      if (!geminiKey) {
        console.error('[TTS] Gemini TTS requires a Gemini API key (geminiApiKey). Get one free at aistudio.google.com');
        throw new Error('Gemini API key (geminiApiKey) not configured — get one free at aistudio.google.com');
      }
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
          {
            // Build instruction: donor style > global config style > plain text
        contents: [{ parts: [{ text:
          styleInfo.geminiPrefix  ? styleInfo.geminiPrefix + text :
          cfg.geminiTtsStyle      ? `${cfg.geminiTtsStyle}: ${text}` :
          text
        }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey,
            },
          }
        );
        const inlineData = res.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!inlineData?.data) throw new Error('Gemini TTS: ไม่ได้รับข้อมูลเสียงในการตอบกลับ');
        // Convert raw PCM → WAV so browsers can play it
        const pcmBuffer  = Buffer.from(inlineData.data, 'base64');
        const wavBuffer  = pcmToWav(pcmBuffer);
        return wavBuffer.toString('base64');
      } catch (e) {
        const errDetail = e.response?.data?.error;
        console.error('[TTS] Gemini error:', errDetail?.message || e.message, '| status:', e.response?.status);
        throw e;
      }
    }

    // ── Legacy Neural2 / WaveNet — Cloud TTS API (free tier, no action tags) ──
    const inputText = stripActionTags(text);
    try {
      const res = await axios.post(
        'https://texttospeech.googleapis.com/v1/text:synthesize',
        {
          input: { text: inputText },
          voice: { languageCode: cfg.googleLang || 'th-TH', name: voiceName },
          audioConfig: { audioEncoding: 'MP3' },
        },
        { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.googleTtsKey } }
      );
      return res.data.audioContent || null;
    } catch (e) {
      const errDetail = e.response?.data?.error;
      console.error('[TTS] Neural2 error:', errDetail?.message || e.message, '| status:', e.response?.status);
      throw e;
    }
  }

  return null;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/config/export — returns full config as Railway Raw env var string
// Usage: copy the value of CONFIG= and paste into Railway → Variables → Raw Editor
app.get('/api/config/export', requireAuth, (req, res) => {
  const cfg = loadConfig();
  // Strip nothing — export full config including API keys (for Railway secure storage)
  const json = JSON.stringify(cfg);
  const raw  = `CONFIG=${json}`;
  res.type('text/plain').send(raw);
});

app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({
    ...cfg,
    elevenLabsKey:        cfg.elevenLabsKey ? '***hidden***' : '',
    googleTtsKey:         cfg.googleTtsKey  ? '***hidden***' : '',
    easySlipKey:          cfg.easySlipKey   ? '***hidden***' : '',
    easySlipApiVersion:   cfg.easySlipApiVersion || 'v1',
    elevenLabsAvailable:  !!cfg.elevenLabsKey,
    googleTtsAvailable:   !!cfg.googleTtsKey,
    easySlipAvailable:    !!cfg.easySlipKey,
    // Gate enabled = just needs slipVerify.enabled (no API key required for manual mode)
    slipGateEnabled:      !!(cfg.slipVerify?.enabled),
    slipAutoVerify:       !!(cfg.easySlipKey && cfg.slipVerify?.enabled),
    tiers:      cfg.tiers,
    ttsRead:    cfg.ttsRead,
    lockAmount: cfg.lockAmount,
    _envFlags: getEnvFlags(),
  });
});

app.get('/api/config/full', requireAuth, (req, res) => {
  res.json({ ...loadConfig(), _envFlags: getEnvFlags() });
});

// POST /api/config/reset — wipe config.json and reload from CONFIG env var
// Use this when you've updated CONFIG in Railway Variables and want it applied NOW
// without waiting for a fresh redeploy
app.post('/api/config/reset', requireAuth, (req, res) => {
  try {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
    const cfg = loadConfig();   // recreates config.json from CONFIG env var + DEFAULTS
    res.json({ ok: true, message: 'config.json ถูกรีเซ็ตและโหลดจาก CONFIG env var แล้ว', cfg: { theme: cfg.theme, ttsProvider: cfg.ttsProvider } });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/config/import — full replace from an exported JSON file
// Unlike /api/config (partial merge), this starts from DEFAULTS then overlays the imported data.
// API keys present in the file are accepted; missing keys fall back to the current saved value
// so you never accidentally wipe a key just because the export was done on a machine that masked it.
app.post('/api/config/import', requireAuth, (req, res) => {
  try {
    const current = loadConfig();
    const body    = { ...req.body };

    // Strip internal metadata fields added by the exporter
    delete body._exportedAt;
    delete body._version;

    // Protect secret fields — if the imported file has '***hidden***' keep what we have now
    const SECRET_FIELDS = ['elevenLabsKey', 'googleTtsKey', 'geminiApiKey', 'easySlipKey'];
    for (const field of SECRET_FIELDS) {
      if (!body[field] || body[field] === '***hidden***') body[field] = current[field];
    }

    // Start from DEFAULTS so any schema additions in new versions are filled in
    let updated = { ...DEFAULTS, ...body };

    // Deep-merge sub-objects
    updated.bot = { ...(DEFAULTS.bot || {}), ...(body.bot || {}) };
    if (body.bot?.messages !== undefined) updated.bot.messages = body.bot.messages;

    updated.slipVerify = {
      ...(DEFAULTS.slipVerify || {}),
      ...(body.slipVerify || {}),
    };

    updated.paymentAccounts = {
      ...(DEFAULTS.paymentAccounts || {}),
      ...(body.paymentAccounts || {}),
      accounts: body.paymentAccounts?.accounts ?? DEFAULTS.paymentAccounts?.accounts ?? [],
    };

    saveConfig(updated);

    // Apply bot state immediately
    updated.bot?.enabled ? startBot(updated.bot) : stopBot();

    res.json({ ok: true, message: 'Import สำเร็จ' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/config', requireAuth, (req, res) => {
  const current = loadConfig();
  const body    = { ...req.body };

  // Never overwrite secret API keys with the masked '***hidden***' placeholder
  // (Dashboard sends this back when the key came from an env var and was never shown)
  const SECRET_FIELDS = ['elevenLabsKey', 'googleTtsKey', 'geminiApiKey', 'easySlipKey'];
  for (const field of SECRET_FIELDS) {
    if (body[field] === '***hidden***') body[field] = current[field];
    // Empty string means "clear the key" — keep that behaviour
  }

  let updated = { ...current, ...body };
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
app.post('/api/donate', limitDonate, async (req, res) => {
  const cfg = loadConfig();
  const { name, amount, message, ttsProvider: donorProvider, slipRef, epicStyle, ttsStyle } = req.body;

  if (!name || !amount) return res.status(400).json({ error: 'Name and amount required' });
  const MAX_AMOUNT = 999999;
  const MAX_NAME   = 100;
  const MAX_MSG    = 500;
  if (Number(amount) < cfg.minDonate) {
    return res.status(400).json({ error: `Minimum donation is ${cfg.minDonate} ${cfg.currency}` });
  }
  if (Number(amount) > MAX_AMOUNT) return res.status(400).json({ error: `ยอดบริจาคสูงสุดคือ ${MAX_AMOUNT.toLocaleString()}` });
  if (name.length > MAX_NAME) return res.status(400).json({ error: `ชื่อต้องไม่เกิน ${MAX_NAME} ตัวอักษร` });
  if (message && message.length > MAX_MSG) return res.status(400).json({ error: `ข้อความต้องไม่เกิน ${MAX_MSG} ตัวอักษร` });
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
    currency: cfg.currency,
    ttsProvider: resolvedProvider,
    ttsStyle:    (ttsStyle || '').trim(),
    slipRef: slipRef || null,
    epicStyle: epicStyle || null,
    timestamp: new Date().toISOString(),
  };

  let audioBase64 = null;
  const ttsText = buildTtsText(cfg, donation);
  if (ttsText) {
    try {
      audioBase64 = await generateTTS({ ...cfg, ttsProvider: resolvedProvider }, ttsText, donation.amount, donation.ttsStyle);
    } catch (e) {
      console.error('TTS error:', e.response?.data || e.message);
    }
  }

  const donationTiers = cfg.tiers || [];
  const tier = [...donationTiers].reverse().find(t => donation.amount >= t.minAmount) || donationTiers[0] || { id:'basic', animation:'slideUp' };

  saveDonation(donation);
  io.emit('new_donation', { ...donation, audioBase64, tier });
  dispatchWebhook('donation.new', donation).catch(() => {});
  res.json({ ok: true, donation });
});

// POST test alert
app.post('/api/test-alert', requireAuth, limitTts, async (req, res) => {
  const cfg = loadConfig();
  const { name, amount, message, ttsOnly = false, forceAnimation, epicStyle, forceEpic = false } = req.body;

  const donation = {
    id: Date.now(),
    name:    (name    || 'ทดสอบระบบ').trim(),
    amount:  Number(amount) || 99,
    message: message !== undefined ? String(message).trim() : 'สวัสดีครับ ขอบคุณสำหรับสตรีมดีๆ!',
    currency: cfg.currency,
    ttsProvider: cfg.ttsProvider,
    timestamp: new Date().toISOString(),
    isTest:    true,
    epicStyle: epicStyle || null,
    forceEpic: !!forceEpic,
  };

  let audioBase64 = null;
  const ttsTextTest = buildTtsText(cfg, donation);
  if (ttsTextTest) {
    try {
      audioBase64 = await generateTTS(cfg, ttsTextTest, donation.amount, donation.ttsStyle || '');
    } catch (e) {
      console.error('TTS test error:', e.response?.data || e.message);
    }
  }

  // ttsOnly: generate TTS but don't show overlay
  if (ttsOnly) {
    return res.json({ ok: true, audioBase64 });
  }

  const testTiers = cfg.tiers || [];
  let testTier = [...testTiers].reverse().find(t => donation.amount >= t.minAmount) || testTiers[0] || { id:'basic', animation:'slideUp' };
  if (forceAnimation) testTier = { ...testTier, animation: forceAnimation };

  io.emit('new_donation', { ...donation, audioBase64, tier: testTier });
  res.json({ ok: true });
});

// POST rerun donation by id — re-emit existing donation with fresh TTS
app.post('/api/rerun/:id', requireAuth, async (req, res) => {
  const cfg  = loadConfig();
  const list = loadDonations();
  const donation = list.find(d => String(d.id) === String(req.params.id));
  if (!donation) return res.status(404).json({ error: 'ไม่พบรายการ' });

  let audioBase64 = null;
  const ttsText = buildTtsText(cfg, donation);
  if (ttsText) {
    try { audioBase64 = await generateTTS(cfg, ttsText, donation.amount, donation.ttsStyle || ''); }
    catch(e) { console.error('Rerun TTS error:', e.message); }
  }

  const donationTiers = cfg.tiers || [];
  const tier = [...donationTiers].reverse().find(t => donation.amount >= t.minAmount) || donationTiers[0] || { id:'basic', animation:'slideUp' };

  io.emit('new_donation', { ...donation, audioBase64, tier, isRerun: true });
  res.json({ ok: true });
});

// POST verify slip — auto via EasySlip if key configured, else manual mode
app.post('/api/verify-slip', (req, res, next) => {
  // Run multer first, then handle in async function
  upload.single('slip')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'ไฟล์ไม่ถูกต้อง' });
    }

    const cfg = loadConfig();

    if (!req.file) {
      return res.status(400).json({ error: 'ไม่พบไฟล์สลิป กรุณาแนบรูปสลิป' });
    }

    // ── Manual mode: no EasySlip key configured ────────────────
    if (!cfg.easySlipKey) {
      // Just acknowledge the upload — amount will be entered manually
      return res.json({
        ok:          true,
        mode:        'manual',
        message:     'อัปโหลดสลิปสำเร็จ — กรุณาใส่จำนวนเงินด้วยตนเอง',
        minAmountForTts: cfg.slipVerify?.minAmountForTts ?? 20,
      });
    }

    // ── Auto mode: verify via EasySlip API ────────────────────
    // Both v1 and v2 use multipart/form-data with field name "file"
    // v1: developer.easyslip.com/api/v1/verify
    // v2: api.easyslip.com/v2/verify/bank
    try {
      const useV2 = cfg.easySlipApiVersion === 'v2';
      const endpoint = useV2
        ? 'https://api.easyslip.com/v2/verify/bank'
        : 'https://developer.easyslip.com/api/v1/verify';

      const formData = new FormData();
      formData.append(
        'file',
        new Blob([req.file.buffer], { type: req.file.mimetype }),
        req.file.originalname || 'slip.jpg'
      );

      console.log(`📋 Sending slip to EasySlip API ${useV2 ? 'v2' : 'v1'}, size: ${req.file.size} bytes`);

      const response = await fetch(endpoint, {
        method:  'POST',
        headers: { Authorization: `Bearer ${cfg.easySlipKey}` },
        body:    formData,
      });

      let json;
      try { json = await response.json(); }
      catch(e) {
        const text = await response.text().catch(() => '');
        console.error('EasySlip non-JSON response:', text);
        return res.status(502).json({ error: 'EasySlip ตอบกลับไม่ถูกต้อง: ' + text.slice(0, 200) });
      }

      console.log('📋 EasySlip response status:', json.status, '| HTTP:', response.status);
      console.log('📋 EasySlip raw response:', JSON.stringify(json).slice(0, 500));

      // v2 uses { success: true, data: {...} }, v1 uses { status: 200, data: {...} }
      const isOk = useV2
        ? (json.success === true)
        : (response.ok && (!json.status || json.status === 200));

      if (!isOk) {
        const msg = json.message || json.error?.message || json.error || json.detail || `HTTP ${response.status}`;
        return res.status(400).json({ error: 'EasySlip: ' + msg });
      }

      const slip         = json.data || json || {};
      // v2 response uses slip.data.amount.amount, v1 uses slip.amount.amount
      const amount       = slip.amount?.amount ?? slip.amount?.local?.amount ?? slip.amount ?? 0;
      const transRef     = slip.transRef || slip.ref || slip.transactionRef || '';
      const senderName   = slip.sender?.account?.name?.th || slip.sender?.account?.name?.en || slip.sender?.displayName || 'ไม่ระบุ';
      const receiverName = slip.receiver?.account?.name?.th || slip.receiver?.account?.name?.en || slip.receiver?.displayName || 'ไม่ระบุ';
      const senderBank   = slip.sender?.bank?.name || slip.sender?.bank?.short || '';
      const receiverBank = slip.receiver?.bank?.name || slip.receiver?.bank?.short || '';
      const date         = slip.date || slip.transactionDate || '';

      // ── Duplicate slip check ──────────────────────────────────────────────
      if (transRef) {
        // 1. Check in-memory lock (prevents same slip being verified twice in quick succession)
        const now = Date.now();
        // Clean up expired locks
        for (const [ref, ts] of recentlyVerifiedRefs) {
          if (now - ts > SLIP_LOCK_MS) recentlyVerifiedRefs.delete(ref);
        }
        if (recentlyVerifiedRefs.has(transRef)) {
          return res.status(400).json({ error: `❌ สลิปนี้ถูกใช้ไปแล้ว (ref: ${transRef}) — กรุณาใช้สลิปใหม่` });
        }
        // 2. Check saved donations (persisted history)
        const pastDonations = loadDonations();
        if (pastDonations.some(d => d.slipRef === transRef)) {
          return res.status(400).json({ error: `❌ สลิปนี้ถูกใช้งานไปแล้ว — ไม่สามารถใช้ซ้ำได้ (ref: ${transRef})` });
        }
        // Lock this ref so it can't be verified again within the hour
        recentlyVerifiedRefs.set(transRef, now);
      }

      console.log(`✅ Slip verified: ฿${amount} from ${senderName} (ref: ${transRef})`);

      res.json({
        ok:          true,
        mode:        'auto',
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
      console.error('EasySlip fetch error:', e.message);
      res.status(500).json({ error: 'ไม่สามารถเชื่อมต่อ EasySlip ได้: ' + e.message });
    }
  });
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
      'https://texttospeech.googleapis.com/v1/voices',
      { headers: { 'x-goog-api-key': cfg.googleTtsKey } }
    );
    const voices = (r.data.voices || []).filter(v =>
      v.languageCodes?.some(lc => lc.startsWith('th') || lc.startsWith('en'))
    );
    res.json(voices);
  } catch (e) {
    res.status(500).json({ error: 'Cannot fetch Google voices' });
  }
});

// POST /api/test-tts — generate TTS for a test phrase and return result or error message
// Used by dashboard to diagnose TTS issues without firing an overlay alert
app.post('/api/test-tts', requireAuth, limitTts, async (req, res) => {
  const cfg = loadConfig();
  const { text = 'สวัสดีครับ [laughs] ขอบคุณมากเลยนะครับ', amount = 99 } = req.body;
  try {
    const audioBase64 = await generateTTS(cfg, text, Number(amount));
    if (!audioBase64) {
      return res.json({ ok: false, error: 'TTS ไม่ได้รับข้อมูลเสียงกลับมา — ตรวจสอบ API Key และการตั้งค่า' });
    }
    res.json({ ok: true, audioBase64, provider: cfg.ttsProvider });
  } catch (e) {
    const errDetail = e.response?.data?.error;
    const msg = errDetail?.message || e.message || 'Unknown error';
    const status = e.response?.status || 500;
    console.error('[test-tts] Error:', msg);
    res.json({ ok: false, error: `${msg} (HTTP ${status})`, detail: errDetail });
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

  const epicCfg     = cfg.epicAlert || {};
  const shouldEpic  = epicCfg.enabled && amount >= (Number(epicCfg.minAmount) || 50);

  const donation = {
    id:          Date.now(),
    name:        bot.botName || '🤖 DonateBot',
    amount,
    message:     typeof msg === 'string' ? msg : (msg.text || ''),
    currency:    cfg.currency,
    ttsProvider: cfg.ttsProvider,
    timestamp:   new Date().toISOString(),
    isBot:       true,
    epicStyle:   shouldEpic ? (epicCfg.style || 'random') : null,
  };

  let audioBase64 = null;
  const botTtsText = buildTtsText(cfg, donation);
  if (botTtsText) {
    try {
      audioBase64 = await generateTTS(cfg, botTtsText, donation.amount);
    } catch (e) { console.error('Bot TTS error:', e.message); }
  }

  const botTiers = cfg.tiers || [];
  const botTier = [...botTiers].reverse().find(t => donation.amount >= t.minAmount) || botTiers[0] || { id:'basic', animation:'slideUp' };

  saveDonation(donation);
  io.emit('new_donation', { ...donation, audioBase64, tier: botTier });
  dispatchWebhook('donation.bot', donation).catch(() => {});
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

app.post('/api/bot/start', requireAuth, (req, res) => {
  startBot();
  res.json({ ok: true, running: botTimer !== null });
});

app.post('/api/bot/stop', requireAuth, (req, res) => {
  stopBot();
  res.json({ ok: true, running: false });
});

app.post('/api/bot/fire', requireAuth, async (req, res) => {
  await fireBotDonation();
  res.json({ ok: true });
});

// ─── Queue Pause/Resume ──────────────────────────────────────────────────────

app.get('/api/queue/status', (req, res) => {
  res.json({ paused: queuePaused });
});

app.post('/api/queue/pause', requireAuth, (req, res) => {
  queuePaused = true;
  io.emit('queue_pause');
  res.json({ ok: true, paused: true });
});

app.post('/api/queue/resume', requireAuth, (req, res) => {
  queuePaused = false;
  io.emit('queue_resume');
  res.json({ ok: true, paused: false });
});

// ─── Webhook Test ─────────────────────────────────────────────────────────────

app.post('/api/webhook/test', requireAuth, async (req, res) => {
  try {
    await dispatchWebhook('test', { message: 'Webhook test from Stream Donate', timestamp: new Date().toISOString() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Socket ──────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎉 Donation Server running!\n   Donate page  : http://localhost:${PORT}/donate.html\n   Overlay (OBS) : http://localhost:${PORT}/overlay.html\n   Dashboard     : http://localhost:${PORT}/dashboard.html\n`);
  if (!process.env.ADMIN_TOKEN) {
    console.warn('⚠️  ADMIN_TOKEN ไม่ได้ตั้งค่า — endpoint /api/config และ /api/bot เปิดให้เข้าถึงได้โดยไม่ต้องยืนยันตัวตน!');
  }
  if (allowedOrigins.length) {
    console.log(`🔒 CORS จำกัดเฉพาะ: ${allowedOrigins.join(', ')}`);
  }
  // Auto-start bot if it was enabled
  const botCfg = loadConfig().bot;
  if (botCfg?.enabled && botCfg?.messages?.length) startBot(botCfg);
});
