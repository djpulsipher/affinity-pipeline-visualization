// Global variables
let currentData = null;
let currentView = 'pipeline'; // 'pipeline' or 'detailed'
let fieldMappings = {};
let stageWeights = {};
let excludedStages = new Set(); // New: Track excluded stages
let stageOrder = []; // New: Track custom stage order
let isReorderMode = false; // New: Track reorder mode
let defaultSettings = {
    defaultStageField: '',
    defaultStageValue: '',
    globalDefaultValue: 1000000,
    rules: [],
    closedWonStage: '',
    closedWonValueField: ''
};

// New field mappings for lead age
let firstEmailField = null;

// Color schemes
const colorSchemes = {
    sources: d3.scaleOrdinal(d3.schemeCategory10),
    stages: d3.scaleOrdinal(d3.schemeSet3),
    values: d3.scaleLinear()
        .domain([0, 1000000])
        .range(['#dc3545', '#ffc107', '#28a745'])
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Load saved API key
    const savedApiKey = localStorage.getItem('affinityApiKey');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }

    // Add event listeners with null checks
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', saveApiKey);
    
    const loadDataBtn = document.getElementById('loadData');
    if (loadDataBtn) loadDataBtn.addEventListener('click', loadPipelineData);
    
    const resetWeightsBtn = document.getElementById('resetWeights');
    if (resetWeightsBtn) resetWeightsBtn.addEventListener('click', resetWeights);
    
    const reorderStagesBtn = document.getElementById('reorderStages');
    if (reorderStagesBtn) reorderStagesBtn.addEventListener('click', toggleReorderMode);
    
    const debugModeBtn = document.getElementById('debugMode');
    if (debugModeBtn) debugModeBtn.addEventListener('click', toggleDebugMode);
    
    const refreshDataBtn = document.getElementById('refreshData');
    if (refreshDataBtn) refreshDataBtn.addEventListener('click', refreshData);
    
    const toggleViewBtn = document.getElementById('toggleView');
    if (toggleViewBtn) toggleViewBtn.addEventListener('click', toggleView);
    
    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    const listSelect = document.getElementById('listSelect');
    if (listSelect) listSelect.addEventListener('change', onListChange);
    
    const addRuleBtn = document.getElementById('addRule');
    if (addRuleBtn) addRuleBtn.addEventListener('click', showRuleModal);
    
    const defaultStageField = document.getElementById('defaultStageField');
    if (defaultStageField) defaultStageField.addEventListener('change', onDefaultStageFieldChange);
    
    const defaultStageValue = document.getElementById('defaultStageValue');
    if (defaultStageValue) defaultStageValue.addEventListener('change', updateDefaultSettings);
    
    const globalDefaultValue = document.getElementById('globalDefaultValue');
    if (globalDefaultValue) globalDefaultValue.addEventListener('change', updateDefaultSettings);
    
    const closedWonStage = document.getElementById('closedWonStage');
    if (closedWonStage) closedWonStage.addEventListener('change', updateDefaultSettings);
    
    const closedWonValueField = document.getElementById('closedWonValueField');
    if (closedWonValueField) closedWonValueField.addEventListener('change', updateDefaultSettings);
    
    const ruleField = document.getElementById('ruleField');
    if (ruleField) ruleField.addEventListener('change', onRuleFieldChange);
    
    const ruleForm = document.getElementById('ruleForm');
    if (ruleForm) ruleForm.addEventListener('submit', saveRule);
    
    const cancelRuleBtn = document.getElementById('cancelRule');
    if (cancelRuleBtn) cancelRuleBtn.addEventListener('click', closeRuleModal);
    

    
    // Modal close
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeModal);
    });
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('leadModal');
        const ruleModal = document.getElementById('ruleModal');
        if (event.target === modal) {
            closeModal();
        } else if (event.target === ruleModal) {
            closeRuleModal();
        }
    });

    // Enable debug mode if requested
    if (localStorage.getItem('debug') === 'true') {
        console.log('Debug mode enabled');
        window.debugMode = true;
    }

    // Load default settings
    loadDefaultSettings();

    // Load lists on startup
    loadLists();
}

// API Key management
function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
        localStorage.setItem('affinityApiKey', apiKey);
        showNotification('API key saved successfully!', 'success');
        loadLists(); // Reload lists with new API key
    } else {
        showNotification('Please enter a valid API key', 'error');
    }
}

