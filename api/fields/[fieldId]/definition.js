const { makeAffinityRequest } = require('../../affinityClient');

module.exports = async (req, res) => {
  const { fieldId } = req.query;

  if (!fieldId) {
    return res.status(400).json({ error: 'Missing fieldId' });
  }

  try {
    const data = await makeAffinityRequest(`/v2/fields/${fieldId}`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching field definition:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch field definition' });
  }
};
