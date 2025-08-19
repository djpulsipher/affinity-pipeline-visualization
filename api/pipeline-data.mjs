// /api/pipeline-data.js
export default async function handler(req, res) {
  try {
    // 1) Read your secret from Vercel env vars
    const key = process.env.AFFINITY_API_KEY;
    if (!key) {
      res.status(500).json({ error: 'Missing AFFINITY_API_KEY on the server' });
      return;
    }

    // 2) Get the list ID from query params
    const { listId } = req.query;
    if (!listId) {
      return res.status(400).json({ error: 'listId is required' });
    }

    // 3) Call the Affinity API with Basic auth
    const authHeader = 'Basic ' + Buffer.from(`${key}:`).toString('base64');

    // 4) Get fields for the list first
    const fieldsResponse = await fetch(`https://api.affinity.co/v2/lists/${encodeURIComponent(listId)}/fields`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (!fieldsResponse.ok) {
      const text = await fieldsResponse.text();
      res.status(fieldsResponse.status).send(text);
      return;
    }

    const fieldsData = await fieldsResponse.json();
    const fields = fieldsData.data || fieldsData;
    const fieldIds = fields.map(field => field.id);

    // 5) Get list entries with field data
    let listEntriesResponse;
    try {
      // First try with fieldIds
      const params = new URLSearchParams({ fieldIds: fieldIds.join(',') });
      listEntriesResponse = await fetch(`https://api.affinity.co/v2/lists/${encodeURIComponent(listId)}/list-entries?${params}`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });
    } catch (error) {
      // If that fails, try with fieldTypes
      const params = new URLSearchParams({ fieldTypes: ['enriched', 'list', 'global', 'relationship-intelligence'].join(',') });
      listEntriesResponse = await fetch(`https://api.affinity.co/v2/lists/${encodeURIComponent(listId)}/list-entries?${params}`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });
    }

    if (!listEntriesResponse.ok) {
      const text = await listEntriesResponse.text();
      res.status(listEntriesResponse.status).send(text);
      return;
    }

    const entriesData = await listEntriesResponse.json();
    const entries = Array.isArray(entriesData) ? entriesData : (entriesData.data || entriesData.list_entries || []);

    // 6) Process the data
    const pipelineData = entries.map(entry => {
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

    // 7) Return JSON to your frontend
    res.status(200).json({
      list_entries: entries,
      fields: fields,
      pipeline_data: pipelineData
    });

  } catch (err) {
    console.error('Pipeline data error:', err);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to fetch pipeline data';
    if (err.response) {
      if (err.response.status === 401) {
        errorMessage = 'Authentication failed. Please check your API key.';
      } else if (err.response.status === 403) {
        errorMessage = 'Access denied. Please check your API permissions.';
      } else if (err.response.status === 404) {
        errorMessage = 'List not found. Please check the list ID.';
      } else {
        errorMessage = `API Error: ${err.response.status} - ${err.response.data?.error || err.message}`;
      }
    } else if (err.code === 'ENOTFOUND') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
}
