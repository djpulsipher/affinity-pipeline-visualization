const { makeAffinityRequest } = require('./affinityClient');

module.exports = async (req, res) => {
  const { term, page_size = 500, page_token } = req.query;
  const params = { page_size };
  if (term) params.term = term;
  if (page_token) params.page_token = page_token;

  try {
    const data = await makeAffinityRequest('/v2/opportunities', params);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
};
