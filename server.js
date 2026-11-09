import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const ttsRequests = new Map();
const PORT = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH = 'https://graph.threads.net/v1.0';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.warn('WARNING: Set SESSION_SECRET to a random value at least 32 characters long in hosting environment variables.');
}
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'threads_studio_sid',
  secret: SESSION_SECRET || crypto.randomBytes(48).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: 'auto', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || body?.error_description || `API request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
};

const isThreadsHost = (hostname) => ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'].includes(hostname.toLowerCase());
const normalizePath = (value) => {
  const u = new URL(value);
  return u.pathname.replace(/\/+$/, '');
};

// Resolve a Threads share URL safely. Redirects are followed only when every hop remains on Threads.
async function resolveThreadsLink(raw) {
  let current;
  try { current = new URL(raw); } catch { throw new Error('Link không hợp lệ. Hãy dán đường link Threads đầy đủ.'); }
  if (!isThreadsHost(current.hostname) || current.protocol !== 'https:') {
    throw new Error('Chỉ chấp nhận link HTTPS thuộc threads.net hoặc threads.com.');
  }
  for (let i = 0; i < 6; i++) {
    const response = await fetch(current, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'ThreadsStudio/1.0' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      const next = new URL(location, current);
      if (!isThreadsHost(next.hostname) || next.protocol !== 'https:') throw new Error('Link chuyển hướng ra ngoài Threads nên đã bị chặn.');
      current = next;
      continue;
    }
    break;
  }
  return current.toString();
}

async function graphGet(pathAndQuery, accessToken) {
  const url = new URL(`${GRAPH}/${pathAndQuery.replace(/^\//, '')}`);
  url.searchParams.set('access_token', accessToken);
  return fetchJson(url);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    threadsConfigured: Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET && process.env.THREADS_REDIRECT_URI),
    voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ADAM_VOICE_ID),
    features: { threadsReplies: 'requires Meta OAuth + threads_read_replies', adamTts: 'requires an authorized ElevenLabs API credential', videoExport: 'WebM in supported browsers; MP4 is not enabled in this build' }
  });
});

app.get('/api/me', (req, res) => {
  res.json({ connected: Boolean(req.session.threads?.accessToken), username: req.session.threads?.username || null });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/auth/threads', (req, res) => {
  const { THREADS_APP_ID, THREADS_REDIRECT_URI } = process.env;
  if (!THREADS_APP_ID || !THREADS_REDIRECT_URI) return res.status(503).send('Máy chủ chưa được cấu hình THREADS_APP_ID và THREADS_REDIRECT_URI.');
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const authorize = new URL('https://threads.net/oauth/authorize');
  authorize.searchParams.set('client_id', THREADS_APP_ID);
  authorize.searchParams.set('redirect_uri', THREADS_REDIRECT_URI);
  authorize.searchParams.set('scope', 'threads_basic,threads_read_replies');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('state', state);
  res.redirect(authorize.toString());
});

