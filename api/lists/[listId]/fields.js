const { makeAffinityRequest } = require('../../affinityClient');

module.exports = async (req, res) => {
  const { listId } = req.query;

  try {
    const data = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
};
