// /api/lists/[id]/fields.js
export default async function handler(req, res) {
  try {
    // 1) Read your secret from Vercel env vars
    const key = process.env.AFFINITY_API_KEY;
    if (!key) {
      res.status(500).json({ error: 'Missing AFFINITY_API_KEY on the server' });
      return;
    }

    // 2) Get the list ID from the URL
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'List ID is required' });
      return;
    }

    // 3) Call the Affinity API with Basic auth
    const authHeader = 'Basic ' + Buffer.from(`${key}:`).toString('base64');

    const upstream = await fetch(`https://api.affinity.co/v2/lists/${encodeURIComponent(id)}/fields`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    // 4) Forward errors transparently
    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).send(text);
      return;
    }

    // 5) Return JSON to your frontend
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
