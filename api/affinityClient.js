const axios = require('axios');
require('dotenv').config();

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

async function makeAffinityRequest(endpoint, params = {}) {
  const response = await axios.get(`${AFFINITY_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${AFFINITY_API_KEY}`
    },
    params
  });
  return response.data;
}

module.exports = { makeAffinityRequest };
