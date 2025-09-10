const { makeAffinityRequest } = require('./affinityClient');

module.exports = async (req, res) => {
  const { listId } = req.query;
  if (!listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const fieldsResponse = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    const fields = fieldsResponse.data || fieldsResponse;
    const fieldIds = fields.map(f => f.id);

    // Fetch all list entries with pagination (Affinity defaults to ~100 per page)
    async function fetchAllEntries() {
      const all = [];
      let pageToken;
      let useFieldIds = true;
      while (true) {
        let params = { page_size: 500 };
        if (pageToken) params.page_token = pageToken;
        if (useFieldIds) params.fieldIds = fieldIds.join(',');
        else params.fieldTypes = ['enriched', 'list', 'global', 'relationship-intelligence'].join(',');

        let resp;
        try {
          resp = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, params);
        } catch (err) {
          // Fall back to fieldTypes if fieldIds are not accepted
          if (useFieldIds) {
            useFieldIds = false;
            continue;
          }
          throw err;
        }
        const data = Array.isArray(resp) ? resp : (resp.data || resp.list_entries || []);
        all.push(...data);
        pageToken = resp?.next_page_token || resp?.nextPageToken || resp?.page_token || null;
        if (!pageToken || data.length === 0) break;
      }
      return all;
    }

    const entries = await fetchAllEntries();

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

    res.status(200).json({
      list_entries: entries,
      fields,
      pipeline_data: pipelineData
    });
  } catch (error) {
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
};
