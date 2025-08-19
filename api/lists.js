// /api/lists.js
export default async function handler(req, res) {
  try {
    // 1) Read your secret from Vercel env vars
    const key = process.env.AFFINITY_API_KEY;
    if (!key) {
      res.status(500).json({ error: 'Missing AFFINITY_API_KEY on the server' });
      return;
    }

    // 2) Call the Affinity API with Basic auth (key as username, blank password)
    const authHeader = 'Basic ' + Buffer.from(`${key}:`).toString('base64');

    const upstream = await fetch('https://api.affinity.co/v2/lists', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    // 3) Forward errors transparently (helps debugging)
    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).send(text);
      return;
    }

    // 4) Return JSON to your frontend
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
