const { makeAffinityRequest } = require('../../affinityClient');

module.exports = async (req, res) => {
  const { listId } = req.query;
  if (!listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const data = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching fields:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
};
