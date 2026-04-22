import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });
  if (!url.startsWith('https://mis.twse.com.tw/')) return res.status(403).json({ error: 'Forbidden' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://mis.twse.com.tw/'
      }
    });
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
}
