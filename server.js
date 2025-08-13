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
      headers: {
        'Authorization': `Bearer ${AFFINITY_API_KEY}`
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
    const response = await makeAffinityRequest('/v2/lists');
    // The API returns { data: [...], pagination: {...} }
    // We'll pass through the entire response structure
    res.json(response);
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
    
    const listEntries = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, params);
    res.json(listEntries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch list entries' });
  }
});

// Get fields for a specific list
app.get('/api/lists/:listId/fields', async (req, res) => {
  try {
    const { listId } = req.params;
    const response = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    // The API returns { data: [...], pagination: {...} }
    // We'll pass through the entire response structure
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
});



// Get field values for a specific entity
app.get('/api/field-values', async (req, res) => {
  try {
    const { person_id, organization_id, opportunity_id, list_entry_id, field_id } = req.query;
    
    // Note: Field values are now processed client-side from existing pipeline data
    // This endpoint is kept for backward compatibility with existing entity-based queries
    
    // Otherwise, get field values for a specific entity
    let params = {};
    if (person_id) params.person_id = person_id;
    else if (organization_id) params.organization_id = organization_id;
    else if (opportunity_id) params.opportunity_id = opportunity_id;
    else if (list_entry_id) params.list_entry_id = list_entry_id;
    else {
      return res.status(400).json({ error: 'Must specify one of: person_id, organization_id, opportunity_id, list_entry_id, or field_id' });
    }
    
    const fieldValues = await makeAffinityRequest('/v2/field-values', params);
    res.json(fieldValues);
  } catch (error) {
    console.error('Error fetching field values:', error);
    let errorMessage = 'Failed to fetch field values';
    if (error.response) {
      if (error.response.status === 401) {
        errorMessage = 'Authentication failed. Please check your API key.';
      } else if (error.response.status === 403) {
        errorMessage = 'Access denied. Please check your API permissions.';
      } else if (error.response.status === 404) {
        errorMessage = 'Field not found. Please check the field ID.';
      } else {
        errorMessage = `API Error: ${error.response.status} - ${error.response.data?.error || error.message}`;
      }
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    res.status(500).json({ error: errorMessage });
  }
});

// Get opportunities
app.get('/api/opportunities', async (req, res) => {
  try {
    const { term, page_size = 500, page_token } = req.query;
    
    const params = { page_size };
    if (term) params.term = term;
    if (page_token) params.page_token = page_token;
    
    const opportunities = await makeAffinityRequest('/v2/opportunities', params);
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
    
    console.log(`Fetching pipeline data for list: ${listId}`);
    
    // Get fields for the list first (including relationship-intelligence fields)
    const fieldsResponse = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    const fields = fieldsResponse.data || fieldsResponse;
    console.log(`Found ${fields.length} fields for list (including relationship-intelligence fields)`);
    
    // Extract field IDs for the list-entries request
    const fieldIds = fields.map(field => field.id);
    console.log(`Using ${fieldIds.length} field IDs for list entries request`);

    
    // Get list entries with all field data
    // Try different approaches for field selection
    let listEntriesResponse;
    try {
      // First try with fieldIds
      listEntriesResponse = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, {
        fieldIds: fieldIds.join(',') // Convert array to comma-separated string
      });
      console.log('Successfully fetched with fieldIds');
    } catch (error) {
      console.log('Failed with fieldIds, trying with fieldTypes...');
      // If that fails, try with fieldTypes
      listEntriesResponse = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, {
        fieldTypes: ['enriched', 'list', 'global', 'relationship-intelligence'].join(',')
      });
      console.log('Successfully fetched with fieldTypes');
    }
    const entries = Array.isArray(listEntriesResponse) ? listEntriesResponse : (listEntriesResponse.data || listEntriesResponse.list_entries || []);
    

    
    console.log(`Found ${entries.length} list entries with field data`);
    
    // Process the data (field values might be in entity.fields or entry.fields)
    const pipelineData = entries.map(entry => {
      // Field values could be in different locations based on API response
      const fieldValues = entry.field_values || entry.fields || entry.entity?.fields || [];
      
      return {
        id: entry.id,
        entity_id: entry.entity?.id || entry.entity_id,
        entity_type: entry.type || entry.entity_type,
        created_at: entry.createdAt || entry.created_at,
        entity: entry.entity,
        field_values: fieldValues
      };
    });
    
    console.log(`Successfully processed ${pipelineData.length} pipeline entries`);
    
    res.json({
      list_entries: entries,
      fields: fields,
      pipeline_data: pipelineData
    });
    
  } catch (error) {
    console.error('Pipeline data error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to fetch pipeline data';
    if (error.response) {
      if (error.response.status === 401) {
        errorMessage = 'Authentication failed. Please check your API key.';
      } else if (error.response.status === 403) {
        errorMessage = 'Access denied. Please check your API permissions.';
      } else if (error.response.status === 404) {
        errorMessage = 'List not found. Please check the list ID.';
      } else {
        errorMessage = `API Error: ${error.response.status} - ${error.response.data?.error || error.message}`;
      }
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});











// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test endpoint to show all available fields for a list
app.get('/api/test-fields/:listId', async (req, res) => {
  try {
    const { listId } = req.params;
    
    console.log(`Testing all fields for list: ${listId}`);
    
    // Get all fields for the list
    const fieldsResponse = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    const fields = fieldsResponse.data || fieldsResponse;
    
    // Categorize fields by type
    const categorizedFields = {
      enriched: [],
      list: [],
      global: [],
      'relationship-intelligence': [],
      unknown: []
    };
    
    fields.forEach(field => {
      const fieldType = field.fieldType || 'unknown';
      if (categorizedFields[fieldType]) {
        categorizedFields[fieldType].push({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          valueType: field.valueType,
          description: field.description || 'No description'
        });
      } else {
        categorizedFields.unknown.push({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          valueType: field.valueType,
          description: field.description || 'No description'
        });
      }
    });
    
    // Create summary
    const summary = {
      total_fields: fields.length,
      by_type: {
        enriched: categorizedFields.enriched.length,
        list: categorizedFields.list.length,
        global: categorizedFields.global.length,
        'relationship-intelligence': categorizedFields['relationship-intelligence'].length,
        unknown: categorizedFields.unknown.length
      }
    };
    
    // Find potential aging fields (datetime fields)
    const potentialAgingFields = fields.filter(field => 
      field.valueType === 'datetime' || 
      field.name.toLowerCase().includes('date') ||
      field.name.toLowerCase().includes('created') ||
      field.name.toLowerCase().includes('updated') ||
      field.name.toLowerCase().includes('last') ||
      field.name.toLowerCase().includes('first')
    ).map(field => ({
      id: field.id,
      name: field.name,
      fieldType: field.fieldType,
      valueType: field.valueType,
      reason: field.valueType === 'datetime' ? 'datetime field' : 'name suggests date/time'
    }));
    
    const result = {
      list_id: listId,
      summary,
      categorized_fields: categorizedFields,
      potential_aging_fields: potentialAgingFields,
      all_fields: fields.map(field => ({
        id: field.id,
        name: field.name,
        fieldType: field.fieldType,
        valueType: field.valueType,
        description: field.description || 'No description'
      }))
    };
    
    console.log(`✅ Field test complete for list ${listId}`);
    console.log(`📊 Summary: ${summary.total_fields} total fields`);
    console.log(`🎯 Found ${potentialAgingFields.length} potential aging fields`);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error testing fields:', error);
    let errorMessage = 'Failed to test fields';
    if (error.response) {
      if (error.response.status === 401) {
        errorMessage = 'Authentication failed. Please check your API key.';
      } else if (error.response.status === 403) {
        errorMessage = 'Access denied. Please check your API permissions.';
      } else if (error.response.status === 404) {
        errorMessage = 'List not found. Please check the list ID.';
      } else {
        errorMessage = `API Error: ${error.response.status} - ${error.response.data?.error || error.message}`;
      }
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    res.status(500).json({ error: errorMessage });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to view the pipeline visualization`);
}); 