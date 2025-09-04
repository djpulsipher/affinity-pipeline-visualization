const { makeAffinityRequest } = require('./affinityClient');

module.exports = async (req, res) => {
  const { listId1, listId2 } = req.query;
  
  if (!listId1 || !listId2) {
    return res.status(400).json({ 
      error: 'Both listId1 and listId2 are required' 
    });
  }

  try {
    // Fetch data from both lists
    const [list1Data, list2Data] = await Promise.all([
      fetchListData(listId1),
      fetchListData(listId2)
    ]);

    // Compare opportunities
    const comparison = compareOpportunities(list1Data, list2Data);

    res.status(200).json({
      list1: {
        id: listId1,
        count: list1Data.entries.length,
        sample_entries: list1Data.entries.slice(0, 3) // First 3 entries for inspection
      },
      list2: {
        id: listId2,
        count: list2Data.entries.length,
        sample_entries: list2Data.entries.slice(0, 3) // First 3 entries for inspection
      },
      comparison,
      analysis: {
        same_opportunities: comparison.sameOpportunities.length,
        different_opportunities: comparison.differentOpportunities.length,
        total_compared: comparison.sameOpportunities.length + comparison.differentOpportunities.length
      }
    });

  } catch (error) {
    let errorMessage = 'Failed to compare lists';
    if (error.response) {
      if (error.response.status === 401) {
        errorMessage = 'Authentication failed. Please check your API key.';
      } else if (error.response.status === 403) {
        errorMessage = 'Access denied. Please check your API permissions.';
      } else if (error.response.status === 404) {
        errorMessage = 'One or both lists not found. Please check the list IDs.';
      } else {
        errorMessage = `API Error: ${error.response.status} - ${error.response.data?.error || error.message}`;
      }
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    res.status(500).json({ error: errorMessage });
  }
};

async function fetchListData(listId) {
  // Get fields first
  const fieldsResponse = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
  const fields = fieldsResponse.data || fieldsResponse;
  const fieldIds = fields.map(f => f.id);

  // Get list entries
  let listEntriesResponse;
  try {
    listEntriesResponse = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, {
      fieldIds: fieldIds.join(',')
    });
  } catch (err) {
    listEntriesResponse = await makeAffinityRequest(`/v2/lists/${listId}/list-entries`, {
      fieldTypes: ['enriched', 'list', 'global', 'relationship-intelligence'].join(',')
    });
  }

  const entries = Array.isArray(listEntriesResponse)
    ? listEntriesResponse
    : (listEntriesResponse.data || listEntriesResponse.list_entries || []);

  return {
    fields,
    entries: entries.map(entry => ({
      id: entry.id,
      entity_id: entry.entity?.id || entry.entity_id,
      entity_type: entry.type || entry.entity_type,
      created_at: entry.createdAt || entry.created_at,
      entity: entry.entity,
      field_values: entry.field_values || entry.fields || entry.entity?.fields || []
    }))
  };
}

function compareOpportunities(list1Data, list2Data) {
  const sameOpportunities = [];
  const differentOpportunities = [];

  // Create a map of entity IDs from list 1 for quick lookup
  const list1EntityMap = new Map();
  list1Data.entries.forEach(entry => {
    if (entry.entity_id) {
      list1EntityMap.set(entry.entity_id, entry);
    }
  });

  // Compare each entry from list 2
  list2Data.entries.forEach(entry2 => {
    if (entry2.entity_id) {
      const entry1 = list1EntityMap.get(entry2.entity_id);
      
      if (entry1) {
        // Same entity ID found - this is the same opportunity
        sameOpportunities.push({
          entity_id: entry2.entity_id,
          list1_entry_id: entry1.id,
          list2_entry_id: entry2.id,
          list1_created_at: entry1.created_at,
          list2_created_at: entry2.created_at,
          is_same_opportunity: true
        });
      } else {
        // Different entity ID - this is a different opportunity
        differentOpportunities.push({
          entity_id: entry2.entity_id,
          list2_entry_id: entry2.id,
          list2_created_at: entry2.created_at,
          is_same_opportunity: false
        });
      }
    }
  });

  return {
    sameOpportunities,
    differentOpportunities
  };
}
