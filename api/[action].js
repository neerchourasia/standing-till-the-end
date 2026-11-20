// Account and save API for Vercel. Accounts live in Redis (REDIS_URL).
// Routes: POST /api/signup, /api/login, /api/save
import { createClient } from 'redis';

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', () => {});
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}
const key = name => 'account:' + name;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const action = req.query.action;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = String(body.name || '').trim().toLowerCase();
  const hash = String(body.hash || '');
  const username = String(body.username || '').trim();
  if (action !== 'save' && !/^[A-Za-z0-9_]{2,16}$/.test(username)) return res.status(400).json({ error: 'Username: 2 to 16 letters, numbers or _.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  try {
    const db = await getClient();
    if (action === 'signup') {
      if (body.terms !== true) return res.status(400).json({ error: 'You must accept the Terms of Service.' });
      const exists = await db.exists(key(name));
      if (exists) return res.status(409).json({ error: 'That name is taken.' });
      const data = { coins: 0, owned: [], bestDays: {}, username, share: !!body.share, terms: String(body.termsVersion || '') };
      await db.set(key(name), JSON.stringify({ hash, data }));
      return res.status(200).json({ data });
    }

    const raw = await db.get(key(name));
    const acct = raw ? JSON.parse(raw) : null;
    if (!acct || acct.hash !== hash) return res.status(401).json({ error: 'Wrong email or password.' });
    if (action === 'login' && String(acct.data.username || '').toLowerCase() !== username.toLowerCase())
      return res.status(401).json({ error: 'That username does not match this email.' });

    if (action === 'admin') {
      const admin = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (!admin || name !== admin) return res.status(403).json({ error: 'Not allowed.' });
      const users = [];
      for (const k of await db.keys('account:*')) {
        const r = await db.get(k);
        const a = r ? JSON.parse(r) : null;
        if (a && a.data && a.data.share) {
          users.push({ email: k.slice('account:'.length), username: a.data.username, coins: a.data.coins, owned: a.data.owned, bestDays: a.data.bestDays });
        }
      }
      return res.status(200).json({ users });
    }
    if (action === 'login') return res.status(200).json({ data: acct.data });
    if (action === 'save') {
      acct.data = body.data || acct.data;
      await db.set(key(name), JSON.stringify(acct));
      return res.status(200).json({ ok: true });
    }
    return res.status(404).json({ error: 'Unknown action.' });
  } catch (e) {
    return res.status(500).json({ error: 'The save server had a problem. Try again.' });
  }
}
