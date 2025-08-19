const { makeAffinityRequest } = require('../../affinityClient');

module.exports = async (req, res) => {
  const { listId, page_size = 500, page_token } = req.query;
  const params = { page_size };
  if (page_token) params.page_token = page_token;

  try {
    const data = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, params);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch list entries' });
  }
};
