const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Affinity API configuration
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

// Helper function to make authenticated requests to Affinity API
async function makeAffinityRequest(endpoint, params = {}) {
  try {
    const response = await axios.get(`${AFFINITY_BASE_URL}${endpoint}`, {
      auth: {
        username: '',
        password: AFFINITY_API_KEY
      },
      params
    });
    return response.data;
  } catch (error) {
    console.error('Affinity API Error:', error.response?.data || error.message);
    throw error;
  }
}

// API Routes

// Get all lists
app.get('/api/lists', async (req, res) => {
  try {
    const lists = await makeAffinityRequest('/lists');
    res.json(lists);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

// Get list entries for a specific list
app.get('/api/lists/:listId/list-entries', async (req, res) => {
  try {
    const { listId } = req.params;
    const { page_size = 500, page_token } = req.query;
    
    const params = { page_size };
    if (page_token) params.page_token = page_token;
    
    const listEntries = await makeAffinityRequest(`/lists/${listId}/list-entries`, params);
    res.json(listEntries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch list entries' });
  }
});

// Get fields for a specific list
app.get('/api/lists/:listId/fields', async (req, res) => {
  try {
    const { listId } = req.params;
    const fields = await makeAffinityRequest('/fields', { list_id: listId });
    res.json(fields);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
});

// Get field values for a specific entity
app.get('/api/field-values', async (req, res) => {
  try {
    const { person_id, organization_id, opportunity_id, list_entry_id } = req.query;
    
    let params = {};
    if (person_id) params.person_id = person_id;
    else if (organization_id) params.organization_id = organization_id;
    else if (opportunity_id) params.opportunity_id = opportunity_id;
    else if (list_entry_id) params.list_entry_id = list_entry_id;
    else {
      return res.status(400).json({ error: 'Must specify one of: person_id, organization_id, opportunity_id, or list_entry_id' });
    }
    
    const fieldValues = await makeAffinityRequest('/field-values', params);
    res.json(fieldValues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch field values' });
  }
});

// Get opportunities
app.get('/api/opportunities', async (req, res) => {
  try {
    const { term, page_size = 500, page_token } = req.query;
    
    const params = { page_size };
    if (term) params.term = term;
    if (page_token) params.page_token = page_token;
    
    const opportunities = await makeAffinityRequest('/opportunities', params);
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// Get pipeline data (aggregated data for visualization)
app.get('/api/pipeline-data', async (req, res) => {
  try {
    const { listId } = req.query;
    
    if (!listId) {
      return res.status(400).json({ error: 'listId is required' });
    }
    
    // Get list entries
    const listEntries = await makeAffinityRequest(`/lists/${listId}/list-entries`);
    const entries = Array.isArray(listEntries) ? listEntries : listEntries.list_entries || [];
    
    // Get fields for the list
    const fields = await makeAffinityRequest('/fields', { list_id: listId });
    
    // Get field values for each entry
    const pipelineData = [];
    
    for (const entry of entries) {
      const fieldValues = await makeAffinityRequest('/field-values', { 
        list_entry_id: entry.id 
      });
      
      // Extract relevant data
      const leadData = {
        id: entry.id,
        entity_id: entry.entity_id,
        entity_type: entry.entity_type,
        created_at: entry.created_at,
        entity: entry.entity,
        field_values: fieldValues
      };
      
      pipelineData.push(leadData);
    }
    
    res.json({
      list_entries: entries,
      fields: fields,
      pipeline_data: pipelineData
    });
    
  } catch (error) {
    console.error('Pipeline data error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline data' });
  }
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to view the pipeline visualization`);
}); 