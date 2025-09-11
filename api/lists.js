const { makeAffinityRequest } = require('./affinityClient');

module.exports = async (req, res) => {
  try {
    const data = await makeAffinityRequest('/v2/lists');

    // Normalize various possible response shapes into an array of lists
    let lists = [];
    if (Array.isArray(data)) {
      lists = data;
    } else if (Array.isArray(data?.data)) {
      lists = data.data;
    } else if (Array.isArray(data?.lists)) {
      lists = data.lists;
    } else if (Array.isArray(data?.items)) {
      lists = data.items;
    } else if (data && typeof data === 'object') {
      // Fallback: pick the first array value in the object
      const firstArray = Object.values(data).find(Array.isArray);
      if (Array.isArray(firstArray)) lists = firstArray;
    }

    if (!Array.isArray(lists)) {
      return res.status(502).json({ error: 'Unexpected lists response shape' });
    }

    res.status(200).json(lists);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data || { error: 'Failed to fetch lists' };
    res.status(status).json(message);
  }
};
