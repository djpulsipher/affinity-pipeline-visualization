// /api/env.js
export default function handler(req, res) {
  const hasKey = Boolean(process.env.AFFINITY_API_KEY);
  res.status(200).json({ hasAffinityKey: hasKey });
}
