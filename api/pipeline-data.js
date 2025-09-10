const { makeAffinityRequest, makeAffinityRequestRaw } = require('./affinityClient');

module.exports = async (req, res) => {
  const { listId } = req.query;
  if (!listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const fieldsResponse = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    const fields = fieldsResponse.data || fieldsResponse;
    const fieldIds = fields.map(f => f.id);

    // Fetch all list entries with pagination
    async function fetchAllEntries() {
      const all = [];
      let pageToken;
      let useFieldIds = true;
      let usingPageNumberFallback = false;
      let usingOffsetFallback = false;
      let pageNumber = 1;
      let offset = 0;
      const PAGE_SIZE = 500;
      const MAX_PAGES = 200; // safety guard
      const debug = process.env.DEBUG_AFFINITY_PAGINATION === '1';
      for (let i = 0; i < MAX_PAGES; i++) {
        const params = { page_size: PAGE_SIZE };
        if (pageToken) params.page_token = pageToken;
        if (usingPageNumberFallback) {
          params.page = pageNumber;
          params.per_page = PAGE_SIZE;
        }
        if (usingOffsetFallback) {
          params.limit = PAGE_SIZE;
          params.offset = offset;
        }
        if (useFieldIds) params.fieldIds = fieldIds.join(',');
        else params.fieldTypes = ['enriched', 'list', 'global', 'relationship-intelligence'].join(',');

        let resp;
        try {
          resp = await makeAffinityRequestRaw(`/v2/lists/${listId}/list-entries`, params);
        } catch (err) {
          if (useFieldIds) {
            useFieldIds = false;
            continue;
          }
          throw err;
        }

        const body = resp.data;
        const data = Array.isArray(body) ? body : (body.data || body.list_entries || []);
        all.push(...data);

        const headers = resp.headers || {};
        // Common header/body token variants
        let nextToken = headers['next-page-token']
          || headers['x-next-page-token']
          || headers['x-affinity-next-page-token']
          || body?.next_page_token
          || body?.nextPageToken
          || null;

        // Parse Link header if present: <...page_token=XYZ>; rel="next"
        if (!nextToken && headers.link) {
          try {
            const linkHeader = headers.link;
            const segments = linkHeader.split(',');
            for (const seg of segments) {
              const [urlPart, relPart] = seg.split(';').map(s => s.trim());
              if (relPart && /rel\s*=\s*"?next"?/i.test(relPart)) {
                const m = urlPart.match(/<([^>]+)>/);
                if (m && m[1]) {
                  const url = new URL(m[1]);
                  const tokenFromLink = url.searchParams.get('page_token')
                    || url.searchParams.get('pageToken')
                    || url.searchParams.get('next_page_token');
                  if (tokenFromLink) {
                    nextToken = tokenFromLink;
                    break;
                  }
                }
              }
            }
          } catch (_) {}
        }

        if (debug) {
          console.log('[affinity] fetched page', {
            count: data.length,
            page_size: PAGE_SIZE,
            has_next_token: Boolean(nextToken),
            using_page_fallback: usingPageNumberFallback,
            using_offset_fallback: usingOffsetFallback,
            page: usingPageNumberFallback ? pageNumber : undefined,
            offset: usingOffsetFallback ? offset : undefined,
            header_keys: Object.keys(headers),
          });
        }

        if (nextToken) {
          pageToken = nextToken;
          continue; // token-based pagination
        }

        if (data.length === 0) break; // no more data

        // If we got a full page but no token, try fallback styles
        if (!usingPageNumberFallback && !usingOffsetFallback && data.length >= PAGE_SIZE) {
          usingPageNumberFallback = true;
          pageNumber = 2; // next page
          continue;
        }

        if (usingPageNumberFallback) {
          if (data.length < PAGE_SIZE) break; // last page reached
          pageNumber += 1;
          continue;
        }

        if (!usingOffsetFallback && data.length >= PAGE_SIZE) {
          usingOffsetFallback = true;
          offset = PAGE_SIZE; // next offset
          continue;
        }

        if (usingOffsetFallback) {
          if (data.length < PAGE_SIZE) break; // last page
          offset += PAGE_SIZE;
          continue;
        }

        break; // nothing else to do
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
