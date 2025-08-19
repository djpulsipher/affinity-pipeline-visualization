const { makeAffinityRequest } = require('../affinityClient');

module.exports = async (req, res) => {
  const { listId } = req.query;
  try {
    const fieldsResponse = await makeAffinityRequest(`/v2/lists/${listId}/fields`);
    const fields = fieldsResponse.data || fieldsResponse;

    const categorizedFields = {
      enriched: [],
      list: [],
      global: [],
      'relationship-intelligence': [],
      unknown: []
    };

    fields.forEach(field => {
      const fieldType = field.fieldType || 'unknown';
      const item = {
        id: field.id,
        name: field.name,
        fieldType: field.fieldType,
        valueType: field.valueType,
        description: field.description || 'No description'
      };
      if (categorizedFields[fieldType]) {
        categorizedFields[fieldType].push(item);
      } else {
        categorizedFields.unknown.push(item);
      }
    });

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

    res.status(200).json({
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
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to test fields' });
  }
};
