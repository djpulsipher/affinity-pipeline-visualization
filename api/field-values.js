const { makeAffinityRequest } = require('./affinityClient');

module.exports = async (req, res) => {
  const { person_id, organization_id, opportunity_id, list_entry_id } = req.query;

  let params = {};
  if (person_id) params.person_id = person_id;
  else if (organization_id) params.organization_id = organization_id;
  else if (opportunity_id) params.opportunity_id = opportunity_id;
  else if (list_entry_id) params.list_entry_id = list_entry_id;
  else {
    return res.status(400).json({ error: 'Must specify one of: person_id, organization_id, opportunity_id, or list_entry_id' });
  }

  try {
    const data = await makeAffinityRequest('/v2/field-values', params);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch field values' });
  }
};