// Load lists from Affinity API
async function loadLists() {
    try {
        showLoading('Loading lists...');
        const response = await fetch('/api/lists');
        const responseData = await response.json();
        
        // Handle the API response structure with data wrapper
        const lists = responseData.data || responseData;
        
        const listSelect = document.getElementById('listSelect');
        if (listSelect) {
            listSelect.innerHTML = '<option value="">Select a list...</option>';
            
            if (Array.isArray(lists)) {
                lists.forEach(list => {
                    const option = document.createElement('option');
                    option.value = list.id;
                    option.textContent = `${list.name} (${list.list_size || 0} entries)`;
                    listSelect.appendChild(option);
                });
            } else {
                console.error('Lists is not an array:', lists);
                showNotification('Invalid list data received', 'error');
            }
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error loading lists:', error);
        showNotification('Failed to load lists. Please check your API key.', 'error');
        hideLoading();
    }
}

// Handle list selection change
async function onListChange() {
    const listId = document.getElementById('listSelect').value;
    if (!listId) return;

    try {
        showLoading('Loading fields...');
        
        // Load fields for the selected list
        const response = await fetch(`/api/lists/${listId}/fields`);
        const responseData = await response.json();
        
        // Handle the API response structure with data wrapper
        const fields = responseData.data || responseData;
        
        if (Array.isArray(fields)) {
            // Populate field dropdowns
            populateFieldDropdown('stageField', fields, 'Status');
            populateFieldDropdown('valueField', fields, 'Amount');
            populateFieldDropdown('sourceField', fields, 'Source');
            populateFieldDropdown('firstEmailField', fields, 'FirstEmail');
        } else {
            console.error('Fields is not an array:', fields);
            showNotification('Invalid field data received', 'error');
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error loading fields:', error);
        showNotification('Failed to load fields', 'error');
        hideLoading();
    }
}

// Populate field dropdown with smart defaults
function populateFieldDropdown(selectId, fields, defaultType) {
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = '<option value="">Select field...</option>';
        
        fields.forEach(field => {
            const option = document.createElement('option');
            option.value = field.id;
            option.textContent = field.name;
            
            // Auto-select based on field name patterns
            if (defaultType === 'Status' && field.name.toLowerCase().includes('status')) {
                option.selected = true;
            } else if (defaultType === 'Amount' && field.name.toLowerCase().includes('amount')) {
                option.selected = true;
            } else if (defaultType === 'Source' && field.name.toLowerCase().includes('source')) {
                option.selected = true;
            } else if (defaultType === 'FirstEmail' && (field.name.toLowerCase().includes('first') && field.name.toLowerCase().includes('email'))) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
        
        // Also populate default stage field dropdown if it exists and we're populating stage fields
        if (selectId === 'stageField' && document.getElementById('defaultStageField')) {
            const defaultStageFieldSelect = document.getElementById('defaultStageField');
            if (defaultStageFieldSelect) {
                defaultStageFieldSelect.innerHTML = '<option value="">Select stage field...</option>';
                
                fields.forEach(field => {
                    const option = document.createElement('option');
                    option.value = field.id; // Use field ID for default stage field
                    option.textContent = field.name;
                    defaultStageFieldSelect.appendChild(option);
                });
                
                // Auto-select the stage field if it matches the current stage field selection
                const stageFieldSelect = document.getElementById('stageField');
                if (stageFieldSelect && stageFieldSelect.value) {
                    defaultStageFieldSelect.value = stageFieldSelect.value;
                }
            }
        }
        
        // Also populate closed/won stage dropdown if it exists and we're populating stage fields
        if (selectId === 'stageField' && document.getElementById('closedWonStage')) {
            const closedWonStageSelect = document.getElementById('closedWonStage');
            if (closedWonStageSelect) {
                closedWonStageSelect.innerHTML = '<option value="">Select stage value...</option>';
                
                // Don't populate with field names - we'll populate with actual stage values after data is loaded
                // This will be handled by populateClosedWonStageValues() after pipeline data is loaded
            }
        }
        
        // Also populate closed/won value field dropdown if it exists and we're populating value fields
        if (selectId === 'valueField' && document.getElementById('closedWonValueField')) {
            const closedWonValueFieldSelect = document.getElementById('closedWonValueField');
            if (closedWonValueFieldSelect) {
                closedWonValueFieldSelect.innerHTML = '<option value="">Select value field...</option>';
                
                fields.forEach(field => {
                    const option = document.createElement('option');
                    option.value = field.name; // Use field name for closed/won value field
                    option.textContent = field.name;
                    closedWonValueFieldSelect.appendChild(option);
                });
            }
        }
        

    }
    
}

// Load pipeline data
async function loadPipelineData() {
    const listId = document.getElementById('listSelect').value;
    const stageFieldId = document.getElementById('stageField').value;
    const valueFieldId = document.getElementById('valueField').value;
    const sourceFieldId = document.getElementById('sourceField').value;
    
    if (!listId || !stageFieldId || !valueFieldId) {
        showNotification('Please select a list and required fields', 'error');
        return;
    }
    
    try {
        showLoading('Loading pipeline data...');
        
        // Store field mappings
        fieldMappings = {
            stage: stageFieldId,
            value: valueFieldId,
            source: sourceFieldId
        };
        
        // Store new field mappings
        firstEmailField = document.getElementById('firstEmailField').value;
        
        console.log('Loading pipeline data for list:', listId);
        console.log('Field mappings:', fieldMappings);
        
        // Load pipeline data
        const response = await fetch(`/api/pipeline-data?listId=${listId}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', response.status, errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Received pipeline data:', data);
        
        // Handle the new API structure where field values are included in list entries
        const pipelineData = data.pipeline_data || data.list_entries || [];
        
        if (!pipelineData || pipelineData.length === 0) {
            throw new Error('No pipeline data found. Check if your list contains leads with the selected fields.');
        }
        
        // Log the structure of the first entry to debug
        if (pipelineData.length > 0) {
            console.log('First entry structure:', pipelineData[0]);
        }
        
        currentData = await processPipelineDataWithDefaults(data);
        console.log('Processed data:', currentData);
        
        if (currentData.leads.length === 0) {
            throw new Error('No leads found with the selected stage field. Please check your field selections.');
        }
        
        initializeStageWeights();
        updateVisualization();
        updateSummaryStats();
        
        // Populate default stage values if a field is selected
        await populateDefaultStageValues();
        
        // Populate closed/won stage values
        populateClosedWonStageValues();
        
        hideLoading();
        showNotification(`Pipeline data loaded successfully! Found ${currentData.leads.length} leads across ${currentData.stages.length} stages.`, 'success');
        
    } catch (error) {
        console.error('Error loading pipeline data:', error);
        showNotification(`Failed to load pipeline data: ${error.message}`, 'error');
        hideLoading();
    }
}

// Process pipeline data
function processPipelineData(data) {
    const processed = {
        leads: [],
        stages: new Set(),
        sources: new Set(),
        totalValue: 0,
        totalLeads: 0,
        fields: data.fields || [] // Add fields to processed data
    };
    
    // Handle both old and new API structures
    const pipelineData = data.pipeline_data || data.list_entries || [];
    
    pipelineData.forEach(lead => {
        // In the new API structure, field values are included directly in the lead object
        const fieldValues = lead.field_values || lead.fields || [];
        
        const leadData = {
            id: lead.id,
            entity_id: lead.entity_id,
            entity: lead.entity,
            stage: null,
            value: 0,
            source: null,
            lastContact: null, // Add lastContact field
            contactDirection: null, // Add contact direction (who sent to whom)
            contactType: null, // Add contact type (email, meeting, etc.)
            firstEmail: null, // Add first email field
            leadAge: null, // Add lead age calculation
            field_values: fieldValues
        };
        
        // Extract field values from the new API structure
        fieldValues.forEach(fieldValue => {
            const fieldId = fieldValue.id;
            
            // Handle different value types from the new API structure
            let fieldValueData = null;
            if (fieldValue.value && fieldValue.value.data) {
                // New API structure: value.data contains the actual value
                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                    fieldValueData = fieldValue.value.data?.text;
                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'text') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'dropdown-multi') {
                    // Handle multi-select dropdowns - convert array to readable string
                    if (Array.isArray(fieldValue.value.data)) {
                        fieldValueData = fieldValue.value.data.join(', ');
                    } else if (typeof fieldValue.value.data === 'object') {
                        // If it's an object with text properties, extract them
                        const texts = Object.values(fieldValue.value.data).filter(val => typeof val === 'string');
                        fieldValueData = texts.join(', ');
                    } else {
                        fieldValueData = String(fieldValue.value.data);
                    }
                } else if (fieldValue.value.type === 'interaction') {
                    // For relationship-intelligence fields, get the date
                    if (fieldValue.value.data?.sentAt) {
                        fieldValueData = fieldValue.value.data.sentAt;
                    } else if (fieldValue.value.data?.startTime) {
                        fieldValueData = fieldValue.value.data.startTime;
                    }
                } else {
                    // For any other type, convert to string safely
                    if (typeof fieldValue.value.data === 'object') {
                        fieldValueData = JSON.stringify(fieldValue.value.data);
                    } else {
                        fieldValueData = String(fieldValue.value.data);
                    }
                }
            } else {
                // Fallback to old structure
                fieldValueData = fieldValue.value?.text || fieldValue.value;
            }
            
            // Ensure fieldValueData is always a string for display
            if (typeof fieldValueData === 'object') {
                fieldValueData = JSON.stringify(fieldValueData);
            } else if (fieldValueData !== null && fieldValueData !== undefined) {
                fieldValueData = String(fieldValueData);
            } else {
                fieldValueData = '';
            }
            
            if (fieldId == fieldMappings.stage) {
                leadData.stage = fieldValueData;
            } else if (fieldId == fieldMappings.value) {
                leadData.value = parseFloat(fieldValueData) || 0;
            } else if (fieldId == fieldMappings.source) {
                // Handle source field specifically - if it's null or empty object, set to empty string
                if (fieldValueData === '' || fieldValueData === '{"type":"dropdown-multi","data":null}' || fieldValueData === '[object Object]') {
                    leadData.source = '';
                } else {
                    leadData.source = fieldValueData;
                }
                console.log('Source field processed:', fieldId, fieldValueData, typeof fieldValueData);
            } else if (fieldId == firstEmailField) {
                leadData.firstEmail = fieldValueData;
                // Calculate lead age from first email date
                if (fieldValueData) {
                    const firstEmailDate = new Date(fieldValueData);
                    if (!isNaN(firstEmailDate.getTime())) {
                        const now = new Date();
                        const ageInDays = Math.floor((now - firstEmailDate) / (1000 * 60 * 60 * 24));
                        leadData.leadAge = ageInDays;
                    }
                }
            }
        });
        
        // Extract Last Contact and Contact Direction from relationship-intelligence fields
        const lastContactField = fieldValues.find(fv => fv.id === 'last-contact');
        if (lastContactField && lastContactField.value && lastContactField.value.data) {
            const contactData = lastContactField.value.data;
            
            // Get the interaction type
            leadData.contactType = contactData.type || 'unknown';
            
            if (contactData.sentAt) {
                leadData.lastContact = contactData.sentAt;
            } else if (contactData.startTime) {
                leadData.lastContact = contactData.startTime;
            }
            
            // Extract contact direction information
            if (contactData.from && contactData.to) {
                const fromPerson = contactData.from.person;
                const toPerson = contactData.to[0]?.person; // Get first recipient
                
                if (fromPerson && toPerson) {
                    const fromName = `${fromPerson.firstName || ''} ${fromPerson.lastName || ''}`.trim();
                    const toName = `${toPerson.firstName || ''} ${toPerson.lastName || ''}`.trim();
                    
                    // For emails, just show who sent to whom
                    leadData.contactDirection = `${fromName} emailed ${toName}`;
                }
            } else {
                // For non-email interactions, show the type
                leadData.contactDirection = `Last contact was a ${contactData.type}`;
            }
        }
        
        if (leadData.stage) {
            processed.stages.add(leadData.stage);
            processed.leads.push(leadData);
            processed.totalValue += leadData.value;
            processed.totalLeads++;
            
            if (leadData.source) {
                processed.sources.add(leadData.source);
            }
        }
    });
    
    processed.stages = Array.from(processed.stages);
    processed.sources = Array.from(processed.sources);
    
    return processed;
}

// Initialize stage weights with exclude toggles and reorder functionality
function initializeStageWeights() {
    const container = document.getElementById('stageWeightsContainer');
    if (container) {
        container.innerHTML = '';
        
        if (!currentData || !currentData.stages.length) return;
        
        // Initialize stage order if not set
        if (stageOrder.length === 0) {
            stageOrder = [...currentData.stages];
        }
        
        // Create stage items in custom order
        stageOrder.forEach(stage => {
            const stageItem = document.createElement('div');
            stageItem.className = 'stage-item';
            stageItem.dataset.stage = stage;
            
            const isExcluded = excludedStages.has(stage);
            if (isExcluded) {
                stageItem.classList.add('excluded');
            }
            
            stageItem.innerHTML = `
                <div class="stage-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="stage-info">
                    <div class="stage-name">${stage}</div>
                    <div class="stage-exclude-toggle">
                        <input type="checkbox" data-stage="${stage}" ${isExcluded ? 'checked' : ''}>
                        <label>Exclude</label>
                    </div>
                </div>
                <div class="stage-weight-controls">
                    <input type="range" 
                           class="stage-weight-slider" 
                           min="0" 
                           max="2" 
                           step="0.1" 
                           value="${stageWeights[stage] || 1}"
                           onchange="updateStageWeight('${stage}', this.value)">
                    <span class="stage-weight-value" onclick="makeWeightEditable(this, '${stage}')">${stageWeights[stage] || 1}</span>
                </div>
            `;
            
            container.appendChild(stageItem);
            
            // Add event listener for exclude toggle
            const excludeCheckbox = stageItem.querySelector(`input[data-stage="${stage}"]`);
            if (excludeCheckbox) {
                excludeCheckbox.addEventListener('change', (e) => {
                    toggleStageExclusion(stage, e.target.checked);
                });
            }
        });
        
        // Add drag and drop functionality
        setupDragAndDrop();
    }
}

// Update stage weight
function updateStageWeight(stage, weight) {
    stageWeights[stage] = parseFloat(weight);
    const weightValue = document.querySelector(`[data-stage="${stage}"] .stage-weight-value`);
    if (weightValue) {
        weightValue.textContent = weight;
    }
    updateVisualization();
    updateSummaryStats();
}

// Make weight value editable
function makeWeightEditable(element, stage) {
    const currentValue = element.textContent;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '2';
    input.step = '0.1';
    input.value = currentValue;
    input.className = 'stage-weight-input';
    input.style.cssText = `
        width: 50px;
        padding: 2px 4px;
        border: 1px solid #667eea;
        border-radius: 4px;
        font-size: 14px;
        text-align: center;
    `;
    
    // Replace span with input
    element.style.display = 'none';
    element.parentNode.insertBefore(input, element.nextSibling);
    input.focus();
    input.select();
    
    // Handle input events
    function handleInput() {
        const newValue = parseFloat(input.value);
        if (!isNaN(newValue) && newValue >= 0 && newValue <= 2) {
            updateStageWeight(stage, newValue);
            // Update the slider to match
            const slider = document.querySelector(`[data-stage="${stage}"] .stage-weight-slider`);
            if (slider) {
                slider.value = newValue;
            }
        }
        // Restore span
        element.style.display = 'inline';
        input.remove();
    }
    
    input.addEventListener('blur', handleInput);
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleInput();
        } else if (e.key === 'Escape') {
            // Cancel editing
            element.style.display = 'inline';
            input.remove();
        }
    });
}

// Reset weights
function resetWeights() {
    // Reset stage weights
    stageWeights = {};
    
    // Reset exclusions
    excludedStages.clear();
    
    // Reset stage order
    if (currentData && currentData.stages) {
        stageOrder = [...currentData.stages];
    }
    
    // Exit reorder mode if active
    if (isReorderMode) {
        toggleReorderMode();
    }
    
    initializeStageWeights();
    updateVisualization();
    updateSummaryStats();
}

// Update visualization
function updateVisualization() {
    if (!currentData) return;
    
    createFunnelVisualization();
    
    if (currentView === 'pipeline') {
        createPipelineVisualization();
    } else {
        createDetailedView();
    }
}

// Create funnel visualization
function createFunnelVisualization() {
    const container = document.getElementById('funnelViz');
    if (container) {
        container.innerHTML = '';
        
        if (!currentData || !currentData.leads.length) {
            container.innerHTML = '<p>No data to visualize</p>';
            return;
        }
        
        // Group leads by stage, excluding excluded stages
        const stageData = stageOrder
            .filter(stage => !excludedStages.has(stage))
            .map(stage => {
                const stageLeads = currentData.leads.filter(lead => lead.stage === stage);
                const totalValue = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
                const weight = stageWeights[stage] || 1;
                const weightedValue = stageLeads.reduce((sum, lead) => sum + (lead.value * weight), 0);
                return {
                    stage,
                    leads: stageLeads,
                    totalValue,
                    weightedValue,
                    count: stageLeads.length,
                    weight: weight
                };
            }).filter(stage => stage.count > 0); // Only show stages with leads
        
        if (stageData.length === 0) {
            container.innerHTML = '<p>No stages to display</p>';
            return;
        }
        
        const colors = d3.schemeCategory10;
        
        // Create SVG for funnel
        const width = 600;
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };
        const stageHeight = 60;
        const spacing = 10;
        const totalHeight = stageData.length * (stageHeight + spacing) + margin.top + margin.bottom;
        const height = Math.max(400, totalHeight);
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('max-width', '100%')
            .style('height', 'auto');
        
        // Create funnel stages in order
        stageData.forEach((stageInfo, index) => {
            const y = margin.top + index * (stageHeight + spacing);
            
            // Calculate funnel width - improved alignment with more gradual reduction
            const maxWidth = width - margin.left - margin.right;
            const totalStages = stageData.length;
            
            // More gradual reduction: start at 95% width, reduce by smaller increments
            const startWidth = 0.95; // Start at 95% of available width
            const reductionPerStage = 0.08; // Reduce by 8% per stage instead of 15%
            const funnelRatio = Math.max(0.3, startWidth - (index * reductionPerStage)); // Minimum 30% width
            
            const stageWidth = maxWidth * funnelRatio;
            const x = (width - stageWidth) / 2;
            
            // Create funnel stage group
            const stageGroup = svg.append('g')
                .attr('class', 'funnel-stage-group')
                .style('cursor', 'pointer')
                .on('click', () => showStageDetails(stageInfo));
            
            // Create funnel stage (trapezoid shape with better alignment)
            const topWidth = stageWidth;
            const bottomWidth = index < stageData.length - 1 ? 
                maxWidth * Math.max(0.3, startWidth - ((index + 1) * reductionPerStage)) : 
                stageWidth * 0.8; // Last stage tapers to 80% of its width
            
            const points = [
                [x, y], // top-left
                [x + topWidth, y], // top-right
                [x + (topWidth - bottomWidth) / 2 + bottomWidth, y + stageHeight], // bottom-right
                [x + (topWidth - bottomWidth) / 2, y + stageHeight]  // bottom-left
            ];
            
            const line = d3.line()
                .x(d => d[0])
                .y(d => d[1]);
            
            // Create the funnel stage path
            stageGroup.append('path')
                .attr('d', line(points) + 'Z')
                .attr('fill', colors[index % colors.length])
                .attr('stroke', d3.color(colors[index % colors.length]).darker(0.3))
                .attr('stroke-width', 2)
                .style('transition', 'all 0.3s ease')
                .on('mouseover', function() {
                    d3.select(this)
                        .attr('stroke-width', 3)
                        .attr('fill', d3.color(colors[index % colors.length]).brighter(0.2));
                })
                .on('mouseout', function() {
                    d3.select(this)
                        .attr('stroke-width', 2)
                        .attr('fill', colors[index % colors.length]);
                });
            
            // Add stage name (black text)
            stageGroup.append('text')
                .attr('x', x + topWidth / 2)
                .attr('y', y + 20)
                .attr('text-anchor', 'middle')
                .attr('fill', 'black')
                .attr('font-weight', 'bold')
                .attr('font-size', '14px')
                .text(stageInfo.stage);
            
            // Add lead count (black text)
            stageGroup.append('text')
                .attr('x', x + topWidth / 2)
                .attr('y', y + 35)
                .attr('text-anchor', 'middle')
                .attr('fill', 'black')
                .attr('font-size', '12px')
                .text(`${stageInfo.count} leads`);
            
            // Add weighted value (black text)
            stageGroup.append('text')
                .attr('x', x + topWidth / 2)
                .attr('y', y + 50)
                .attr('text-anchor', 'middle')
                .attr('fill', 'black')
                .attr('font-weight', 'bold')
                .attr('font-size', '12px')
                .text(formatCurrency(stageInfo.weightedValue));
        });
    }
}

// Create pipeline visualization
function createPipelineVisualization() {
    const container = document.getElementById('pipelineViz');
    if (container) {
        container.innerHTML = '';
        
        const width = container.clientWidth;
        const height = 400;
        const margin = { top: 20, right: 20, bottom: 80, left: 60 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);
        
        // Group leads by stage, excluding excluded stages
        const stageData = stageOrder
            .filter(stage => !excludedStages.has(stage))
            .map(stage => {
                const stageLeads = currentData.leads.filter(lead => lead.stage === stage);
                const totalValue = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
                const weight = stageWeights[stage] || 1;
                const weightedValue = totalValue * weight;
                
                return {
                    stage,
                    leads: stageLeads,
                    totalValue,
                    weightedValue,
                    count: stageLeads.length,
                    weight: weight
                };
            }).filter(stage => stage.count > 0); // Only show stages with leads
        
        // Scales
        const xScale = d3.scaleBand()
            .domain(stageData.map(d => d.stage))
            .range([margin.left, width - margin.right])
            .padding(0.1);
        
        const maxValue = d3.max(stageData, d => d.weightedValue);
        const yScale = d3.scaleLinear()
            .domain([0, maxValue || 1])
            .range([height - margin.bottom, margin.top]);
        
        // Create stage bars
        const stageGroups = svg.selectAll('.stage-group')
            .data(stageData)
            .enter()
            .append('g')
            .attr('class', 'stage-group')
            .attr('transform', d => `translate(${xScale(d.stage)}, 0)`);
        
        // Stage bars
        stageGroups.append('rect')
            .attr('class', 'pipeline-stage')
            .attr('x', 0)
            .attr('y', d => yScale(d.weightedValue))
            .attr('width', xScale.bandwidth())
            .attr('height', d => Math.max(0, height - margin.bottom - yScale(d.weightedValue)))
            .style('fill', (d, i) => colorSchemes.stages(i))
            .on('click', function(event, d) {
                showStageDetails(d);
            });
        
        // Stage labels
        stageGroups.append('text')
            .attr('class', 'stage-label')
            .attr('x', xScale.bandwidth() / 2)
            .attr('y', height - margin.bottom + 25)
            .text(d => d.stage)
            .style('fill', '#333')
            .style('font-size', '10px')
            .style('text-anchor', 'middle')
            .attr('transform', `rotate(-45, ${xScale.bandwidth() / 2}, ${height - margin.bottom + 25})`);
        
        // Value labels
        stageGroups.append('text')
            .attr('class', 'stage-value')
            .attr('x', xScale.bandwidth() / 2)
            .attr('y', d => d.weightedValue === 0 ? height - margin.bottom + 35 : yScale(d.weightedValue) - 10)
            .text(d => formatCurrency(d.weightedValue))
            .style('fill', '#333')
            .style('font-size', '11px')
            .style('text-anchor', 'middle');
        
        // Y-axis
        const yAxis = d3.axisLeft(yScale)
            .tickFormat(d => `$${formatCurrency(d)}`);
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(yAxis);
        
        // Create legend
        createLegend();
    }
}

// Create detailed view
function createDetailedView() {
    const container = document.getElementById('detailedView');
    if (container) {
        container.classList.remove('hidden');
        
        const leadDetails = document.getElementById('leadDetails');
        if (leadDetails) {
            leadDetails.innerHTML = '';
            
            currentData.leads.forEach(lead => {
                const leadCard = document.createElement('div');
                leadCard.className = 'lead-card';
                leadCard.onclick = () => showLeadDetails(lead);
                

                
                leadCard.innerHTML = `
                    <h4>${lead.entity?.name || `Lead ${lead.id}`}</h4>
                    <div class="lead-info">
                        <span>
                            <span class="label">Stage:</span>
                            <span class="value">${lead.stage}</span>
                        </span>
                        <span>
                            <span class="label">Value:</span>
                            <span class="value">$${formatCurrency(lead.value)}</span>
                        </span>
                        <span>
                            <span class="label">Source:</span>
                            <span class="value">${lead.source || 'N/A'}</span>
                        </span>
                        <span>
                            <span class="label">Contact Direction:</span>
                            <span class="value">${lead.contactDirection || 'N/A'}</span>
                        </span>
                        <span>
                            <span class="label">Contact Type:</span>
                            <span class="value">${lead.contactType || 'N/A'}</span>
                        </span>
                        <span>
                            <span class="label">Lead Age:</span>
                            <span class="value">${lead.leadAge !== null ? `${lead.leadAge} days` : 'N/A'}</span>
                        </span>
                        <span>
                            <span class="label">Last Contact:</span>
                            <span class="value">${lead.lastContact ? formatLastContact(lead.lastContact) : 'N/A'}</span>
                        </span>
                        <span>
                            <span class="label">Weighted Value:</span>
                            <span class="value">$${formatCurrency(lead.value * (stageWeights[lead.stage] || 1))}</span>
                        </span>

                    </div>
                `;
                
                leadDetails.appendChild(leadCard);
            });
        }
    }
}

// Toggle view
function toggleView() {
    currentView = currentView === 'pipeline' ? 'detailed' : 'pipeline';
    document.getElementById('toggleView').textContent = 
        currentView === 'pipeline' ? 'Show Details' : 'Show Pipeline';
    
    if (currentView === 'pipeline') {
        document.getElementById('detailedView').classList.add('hidden');
        document.getElementById('pipelineViz').classList.remove('hidden');
    } else {
        document.getElementById('detailedView').classList.remove('hidden');
        document.getElementById('pipelineViz').classList.add('hidden');
    }
    
    updateVisualization();
}

// Update summary statistics
function updateSummaryStats() {
    if (!currentData) return;
    
    const totalValue = currentData.totalValue;
    const totalLeads = currentData.totalLeads;
    const weightedValue = currentData.leads.reduce((sum, lead) => {
        // Skip excluded stages
        if (excludedStages.has(lead.stage)) {
            return sum;
        }
        return sum + (lead.value * (stageWeights[lead.stage] || 1));
    }, 0);
    
    // Calculate average contact days for entire list
    const averageContactDays = calculateAverageContactDays(currentData.leads);
    
    // Calculate average lead age for entire list
    const averageLeadAge = calculateAverageLeadAge(currentData.leads);
    
    // Calculate average lead age per stage
    const stageAges = calculateStageAges(currentData.leads);
    
    document.getElementById('totalValue').textContent = `$${formatCurrency(totalValue)}`;
    document.getElementById('totalLeads').textContent = totalLeads;
    document.getElementById('weightedValue').textContent = `$${formatCurrency(weightedValue)}`;
    
    // Add contact info to summary if element exists
    const contactInfoElement = document.getElementById('contactInfo');
    if (contactInfoElement) {
        let contactInfo = '';
        if (averageContactDays !== null) {
            const urgencyColor = getContactUrgencyColor(averageContactDays + ' days ago');
            contactInfo += `<strong>Average Days Since Last Contact:</strong> <span style="color: ${urgencyColor}; font-weight: bold;">${averageContactDays} days</span><br/>`;
        } else {
            contactInfo += `<strong>Average Days Since Last Contact:</strong> <span style="color: #999;">No contact data</span><br/>`;
        }
        
        if (averageLeadAge !== null) {
            contactInfo += `<strong>Average Lead Age:</strong> <span style="font-weight: bold;">${averageLeadAge} days</span>`;
        } else {
            contactInfo += `<strong>Average Lead Age:</strong> <span style="color: #999;">No age data</span>`;
        }
        
        contactInfoElement.innerHTML = contactInfo;
    }
    
    // Add stage age info if element exists
    const stageAgeElement = document.getElementById('stageAges');
    if (stageAgeElement && Object.keys(stageAges).length > 0) {
        let stageAgeInfo = '<strong>Average Lead Age by Stage:</strong><br/>';
        Object.entries(stageAges).forEach(([stage, age]) => {
            stageAgeInfo += `${stage}: ${age} days<br/>`;
        });
        stageAgeElement.innerHTML = stageAgeInfo;
    }
}

// Create legend
function createLegend() {
    const legendContainer = document.getElementById('legendItems');
    if (legendContainer) {
        legendContainer.innerHTML = '';
        
        // Stage legend
        currentData.stages.forEach((stage, index) => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <div class="legend-color" style="background-color: ${colorSchemes.stages(index)}"></div>
                <span>${stage} (${stageWeights[stage] || 1}x)</span>
            `;
            legendContainer.appendChild(legendItem);
        });
        
        // Value range legend
        const valueRanges = [
            { label: 'High Value', class: 'high-value', min: 100000 },
            { label: 'Medium Value', class: 'medium-value', min: 10000, max: 99999 },
            { label: 'Low Value', class: 'low-value', max: 9999 }
        ];
        
        valueRanges.forEach(range => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <div class="legend-color ${range.class}"></div>
                <span>${range.label}</span>
            `;
            legendContainer.appendChild(legendItem);
        });
    }
}

// Show stage details
function showStageDetails(stageData) {
    const modal = document.getElementById('leadModal');
    const content = document.getElementById('modalContent');
    
            // Calculate average last contact time for this stage
    const averageContactDays = calculateAverageContactDays(stageData.leads);
    
    // Calculate average lead age for this stage
    const averageLeadAge = calculateAverageLeadAge(stageData.leads);
    
    content.innerHTML = `
        <h3>${stageData.stage} Stage</h3>
        <div class="stage-stats">
            <p><strong>Total Value:</strong> $${formatCurrency(stageData.totalValue)}</p>
            <p><strong>Weighted Value:</strong> $${formatCurrency(stageData.weightedValue)}</p>
            <p><strong>Number of Leads:</strong> ${stageData.count}</p>
            <p><strong>Stage Weight:</strong> ${stageWeights[stageData.stage] || 1}x</p>
            ${averageContactDays !== null ? `<p><strong>Average Days Since Last Contact:</strong> <span style="color: ${getContactUrgencyColor(averageContactDays + ' days ago')};">${averageContactDays} days</span></p>` : ''}
            ${averageLeadAge !== null ? `<p><strong>Average Lead Age:</strong> ${averageLeadAge} days</p>` : ''}
        </div>
        <h4>Leads in this stage:</h4>
        <div class="leads-list">
            ${stageData.leads.map(lead => {
                const urgencyColor = getContactUrgencyColor(lead.lastContact);
                const lastContactInfo = lead.lastContact ? 
                    `<span class="last-contact" style="color: ${urgencyColor}; font-weight: bold;">Last Contact: ${formatLastContact(lead.lastContact)}</span>` :
                    `<span class="last-contact" style="color: ${urgencyColor};">No contact info</span>`;
                
                return `
                    <div class="lead-item">
                        <strong>${lead.entity?.name || `Lead ${lead.id}`}</strong>
                        <div class="lead-details">
                            <span class="lead-value">$${formatCurrency(lead.value)}</span>
                            ${lead.source ? `<span class="lead-source">Source: ${lead.source}</span>` : ''}
                            ${lead.contactDirection ? `<span class="lead-contact">Contact: ${lead.contactDirection}</span>` : ''}
                            ${lead.contactType ? `<span class="lead-type">Type: ${lead.contactType}</span>` : ''}
                            ${lead.leadAge !== null ? `<span class="lead-age">Age: ${lead.leadAge} days</span>` : ''}
                            ${lastContactInfo}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    modal.classList.remove('hidden');
}

// Show lead details
function showLeadDetails(lead) {
    const modal = document.getElementById('leadModal');
    const content = document.getElementById('modalContent');
    
    const urgencyColor = getContactUrgencyColor(lead.lastContact);
    const lastContactInfo = lead.lastContact ? 
        `<p><strong>Last Contact:</strong> <span style="color: ${urgencyColor}; font-weight: bold;">${formatLastContact(lead.lastContact)}</span></p>` : 
        `<p><strong>Last Contact:</strong> <span style="color: ${urgencyColor};">No contact information available</span></p>`;
    
    content.innerHTML = `
        <h3>${lead.entity?.name || `Lead ${lead.id}`}</h3>
        <div class="lead-detail-stats">
            <p><strong>Stage:</strong> ${lead.stage}</p>
            <p><strong>Value:</strong> $${formatCurrency(lead.value)}</p>
            <p><strong>Weighted Value:</strong> $${formatCurrency(lead.value * (stageWeights[lead.stage] || 1))}</p>
            ${lead.source ? `<p><strong>Source:</strong> ${lead.source}</p>` : ''}
            ${lead.contactDirection ? `<p><strong>Contact Direction:</strong> ${lead.contactDirection}</p>` : ''}
            ${lead.contactType ? `<p><strong>Contact Type:</strong> ${lead.contactType}</p>` : ''}
            ${lead.leadAge !== null ? `<p><strong>Lead Age:</strong> ${lead.leadAge} days</p>` : ''}
            ${lastContactInfo}
            <p><strong>Lead ID:</strong> ${lead.id}</p>
            <p><strong>Entity ID:</strong> ${lead.entity_id}</p>
        </div>
        <h4>Lead Information:</h4>
        <div class="field-values">
            <div class="field-item">
                <strong>Stage:</strong> ${lead.stage}
            </div>
            <div class="field-item">
                <strong>Value:</strong> $${formatCurrency(lead.value)}
            </div>
            ${lead.source ? `<div class="field-item"><strong>Source:</strong> ${lead.source}</div>` : ''}
            ${lead.contactDirection ? `<div class="field-item"><strong>Contact Direction:</strong> ${lead.contactDirection}</div>` : ''}
            ${lead.contactType ? `<div class="field-item"><strong>Contact Type:</strong> ${lead.contactType}</div>` : ''}
            ${lead.leadAge !== null ? `<div class="field-item"><strong>Lead Age:</strong> ${lead.leadAge} days</div>` : ''}
            ${lead.lastContact ? `<div class="field-item"><strong>Last Contact:</strong> ${formatLastContact(lead.lastContact)}</div>` : ''}
        </div>
    `;
    
    modal.classList.remove('hidden');
}

// Show tooltip
function showTooltip(event, lead) {
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);
    
    tooltip.transition()
        .duration(200)
        .style('opacity', 1);
    
    tooltip.html(`
        <strong>${lead.entity?.name || `Lead ${lead.id}`}</strong><br/>
        Stage: ${lead.stage}<br/>
        Value: $${formatCurrency(lead.value)}<br/>
        ${lead.source ? `Source: ${lead.source}<br/>` : ''}
        ${lead.contactDirection ? `Contact: ${lead.contactDirection}<br/>` : ''}
        ${lead.contactType ? `Type: ${lead.contactType}<br/>` : ''}
        ${lead.leadAge !== null ? `Age: ${lead.leadAge} days<br/>` : ''}
        Weighted: $${formatCurrency(lead.value * (stageWeights[lead.stage] || 1))}
    `)
    .style('left', (event.pageX + 10) + 'px')
    .style('top', (event.pageY - 10) + 'px');
}

// Hide tooltip
function hideTooltip() {
    d3.selectAll('.tooltip').remove();
}

// Close modal
function closeModal() {
    const modal = document.getElementById('leadModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Refresh data
function refreshData() {
    if (currentData) {
        loadPipelineData();
    }
}

// Toggle debug mode
function toggleDebugMode() {
    const debugMode = localStorage.getItem('debug') === 'true';
    if (debugMode) {
        localStorage.removeItem('debug');
        window.debugMode = false;
        showNotification('Debug mode disabled', 'info');
        console.log('Debug mode disabled');
    } else {
        localStorage.setItem('debug', 'true');
        window.debugMode = true;
        showNotification('Debug mode enabled - check console for detailed logs', 'info');
        console.log('Debug mode enabled');
    }
}

// Default Value Management Functions
function loadDefaultSettings() {
    const saved = localStorage.getItem('defaultSettings');
    if (saved) {
        defaultSettings = { ...defaultSettings, ...JSON.parse(saved) };
    } else {
        // Add some example rules for first-time users
        defaultSettings.rules = [
            {
                name: "Banks",
                field: "Industry",
                value: "Banking",
                defaultValue: 5000000
            },
            {
                name: "Universities",
                field: "Industry", 
                value: "Education",
                defaultValue: 1000000
            },
            {
                name: "Healthcare",
                field: "Industry",
                value: "Healthcare",
                defaultValue: 3000000
            }
        ];
    }
    
    // Update UI
    const defaultStageFieldInput = document.getElementById('defaultStageField');
    if (defaultStageFieldInput) defaultStageFieldInput.value = defaultSettings.defaultStageField;
    
    const defaultStageValueInput = document.getElementById('defaultStageValue');
    if (defaultStageValueInput) defaultStageValueInput.value = defaultSettings.defaultStageValue;
    
    const globalDefaultValueInput = document.getElementById('globalDefaultValue');
    if (globalDefaultValueInput) globalDefaultValueInput.value = defaultSettings.globalDefaultValue;
    
    const closedWonStageInput = document.getElementById('closedWonStage');
    if (closedWonStageInput) closedWonStageInput.value = defaultSettings.closedWonStage;
    
    const closedWonValueFieldInput = document.getElementById('closedWonValueField');
    if (closedWonValueFieldInput) closedWonValueFieldInput.value = defaultSettings.closedWonValueField;
    
    renderDefaultRules();
    updatePiggyBank();
}

// Populate default stage values from current data
async function populateDefaultStageValues() {
    const fieldId = document.getElementById('defaultStageField').value;
    const valueSelect = document.getElementById('defaultStageValue');
    
    if (!fieldId) return;
    
    try {
        // First, try to get values from current pipeline data if available
        let fieldValues = new Set();
        
        if (currentData && currentData.leads) {
            currentData.leads.forEach(lead => {
                lead.field_values.forEach(fieldValue => {
                    if (fieldValue.field_id == fieldId) {
                        const value = fieldValue.value?.text || fieldValue.value;
                        if (value) fieldValues.add(value);
                    }
                });
            });
        }
        
        // If no values from current data, try to get from field definition
        if (fieldValues.size === 0) {
            console.log('No values in current data, fetching field definition...');
            const response = await fetch(`/api/fields/${fieldId}/definition`);
            
            if (response.ok) {
                const fieldDefinition = await response.json();
                console.log('Field definition:', fieldDefinition);
                
                // Extract possible values from field definition
                if (fieldDefinition.possible_values) {
                    fieldDefinition.possible_values.forEach(possibleValue => {
                        if (possibleValue.text) {
                            fieldValues.add(possibleValue.text);
                        }
                    });
                }
                
                // Also check for dropdown options
                if (fieldDefinition.dropdown_options) {
                    fieldDefinition.dropdown_options.forEach(option => {
                        if (option.text) {
                            fieldValues.add(option.text);
                        }
                    });
                }
                
                // Check for enum_values (common in Affinity)
                if (fieldDefinition.enum_values) {
                    fieldDefinition.enum_values.forEach(enumValue => {
                        if (enumValue.text) {
                            fieldValues.add(enumValue.text);
                        }
                    });
                }
                
                // Check for value_type specific options
                if (fieldDefinition.value_type === 'Ranked Dropdown' && fieldDefinition.options) {
                    fieldDefinition.options.forEach(option => {
                        if (option.text) {
                            fieldValues.add(option.text);
                        }
                    });
                }
            } else {
                console.error('Failed to fetch field definition:', response.status);
            }
        }
        
        // Clear existing options
        if (valueSelect) {
            valueSelect.innerHTML = '<option value="">Select default stage value...</option>';
            
            // Populate the dropdown
            if (fieldValues.size > 0) {
                Array.from(fieldValues).sort().forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    valueSelect.appendChild(option);
                });
            } else {
                // If still no values found, show a helpful message
                valueSelect.innerHTML = '<option value="">No values found - try loading pipeline data first</option>';
            }
        }
        
    } catch (error) {
        console.error('Error populating default stage values:', error);
        if (valueSelect) valueSelect.innerHTML = '<option value="">Error loading values</option>';
    }
}

// Populate closed/won stage values
function populateClosedWonStageValues() {
    const valueSelect = document.getElementById('closedWonStage');
    
    if (!currentData) return;
    
    // Clear existing options
    if (valueSelect) {
        valueSelect.innerHTML = '<option value="">Select stage value...</option>';
    }
    
    // Get unique stage values from the current data (same as stage weights)
    const stageValues = new Set();
    
    currentData.leads.forEach(lead => {
        if (lead.stage) {
            stageValues.add(lead.stage);
        }
    });
    
    // Populate the dropdown with stage values (same as stage weights)
    if (valueSelect) {
        Array.from(stageValues).sort().forEach(stage => {
            const option = document.createElement('option');
            option.value = stage;
            option.textContent = stage;
            valueSelect.appendChild(option);
        });
    }
}

// Handle rule field change to populate value dropdown
async function onRuleFieldChange() {
    const fieldName = document.getElementById('ruleField').value;
    const valueInput = document.getElementById('ruleValue');
    
    if (!fieldName) {
        if (valueInput) valueInput.innerHTML = '<option value="">Select field first...</option>';
        return;
    }
    
    // Clear the value dropdown
    if (valueInput) valueInput.innerHTML = '<option value="">Loading values...</option>';
    
    try {
        // Find the field by name
        const field = currentData.fields.find(f => f.name === fieldName);
        if (!field) {
            if (valueInput) valueInput.innerHTML = '<option value="">Field not found</option>';
            return;
        }
        
        // Try to get values from current pipeline data first
        let fieldValues = new Set();
        
        if (currentData && currentData.leads) {
            currentData.leads.forEach(lead => {
                lead.field_values.forEach(fieldValue => {
                    if (fieldValue.field_id == field.id) {
                        const value = fieldValue.value?.text || fieldValue.value;
                        if (value) fieldValues.add(value);
                    }
                });
            });
        }
        
        // If no values from current data, try to get from field definition
        if (fieldValues.size === 0) {
            console.log('No values in current data, fetching field definition...');
            const response = await fetch(`/api/fields/${field.id}/definition`);
            
            if (response.ok) {
                const fieldDefinition = await response.json();
                console.log('Field definition:', fieldDefinition);
                
                // Extract possible values from field definition
                if (fieldDefinition.possible_values) {
                    fieldDefinition.possible_values.forEach(possibleValue => {
                        if (possibleValue.text) {
                            fieldValues.add(possibleValue.text);
                        }
                    });
                }
                
                // Also check for dropdown options
                if (fieldDefinition.dropdown_options) {
                    fieldDefinition.dropdown_options.forEach(option => {
                        if (option.text) {
                            fieldValues.add(option.text);
                        }
                    });
                }
                
                // Check for enum_values (common in Affinity)
                if (fieldDefinition.enum_values) {
                    fieldDefinition.enum_values.forEach(enumValue => {
                        if (enumValue.text) {
                            fieldValues.add(enumValue.text);
                        }
                    });
                }
                
                // Check for value_type specific options
                if (fieldDefinition.value_type === 'Ranked Dropdown' && fieldDefinition.options) {
                    fieldDefinition.options.forEach(option => {
                        if (option.text) {
                            fieldValues.add(option.text);
                        }
                    });
                }
            } else {
                console.error('Failed to fetch field definition:', response.status);
            }
        }
        
        // Clear loading message
        if (valueInput) valueInput.innerHTML = '<option value="">Select value...</option>';
        
        // Populate the dropdown
        if (valueInput) {
            if (fieldValues.size > 0) {
                Array.from(fieldValues).sort().forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    valueInput.appendChild(option);
                });
            } else {
                // If still no values found, show a helpful message
                valueInput.innerHTML = '<option value="">No values found - try loading pipeline data first</option>';
            }
        }
        
    } catch (error) {
        console.error('Error processing field values:', error);
        if (valueInput) valueInput.innerHTML = '<option value="">Error loading values</option>';
    }
}



// Handle default stage field change
async function onDefaultStageFieldChange() {
    const fieldId = document.getElementById('defaultStageField').value;
    const valueSelect = document.getElementById('defaultStageValue');
    
    // Clear the value dropdown
    if (valueSelect) valueSelect.innerHTML = '<option value="">Loading values...</option>';
    
    if (!fieldId) return;
    
    try {
        // First, try to get values from current pipeline data if available
        let fieldValues = new Set();
        
        if (currentData && currentData.leads) {
            currentData.leads.forEach(lead => {
                lead.field_values.forEach(fieldValue => {
                    if (fieldValue.field_id == fieldId) {
                        const value = fieldValue.value?.text || fieldValue.value;
                        if (value) fieldValues.add(value);
                    }
                });
            });
        }
        
        // If no values from current data, try to get from field definition
        if (fieldValues.size === 0) {
            console.log('No values in current data, fetching field definition...');
            const response = await fetch(`/api/fields/${fieldId}/definition`);
            
            if (response.ok) {
                const fieldDefinition = await response.json();
                console.log('Field definition:', fieldDefinition);
                
                // Extract possible values from field definition
                if (fieldDefinition.possible_values) {
                    fieldDefinition.possible_values.forEach(possibleValue => {
                        if (possibleValue.text) {
                            fieldValues.add(possibleValue.text);
                        }
                    });
                }
                
                // Also check for dropdown options
                if (fieldDefinition.dropdown_options) {
                    fieldDefinition.dropdown_options.forEach(option => {
                        if (option.text) {
                            fieldValues.add(option.text);
                        }
                    });
                }
                
                // Check for enum_values (common in Affinity)
                if (fieldDefinition.enum_values) {
                    fieldDefinition.enum_values.forEach(enumValue => {
                        if (enumValue.text) {
                            fieldValues.add(enumValue.text);
                        }
                    });
                }
                
                // Check for value_type specific options
                if (fieldDefinition.value_type === 'Ranked Dropdown' && fieldDefinition.options) {
                    fieldDefinition.options.forEach(option => {
                        if (option.text) {
                            fieldValues.add(option.text);
                        }
                    });
                }
            } else {
                console.error('Failed to fetch field definition:', response.status);
            }
        }
        
        // Clear loading message
        if (valueSelect) valueSelect.innerHTML = '<option value="">Select default stage value...</option>';
        
        // Populate the dropdown
        if (valueSelect) {
            if (fieldValues.size > 0) {
                Array.from(fieldValues).sort().forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    valueSelect.appendChild(option);
                });
            } else {
                // If still no values found, show a helpful message
                valueSelect.innerHTML = '<option value="">No values found - try loading pipeline data first</option>';
            }
        }
        
        // Update settings
        updateDefaultSettings();
        
    } catch (error) {
        console.error('Error processing field values:', error);
        if (valueSelect) valueSelect.innerHTML = '<option value="">Error loading values</option>';
    }
}

function updateDefaultSettings() {
    defaultSettings.defaultStageField = document.getElementById('defaultStageField').value;
    defaultSettings.defaultStageValue = document.getElementById('defaultStageValue').value;
    defaultSettings.globalDefaultValue = parseFloat(document.getElementById('globalDefaultValue').value) || 1000000;
    defaultSettings.closedWonStage = document.getElementById('closedWonStage').value;
    defaultSettings.closedWonValueField = document.getElementById('closedWonValueField').value;
    
    localStorage.setItem('defaultSettings', JSON.stringify(defaultSettings));
    
    // Re-process data if we have current data
    if (currentData) {
        // The original loadPipelineData calls processPipelineDataWithDefaults,
        // which now fetches last contact info. We need to re-call loadPipelineData
        // to ensure all data is processed correctly, including the new field.
        // However, the current structure of loadPipelineData doesn't allow
        // for a direct re-call here. A more robust solution would involve
        // a separate function for re-processing or a flag to indicate
        // if the data needs to be re-processed.
        // For now, we'll just update the UI elements.
        updateVisualization();
        updateSummaryStats();
        updatePiggyBank();
    }
}

function renderDefaultRules() {
    const container = document.getElementById('defaultValueRules');
    if (container) {
        container.innerHTML = '';
        
        defaultSettings.rules.forEach((rule, index) => {
            const ruleElement = document.createElement('div');
            ruleElement.className = 'rule-item';
            ruleElement.innerHTML = `
                <div class="rule-header">
                    <div class="rule-title">${rule.name}</div>
                    <div class="rule-actions">
                        <button class="edit-rule" onclick="editRule(${index})">Edit</button>
                        <button class="delete-rule" onclick="deleteRule(${index})">Delete</button>
                    </div>
                </div>
                <div class="rule-content">
                    <div class="rule-field">
                        <label>Field:</label>
                        <span>${rule.field}</span>
                    </div>
                    <div class="rule-field">
                        <label>Value:</label>
                        <span>${rule.value}</span>
                    </div>
                    <div class="rule-field">
                        <label>Default Value:</label>
                        <span>$${formatCurrency(rule.defaultValue)}</span>
                    </div>
                </div>
            `;
            container.appendChild(ruleElement);
        });
    }
}

function showRuleModal(ruleIndex = null) {
    const modal = document.getElementById('ruleModal');
    const form = document.getElementById('ruleForm');
    const nameInput = document.getElementById('ruleName');
    const fieldInput = document.getElementById('ruleField');
    const valueInput = document.getElementById('ruleValue');
    const defaultValueInput = document.getElementById('ruleDefaultValue');
    
    // Reset modal to default rule mode
    if (modal) {
        modal.querySelector('h3').textContent = 'Default Value Rule';
        nameInput.placeholder = 'e.g., Banks, Universities, etc.';
        fieldInput.style.display = 'block';
        valueInput.style.display = 'block';
        defaultValueInput.style.display = 'block';
        
        // Show labels for all fields
        fieldInput.previousElementSibling.style.display = 'block';
        valueInput.previousElementSibling.style.display = 'block';
        defaultValueInput.previousElementSibling.style.display = 'block';
        
        // Set modal type for default rules
        form.dataset.modalType = 'defaultRule';
        
        // Populate field options
        fieldInput.innerHTML = '<option value="">Select field...</option>';
        if (currentData && currentData.fields) {
            currentData.fields.forEach(field => {
                const option = document.createElement('option');
                option.value = field.name;
                option.textContent = field.name;
                fieldInput.appendChild(option);
            });
        }
        
        // If editing existing rule
        if (ruleIndex !== null && defaultSettings.rules[ruleIndex]) {
            const rule = defaultSettings.rules[ruleIndex];
            nameInput.value = rule.name;
            fieldInput.value = rule.field;
            valueInput.value = rule.value;
            defaultValueInput.value = rule.defaultValue;
            form.dataset.editIndex = ruleIndex;
        } else {
            // New rule
            form.reset();
            delete form.dataset.editIndex;
        }
        
        modal.classList.remove('hidden');
    }
}

function closeRuleModal() {
    const modal = document.getElementById('ruleModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function saveRule(event) {
    event.preventDefault();
    
    const form = event.target;
    const modalType = form.dataset.modalType;
    
    if (modalType === 'closedWon') {
        // Handle closed/won stage
        const stage = document.getElementById('ruleName').value;
        const valueField = document.getElementById('ruleDefaultValue').value;
        
        if (!stage) {
            showNotification('Please select a stage value', 'error');
            return;
        }
        
        if (!valueField) {
            showNotification('Please select a value field for committed amount', 'error');
            return;
        }
        
        const stageData = {
            stage: stage,
            valueField: valueField
        };
        
        const editIndex = form.dataset.editIndex;
        if (editIndex !== undefined) {
            // Update existing stage
            defaultSettings.closedWonStages[editIndex] = stageData;
        } else {
            // Add new stage
            defaultSettings.closedWonStages.push(stageData);
        }
        
        localStorage.setItem('defaultSettings', JSON.stringify(defaultSettings));
        renderClosedWonStages();
        closeRuleModal();
        
        // Re-process data if we have current data
        if (currentData) {
            // The original loadPipelineData calls processPipelineDataWithDefaults,
            // which now fetches last contact info. We need to re-call loadPipelineData
            // to ensure all data is processed correctly, including the new field.
            // However, the current structure of loadPipelineData doesn't allow
            // for a direct re-call here. A more robust solution would involve
            // a separate function for re-processing or a flag to indicate
            // if the data needs to be re-processed.
            // For now, we'll just update the UI elements.
            updateVisualization();
            updateSummaryStats();
            updatePiggyBank();
        }
        
        showNotification('Closed/Won stage saved successfully!', 'success');
    } else {
        // Handle default value rule
        const name = document.getElementById('ruleName').value;
        const field = document.getElementById('ruleField').value;
        const value = document.getElementById('ruleValue').value;
        const defaultValue = parseFloat(document.getElementById('ruleDefaultValue').value);
        
        if (!name || !field || !value || !defaultValue) {
            showNotification('Please fill in all fields', 'error');
            return;
        }
        
        const rule = {
            name,
            field,
            value,
            defaultValue
        };
        
        const editIndex = form.dataset.editIndex;
        if (editIndex !== undefined) {
            // Update existing rule
            defaultSettings.rules[editIndex] = rule;
        } else {
            // Add new rule
            defaultSettings.rules.push(rule);
        }
        
        localStorage.setItem('defaultSettings', JSON.stringify(defaultSettings));
        renderDefaultRules();
        closeRuleModal();
        
        // Re-process data if we have current data
        if (currentData) {
            // The original loadPipelineData calls processPipelineDataWithDefaults,
            // which now fetches last contact info. We need to re-call loadPipelineData
            // to ensure all data is processed correctly, including the new field.
            // However, the current structure of loadPipelineData doesn't allow
            // for a direct re-call here. A more robust solution would involve
            // a separate function for re-processing or a flag to indicate
            // if the data needs to be re-processed.
            // For now, we'll just update the UI elements.
            updateVisualization();
            updateSummaryStats();
        }
        
        showNotification('Rule saved successfully!', 'success');
    }
}

function editRule(index) {
    showRuleModal(index);
}

function deleteRule(index) {
    if (confirm('Are you sure you want to delete this rule?')) {
        defaultSettings.rules.splice(index, 1);
        localStorage.setItem('defaultSettings', JSON.stringify(defaultSettings));
        renderDefaultRules();
        
            // Re-process data if we have current data
    if (currentData) {
        // The original loadPipelineData calls processPipelineDataWithDefaults,
        // which now fetches last contact info. We need to re-call loadPipelineData
        // to ensure all data is processed correctly, including the new field.
        // However, the current structure of loadPipelineData doesn't allow
        // for a direct re-call here. A more robust solution would involve
        // a separate function for re-processing or a flag to indicate
        // if the data needs to be re-processed.
        // For now, we'll just update the UI elements.
        updateVisualization();
        updateSummaryStats();
    }
    
    showNotification('Rule deleted successfully!', 'success');
    }
}

// Enhanced data processing with default values and last contact information
async function processPipelineDataWithDefaults(data) {
    const processed = {
        leads: [],
        stages: new Set(),
        sources: new Set(),
        totalValue: 0,
        totalLeads: 0,
        fields: data.fields || [], // Add fields to processed data
        rawData: data // Store raw data for reprocessing
    };
    

    
    // Handle both old and new API structures
    const pipelineData = data.pipeline_data || data.list_entries || [];
    
    // Process leads and fetch last contact information
    for (const lead of pipelineData) {
        // Debug: Log the first lead's field structure
        if (lead.id === pipelineData[0]?.id) {
            console.log('Sample field value structure:', lead.field_values?.[0]);
        }
        
        // In the new API structure, field values are included directly in the lead object
        const fieldValues = lead.field_values || lead.fields || [];
        
        const leadData = {
            id: lead.id,
            entity_id: lead.entity_id,
            entity: lead.entity,
            stage: null,
            value: 0,
            source: null,
            contactDirection: null, // Add contact direction (who sent to whom)
            contactType: null, // Add contact type (email, meeting, etc.)
            firstEmail: null, // Add first email field
            leadAge: null, // Add lead age calculation
            field_values: fieldValues,
            lastContact: null // New field for last contact information
        };
        
        // Extract field values from the new API structure
        fieldValues.forEach(fieldValue => {
            const fieldId = fieldValue.id;
            
            // Handle different value types from the new API structure
            let fieldValueData = null;
            if (fieldValue.value && fieldValue.value.data) {
                // New API structure: value.data contains the actual value
                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                    fieldValueData = fieldValue.value.data?.text;
                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'text') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'dropdown-multi') {
                    // Handle multi-select dropdowns - convert array to readable string
                    if (Array.isArray(fieldValue.value.data)) {
                        fieldValueData = fieldValue.value.data.join(', ');
                    } else if (typeof fieldValue.value.data === 'object') {
                        // If it's an object with text properties, extract them
                        const texts = Object.values(fieldValue.value.data).filter(val => typeof val === 'string');
                        fieldValueData = texts.join(', ');
                    } else {
                        fieldValueData = String(fieldValue.value.data);
                    }
                } else if (fieldValue.value.type === 'interaction') {
                    // For relationship-intelligence fields, get the date
                    if (fieldValue.value.data?.sentAt) {
                        fieldValueData = fieldValue.value.data.sentAt;
                    } else if (fieldValue.value.data?.startTime) {
                        fieldValueData = fieldValue.value.data.startTime;
                    }
                }
            } else {
                // Fallback to old structure
                fieldValueData = fieldValue.value?.text || fieldValue.value;
            }
            
            // Ensure fieldValueData is always a string for display
            if (typeof fieldValueData === 'object') {
                fieldValueData = JSON.stringify(fieldValueData);
            } else if (fieldValueData !== null && fieldValueData !== undefined) {
                fieldValueData = String(fieldValueData);
            } else {
                fieldValueData = '';
            }
            
            if (fieldId == fieldMappings.stage) {
                leadData.stage = fieldValueData;
            } else if (fieldId == fieldMappings.value) {
                leadData.value = parseFloat(fieldValueData) || 0;
            } else if (fieldId == fieldMappings.source) {
                // Handle source field specifically - if it's null or empty object, set to empty string
                if (fieldValueData === '' || fieldValueData === '{"type":"dropdown-multi","data":null}' || fieldValueData === '[object Object]') {
                    leadData.source = '';
                } else {
                    leadData.source = fieldValueData;
                }
                console.log('Source field processed (with defaults):', fieldId, fieldValueData, typeof fieldValueData);
            } else if (fieldId == firstEmailField) {
                leadData.firstEmail = fieldValueData;
                // Calculate lead age from first email date
                if (fieldValueData) {
                    const firstEmailDate = new Date(fieldValueData);
                    if (!isNaN(firstEmailDate.getTime())) {
                        const now = new Date();
                        const ageInDays = Math.floor((now - firstEmailDate) / (1000 * 60 * 60 * 24));
                        leadData.leadAge = ageInDays;
                    }
                }
            }
        });
        

        // Extract Last Contact and Contact Direction from relationship-intelligence fields
        const lastContactField = fieldValues.find(fv => fv.id === 'last-contact');
        if (lastContactField && lastContactField.value && lastContactField.value.data) {
            const contactData = lastContactField.value.data;
            
            // Get the interaction type
            leadData.contactType = contactData.type || 'unknown';
            
            if (contactData.sentAt) {
                leadData.lastContact = contactData.sentAt;
            } else if (contactData.startTime) {
                leadData.lastContact = contactData.startTime;
            }
            
            // Extract contact direction information
            if (contactData.from && contactData.to) {
                const fromPerson = contactData.from.person;
                const toPerson = contactData.to[0]?.person; // Get first recipient
                
                if (fromPerson && toPerson) {
                    const fromName = `${fromPerson.firstName || ''} ${fromPerson.lastName || ''}`.trim();
                    const toName = `${toPerson.firstName || ''} ${toPerson.lastName || ''}`.trim();
                    
                    // For emails, just show who sent to whom
                    leadData.contactDirection = `${fromName} emailed ${toName}`;
                }
            } else {
                // For non-email interactions, show the type
                leadData.contactDirection = `Last contact was a ${contactData.type}`;
            }
        }
        
        // Apply default stage if missing
        if (!leadData.stage && defaultSettings.defaultStageField && defaultSettings.defaultStageValue) {
            // Check if this lead has the default stage field but no value
            const hasStageField = fieldValues.some(fv => {
                const fieldId = fv.id;
                return fieldId == defaultSettings.defaultStageField;
            });
            if (hasStageField) {
                leadData.stage = defaultSettings.defaultStageValue;
            }
        }
        
        // Apply default value if missing or zero
        if (!leadData.value || leadData.value === 0) {
            // Check rules first
            let appliedRule = false;
            for (const rule of defaultSettings.rules) {
                const matchingField = fieldValues.find(fv => {
                    // Find field by name (since we don't have field IDs in rules)
                    const fieldId = fv.id;
                    const field = data.fields.find(f => f.id == fieldId);
                    return field && field.name === rule.field;
                });
                
                if (matchingField && matchingField.value === rule.value) {
                    leadData.value = rule.defaultValue;
                    appliedRule = true;
                    break;
                }
            }
            
            // If no rule matched, use global default
            if (!appliedRule) {
                leadData.value = defaultSettings.globalDefaultValue;
            }
        }
        
        if (leadData.stage) {
            // Check if this is a closed/won stage
            const isClosedWon = defaultSettings.closedWonStage === leadData.stage;
            
            if (isClosedWon) {
                console.log(`Processing closed/won lead ${lead.id} with stage: ${leadData.stage}`);
                // For closed/won leads, use the specified value field for committed amount
                if (defaultSettings.closedWonValueField) {
                    fieldValues.forEach(fieldValue => {
                        const fieldId = fieldValue.id;
                        const field = data.fields.find(f => f.id == fieldId);
                        if (field && field.name === defaultSettings.closedWonValueField) {
                            // Handle new API structure for value extraction
                            let closedWonValue = 0;
                            if (fieldValue.value && fieldValue.value.data) {
                                closedWonValue = parseFloat(fieldValue.value.data) || 0;
                            } else {
                                closedWonValue = parseFloat(fieldValue.value) || 0;
                            }
                            if (closedWonValue > 0) {
                                leadData.value = closedWonValue;
                                console.log(`Set closed/won value for lead ${lead.id}: ${closedWonValue}`);
                                // Don't add to totalValue as closed/won leads are tracked separately
                            }
                        }
                    });
                }
            } else {
                // Only add to totalValue for non-closed/won leads
                processed.totalValue += leadData.value;
            }
            
            processed.stages.add(leadData.stage);
            processed.leads.push(leadData);
            processed.totalLeads++;
            
            if (leadData.source) {
                processed.sources.add(leadData.source);
            }
        }
    }
    
    processed.stages = Array.from(processed.stages);
    processed.sources = Array.from(processed.sources);
    
    return processed;
}

// Utility functions
function formatCurrency(value) {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
    } else {
        return value.toLocaleString();
    }
}

function getValueClass(value) {
    if (value >= 100000) return 'high-value';
    if (value >= 10000) return 'medium-value';
    return 'low-value';
}

function showLoading(message) {
    const loading = document.querySelector('.loading');
    if (loading) {
        const messageElement = loading.querySelector('p');
        if (messageElement) {
            messageElement.textContent = message;
        }
        loading.style.display = 'flex';
    }
}

function hideLoading() {
    const loading = document.querySelector('.loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    // Set background color based on type
    if (type === 'success') {
        notification.style.backgroundColor = '#28a745';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#dc3545';
    } else {
        notification.style.backgroundColor = '#667eea';
    }
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);



// Update piggy bank visualization
function updatePiggyBank() {
    console.log('updatePiggyBank called');
    console.log('currentData:', currentData);
    console.log('defaultSettings:', defaultSettings);
    
    const piggyBankContainer = document.getElementById('piggyBank');
    if (!piggyBankContainer) return;
    
    // Calculate closed/won value
    let closedWonValue = 0;
    if (currentData && currentData.leads && defaultSettings.closedWonStage && defaultSettings.closedWonValueField) {
        const closedWonLeads = currentData.leads.filter(lead => lead.stage === defaultSettings.closedWonStage);
        console.log(`Found ${closedWonLeads.length} leads in closed/won stage: ${defaultSettings.closedWonStage}`);
        console.log('Available fields:', currentData.fields?.map(f => ({ id: f.id, name: f.name })));
        console.log('Looking for field:', defaultSettings.closedWonValueField);
        
        closedWonValue = closedWonLeads.reduce((sum, lead) => {
            console.log(`Processing lead ${lead.id} field values:`, lead.field_values?.map(fv => ({
                entityAttributeId: fv.entityAttributeId,
                field_id: fv.field_id,
                value: fv.value
            })));
            
            // Find the value field for committed amount
            const valueField = lead.field_values.find(fv => {
                // Check if currentData.fields exists before using it
                if (!currentData.fields) {
                    // If fields is not available, try to match by field name directly
                    // This is a fallback for when the fields data structure is not available
                    return false;
                }
                // Use entityAttributeId instead of field_id (based on HAR file structure)
                const fieldId = fv.entityAttributeId || fv.field_id;
                const field = currentData.fields.find(f => f.id == fieldId);
                const matches = field && field.name === defaultSettings.closedWonValueField;
                if (matches) {
                    console.log(`Found matching field for lead ${lead.id}: ${field.name} = ${fv.value}`);
                }
                return matches;
            });
            
            const fieldValue = parseFloat(valueField?.value) || 0;
            console.log(`Lead ${lead.id} value: ${fieldValue}`);
            return sum + fieldValue;
        }, 0);
        
        console.log(`Total closed/won value: ${closedWonValue}`);
        
        // Fallback: if no value found, try to use the lead's value field directly
        if (closedWonValue === 0 && closedWonLeads.length > 0) {
            console.log('No value found using field matching, trying fallback method...');
            closedWonValue = closedWonLeads.reduce((sum, lead) => {
                return sum + (lead.value || 0);
            }, 0);
            console.log(`Fallback closed/won value: ${closedWonValue}`);
        }
    }
    
    // Update the display values
    const closedWonValueElement = document.getElementById('closedWonValue');
    const goalProgressElement = document.getElementById('goalProgress');
    
    if (closedWonValueElement) {
        closedWonValueElement.textContent = formatCurrency(closedWonValue);
    }
    
    if (goalProgressElement) {
        const progressPercent = Math.min(100, (closedWonValue / 100000000) * 100);
        goalProgressElement.textContent = `${progressPercent.toFixed(1)}%`;
    }
    
    // Create progress bar visualization
    const progressPercent = Math.min(100, (closedWonValue / 100000000) * 100);
    
    piggyBankContainer.innerHTML = `
        <div class="goal-progress-container">
            <div class="goal-progress-bar">
                <div class="goal-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="goal-labels">
                <span class="goal-label">$0</span>
                <span class="goal-label">$100M</span>
            </div>
            <div class="goal-marker" style="left: ${progressPercent}%">
                <span class="goal-marker-value">$${formatCurrency(closedWonValue)}</span>
            </div>
        </div>
    `;
} 

// Toggle stage exclusion
function toggleStageExclusion(stage, isExcluded) {
    if (isExcluded) {
        excludedStages.add(stage);
    } else {
        excludedStages.delete(stage);
    }
    
    // Update UI
    const stageItem = document.querySelector(`[data-stage="${stage}"]`);
    if (stageItem) {
        if (isExcluded) {
            stageItem.classList.add('excluded');
        } else {
            stageItem.classList.remove('excluded');
        }
    }
    
    // Update visualization
    updateVisualization();
    updateSummaryStats();
}

// Setup drag and drop for stage reordering
function setupDragAndDrop() {
    const container = document.getElementById('stageWeightsContainer');
    if (container) {
        const stageItems = container.querySelectorAll('.stage-item');
        
        stageItems.forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            item.draggable = true;
        });
    }
}

// Drag and drop handlers
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.stage);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const draggedStage = e.dataTransfer.getData('text/plain');
    const targetStage = e.target.closest('.stage-item')?.dataset.stage;
    
    if (targetStage && draggedStage !== targetStage) {
        reorderStages(draggedStage, targetStage);
    }
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// Reorder stages
function reorderStages(draggedStage, targetStage) {
    const draggedIndex = stageOrder.indexOf(draggedStage);
    const targetIndex = stageOrder.indexOf(targetStage);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
        // Remove dragged stage from its current position
        stageOrder.splice(draggedIndex, 1);
        // Insert at target position
        stageOrder.splice(targetIndex, 0, draggedStage);
        
        // Re-render stage weights
        initializeStageWeights();
        // Update visualization
        updateVisualization();
    }
}

// Toggle reorder mode
function toggleReorderMode() {
    isReorderMode = !isReorderMode;
    const container = document.getElementById('stageWeightsContainer');
    const reorderButton = document.getElementById('reorderStages');
    
    if (container) {
        if (isReorderMode) {
            container.classList.add('reorder-mode');
            reorderButton.textContent = 'Done Reordering';
            reorderButton.classList.add('btn-primary');
        } else {
            container.classList.remove('reorder-mode');
            reorderButton.textContent = 'Reorder Stages';
            reorderButton.classList.remove('btn-primary');
        }
    }
} 

// Format last contact date
function formatLastContact(dateString) {
    if (!dateString) return 'No contact info';
    
    const contactDate = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - contactDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
        const years = Math.floor(diffDays / 365);
        return `${years} year${years > 1 ? 's' : ''} ago`;
    }
}

// Get contact urgency color based on days since last contact
function getContactUrgencyColor(dateString) {
    if (!dateString) return '#999'; // Gray for no contact
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) return '#28a745'; // Green - recent contact
    if (diffDays <= 30) return '#ffc107'; // Yellow - moderate urgency
    if (diffDays <= 90) return '#fd7e14'; // Orange - high urgency
    return '#dc3545'; // Red - critical urgency
}

// Calculate average days since last contact
function calculateAverageContactDays(leads) {
    const leadsWithContact = leads.filter(lead => lead.lastContact);
    if (leadsWithContact.length === 0) return null;
    
    const totalDays = leadsWithContact.reduce((sum, lead) => {
        const date = new Date(lead.lastContact);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }, 0);
    
    return Math.round(totalDays / leadsWithContact.length);
}

// Calculate average lead age
function calculateAverageLeadAge(leads) {
    const leadsWithAge = leads.filter(lead => lead.leadAge !== null);
    if (leadsWithAge.length === 0) return null;
    
    const totalAge = leadsWithAge.reduce((sum, lead) => sum + lead.leadAge, 0);
    return Math.round(totalAge / leadsWithAge.length);
}

// Calculate average lead age per stage
function calculateStageAges(leads) {
    const stageGroups = {};
    
    leads.forEach(lead => {
        if (lead.leadAge !== null) {
            if (!stageGroups[lead.stage]) {
                stageGroups[lead.stage] = [];
            }
            stageGroups[lead.stage].push(lead.leadAge);
        }
    });
    
    const stageAges = {};
    Object.entries(stageGroups).forEach(([stage, ages]) => {
        const averageAge = Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length);
        stageAges[stage] = averageAge;
    });
    
    return stageAges;
}

 