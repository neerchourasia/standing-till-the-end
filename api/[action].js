// Account and save API for Vercel. Accounts live in Redis (Upstash).
// Routes: POST /api/signup, /api/login, /api/save
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const key = name => 'account:' + name;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const action = req.query.action;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = String(body.name || '');
  const hash = String(body.hash || '');
  if (!/^[A-Za-z0-9_]{2,16}$/.test(name)) return res.status(400).json({ error: 'Bad username.' });

  if (action === 'signup') {
    const exists = await redis.exists(key(name));
    if (exists) return res.status(409).json({ error: 'That name is taken.' });
    const data = { coins: 0, owned: [], bestDays: {} };
    await redis.set(key(name), { hash, data });
    return res.status(200).json({ data });
  }

  const acct = await redis.get(key(name));
  if (!acct || acct.hash !== hash) return res.status(401).json({ error: 'Wrong name or password.' });

  if (action === 'login') return res.status(200).json({ data: acct.data });
  if (action === 'save') {
    acct.data = body.data || acct.data;
    await redis.set(key(name), acct);
    return res.status(200).json({ ok: true });
  }
  return res.status(404).json({ error: 'Unknown action.' });
}
