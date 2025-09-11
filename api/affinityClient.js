const axios = require('axios');
require('dotenv').config();

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

function buildUrl(endpoint) {
  if (typeof endpoint === 'string' && /^https?:\/\//i.test(endpoint)) return endpoint;
  return `${AFFINITY_BASE_URL}${endpoint}`;
}

// Returns only the response data
async function makeAffinityRequest(endpoint, params = {}) {
  const response = await axios.get(buildUrl(endpoint), {
    headers: { Authorization: `Bearer ${AFFINITY_API_KEY}` },
    params,
  });
  return response.data;
}

// Returns the full axios response (data + headers)
async function makeAffinityRequestRaw(endpoint, params = {}) {
  const response = await axios.get(buildUrl(endpoint), {
    headers: { Authorization: `Bearer ${AFFINITY_API_KEY}` },
    params,
    // Keep defaults; headers include pagination tokens when present
  });
  return response;
}

module.exports = {
  makeAffinityRequest,
  makeAffinityRequestRaw,
};
