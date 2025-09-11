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
      let nextAbsoluteUrl = null; // if API provides full nextUrl with cursor
      const PAGE_SIZE = 500;
      const MAX_PAGES = 200; // safety guard
      const debug = process.env.DEBUG_AFFINITY_PAGINATION === '1';
      let first = true;

      const parseLinkForToken = (linkHeader) => {
        if (!linkHeader) return null;
        const parts = String(linkHeader).split(',');
        for (const p of parts) {
          if (/rel="next"/i.test(p)) {
            const m = p.match(/<([^>]+)>/);
            if (m && m[1]) {
              try {
                const u = new URL(m[1]);
                return u.searchParams.get('page_token') || u.searchParams.get('pageToken');
              } catch (_) {}
            }
          }
        }
        return null;
      };

      for (let i = 0; i < MAX_PAGES; i++) {
        const endpoint = nextAbsoluteUrl || `/v2/lists/${listId}/list-entries`;
        const params = nextAbsoluteUrl ? undefined : { page_size: PAGE_SIZE, per_page: PAGE_SIZE };
        if (pageToken && params) params.page_token = pageToken;
        if (usingPageNumberFallback && params) { params.page = pageNumber; }
        if (usingOffsetFallback && params) { params.limit = PAGE_SIZE; params.offset = offset; }
        if (!nextAbsoluteUrl) {
          if (useFieldIds) params.fieldIds = fieldIds.join(',');
          else params.fieldTypes = ['enriched','list','global','relationship-intelligence'].join(',');
        }

        let resp;
        try {
          resp = await makeAffinityRequestRaw(endpoint, params);
        } catch (err) {
          if (useFieldIds) { useFieldIds = false; continue; }
          throw err;
        }

        const body = resp.data;
        const data = Array.isArray(body) ? body : (body.data || body.list_entries || []);
        all.push(...data);

        const headers = resp.headers || {};
        let nextToken = headers['next-page-token']
          || headers['x-next-page-token']
          || headers['x-affinity-next-page-token']
          || body?.next_page_token
          || body?.nextPageToken
          || parseLinkForToken(headers.link || headers.Link)
          || null;

        // Read body.pagination if present to detect page/size/next
        const pag = body?.pagination || {};
        const currentPage = pag.page || pag.current_page || pag.page_number || pag.pageNumber || (usingPageNumberFallback ? pageNumber : 1);
        const perPage = pag.per_page || pag.page_size || (Array.isArray(data) ? data.length : PAGE_SIZE) || PAGE_SIZE;
        const totalPages = pag.total_pages || pag.totalPages;
        const hasNextFlag = Boolean(pag.next || pag.next_url || pag.nextUrl || pag.next_page_url || pag.nextPageUrl || pag.has_next || pag.hasMore || pag.more);

        if (first) {
          try {
            console.log('[Affinity] list-entries headers present:', Object.keys(headers));
            console.log('[Affinity] body keys:', Object.keys(body || {}));
            console.log('[Affinity] page_size returned:', data.length);
            console.log('[Affinity] pagination object:', pag && typeof pag === 'object' ? { ...pag } : pag);
            console.log('[Affinity] sample tokens:', {
              header_next_page_token: headers['next-page-token'],
              header_x_next_page_token: headers['x-next-page-token'],
              header_link: headers['link'] || headers['Link'],
              body_next_page_token: body?.next_page_token,
              body_nextPageToken: body?.nextPageToken
            });
          } catch (_) {}
          first = false;
        }

        if (debug) {
          console.log('[affinity] fetched page', {
            count: data.length,
            requested_page_size: PAGE_SIZE,
            effective_per_page: perPage,
            has_next_token: Boolean(nextToken),
            has_page_more: Boolean(totalPages ? currentPage < totalPages : hasNextFlag),
            using_page_fallback: usingPageNumberFallback,
            using_offset_fallback: usingOffsetFallback,
            page: usingPageNumberFallback ? pageNumber : currentPage,
            offset: usingOffsetFallback ? offset : undefined,
          });
        }

        // Token-based continuation
        if (nextToken) { pageToken = nextToken; nextAbsoluteUrl = null; continue; }

        // Cursor/URL-based continuation
        if (pag?.nextUrl || pag?.next_url) {
          nextAbsoluteUrl = pag.nextUrl || pag.next_url;
          pageToken = undefined;
          usingPageNumberFallback = false;
          usingOffsetFallback = false;
          continue;
        }

        // Pagination object indicates more pages
        const hasPageMore = Boolean(totalPages ? currentPage < totalPages : hasNextFlag);
        if (hasPageMore) {
          usingPageNumberFallback = true;
          pageNumber = (Number(currentPage) || 1) + 1;
          continue;
        }

        // Offset fallback if API uses offset/limit and returned a full page
        if (!usingOffsetFallback && data.length >= perPage) {
          usingOffsetFallback = true;
          offset = (Number(offset) || 0) + perPage;
          continue;
        }

        // No more pages
        if (data.length < perPage || !hasPageMore) break;
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
