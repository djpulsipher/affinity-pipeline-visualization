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
    res.status(500).json({ error: 'Failed to fetch field definition' });
  }
};
