const axios = require('axios');
require('dotenv').config();

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

module.exports = async (req, res) => {
  const { field_id, action_type, person_id, organization_id, opportunity_id, list_entry_id } = req.query;

  if (!field_id) {
    return res.status(400).json({ error: 'field_id is required' });
  }

  let params = { field_id };
  if (action_type) params.action_type = action_type;
  if (person_id) params.person_id = person_id;
  if (organization_id) params.organization_id = organization_id;
  if (opportunity_id) params.opportunity_id = opportunity_id;
  if (list_entry_id) params.list_entry_id = list_entry_id;

  try {
    let response;
    try {
      response = await axios.get(`${AFFINITY_BASE_URL}/field-value-changes`, {
        auth: { username: AFFINITY_API_KEY, password: '' },
        params
      });
    } catch (err1) {
      try {
        response = await axios.get(`${AFFINITY_BASE_URL}/field-value-changes`, {
          auth: { username: '', password: AFFINITY_API_KEY },
          params
        });
      } catch (err2) {
        try {
          response = await axios.get(`${AFFINITY_BASE_URL}/field-value-changes`, {
            headers: { Authorization: `Bearer ${AFFINITY_API_KEY}` },
            params
          });
        } catch (err3) {
          const paramsWithKey = { ...params, api_key: AFFINITY_API_KEY };
          response = await axios.get(`${AFFINITY_BASE_URL}/field-value-changes`, { params: paramsWithKey });
        }
      }
    }

    res.status(200).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { error: 'Failed to fetch field value changes' };
    console.error('Field value changes API error', status, errorData);
    res.status(status).json(errorData);
  }
};