app.get('/auth/threads/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) throw new Error(String(error_description || error));
    if (!code || !state || state !== req.session.oauthState) throw new Error('OAuth state không hợp lệ hoặc đã hết hạn. Hãy kết nối lại.');
    delete req.session.oauthState;
    const form = new URLSearchParams({
      client_id: process.env.THREADS_APP_ID,
      client_secret: process.env.THREADS_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: process.env.THREADS_REDIRECT_URI,
      code: String(code)
    });
    const shortToken = await fetchJson('https://graph.threads.net/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
    });
    let token = shortToken.access_token;
    try {
      const exchange = new URL('https://graph.threads.net/access_token');
      exchange.searchParams.set('grant_type', 'th_exchange_token');
      exchange.searchParams.set('client_secret', process.env.THREADS_APP_SECRET);
      exchange.searchParams.set('access_token', token);
      const longToken = await fetchJson(exchange);
      if (longToken.access_token) token = longToken.access_token;
    } catch (exchangeError) {
      console.warn('Long-lived token exchange failed; retaining short-lived token:', exchangeError.message);
    }
    const profile = await graphGet('me?fields=id,username', token);
    req.session.threads = { accessToken: token, userId: profile.id, username: profile.username, connectedAt: Date.now() };
    res.redirect('/?connected=1');
  } catch (error) {
    console.error('Threads OAuth callback:', error.message);
    res.status(400).send(`Không thể kết nối Threads: ${escapeHtml(error.message)}. Quay lại trang chính và thử kết nối lại.`);
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function listOwnPosts(accessToken) {
  const fields = 'id,permalink,text,timestamp';
  let url = new URL(`${GRAPH}/me/threads`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', accessToken);
  const all = [];
  for (let page = 0; page < 10 && url; page++) {
    const data = await fetchJson(url);
    all.push(...(data.data || []));
    url = data.paging?.next ? new URL(data.paging.next) : null;
  }
  return all;
}

app.post('/api/replies', async (req, res) => {
  try {
    const token = req.session.threads?.accessToken;
    if (!token) return res.status(401).json({ error: 'Bạn cần kết nối Threads trước.' });
    const raw = String(req.body?.url || '').trim();
    if (!raw) return res.status(400).json({ error: 'Hãy dán link bài viết Threads.' });
    const resolved = await resolveThreadsLink(raw);
    const linkPath = normalizePath(resolved);
    const posts = await listOwnPosts(token);
    const post = posts.find(item => {
      if (!item.permalink) return false;
      try { return normalizePath(item.permalink) === linkPath; } catch { return false; }
    });
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài này trong danh sách bài viết của tài khoản Threads đang kết nối. Bản này chỉ đọc bài thuộc tài khoản đã cấp quyền; hãy dùng link bài gốc của chính tài khoản đó.' });
    const fields = 'id,text,username,timestamp,permalink,is_reply,is_reply_owned_by_me,root_post,replied_to';
    const replies = await graphGet(`${encodeURIComponent(post.id)}/conversation?fields=${encodeURIComponent(fields)}&reverse=false&limit=100`, token);
    res.json({ post: { id: post.id, permalink: post.permalink, text: post.text || '' }, replies: (replies.data || []).filter(item => item.text).slice(0, 150) });
  } catch (error) {
    console.error('Replies error:', error.message);
    res.status(400).json({ error: error.message || 'Không lấy được bình luận.' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { ELEVENLABS_API_KEY, ADAM_VOICE_ID } = process.env;
    if (!req.session.threads?.accessToken) return res.status(401).json({ error: 'Hãy kết nối Threads trước khi tạo giọng đọc.' });
    const now = Date.now();
    const requestTimes = (ttsRequests.get(req.sessionID) || []).filter(time => now - time < 60_000);
    if (requestTimes.length >= 8) return res.status(429).json({ error: 'Bạn đã tạo nhiều giọng đọc trong một phút. Hãy thử lại sau.' });
    requestTimes.push(now);
    ttsRequests.set(req.sessionID, requestTimes);
    if (!ELEVENLABS_API_KEY || !ADAM_VOICE_ID) return res.status(503).json({ error: 'Giọng Adam chưa được cấu hình. Máy chủ cần API key và Voice ID do chủ tài khoản được phép sử dụng cung cấp.' });
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 5000) return res.status(400).json({ error: 'Nội dung phải có từ 1 đến 5.000 ký tự.' });
    const result = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ADAM_VOICE_ID)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true } })
    });
    if (!result.ok) {
      const detail = await result.text();
      throw new Error(`Dịch vụ giọng đọc báo lỗi (${result.status}): ${detail.slice(0, 300)}`);
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="threads-adam.mp3"');
    const audio = Buffer.from(await result.arrayBuffer());
    res.send(audio);
  } catch (error) {
    console.error('TTS error:', error.message);
    res.status(502).json({ error: error.message || 'Không tạo được giọng đọc.' });
  }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.listen(PORT, '0.0.0.0', () => console.log(`Threads Studio running on port ${PORT}`));
