// Global variables
let currentData = null;
let currentView = 'pipeline'; // 'pipeline' or 'detailed'
let fieldMappings = {};
let stageWeights = {};
let excludedStages = new Set(); // New: Track excluded stages
let stageOrder = []; // New: Track custom stage order
let isReorderMode = false; // New: Track reorder mode
let individualLeadWeights = {}; // New: Track individual lead weights
let didAutoLoadFromRestore = false; // Prevent duplicate auto-loads

// Pipeline change tracking
let pipelineHistory = []; // Array of historical pipeline snapshots
let lastSnapshotTime = null; // Timestamp of last snapshot
let changeTrackingEnabled = true; // Whether change tracking is enabled
let maxHistoryDays = 7; // How many days of history to keep

// Auto-refresh functionality
let autoRefreshEnabled = false; // Whether auto-refresh is enabled
let autoRefreshInterval = null; // Interval for auto-refresh
let autoRefreshMinutes = 5; // Refresh every 5 minutes by default

// Historical search functionality
let historicalMode = false; // Whether we're viewing historical data
let historicalSnapshot = null; // The historical snapshot being viewed
let lastFieldValueChanges = null; // Cache of field value changes for building historical snapshots
let lastProcessedChanges = null; // Processed changes from last historical search

let defaultSettings = {
    defaultStageField: '',
    defaultStageValue: '',
    globalDefaultValue: 1000000,
    rules: [],
    closedWonStage: '',
    closedWonValueField: '',
    lostStages: []
};

// New field mappings for lead age
let firstEmailField = null;

// Robust numeric parser for currency/number strings (handles $ and commas)
function parseCurrencyNumber(input) {
    if (input == null) return 0;
    if (typeof input === 'number') return isFinite(input) ? input : 0;
    if (typeof input === 'string') {
        // Remove currency symbols, commas, spaces; keep digits, minus, and decimal point
        const cleaned = input.replace(/[^0-9.\-]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }
    if (typeof input === 'object') {
        // Common shapes: { amount }, { data }, { text }
        if ('amount' in input) return parseCurrencyNumber(input.amount);
        if ('data' in input) return parseCurrencyNumber(input.data);
        if ('text' in input) return parseCurrencyNumber(input.text);
    }
    return 0;
}

// Normalize field IDs from various API shapes (e.g., "field-123", 123, string IDs)
function normalizeFieldId(raw) {
    const id = raw || '';
    return String(id).replace(/^field-/, '');
}

// Juvo Blue Color Scheme
const colorSchemes = {
    sources: d3.scaleOrdinal(d3.schemeCategory10),
    stages: d3.scaleOrdinal([
        '#1e3a8a', // Dark blue
        '#3b82f6', // Blue
        '#60a5fa', // Light blue
        '#93c5fd', // Lighter blue
        '#dbeafe', // Very light blue
        '#1e40af', // Medium dark blue
        '#2563eb', // Medium blue
        '#1d4ed8', // Darker blue
        '#1e3a8a', // Dark blue
        '#3b82f6'  // Blue
    ]),
    values: d3.scaleLinear()
        .domain([0, 1000000])
        .range(['#dc3545', '#ffc107', '#28a745'])
};

// Team members for contact direction logic
const TEAM_MEMBERS = [
    'Sean Brown',
    'Andrew Croshaw', 
    'Kanak Kunapuli',
    'Camille Nielsen',
    'Alex Geren',
    'Davis Pulsipher',
    'Janae Holland'
];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    // Attach renderer for UI router
    window.renderListView = renderListView;
});

function initializeApp() {
    // Initialize theme from saved preference
    try {
        const savedTheme = localStorage.getItem('ui:theme') || 'light';
        setTheme(savedTheme);
        const switchEl = document.getElementById('themeSwitch');
        if (switchEl) {
            switchEl.checked = (savedTheme === 'dark');
            switchEl.addEventListener('change', () => {
                const next = switchEl.checked ? 'dark' : 'light';
                setTheme(next);
                try { localStorage.setItem('ui:theme', next); } catch (_) {}
            });
        }
    } catch (_) { /* ignore theme init errors */ }
    // Warn if we're on a Vercel preview URL (localStorage tied to subdomain)
    try {
        const host = window.location.hostname || '';
        const isVercelPreview = /-git-|^.*-[a-z0-9]{8}-[a-z0-9]{12}\.vercel\.app$/.test(host);
        if (isVercelPreview) {
            showNotification('Preview deployment detected: local data is tied to this URL. Use the production domain for persistence across deploys.', 'warning');
        }
    } catch (e) { /* no-op */ }

    // Load individual lead weights
    loadIndividualLeadWeights();

    // Load pipeline history
    loadPipelineHistory();

    // Add event listeners with null checks
    
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
    if (listSelect) {
        listSelect.addEventListener('change', (e) => {
            // Persist selected list
            try { localStorage.setItem('ui:lastListId', e.target.value || ''); } catch (_) {}
            onListChange();
        });
    }
    
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

    const lostStagesSelect = document.getElementById('lostStages');
    if (lostStagesSelect) lostStagesSelect.addEventListener('change', updateDefaultSettings);
    
    const addLostStageBtn = document.getElementById('addLostStage');
    if (addLostStageBtn) addLostStageBtn.addEventListener('click', addAdditionalLostStage);
    
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

    // Restore persisted UI control selections after DOM is ready
    restoreUISelections();

    // Restore toggle states
    try {
        const savedTracking = localStorage.getItem('ui:changeTrackingEnabled');
        if (savedTracking !== null) {
            changeTrackingEnabled = JSON.parse(savedTracking);
            const toggleBtn = document.getElementById('toggleChangeTracking');
            if (toggleBtn) {
                toggleBtn.textContent = changeTrackingEnabled ? 'Disable Tracking' : 'Enable Tracking';
                toggleBtn.className = changeTrackingEnabled ? 'btn btn-warning' : 'btn btn-success';
            }
        }
        const savedAuto = localStorage.getItem('ui:autoRefreshEnabled');
        if (savedAuto !== null) {
            autoRefreshEnabled = JSON.parse(savedAuto);
            const toggleAuto = document.getElementById('toggleAutoRefresh');
            if (toggleAuto) {
                if (autoRefreshEnabled) {
                    toggleAuto.textContent = 'Stop Auto Refresh';
                    toggleAuto.className = 'btn btn-warning';
                    toggleAuto.innerHTML = '<i class="fas fa-stop"></i> Stop Auto Refresh';
                    startAutoRefresh();
                } else {
                    toggleAuto.textContent = 'Auto Refresh';
                    toggleAuto.className = 'btn btn-outline';
                    toggleAuto.innerHTML = '<i class="fas fa-clock"></i> Auto Refresh';
                }
            }
        }
    } catch (_) { /* ignore */ }
}

// Theme helper
function setTheme(mode) {
    const root = document.documentElement;
    if (mode === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else {
        root.setAttribute('data-theme', 'light');
    }
}

// Helpers for persisting per-list stage configuration
function getCurrentOrSavedListId() {
    const el = document.getElementById('listSelect');
    return (el && el.value) || localStorage.getItem('ui:lastListId') || '';
}

function saveStageConfig() {
    try {
        const listId = getCurrentOrSavedListId();
        if (!listId) return;
        localStorage.setItem(`ui:stageWeights:${listId}`, JSON.stringify(stageWeights || {}));
        localStorage.setItem(`ui:stageOrder:${listId}`, JSON.stringify(stageOrder || []));
        localStorage.setItem(`ui:excludedStages:${listId}`, JSON.stringify(Array.from(excludedStages || [])));
    } catch (_) { /* ignore */ }
}

function loadStageConfigForList(listId) {
    if (!listId) return;
    try {
        const w = JSON.parse(localStorage.getItem(`ui:stageWeights:${listId}`) || '{}');
        if (w && typeof w === 'object') stageWeights = w;
        const order = JSON.parse(localStorage.getItem(`ui:stageOrder:${listId}`) || '[]');
        if (Array.isArray(order)) stageOrder = order;
        const excl = JSON.parse(localStorage.getItem(`ui:excludedStages:${listId}`) || '[]');
        if (Array.isArray(excl)) excludedStages = new Set(excl);
        // Ensure closed/won and lost stages remain excluded if configured
        if (defaultSettings) {
            if (defaultSettings.closedWonStage) excludedStages.add(defaultSettings.closedWonStage);
            if (Array.isArray(defaultSettings.lostStages)) {
                defaultSettings.lostStages.forEach(stage => excludedStages.add(stage));
            }
        }
    } catch (_) { /* ignore */ }
}

function tryAutoLoadPipelineDataIfRestored() {
    if (didAutoLoadFromRestore) return;
    try {
        const listId = document.getElementById('listSelect')?.value || localStorage.getItem('ui:lastListId');
        const stageField = document.getElementById('stageField')?.value || localStorage.getItem('ui:stageField');
        const valueField = document.getElementById('valueField')?.value || localStorage.getItem('ui:valueField');
        if (listId && stageField && valueField) {
            didAutoLoadFromRestore = true;
            loadPipelineData().catch(() => { didAutoLoadFromRestore = false; });
        }
    } catch (_) { /* ignore */ }
}

function updateListOptionCount(listId, count) {
    const listSelect = document.getElementById('listSelect');
    if (!listSelect) return;
    const option = Array.from(listSelect.options).find(o => String(o.value) === String(listId));
    if (option) {
        // Keep the name prefix as-is, update/append count suffix
        const name = option.textContent.replace(/\s*\(.*entries\)\s*$/i, '');
        option.textContent = `${name} (${count} entries)`;
    }
}

// After data/population, re-apply saved default settings to selects
function applySavedDefaultSelections() {
    try {
        const dsf = document.getElementById('defaultStageField');
        const dsv = document.getElementById('defaultStageValue');
        const cws = document.getElementById('closedWonStage');
        const cwv = document.getElementById('closedWonValueField');
        const ls = document.getElementById('lostStages');

        if (defaultSettings) {
            if (dsf && defaultSettings.defaultStageField) dsf.value = defaultSettings.defaultStageField;
            if (dsv && defaultSettings.defaultStageValue) dsv.value = defaultSettings.defaultStageValue;
            if (cws && defaultSettings.closedWonStage) cws.value = defaultSettings.closedWonStage;
            if (cwv && defaultSettings.closedWonValueField) cwv.value = defaultSettings.closedWonValueField;
            if (ls && Array.isArray(defaultSettings.lostStages) && defaultSettings.lostStages.length > 0) {
                ls.value = defaultSettings.lostStages[0];
            }
        }
    } catch (_) { /* ignore */ }
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
                    // Prefer cached count; the lists API often doesn't include size
                    let cached = null;
                    try { cached = localStorage.getItem(`ui:listSize:${list.id}`); } catch (_) {}
                    if (cached && !isNaN(parseInt(cached, 10))) {
                        option.textContent = `${list.name} (${parseInt(cached, 10)} entries)`;
                    } else {
                        option.textContent = list.name;
                    }
                    listSelect.appendChild(option);
                });

                // Restore last selected list if available
                try {
                    const savedListId = localStorage.getItem('ui:lastListId');
                    if (savedListId) {
                        listSelect.value = savedListId;
                        // Load saved stage configuration for this list
                        loadStageConfigForList(savedListId);
                        // Trigger loading of fields for the restored list and then try auto-load
                        await onListChange();
                        tryAutoLoadPipelineDataIfRestored();
                    }
                } catch (_) {}
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
    // Load any saved stage configuration for this list
    if (listId) {
        loadStageConfigForList(listId);
    }
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
        // Attempt to auto-load pipeline data if we have required selectors
        tryAutoLoadPipelineDataIfRestored();
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

        // Restore saved selection for this field selector if present
        try {
            const saved = localStorage.getItem(`ui:${selectId}`);
            if (saved) {
                select.value = saved;
            }
        } catch (_) {}

        // Persist on change
        select.addEventListener('change', (e) => {
            try { localStorage.setItem(`ui:${selectId}`, e.target.value || ''); } catch (_) {}
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
                
                // Prefer saved defaultSettings, otherwise mirror the selected stage field
                if (defaultSettings && defaultSettings.defaultStageField) {
                    defaultStageFieldSelect.value = defaultSettings.defaultStageField;
                } else {
                    const stageFieldSelect = document.getElementById('stageField');
                    if (stageFieldSelect && stageFieldSelect.value) {
                        defaultStageFieldSelect.value = stageFieldSelect.value;
                    }
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
                // Restore saved selection for closed/won value field
                if (defaultSettings && defaultSettings.closedWonValueField) {
                    closedWonValueFieldSelect.value = defaultSettings.closedWonValueField;
                }
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
        return Promise.reject(new Error('Missing required fields'));
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
        
        // Re-load any saved per-list stage config now that stages are known
        loadStageConfigForList(listId);
        initializeStageWeights();
        updateVisualization();
        updateSummaryStats();

        // Save pipeline snapshot for change tracking
        savePipelineSnapshot();
        
        // Populate default stage values if a field is selected
        await populateDefaultStageValues();
        
        // Populate closed/won and lost stage dropdowns (then apply saved selections)
        populateClosedWonStageValues();
        populateLostStageValues();
        applySavedDefaultSelections();
        // Update list entry count display and cache
        try {
            const count = currentData?.totalLeads || currentData?.leads?.length || 0;
            if (listId) {
                localStorage.setItem(`ui:listSize:${listId}`, String(count));
                updateListOptionCount(listId, count);
            }
        } catch (_) {}
        updatePiggyBank();
        
        hideLoading();
        showNotification(`Pipeline data loaded successfully! Found ${currentData.leads.length} leads across ${currentData.stages.length} stages.`, 'success');
        
        return currentData; // Return the data for promise chaining
        
    } catch (error) {
        console.error('Error loading pipeline data:', error);
        showNotification(`Failed to load pipeline data: ${error.message}`, 'error');
        hideLoading();
        throw error; // Re-throw the error for promise rejection
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
            if (fieldValue.value && Object.prototype.hasOwnProperty.call(fieldValue.value, 'data')) {
                // New API structure: value.data contains the actual value
                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                    fieldValueData = fieldValue.value.data?.text;
                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'text') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'dropdown-multi') {
                    // Handle multi-select dropdowns - convert array to readable string
                    const data = fieldValue.value.data;
                    if (Array.isArray(data)) {
                        fieldValueData = data.join(', ');
                    } else if (data && typeof data === 'object') {
                        // If it's an object with text properties, extract them
                        const texts = Object.values(data).filter(val => typeof val === 'string');
                        fieldValueData = texts.join(', ');
                    } else if (data != null) {
                        fieldValueData = String(data);
                    } else {
                        fieldValueData = '';
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
                    const data = fieldValue.value.data;
                    if (data && typeof data === 'object') {
                        fieldValueData = JSON.stringify(data);
                    } else if (data != null) {
                        fieldValueData = String(data);
                    } else {
                        fieldValueData = '';
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
            
            const normId = normalizeFieldId(fieldId);
            const mapStage = normalizeFieldId(fieldMappings.stage);
            const mapValue = normalizeFieldId(fieldMappings.value);
            const mapSource = normalizeFieldId(fieldMappings.source);

            if (normId === mapStage) {
                leadData.stage = fieldValueData;
            } else if (normId === mapValue) {
                leadData.value = parseCurrencyNumber(fieldValueData);
            } else if (normId === mapSource) {
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
        
        // Reconcile saved stage order with current stages
        const currentStages = [...currentData.stages];
        if (stageOrder.length === 0) {
            stageOrder = [...currentStages];
        } else {
            const validSaved = stageOrder.filter(s => currentStages.includes(s));
            const missing = currentStages.filter(s => !validSaved.includes(s));
            stageOrder = [...validSaved, ...missing];
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
        // Persist after building
        saveStageConfig();
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
    saveStageConfig();
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
    saveStageConfig();
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
        
        // Juvo Blue gradient colors for funnel
        const colors = [
            'url(#gradient1)',
            'url(#gradient2)', 
            'url(#gradient3)',
            'url(#gradient4)',
            'url(#gradient5)',
            'url(#gradient6)',
            'url(#gradient7)',
            'url(#gradient8)',
            'url(#gradient9)',
            'url(#gradient10)'
        ];
        
        // Create SVG for funnel - Made responsive with container width
        const width = container.clientWidth;
        const margin = { top: 30, right: 30, bottom: 30, left: 30 };
        const stageHeight = 80;
        const spacing = 15;
        const totalHeight = stageData.length * (stageHeight + spacing) + margin.top + margin.bottom;
        const height = Math.max(600, totalHeight);

        const svg = d3.select(container)
            .append('svg')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .style('width', '100%')
            .style('height', 'auto');
        
        // Add gradient definitions
        const defs = svg.append('defs');
        
        // Juvo Blue gradients - Better progression from light to dark
        const gradientColors = [
            ['#dbeafe', '#93c5fd'], // Very light blue to light blue
            ['#93c5fd', '#60a5fa'], // Light blue to medium light blue
            ['#60a5fa', '#3b82f6'], // Medium light blue to blue
            ['#3b82f6', '#2563eb'], // Blue to medium blue
            ['#2563eb', '#1d4ed8'], // Medium blue to medium dark blue
            ['#1d4ed8', '#1e40af'], // Medium dark blue to dark blue
            ['#1e40af', '#1e3a8a'], // Dark blue to darker blue
            ['#1e3a8a', '#1e1b4b']  // Darker blue to darkest blue
        ];
        
        gradientColors.forEach((colors, index) => {
            const gradient = defs.append('linearGradient')
                .attr('id', `gradient${index + 1}`)
                .attr('x1', '0%')
                .attr('y1', '0%')
                .attr('x2', '100%')
                .attr('y2', '100%');
            
            gradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', colors[0]);
            
            gradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', colors[1]);
        });
        
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
                .attr('stroke', '#1e3a8a') // Use dark blue stroke for all gradients
                .attr('stroke-width', 2)
                .style('transition', 'all 0.3s ease')
                .on('mouseover', function() {
                    d3.select(this)
                        .attr('stroke-width', 3)
                        .attr('opacity', 0.8);
                })
                .on('mouseout', function() {
                    d3.select(this)
                        .attr('stroke-width', 2)
                        .attr('opacity', 1);
                });
            
            const textY = y + 45;

            // Get change statistics for this stage
            const changeStats = getStageChangeStats(stageInfo.stage);

            // Base font size and max text width for each section
            const baseFont = 18;
            const sectionWidth = (topWidth - 60) / 3; // increased padding

            const adjustTextSize = (textSel, maxWidth) => {
                const node = textSel.node();
                if (!node) return;
                const length = node.getComputedTextLength();
                if (length > maxWidth) {
                    const scale = maxWidth / length;
                    textSel.attr('font-size', `${baseFont * scale}px`);
                }
            };

            const wrapSvgText = (textSel, maxWidth) => {
                const words = textSel.text().split(/\s+/).reverse();
                let line = [];
                let lineNumber = 0;
                const lineHeight = 1.1; // ems
                const y = textSel.attr('y');
                const x = textSel.attr('x');
                let tspan = textSel.text(null)
                    .append('tspan')
                    .attr('x', x)
                    .attr('y', y)
                    .attr('dy', '0em');

                while (words.length) {
                    const word = words.pop();
                    line.push(word);
                    tspan.text(line.join(' '));
                    if (tspan.node().getComputedTextLength() > maxWidth && line.length > 1) {
                        line.pop();
                        tspan.text(line.join(' '));
                        line = [word];
                        tspan = textSel.append('tspan')
                            .attr('x', x)
                            .attr('y', y)
                            .attr('dy', ++lineNumber * lineHeight + 'em')
                            .text(word);
                    }
                }

                const lineCount = lineNumber + 1;
                if (lineCount > 1) {
                    const offset = ((lineCount - 1) * baseFont * lineHeight) / 2;
                    textSel.selectAll('tspan').attr('y', y - offset);
                }
            };

            // Add weighted value on the left
            const valueText = stageGroup.append('text')
                .attr('x', x + 30)
                .attr('y', textY)
                .attr('text-anchor', 'start')
                .attr('fill', 'white')
                .attr('font-weight', 'bold')
                .attr('font-size', `${baseFont}px`)
                .attr('filter', 'drop-shadow(2px 2px 4px rgba(0,0,0,0.7))')
                .text(`$${formatCurrency(stageInfo.weightedValue)}`);

            // Stage name centered
            const nameText = stageGroup.append('text')
                .attr('x', x + topWidth / 2)
                .attr('y', textY)
                .attr('text-anchor', 'middle')
                .attr('fill', 'white')
                .attr('font-weight', 'bold')
                .attr('font-size', `${baseFont}px`)
                .attr('filter', 'drop-shadow(2px 2px 4px rgba(0,0,0,0.7))')
                .text(stageInfo.stage);

            wrapSvgText(nameText, sectionWidth);

            // Lead count on the right with change indicator
            let countText = `${stageInfo.count} leads`;
            if (changeStats.hasChanges) {
                if (changeStats.newLeads > 0) {
                    countText += ` (+${changeStats.newLeads})`;
                }
                if (changeStats.removedLeads > 0) {
                    countText += ` (-${changeStats.removedLeads})`;
                }
            }

            const countColor = changeStats.newLeads > 0
                ? (defaultSettings.lostStages.includes(stageInfo.stage) ? '#dc3545' : '#28a745')
                : 'white';

            const countTextEl = stageGroup.append('text')
                .attr('x', x + topWidth - 30)
                .attr('y', textY)
                .attr('text-anchor', 'end')
                .attr('fill', countColor)
                .attr('font-size', `${baseFont}px`)
                .attr('font-weight', (changeStats.newLeads > 0 || changeStats.removedLeads > 0) ? 'bold' : 'normal')
                .attr('filter', 'drop-shadow(2px 2px 4px rgba(0,0,0,0.7))')
                .text(countText);

            // Adjust text size if necessary to prevent overlap
            adjustTextSize(valueText, sectionWidth);
            adjustTextSize(countTextEl, sectionWidth);
            
            // Note: Yellow dot indicators removed as they were redundant with the green lead count text
        });

        /* Arrow visualizations are temporarily disabled
        const movements = getStageMovements();
        movements.forEach(movement => {
            // existing arrow rendering logic removed
        });

        const markerDefs = defs;
        markerDefs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 5)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#007bff');

        markerDefs.append('marker')
            .attr('id', 'arrowhead-won')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 5)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#28a745');

        markerDefs.append('marker')
            .attr('id', 'arrowhead-lost')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 5)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#dc3545');
        */
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
        
        // Lead count with change indicators
        stageGroups.append('text')
            .attr('class', 'stage-count')
            .attr('x', xScale.bandwidth() / 2)
            .attr('y', height - margin.bottom + 45)
            .text(d => {
                const changeStats = getStageChangeStats(d.stage);
                let countText = `${d.count} leads`;
                if (changeStats.hasChanges) {
                    if (changeStats.newLeads > 0) {
                        countText += ` (+${changeStats.newLeads})`;
                    }
                    if (changeStats.removedLeads > 0) {
                        countText += ` (-${changeStats.removedLeads})`;
                    }
                }
                return countText;
            })
            .style('fill', d => {
                const changeStats = getStageChangeStats(d.stage);
                return changeStats.hasChanges ? '#28a745' : '#666';
            })
            .style('font-size', '9px')
            .style('text-anchor', 'middle')
            .style('font-weight', d => {
                const changeStats = getStageChangeStats(d.stage);
                return changeStats.hasChanges ? 'bold' : 'normal';
            })
            .attr('transform', `rotate(-45, ${xScale.bandwidth() / 2}, ${height - margin.bottom + 45})`);
        
        // Value labels
        stageGroups.append('text')
            .attr('class', 'stage-value')
            .attr('x', xScale.bandwidth() / 2)
            .attr('y', d => d.weightedValue === 0 ? height - margin.bottom + 35 : yScale(d.weightedValue) - 10)
            .text(d => formatCurrency(d.weightedValue))
            .style('fill', '#333')
            .style('font-size', '11px')
            .style('text-anchor', 'middle');
        
        // Add change indicators to pipeline bars
        stageGroups.each(function(d) {
            const changeStats = getStageChangeStats(d.stage);
            if (changeStats.hasChanges) {
                const group = d3.select(this);
                
                // Add change indicator dot
                group.append('circle')
                    .attr('cx', xScale.bandwidth() - 8)
                    .attr('cy', yScale(d.weightedValue) + 8)
                    .attr('r', 4)
                    .attr('fill', '#ffc107')
                    .attr('stroke', '#e0a800')
                    .attr('stroke-width', 1);
                
                // Add change count
                const totalChanges = changeStats.newLeads + changeStats.removedLeads + changeStats.stageChanges;
                if (totalChanges > 0) {
                    group.append('text')
                        .attr('x', xScale.bandwidth() - 8)
                        .attr('y', yScale(d.weightedValue) + 11)
                        .attr('text-anchor', 'middle')
                        .attr('fill', 'white')
                        .attr('font-size', '8px')
                        .attr('font-weight', 'bold')
                        .text(totalChanges > 9 ? '9+' : totalChanges);
                }
            }
        });
        
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
            
            // Group leads by stage
            const leadsByStage = {};
            currentData.leads.forEach(lead => {
                if (!leadsByStage[lead.stage]) {
                    leadsByStage[lead.stage] = [];
                }
                leadsByStage[lead.stage].push(lead);
            });
            
            // Create sections for each stage in order
            stageOrder.forEach(stage => {
                if (leadsByStage[stage] && leadsByStage[stage].length > 0) {
                    const stageSection = document.createElement('div');
                    stageSection.className = 'stage-section';
                    
                    // Get stage color from funnel
                    const stageIndex = stageOrder.indexOf(stage);
                    const stageColor = d3.schemeCategory10[stageIndex % 10];
                    
                    stageSection.innerHTML = `
                        <div class="stage-header" style="background-color: ${stageColor}; color: white;">
                            <h3>${stage} (${leadsByStage[stage].length} leads)</h3>
                        </div>
                        <div class="stage-leads">
                            ${leadsByStage[stage].map(lead => `
                                <div class="lead-card" onclick="showLeadDetails(${JSON.stringify(lead).replace(/"/g, '&quot;')})">
                                    <h4>${lead.entity?.name || `Lead ${lead.id}`}</h4>
                                    <div class="lead-info">
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
                                            <span class="label">Individual Weight:</span>
                                            <span class="value">${getIndividualLeadWeight(lead.id)}x</span>
                                        </span>
                                        <span>
                                            <span class="label">Total Weighted Value:</span>
                                            <span class="value">$${formatCurrency(calculateLeadWeightedValue(lead))}</span>
                                        </span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    
                    leadDetails.appendChild(stageSection);
                }
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
        return sum + calculateLeadWeightedValue(lead);
    }, 0);
    
    // Calculate average contact days for entire list
    const averageContactDays = calculateAverageContactDays(currentData.leads);
    
    // Calculate average lead age for entire list
    const averageLeadAge = calculateAverageLeadAge(currentData.leads);
    
    // Calculate average lead age per stage
    const stageAges = calculateStageAges(currentData.leads);
    
    // Update main metrics with larger, centered display
    document.getElementById('totalValue').textContent = `$${formatCurrency(totalValue)}`;
    document.getElementById('totalLeads').textContent = totalLeads;
    document.getElementById('weightedValue').textContent = `$${formatCurrency(weightedValue)}`;
    
    // Update average contact days metric
    const averageContactElement = document.getElementById('averageContact');
    if (averageContactElement) {
        if (averageContactDays !== null) {
            const urgencyColor = getContactUrgencyColor(averageContactDays + ' days ago');
            averageContactElement.innerHTML = `<span style="color: ${urgencyColor}; font-weight: bold;">${averageContactDays} days</span>`;
        } else {
            averageContactElement.innerHTML = '<span style="color: #999;">No contact data</span>';
        }
    }
    
    // Contact urgency legend removed as requested
    
    // Create comprehensive stage metrics table
    const stageAgeElement = document.getElementById('stageAges');
    if (stageAgeElement && Object.keys(stageAges).length > 0) {
        let stageMetricsInfo = '<div class="stage-metrics-table">';
        stageMetricsInfo += '<table>';
        stageMetricsInfo += '<thead><tr><th>Stage</th><th>Avg Age (Days)</th><th>Avg Last Contact (Days)</th></tr></thead>';
        stageMetricsInfo += '<tbody>';
        
        // Calculate average contact days per stage
        const stageContactDays = {};
        currentData.leads.forEach(lead => {
            if (lead.lastContact) {
                const contactDate = new Date(lead.lastContact);
                const now = new Date();
                const diffTime = Math.abs(now - contactDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (!stageContactDays[lead.stage]) {
                    stageContactDays[lead.stage] = [];
                }
                stageContactDays[lead.stage].push(diffDays);
            }
        });
        
        // Calculate averages for each stage
        const stageContactAverages = {};
        Object.entries(stageContactDays).forEach(([stage, days]) => {
            const average = Math.round(days.reduce((sum, day) => sum + day, 0) / days.length);
            stageContactAverages[stage] = average;
        });
        
        // Sort stages by age (descending)
        const sortedStages = Object.entries(stageAges).sort((a, b) => b[1] - a[1]);
        
        sortedStages.forEach(([stage, age]) => {
            const contactDays = stageContactAverages[stage] || 'N/A';
            // For stage averages, we can't determine direction, so use the original logic
            const contactColor = stageContactAverages[stage] ? getContactUrgencyColor(stageContactAverages[stage] + ' days ago') : '#999';
            
            stageMetricsInfo += `<tr>
                <td>${stage}</td>
                <td>${age}</td>
                <td style="color: ${contactColor}; font-weight: bold;">${contactDays}</td>
            </tr>`;
        });
        
        stageMetricsInfo += '</tbody></table></div>';
        stageAgeElement.innerHTML = stageMetricsInfo;
    }
}

// Render List View table from currentData
async function renderListView() {
    const head = document.getElementById('listTableHead');
    const body = document.getElementById('listTableBody');
    if (!head || !body) return;

    const listId = document.getElementById('listSelect')?.value || localStorage.getItem('ui:lastListId');
    if (!listId) {
        head.innerHTML = '';
        body.innerHTML = '<tr><td>Select a list in Settings to view entries.</td></tr>';
        return;
    }

    if (!currentData || !currentData.leads || currentData.leads.length === 0) {
        try { await loadPipelineData(); } catch (_) {}
    }

    const rows = (currentData?.leads || []).map(lead => ({
        name: lead.entity?.name || `Lead ${lead.id}`,
        stage: lead.stage || '-',
        value: Number(lead.value) || 0,
        weighted: calculateLeadWeightedValue(lead) || 0,
        lastContact: lead.lastContact ? new Date(lead.lastContact) : null,
    }));

    head.innerHTML = ['Name','Stage','Value','Weighted','Last Contact'].map(h => `<th>${h}</th>`).join('');
    const fmtDate = (d) => d ? d.toLocaleDateString() : '—';
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="5">No entries found for this list.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td><span class="badge">${r.stage}</span></td>
          <td>$${formatCurrency(r.value)}</td>
          <td>$${formatCurrency(r.weighted)}</td>
          <td>${fmtDate(r.lastContact)}</td>
        </tr>
    `).join('');
}

// Expose for UI router
window.renderListView = renderListView;

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
    const drawer = document.getElementById('stageDrawer');
    const title = document.getElementById('stageDrawerTitle');
    const body = document.getElementById('stageDrawerBody');
    
    // Calculate average last contact time for this stage
    const averageContactDays = calculateAverageContactDays(stageData.leads);
    
    // Calculate average lead age for this stage
    const averageLeadAge = calculateAverageLeadAge(stageData.leads);
    
    // Get change statistics for this stage
    const changeStats = getStageChangeStats(stageData.stage);
    
    title.innerHTML = `<i class="fas fa-layer-group"></i> ${stageData.stage}`;
    const kpi = (label, value) => `<div style="display:flex;flex-direction:column;gap:4px;"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
    const leadsTop = stageData.leads.slice().sort((a,b)=> (b.value)-(a.value)).slice(0,5);
    body.innerHTML = `
      <div style="display:grid;grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:16px;">
        ${kpi('Total Value', `$${formatCurrency(stageData.totalValue)}`)}
        ${kpi('Weighted', `$${formatCurrency(stageData.weightedValue)}`)}
        ${kpi('Leads', `${stageData.count}`)}
        ${kpi('Stage Weight', `${stageWeights[stageData.stage] || 1}x`)}
      </div>
      <div style="display:grid;grid-template-columns: 1fr 1fr; gap:16px;">
        <div class="card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">Activity</h4>
          <div>${averageLeadAge !== null ? `Avg Age: <strong>${averageLeadAge} days</strong>` : 'Avg Age: —'}</div>
          <div>${averageContactDays !== null ? `Avg Last Contact: <strong>${averageContactDays} days</strong>` : 'Avg Last Contact: —'}</div>
        </div>
        <div class="card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">Top Leads</h4>
          <ol style="margin:0;padding-left:18px;">
            ${leadsTop.map(l => `<li>${l.entity?.name || 'Lead'} — $${formatCurrency(l.value)} <span style="color:#64748b;">(w: $${formatCurrency(calculateLeadWeightedValue(l))})</span></li>`).join('')}
          </ol>
        </div>
      </div>
      <h4 style="margin:16px 0 8px;">All Leads</h4>
      <div class="leads-list">
        ${stageData.leads.map(lead => {
            const urgencyColor = getContactUrgencyColor(lead.lastContact, lead);
            const individualWeight = getIndividualLeadWeight(lead.id);
            const weightedValue = calculateLeadWeightedValue(lead);
            const lastContactInfo = lead.lastContact ? `<span class="last-contact" style="color:${urgencyColor};font-weight:bold;">Last Contact: ${formatLastContact(lead.lastContact)}</span>` : `<span class="last-contact" style="color:${urgencyColor};">No contact info</span>`;
            return `<div class="lead-item"><div class="lead-header"><strong>${lead.entity?.name || `Lead ${lead.id}`}${individualWeight!==1?` (${individualWeight}x)`:''}</strong></div><div class="lead-details"><span class="lead-value">$${formatCurrency(lead.value)}</span><span class="lead-weighted-value">Weighted: $${formatCurrency(weightedValue)}</span>${lead.source?`<span class="lead-source">Source: ${lead.source}</span>`:''}${lastContactInfo}</div></div>`;
        }).join('')}
      </div>
    `;

    drawer.classList.remove('hidden');
}

// Show lead details
function showLeadDetails(lead) {
    const modal = document.getElementById('leadModal');
    const content = document.getElementById('modalContent');
    
    const urgencyColor = getContactUrgencyColor(lead.lastContact, lead);
    const lastContactInfo = lead.lastContact ? 
        `<p><strong>Last Contact:</strong> <span style="color: ${urgencyColor}; font-weight: bold;">${formatLastContact(lead.lastContact)}</span></p>` : 
        `<p><strong>Last Contact:</strong> <span style="color: ${urgencyColor};">No contact information available</span></p>`;
    
    content.innerHTML = `
        <h3>${lead.entity?.name || `Lead ${lead.id}`}</h3>
        <div class="lead-detail-stats">
            <p><strong>Stage:</strong> ${lead.stage}</p>
            <p><strong>Value:</strong> $${formatCurrency(lead.value)}</p>
            <p><strong>Stage Weight:</strong> ${stageWeights[lead.stage] || 1}x</p>
            <p><strong>Individual Weight:</strong> ${getIndividualLeadWeight(lead.id)}x</p>
            <p><strong>Total Weighted Value:</strong> $${formatCurrency(calculateLeadWeightedValue(lead))}</p>
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
            <div class="field-item">
                <strong>Stage Weight:</strong> ${stageWeights[lead.stage] || 1}x
            </div>
            <div class="field-item">
                <strong>Individual Weight:</strong> ${getIndividualLeadWeight(lead.id)}x
            </div>
            <div class="field-item">
                <strong>Total Weighted Value:</strong> $${formatCurrency(calculateLeadWeightedValue(lead))}
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
    
    const individualWeight = getIndividualLeadWeight(lead.id);
    const weightedValue = calculateLeadWeightedValue(lead);
    const weightDisplay = individualWeight !== 1 ? ` (${individualWeight}x)` : '';
    
    tooltip.html(`
        <strong>${lead.entity?.name || `Lead ${lead.id}`}${weightDisplay}</strong><br/>
        Stage: ${lead.stage}<br/>
        Value: $${formatCurrency(lead.value)}<br/>
        ${lead.source ? `Source: ${lead.source}<br/>` : ''}
        ${lead.contactDirection ? `Contact: ${lead.contactDirection}<br/>` : ''}
        ${lead.contactType ? `Type: ${lead.contactType}<br/>` : ''}
        ${lead.leadAge !== null ? `Age: ${lead.leadAge} days<br/>` : ''}
        Weighted: $${formatCurrency(weightedValue)}
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

    const lostStagesInput = document.getElementById('lostStages');
    if (lostStagesInput && Array.isArray(defaultSettings.lostStages)) {
        // Set primary lost stage (first one in the array)
        lostStagesInput.value = defaultSettings.lostStages.length > 0 ? defaultSettings.lostStages[0] : '';
        
        // Clear and repopulate additional lost stages
        const container = document.getElementById('additionalLostStagesList');
        if (container) {
            container.innerHTML = '';
            // Add additional lost stages (skip the first one)
            for (let i = 1; i < defaultSettings.lostStages.length; i++) {
                if (currentData) {
                    const stageValues = new Set();
                    currentData.leads.forEach(lead => {
                        if (lead.stage) {
                            stageValues.add(lead.stage);
                        }
                    });
                    addLostStageItem(defaultSettings.lostStages[i], Array.from(stageValues).sort());
                }
            }
        }
    }

    // Ensure excluded stages include closed/won and lost selections
    if (defaultSettings.closedWonStage) excludedStages.add(defaultSettings.closedWonStage);
    if (Array.isArray(defaultSettings.lostStages)) {
        defaultSettings.lostStages.forEach(stage => excludedStages.add(stage));
    }
    
    renderDefaultRules();
    updatePiggyBank();
    
    // Populate default stage values if we have a saved field but no saved value
    if (defaultSettings.defaultStageField && !defaultSettings.defaultStageValue) {
        populateDefaultStageValues();
    }
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
                if (lead.field_values) {
                    lead.field_values.forEach(fieldValue => {
                        if (fieldValue.id == fieldId) {
                            // Handle the new API structure
                            let value = null;
                            if (fieldValue.value && Object.prototype.hasOwnProperty.call(fieldValue.value, 'data')) {
                                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                                    value = fieldValue.value.data?.text;
                                } else if (fieldValue.value.type === 'text') {
                                    value = fieldValue.value.data;
                                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                                    value = fieldValue.value.data;
                                } else if (fieldValue.value.type === 'dropdown-multi') {
                                    const data = fieldValue.value.data;
                                    if (Array.isArray(data)) {
                                        value = data.join(', ');
                                    } else if (data && typeof data === 'object') {
                                        const texts = Object.values(data).filter(val => typeof val === 'string');
                                        value = texts.join(', ');
                                    } else if (data != null) {
                                        value = String(data);
                                    } else {
                                        value = '';
                                    }
                                } else {
                                    const data = fieldValue.value.data;
                                    value = data != null ? String(data) : '';
                                }
                            } else {
                                // Fallback to old structure
                                value = fieldValue.value?.text || fieldValue.value;
                            }
                            
                            if (value) fieldValues.add(value);
                        }
                    });
                }
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
                
                // Restore saved value if it exists
                if (defaultSettings.defaultStageValue) {
                    valueSelect.value = defaultSettings.defaultStageValue;
                }
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

// Restore persisted UI selections for primary selectors
function restoreUISelections() {
    try {
        const stageFieldSel = document.getElementById('stageField');
        const valueFieldSel = document.getElementById('valueField');
        const sourceFieldSel = document.getElementById('sourceField');
        const firstEmailSel = document.getElementById('firstEmailField');

        const savedStage = localStorage.getItem('ui:stageField');
        if (stageFieldSel && savedStage) stageFieldSel.value = savedStage;
        const savedValue = localStorage.getItem('ui:valueField');
        if (valueFieldSel && savedValue) valueFieldSel.value = savedValue;
        const savedSource = localStorage.getItem('ui:sourceField');
        if (sourceFieldSel && savedSource) sourceFieldSel.value = savedSource;
        const savedFirstEmail = localStorage.getItem('ui:firstEmailField');
        if (firstEmailSel && savedFirstEmail) firstEmailSel.value = savedFirstEmail;
    } catch (_) { /* ignore */ }
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
        // Apply saved closed/won selection
        if (defaultSettings && defaultSettings.closedWonStage) {
            valueSelect.value = defaultSettings.closedWonStage;
        }
    }
}

// Populate lost stage values
function populateLostStageValues() {
    const valueSelect = document.getElementById('lostStages');
    if (!currentData || !valueSelect) return;

    // Clear existing options
    valueSelect.innerHTML = '<option value="">Select stage value...</option>';

    const stageValues = new Set();
    currentData.leads.forEach(lead => {
        if (lead.stage) {
            stageValues.add(lead.stage);
        }
    });

    const sortedStages = Array.from(stageValues).sort();
    
    sortedStages.forEach(stage => {
        const option = document.createElement('option');
        option.value = stage;
        option.textContent = stage;
        // Set the primary lost stage
        if (Array.isArray(defaultSettings.lostStages) && defaultSettings.lostStages.length > 0 && defaultSettings.lostStages[0] === stage) {
            option.selected = true;
        }
        valueSelect.appendChild(option);
    });
    
    // Populate additional lost stages
    populateAdditionalLostStages();
}

// Populate additional lost stages UI
function populateAdditionalLostStages() {
    const container = document.getElementById('additionalLostStagesList');
    if (!container || !currentData) return;
    
    // Clear existing additional stages
    container.innerHTML = '';
    
    // Get all available stages
    const stageValues = new Set();
    currentData.leads.forEach(lead => {
        if (lead.stage) {
            stageValues.add(lead.stage);
        }
    });
    const sortedStages = Array.from(stageValues).sort();
    
    // Create additional lost stage items (skip the first one since that's the primary)
    if (Array.isArray(defaultSettings.lostStages) && defaultSettings.lostStages.length > 1) {
        for (let i = 1; i < defaultSettings.lostStages.length; i++) {
            addLostStageItem(defaultSettings.lostStages[i], sortedStages);
        }
    }
}

// Add a new lost stage item
function addLostStageItem(selectedValue = '', availableStages = []) {
    const container = document.getElementById('additionalLostStagesList');
    if (!container) return;
    
    // Get available stages if not provided
    if (availableStages.length === 0 && currentData) {
        const stageValues = new Set();
        currentData.leads.forEach(lead => {
            if (lead.stage) {
                stageValues.add(lead.stage);
            }
        });
        availableStages = Array.from(stageValues).sort();
    }
    
    const item = document.createElement('div');
    item.className = 'lost-stage-item';
    
    const select = document.createElement('select');
    select.className = 'form-control additional-lost-stage';
    select.innerHTML = '<option value="">Select additional stage...</option>';
    
    availableStages.forEach(stage => {
        const option = document.createElement('option');
        option.value = stage;
        option.textContent = stage;
        if (stage === selectedValue) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-danger remove-lost-stage';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.addEventListener('click', () => {
        item.remove();
        updateDefaultSettings();
    });
    
    select.addEventListener('change', updateDefaultSettings);
    
    item.appendChild(select);
    item.appendChild(removeBtn);
    container.appendChild(item);
}

// Add additional lost stage handler
function addAdditionalLostStage() {
    addLostStageItem();
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
                if (lead.field_values) {
                    lead.field_values.forEach(fieldValue => {
                        if (fieldValue.id == field.id) {
                            // Handle the new API structure
                            let value = null;
                            if (fieldValue.value && Object.prototype.hasOwnProperty.call(fieldValue.value, 'data')) {
                                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                                    value = fieldValue.value.data?.text;
                                } else if (fieldValue.value.type === 'text') {
                                    value = fieldValue.value.data;
                                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                                    value = fieldValue.value.data;
                                } else if (fieldValue.value.type === 'dropdown-multi') {
                                    const data = fieldValue.value.data;
                                    if (Array.isArray(data)) {
                                        value = data.join(', ');
                                    } else if (data && typeof data === 'object') {
                                        const texts = Object.values(data).filter(val => typeof val === 'string');
                                        value = texts.join(', ');
                                    } else if (data != null) {
                                        value = String(data);
                                    } else {
                                        value = '';
                                    }
                                } else {
                                    const data = fieldValue.value.data;
                                    value = data != null ? String(data) : '';
                                }
                            } else {
                                // Fallback to old structure
                                value = fieldValue.value?.text || fieldValue.value;
                            }
                            
                            if (value) fieldValues.add(value);
                        }
                    });
                }
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
                if (lead.field_values) {
                    lead.field_values.forEach(fieldValue => {
                        if (fieldValue.id == fieldId) {
                            // Handle the new API structure
                            let value = null;
                            if (fieldValue.value && Object.prototype.hasOwnProperty.call(fieldValue.value, 'data')) {
                                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                                    value = fieldValue.value.data?.text;
                                } else if (fieldValue.value.type === 'text') {
                                    value = fieldValue.value.data;
                                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                                    value = fieldValue.value.data;
                                } else if (fieldValue.value.type === 'dropdown-multi') {
                                    const data = fieldValue.value.data;
                                    if (Array.isArray(data)) {
                                        value = data.join(', ');
                                    } else if (data && typeof data === 'object') {
                                        const texts = Object.values(data).filter(val => typeof val === 'string');
                                        value = texts.join(', ');
                                    } else if (data != null) {
                                        value = String(data);
                                    } else {
                                        value = '';
                                    }
                                } else {
                                    const data = fieldValue.value.data;
                                    value = data != null ? String(data) : '';
                                }
                            } else {
                                // Fallback to old structure
                                value = fieldValue.value?.text || fieldValue.value;
                            }
                            
                            if (value) fieldValues.add(value);
                        }
                    });
                }
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
                
                // Restore saved value if it exists and is valid for this field
                if (defaultSettings.defaultStageValue && fieldValues.has(defaultSettings.defaultStageValue)) {
                    valueSelect.value = defaultSettings.defaultStageValue;
                }
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
    const oldClosedWon = defaultSettings.closedWonStage;
    const oldLost = Array.isArray(defaultSettings.lostStages) ? [...defaultSettings.lostStages] : [];

    defaultSettings.defaultStageField = document.getElementById('defaultStageField').value;
    defaultSettings.defaultStageValue = document.getElementById('defaultStageValue').value;
    defaultSettings.globalDefaultValue = parseFloat(document.getElementById('globalDefaultValue').value) || 1000000;
    defaultSettings.closedWonStage = document.getElementById('closedWonStage').value;
    defaultSettings.closedWonValueField = document.getElementById('closedWonValueField').value;
    // Collect lost stages from primary select and additional stages
    const lostStages = [];
    
    // Get primary lost stage
    const lostSelect = document.getElementById('lostStages');
    if (lostSelect && lostSelect.value) {
        lostStages.push(lostSelect.value);
    }
    
    // Get additional lost stages
    const additionalStages = document.querySelectorAll('.additional-lost-stage');
    additionalStages.forEach(select => {
        if (select.value && !lostStages.includes(select.value)) {
            lostStages.push(select.value);
        }
    });
    
    defaultSettings.lostStages = lostStages;

    // Update excluded stages
    excludedStages.delete(oldClosedWon);
    oldLost.forEach(stage => excludedStages.delete(stage));
    if (defaultSettings.closedWonStage) excludedStages.add(defaultSettings.closedWonStage);
    defaultSettings.lostStages.forEach(stage => excludedStages.add(stage));

    localStorage.setItem('defaultSettings', JSON.stringify(defaultSettings));

    // Re-process data if we have current data
    if (currentData) {
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
            if (fieldValue.value && Object.prototype.hasOwnProperty.call(fieldValue.value, 'data')) {
                // New API structure: value.data contains the actual value
                if (fieldValue.value.type === 'ranked-dropdown' || fieldValue.value.type === 'dropdown') {
                    fieldValueData = fieldValue.value.data?.text;
                } else if (fieldValue.value.type === 'number' || fieldValue.value.type === 'number-multi') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'text') {
                    fieldValueData = fieldValue.value.data;
                } else if (fieldValue.value.type === 'dropdown-multi') {
                    // Handle multi-select dropdowns - convert array to readable string
                    const data = fieldValue.value.data;
                    if (Array.isArray(data)) {
                        fieldValueData = data.join(', ');
                    } else if (data && typeof data === 'object') {
                        // If it's an object with text properties, extract them
                        const texts = Object.values(data).filter(val => typeof val === 'string');
                        fieldValueData = texts.join(', ');
                    } else if (data != null) {
                        fieldValueData = String(data);
                    } else {
                        fieldValueData = '';
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
            const hasStageField = fieldValues.some(fv => normalizeFieldId(fv.id) === normalizeFieldId(defaultSettings.defaultStageField));
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
            const isClosedWon = defaultSettings.closedWonStage === leadData.stage;
            const isLost = defaultSettings.lostStages.includes(leadData.stage);

            if (isClosedWon) {
                console.log(`Processing closed/won lead ${lead.id} with stage: ${leadData.stage}`);
                if (defaultSettings.closedWonValueField) {
                    fieldValues.forEach(fieldValue => {
                        const fieldId = fieldValue.id;
                        const field = data.fields.find(f => f.id == fieldId);
                        if (field && field.name === defaultSettings.closedWonValueField) {
                            let closedWonValue = 0;
                            if (fieldValue.value && Object.prototype.hasOwnProperty.call(fieldValue.value, 'data')) {
                                closedWonValue = parseCurrencyNumber(fieldValue.value.data);
                            } else {
                                closedWonValue = parseCurrencyNumber(fieldValue.value);
                            }
                            if (closedWonValue > 0) {
                                leadData.value = closedWonValue;
                                console.log(`Set closed/won value for lead ${lead.id}: ${closedWonValue}`);
                            }
                        }
                    });
                }
            } else if (!isLost) {
                processed.totalValue += leadData.value;
            }

            if (!isClosedWon && !isLost) {
                processed.stages.add(leadData.stage);
            }

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
    if (currentData && currentData.leads && defaultSettings.closedWonStage) {
        const closedWonLeads = currentData.leads.filter(lead => lead.stage === defaultSettings.closedWonStage);
        console.log(`Found ${closedWonLeads.length} leads in closed/won stage: ${defaultSettings.closedWonStage}`);

        // Prefer the already-processed lead.value (processPipelineData sets it from the configured field)
        closedWonValue = closedWonLeads.reduce((sum, lead) => sum + (Number(lead.value) || 0), 0);

        // If still zero and a field was selected, try extracting directly from field_values (robustly)
        if (closedWonValue === 0 && defaultSettings.closedWonValueField) {
            const toNumber = (val) => parseCurrencyNumber(val);

            const getFieldNameById = (id) => {
                const field = currentData.fields?.find(f => String(f.id) === String(id));
                return field?.name;
            };

            closedWonValue = closedWonLeads.reduce((sum, lead) => {
                let matched = 0;
                (lead.field_values || []).forEach(fv => {
                    const possibleId = fv.id || fv.field_id || fv.entityAttributeId;
                    const name = fv.name || getFieldNameById(possibleId);
                    let raw = null;
                    if (name === defaultSettings.closedWonValueField) {
                        if (fv.value && Object.prototype.hasOwnProperty.call(fv.value, 'data')) {
                            raw = fv.value.data;
                        } else {
                            raw = fv.value;
                        }
                        matched += toNumber(raw);
                    }
                });
                return sum + matched;
            }, 0);
        }
    }
    
    // Update the display values
    const closedWonValueElement = document.getElementById('closedWonValue');
    const goalProgressElement = document.getElementById('goalProgress');
    const cwGoal = document.getElementById('closedWonValue_goal');
    const gpGoal = document.getElementById('goalProgress_goal');
    
    if (closedWonValueElement) {
        closedWonValueElement.textContent = formatCurrency(closedWonValue);
    }
    
    if (goalProgressElement) {
        const progressPercent = Math.min(100, (closedWonValue / 100000000) * 100);
        goalProgressElement.textContent = `${progressPercent.toFixed(1)}%`;
    }
    if (cwGoal) cwGoal.textContent = formatCurrency(closedWonValue);
    if (gpGoal) {
        const p = Math.min(100, (closedWonValue / 100000000) * 100);
        gpGoal.textContent = `${p.toFixed(1)}%`;
        const fill = document.getElementById('goalProgressFill');
        if (fill) fill.style.width = `${p}%`;
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

    // Pipeline coverage of remaining goal
    try {
        // Only consider open (non-closed, non-lost) leads for pipeline coverage
        const openLeads = (currentData?.leads || []).filter(l => l.stage !== defaultSettings.closedWonStage && !defaultSettings.lostStages.includes(l.stage));
        const weighted = openLeads.reduce((sum, l) => sum + calculateLeadWeightedValue(l), 0) || 0;
        const remaining = Math.max(0, 100000000 - closedWonValue);
        const coveragePct = remaining > 0 ? Math.min(100, (weighted / remaining) * 100) : 100;
        const wpEl = document.getElementById('weightedPipeline_goal');
        const covEl = document.getElementById('pipelineCoveragePct');
        if (wpEl) wpEl.textContent = formatCurrency(weighted);
        if (covEl) covEl.textContent = `${coveragePct.toFixed(1)}%`;
    } catch (_) {}
}

// Toggle stage exclusion

// ===============
// Advanced List View (columns, sorting, pinned, saved views)
// ===============
(function(){
  function storageKey(listId){ return `ui:listView:config:${listId||'default'}`; }
  function loadCfg(listId){ try { return JSON.parse(localStorage.getItem(storageKey(listId))||'{}'); } catch(_) { return {}; } }
  function saveCfg(listId, cfg){ try { localStorage.setItem(storageKey(listId), JSON.stringify(cfg||{})); } catch(_){} }
  function defaultView(){ return { columns: ['Name','Stage','Value','Weighted','Last Contact'], pinned: ['Name'], sort: { column:'Name', dir:'asc' } }; }
  function availableColumns(){
    const base = new Set(['Name','Stage','Value','Weighted','Last Contact']);
    try {
      (currentData?.fields||[]).forEach(f=> base.add(f.name));
      (currentData?.leads||[]).slice(0,50).forEach(lead => (lead.field_values||[]).forEach(fv => fv.name && base.add(fv.name)));
    } catch(_){}
    const preferred = ['Organization','Organizations','Owners','People','Source','First Email'];
    preferred.forEach(p=>base.add(p));
    return Array.from(base);
  }
  function strVal(v){ if(v==null) return ''; if(typeof v==='string'||typeof v==='number') return String(v); if(Array.isArray(v)) return v.map(strVal).join(', '); if(typeof v==='object') return v.name||v.text||v.title||v.value||v.data||''; return ''; }
  function cell(lead,label){
    switch(label){
      case 'Name': return lead.entity?.name || `Lead ${lead.id}`;
      case 'Stage': return lead.stage || '';
      case 'Value': return `$${formatCurrency(Number(lead.value)||0)}`;
      case 'Weighted': return `$${formatCurrency(calculateLeadWeightedValue(lead)||0)}`;
      case 'Last Contact': return lead.lastContact ? new Date(lead.lastContact).toLocaleDateString() : '—';
      default:
        // Match by field name via currentData.fields mapping
        const fieldsMap = new Map((currentData?.fields||[]).map(f => [normalizeFieldId(f.id), f.name]));
        const match = (lead.field_values||[]).find(fv => {
          const name = (fv.name || fieldsMap.get(normalizeFieldId(fv.id)) || '').toLowerCase();
          return name === label.toLowerCase();
        });
        if (!match) return '';
        const raw = (match.value && Object.prototype.hasOwnProperty.call(match.value,'data')) ? match.value.data : match.value;
        return strVal(raw)||'';
    }
  }
  async function render(){
    const listId=document.getElementById('listSelect')?.value || localStorage.getItem('ui:lastListId');
    const head=document.getElementById('listTableHead');
    const body=document.getElementById('listTableBody');
    const viewSelect=document.getElementById('listViewSelect');
    if(!head||!body) return;
    if(!listId){ head.innerHTML=''; body.innerHTML='<tr><td>Select a list in Settings to view entries.</td></tr>'; return; }
    if(!currentData||!currentData.leads?.length){ try{ await loadPipelineData(); }catch(_){} }

    const available=availableColumns();
    const cfg=loadCfg(listId);
    cfg.views=cfg.views||{ 'Default': defaultView() };
    cfg.currentView=cfg.currentView||'Default';
    saveCfg(listId,cfg);
    const view=cfg.views[cfg.currentView]||defaultView();

    // toolbar
    if(viewSelect){ viewSelect.innerHTML=Object.keys(cfg.views).map(v=>`<option value="${v}">${v}</option>`).join(''); viewSelect.value=cfg.currentView; viewSelect.onchange=()=>{ cfg.currentView=viewSelect.value; saveCfg(listId,cfg); render(); } }

    const cols=(view.columns||defaultView().columns).filter(c=>available.includes(c));
    const pinned=new Set(view.pinned||[]);
    const sort=view.sort||{ column:'Name', dir:'asc' };

    // sort rows
    let rows=(currentData?.leads||[]).slice();
    rows.sort((a,b)=>{ const av=cell(a,sort.column).toString().toLowerCase(); const bv=cell(b,sort.column).toString().toLowerCase(); return sort.dir==='asc' ? (av>bv?1:av<bv?-1:0) : (av>bv?-1:av<bv?1:0); });

    // head
    head.innerHTML='';
    let left=0;
    cols.forEach(label=>{ const th=document.createElement('th'); th.textContent=label; th.style.cursor='pointer'; th.onclick=()=>{ const next=(sort.column===label && sort.dir==='asc')?'desc':'asc'; view.sort={column:label,dir:next}; cfg.views[cfg.currentView]=view; saveCfg(listId,cfg); render(); }; if(pinned.has(label)){ th.classList.add('pinned'); th.style.setProperty('--pin-left', left+'px'); left+=160; } head.appendChild(th); });

    // body
    body.innerHTML = rows.map(lead=> `<tr>${cols.map(label=>`<td${pinned.has(label)?' class="pinned"':''}>${cell(lead,label)||'—'}</td>`).join('')}</tr>`).join('');

    // drawer populate
    const vis=document.getElementById('visibleCols'); const hid=document.getElementById('hiddenCols'); const drawer=document.getElementById('listColumnsDrawer'); const apply=document.getElementById('applyColumns'); const save=document.getElementById('saveListView'); const del=document.getElementById('deleteListView'); const nameInput=document.getElementById('viewName');
    const setLists=()=>{ if(!vis||!hid)return; vis.innerHTML=cols.map(l=>`<li class="col-item" data-col="${l}"><span>${l}</span><div class="col-actions"><label style="display:flex;align-items:center;gap:4px;font-size:12px;"><input type="checkbox" class="pin" ${pinned.has(l)?'checked':''}/> Pin</label><button class="btn btn-outline up">▲</button><button class="btn btn-outline down">▼</button></div></li>`).join(''); const hidden=available.filter(a=>!cols.includes(a)); hid.innerHTML=hidden.map(l=>`<li class="col-item" data-col="${l}"><span>${l}</span><div class="col-actions"><button class="btn btn-outline add">Add</button></div></li>`).join(''); };
    setLists();
    if(vis){ vis.onclick=(e)=>{ const li=e.target.closest('li'); if(!li) return; const label=li.dataset.col; if(e.target.classList.contains('up')){ const idx=cols.indexOf(label); if(idx>0){ cols.splice(idx,1); cols.splice(idx-1,0,label); setLists(); } } else if(e.target.classList.contains('down')){ const idx=cols.indexOf(label); if(idx<cols.length-1){ cols.splice(idx,1); cols.splice(idx+1,0,label); setLists(); } } else if(e.target.classList.contains('pin')){ if(e.target.checked) pinned.add(label); else pinned.delete(label); } }; }
    if(hid){ hid.onclick=(e)=>{ const li=e.target.closest('li'); if(!li) return; const label=li.dataset.col; if(e.target.classList.contains('add')){ cols.push(label); setLists(); } }; }
    if(apply){ apply.onclick=()=>{ view.columns=cols.slice(); view.pinned=Array.from(pinned); cfg.views[cfg.currentView]=view; saveCfg(listId,cfg); drawer?.classList.add('hidden'); render(); }; }
    if(save){ save.onclick=()=>{ const nm=(nameInput?.value||'').trim(); if(!nm) return; cfg.views[nm]={ columns: cols.slice(), pinned:Array.from(pinned), sort: view.sort||{column:'Name',dir:'asc'} }; cfg.currentView=nm; saveCfg(listId,cfg); render(); }; }
    if(del){ del.onclick=()=>{ if(cfg.currentView==='Default') return; delete cfg.views[cfg.currentView]; cfg.currentView='Default'; saveCfg(listId,cfg); render(); }; }
  }
  // expose
  window.renderListView = render;
})();

// Enhanced List View V2: filters, drag-reorder, pinned offsets
(function(){
  function storageKey(listId){ return `ui:listView:config:${listId||'default'}`; }
  function loadCfg(listId){ try { return JSON.parse(localStorage.getItem(storageKey(listId))||'{}'); } catch(_) { return {}; } }
  function saveCfg(listId,cfg){ try { localStorage.setItem(storageKey(listId), JSON.stringify(cfg||{})); } catch(_){} }
  function defaultView(){ return { columns:['Name','Stage','Value','Weighted','Last Contact'], pinned:['Name'], sort:{column:'Name',dir:'asc'}, filters:{} }; }
  function available(){ const s=new Set(['Name','Stage','Value','Weighted','Last Contact']); try{ (currentData?.fields||[]).forEach(f=>s.add(f.name)); (currentData?.leads||[]).slice(0,50).forEach(l=>(l.field_values||[]).forEach(f=>f.name&&s.add(f.name))); }catch(_){} return Array.from(s); }
  function str(v){ if(v==null) return ''; if(Array.isArray(v)) return v.map(str).join(', '); if(typeof v==='object') return v.name||v.text||v.title||v.value||v.data||''; return String(v); }
  function cellVal(lead,label){ switch(label){ case 'Name': return lead.entity?.name||`Lead ${lead.id}`; case 'Stage': return lead.stage||''; case 'Value': return `$${formatCurrency(Number(lead.value)||0)}`; case 'Weighted': return `$${formatCurrency(calculateLeadWeightedValue(lead)||0)}`; case 'Last Contact': return lead.lastContact ? new Date(lead.lastContact).toLocaleDateString() : '—'; default: const fv=(lead.field_values||[]).find(f=>(f.name||'').toLowerCase()===label.toLowerCase()); const raw=fv?(f.value && Object.prototype.hasOwnProperty.call(f.value,'data')?f.value.data:f.value):null; return str(raw)||''; } }

  async function renderListViewV2(){
    const listId=document.getElementById('listSelect')?.value || localStorage.getItem('ui:lastListId');
    const head=document.getElementById('listTableHead');
    const body=document.getElementById('listTableBody');
    const selector=document.getElementById('listViewSelect');
    if(!head||!body) return;
    if(!listId){ head.innerHTML=''; body.innerHTML='<tr><td>Select a list in Settings to view entries.</td></tr>'; return; }
    if(!currentData||!currentData.leads?.length){ try{ await loadPipelineData(); }catch(_){} }

    const avail=available();
    const cfg=loadCfg(listId); cfg.views=cfg.views||{ 'Default': defaultView() }; cfg.currentView=cfg.currentView||'Default'; saveCfg(listId,cfg);
    const view=cfg.views[cfg.currentView]||defaultView();
    const cols=(view.columns||defaultView().columns).filter(c=>avail.includes(c));
    const pinned=new Set(view.pinned||[]);
    const sort=view.sort||{column:'Name',dir:'asc'};
    const filters=view.filters||{};

    if(selector){ selector.innerHTML=Object.keys(cfg.views).map(n=>`<option value="${n}">${n}</option>`).join(''); selector.value=cfg.currentView; selector.onchange=()=>{ cfg.currentView=selector.value; saveCfg(listId,cfg); renderListViewV2(); } }

    let rows=(currentData?.leads||[]).slice();
    rows=rows.filter(lead=>cols.every(label=>{ const q=(filters[label]||'').toString().trim().toLowerCase(); if(!q) return true; return cellVal(lead,label).toString().toLowerCase().includes(q); }));
    rows.sort((a,b)=>{ const av=cellVal(a,sort.column).toString().toLowerCase(); const bv=cellVal(b,sort.column).toString().toLowerCase(); return sort.dir==='asc' ? (av>bv?1:av<bv?-1:0) : (av>bv?-1:av<bv?1:0); });

    // head + filters
    head.innerHTML=''; const thead=head.parentElement; let left=0;
    cols.forEach(label=>{ const th=document.createElement('th'); th.textContent=label; th.dataset.col=label; th.style.cursor='pointer'; th.onclick=()=>{ const next=(sort.column===label && sort.dir==='asc')?'desc':'asc'; view.sort={column:label,dir:next}; cfg.views[cfg.currentView]=view; saveCfg(listId,cfg); renderListViewV2(); }; if(pinned.has(label)){ th.classList.add('pinned'); th.style.setProperty('--pin-left', left+'px'); left+=160; } head.appendChild(th); });
    let filterRow=thead.querySelector('tr.filters'); if(!filterRow){ filterRow=document.createElement('tr'); filterRow.className='filters'; thead.appendChild(filterRow); }
    filterRow.innerHTML=''; cols.forEach(label=>{ const th=document.createElement('th'); const input=document.createElement('input'); input.type='text'; input.placeholder='Search'; input.value=filters[label]||''; input.oninput=(e)=>{ view.filters=Object.assign({}, view.filters, { [label]: e.target.value }); cfg.views[cfg.currentView]=view; saveCfg(listId,cfg); renderListViewV2(); }; th.appendChild(input); filterRow.appendChild(th); });

    // body
    body.innerHTML = rows.map(lead=>`<tr>${cols.map(label=>`<td data-col="${label}"${pinned.has(label)?' class="pinned"':''}>${cellVal(lead,label)||'—'}</td>`).join('')}</tr>`).join('');
    requestAnimationFrame(()=>{ const ths=[...head.children]; let acc=0; const leftMap={}; ths.forEach(th=>{ const lbl=th.getAttribute('data-col'); if(pinned.has(lbl)){ th.classList.add('pinned'); th.style.setProperty('--pin-left', acc+'px'); leftMap[lbl]=acc; acc+=th.getBoundingClientRect().width; }}); document.querySelectorAll('#listTableBody td.pinned').forEach(td=>{ const lbl=td.getAttribute('data-col'); const left=leftMap[lbl]||0; td.style.setProperty('--pin-left', left+'px'); }); });

    // drawer lists + drag-reorder
    const vis=document.getElementById('visibleCols'); const hid=document.getElementById('hiddenCols'); const drawer=document.getElementById('listColumnsDrawer'); const apply=document.getElementById('applyColumns'); const save=document.getElementById('saveListView'); const del=document.getElementById('deleteListView'); const nameInput=document.getElementById('viewName');
    const setLists=()=>{ if(!vis||!hid) return; vis.innerHTML=cols.map(l=>`<li class="col-item" data-col="${l}" draggable="true"><span>${l}</span><div class="col-actions"><label style="display:flex;align-items:center;gap:4px;font-size:12px;"><input type="checkbox" class="pin" ${pinned.has(l)?'checked':''}/> Pin</label><button class="btn btn-outline up">▲</button><button class="btn btn-outline down">▼</button></div></li>`).join(''); const hidden=available().filter(a=>!cols.includes(a)); hid.innerHTML=hidden.map(l=>`<li class="col-item" data-col="${l}"><span>${l}</span><div class="col-actions"><button class="btn btn-outline add">Add</button></div></li>`).join(''); vis.querySelectorAll('li').forEach(li=>{ li.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain', li.dataset.col); }); li.addEventListener('dragover',e=>{ e.preventDefault(); }); li.addEventListener('drop',e=>{ e.preventDefault(); const dragged=e.dataTransfer.getData('text/plain'); const from=cols.indexOf(dragged); const to=cols.indexOf(li.dataset.col); if(from>-1&&to>-1&&from!==to){ const [m]=cols.splice(from,1); cols.splice(to,0,m); setLists(); } }); }); };
    setLists();
    if(vis){ vis.onclick=(e)=>{ const li=e.target.closest('li'); if(!li) return; const label=li.dataset.col; if(e.target.classList.contains('up')){ const i=cols.indexOf(label); if(i>0){ cols.splice(i,1); cols.splice(i-1,0,label); setLists(); } } else if(e.target.classList.contains('down')){ const i=cols.indexOf(label); if(i<cols.length-1){ cols.splice(i,1); cols.splice(i+1,0,label); setLists(); } } else if(e.target.classList.contains('pin')){ if(e.target.checked) pinned.add(label); else pinned.delete(label); } };
      const panel=document.querySelector('#listColumnsDrawer .drawer-panel'); if(panel){ panel.addEventListener('click', ev=>ev.stopPropagation()); }
    }
    if(hid){ hid.onclick=(e)=>{ const li=e.target.closest('li'); if(!li) return; const label=li.dataset.col; if(e.target.classList.contains('add')){ cols.push(label); setLists(); } }; }
    if(apply){ apply.onclick=()=>{ view.columns=cols.slice(); view.pinned=Array.from(pinned); view.filters=filters; cfg.views[cfg.currentView]=view; saveCfg(listId,cfg); drawer?.classList.add('hidden'); renderListViewV2(); }; }
    if(save){ save.onclick=()=>{ const nm=(nameInput?.value||'').trim(); if(!nm) return; cfg.views[nm]={ columns: cols.slice(), pinned:Array.from(pinned), sort:view.sort||{column:'Name',dir:'asc'}, filters:filters }; cfg.currentView=nm; saveCfg(listId,cfg); renderListViewV2(); }; }
    if(del){ del.onclick=()=>{ if(cfg.currentView==='Default') return; delete cfg.views[cfg.currentView]; cfg.currentView='Default'; saveCfg(listId,cfg); renderListViewV2(); }; }
  }
  // override
  window.renderListView = renderListViewV2;
})();
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
    saveStageConfig();
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
        saveStageConfig();
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

// Determine if a person is on our team
function isTeamMember(personName) {
    if (!personName) return false;
    const fullName = personName.trim();
    return TEAM_MEMBERS.some(member => 
        member.toLowerCase() === fullName.toLowerCase() ||
        fullName.toLowerCase().includes(member.toLowerCase()) ||
        member.toLowerCase().includes(fullName.toLowerCase())
    );
}

// Determine contact direction from lead data
function getContactDirection(lead) {
    if (!lead.lastContact || !lead.contactDirection) return 'unknown';
    
    // Check if we have detailed contact data
    if (lead.contactDirection.includes('emailed')) {
        const parts = lead.contactDirection.split(' emailed ');
        if (parts.length === 2) {
            const fromPerson = parts[0].trim();
            const toPerson = parts[1].trim();
            
            const fromIsTeam = isTeamMember(fromPerson);
            const toIsTeam = isTeamMember(toPerson);
            
            if (fromIsTeam && !toIsTeam) {
                return 'outbound'; // We sent to them
            } else if (!fromIsTeam && toIsTeam) {
                return 'inbound'; // They sent to us
            }
        }
    }
    
    // Fallback: check if contact type indicates direction
    if (lead.contactType === 'email') {
        // For emails, we need to check the direction from contactDirection
        if (lead.contactDirection.includes('emailed')) {
            const parts = lead.contactDirection.split(' emailed ');
            if (parts.length === 2) {
                const fromPerson = parts[0].trim();
                const toPerson = parts[1].trim();
                
                const fromIsTeam = isTeamMember(fromPerson);
                const toIsTeam = isTeamMember(toPerson);
                
                if (fromIsTeam && !toIsTeam) {
                    return 'outbound';
                } else if (!fromIsTeam && toIsTeam) {
                    return 'inbound';
                }
            }
        }
    }
    
    return 'unknown';
}

// Get contact urgency color based on days since last contact and direction
function getContactUrgencyColor(dateString, lead = null) {
    if (!dateString) return '#999'; // Gray for no contact
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Determine contact direction if lead data is provided
    let contactDirection = 'unknown';
    if (lead) {
        contactDirection = getContactDirection(lead);
    }
    
    // Different urgency thresholds based on contact direction
    if (contactDirection === 'inbound') {
        // They contacted us - we need to respond quickly
        if (diffDays <= 5) return '#28a745'; // Green - very recent
        if (diffDays <= 10) return '#ffc107'; // Yellow - need to respond soon
        if (diffDays <= 21) return '#fd7e14'; // Orange - high urgency
        if (diffDays <= 30) return '#dc3545'; // Red - critical - we haven't responded
        return '#8b0000'; // Dark red - very critical
    } else if (contactDirection === 'outbound') {
        // We contacted them - longer grace period
        if (diffDays <= 14) return '#28a745'; // Green - recent
        if (diffDays <= 30) return '#ffc107'; // Yellow - moderate urgency
        if (diffDays <= 60) return '#fd7e14'; // Orange - high urgency
        if (diffDays <= 90) return '#dc3545'; // Red - critical
        return '#8b0000'; // Dark red - very critical
    } else {
        // Unknown direction - use original logic
        if (diffDays <= 7) return '#28a745'; // Green - recent contact
        if (diffDays <= 30) return '#ffc107'; // Yellow - moderate urgency
        if (diffDays <= 90) return '#fd7e14'; // Orange - high urgency
        return '#dc3545'; // Red - critical urgency
    }
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

// Individual Lead Weight Management Functions
function setIndividualLeadWeight(leadId, weight) {
    individualLeadWeights[leadId] = parseFloat(weight);
    saveIndividualLeadWeights();
    updateVisualization();
    updateSummaryStats();
}

function getIndividualLeadWeight(leadId) {
    return individualLeadWeights[leadId] || 1;
}

function resetIndividualLeadWeight(leadId) {
    delete individualLeadWeights[leadId];
    saveIndividualLeadWeights();
    updateVisualization();
    updateSummaryStats();
}

function saveIndividualLeadWeights() {
    localStorage.setItem('individualLeadWeights', JSON.stringify(individualLeadWeights));
}

function loadIndividualLeadWeights() {
    const saved = localStorage.getItem('individualLeadWeights');
    if (saved) {
        individualLeadWeights = JSON.parse(saved);
    }
}

function calculateLeadWeightedValue(lead) {
    const stageWeight = stageWeights[lead.stage] || 1;
    const individualWeight = getIndividualLeadWeight(lead.id);
    return lead.value * stageWeight * individualWeight;
}

// Lead Weight Modal Functions
let currentLeadWeightData = null;

function showLeadWeightModal(leadId, leadName, currentWeight) {
    const modal = document.getElementById('leadWeightModal');
    const lead = currentData.leads.find(l => l.id == leadId);
    
    if (!lead) return;
    
    currentLeadWeightData = { leadId, leadName, currentWeight };
    
    // Set modal content
    document.getElementById('leadWeightModalName').textContent = leadName;
    document.getElementById('leadWeightSlider').value = currentWeight;
    document.getElementById('leadWeightValue').textContent = currentWeight + 'x';
    
    // Update preview
    updateLeadWeightPreview(lead, currentWeight);
    
    // Add event listeners
    const slider = document.getElementById('leadWeightSlider');
    slider.oninput = function() {
        const weight = parseFloat(this.value);
        document.getElementById('leadWeightValue').textContent = weight + 'x';
        updateLeadWeightPreview(lead, weight);
    };
    
    // Button event listeners
    document.getElementById('saveLeadWeight').onclick = () => saveLeadWeight();
    document.getElementById('resetLeadWeight').onclick = () => resetLeadWeight();
    document.getElementById('cancelLeadWeight').onclick = () => closeLeadWeightModal();
    
    modal.classList.remove('hidden');
}

function updateLeadWeightPreview(lead, individualWeight) {
    const baseValue = lead.value;
    const stageWeight = stageWeights[lead.stage] || 1;
    const totalValue = baseValue * stageWeight * individualWeight;
    
    document.getElementById('leadWeightBaseValue').textContent = formatCurrency(baseValue);
    document.getElementById('leadWeightStageWeight').textContent = stageWeight + 'x';
    document.getElementById('leadWeightIndividualWeight').textContent = individualWeight + 'x';
    document.getElementById('leadWeightTotalValue').textContent = formatCurrency(totalValue);
}

function saveLeadWeight() {
    if (!currentLeadWeightData) return;
    
    const weight = parseFloat(document.getElementById('leadWeightSlider').value);
    const reason = document.getElementById('leadWeightReason').value;
    
    setIndividualLeadWeight(currentLeadWeightData.leadId, weight);
    
    // Save reason if provided
    if (reason.trim()) {
        const reasons = JSON.parse(localStorage.getItem('leadWeightReasons') || '{}');
        reasons[currentLeadWeightData.leadId] = reason;
        localStorage.setItem('leadWeightReasons', JSON.stringify(reasons));
    }
    
    showNotification(`Weight updated for ${currentLeadWeightData.leadName}`, 'success');
    closeLeadWeightModal();
}

function resetLeadWeight() {
    if (!currentLeadWeightData) return;
    
    resetIndividualLeadWeight(currentLeadWeightData.leadId);
    
    // Remove reason
    const reasons = JSON.parse(localStorage.getItem('leadWeightReasons') || '{}');
    delete reasons[currentLeadWeightData.leadId];
    localStorage.setItem('leadWeightReasons', JSON.stringify(reasons));
    
    showNotification(`Weight reset for ${currentLeadWeightData.leadName}`, 'info');
    closeLeadWeightModal();
}

function closeLeadWeightModal() {
    const modal = document.getElementById('leadWeightModal');
    modal.classList.add('hidden');
    currentLeadWeightData = null;
    
    // Clear form
    document.getElementById('leadWeightReason').value = '';
    document.getElementById('leadWeightSlider').value = 1;
    document.getElementById('leadWeightValue').textContent = '1x';
}

// Notification function for weight updates
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    
    // Set background color based on type
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#28a745';
            break;
        case 'error':
            notification.style.backgroundColor = '#dc3545';
            break;
        case 'warning':
            notification.style.backgroundColor = '#ffc107';
            notification.style.color = '#212529';
            break;
        default:
            notification.style.backgroundColor = '#007bff';
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Pipeline Change Tracking Functions
function createPipelineSnapshot() {
    if (!currentData || !changeTrackingEnabled) return null;
    
    const now = new Date();
    const snapshot = {
        timestamp: now.toISOString(),
        date: now.toDateString(),
        time: now.toLocaleTimeString(),
        data: {
            leads: currentData.leads.map(lead => ({
                id: lead.id,
                entity_id: lead.entity_id,
                stage: lead.stage,
                value: lead.value,
                source: lead.source,
                entity: lead.entity ? {
                    name: lead.entity.name,
                    id: lead.entity.id
                } : null
            })),
            stages: [...currentData.stages],
            totalValue: currentData.totalValue,
            totalLeads: currentData.totalLeads
        }
    };
    
    return snapshot;
}

function savePipelineSnapshot() {
    console.log('savePipelineSnapshot called');
    console.log('changeTrackingEnabled:', changeTrackingEnabled);
    console.log('currentData exists:', !!currentData);
    
    const snapshot = createPipelineSnapshot();
    if (!snapshot) {
        console.log('No snapshot created');
        return;
    }
    
    console.log('Snapshot created:', snapshot);
    
    // Add to history
    pipelineHistory.push(snapshot);
    
    // Clean up old history (keep only last 7 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxHistoryDays);
    
    pipelineHistory = pipelineHistory.filter(snapshot => {
        const snapshotDate = new Date(snapshot.timestamp);
        return snapshotDate > cutoffDate;
    });
    
    // Limit history size to prevent storage quota issues
    const maxSnapshots = 50; // Keep only last 50 snapshots
    if (pipelineHistory.length > maxSnapshots) {
        pipelineHistory = pipelineHistory.slice(-maxSnapshots);
    }
    
    // Save to localStorage with error handling
    try {
        const historyJson = JSON.stringify(pipelineHistory);
        
        // Check if data is too large (localStorage limit is typically 5-10MB)
        if (historyJson.length > 4000000) { // 4MB limit
            console.warn('Pipeline history too large, removing oldest snapshots');
            // Remove oldest snapshots until we're under the limit
            while (pipelineHistory.length > 10 && JSON.stringify(pipelineHistory).length > 4000000) {
                pipelineHistory.shift(); // Remove oldest snapshot
            }
        }
        
        // Check if localStorage has space
        if (!clearLocalStorageIfNeeded()) {
            // If we still can't write, reduce history further
            pipelineHistory = pipelineHistory.slice(-5); // Keep only last 5 snapshots
        }
        
        localStorage.setItem('pipelineHistory', JSON.stringify(pipelineHistory));
        lastSnapshotTime = new Date();
        updateChangeHistoryDisplay();
    } catch (error) {
        console.error('Failed to save pipeline history to localStorage:', error);
        
        // If storage is full, clear old data and try again
        if (error.name === 'QuotaExceededError' || error.code === 22) {
            console.log('Storage quota exceeded, clearing old history');
            pipelineHistory = pipelineHistory.slice(-5); // Keep only last 5 snapshots
            try {
                localStorage.setItem('pipelineHistory', JSON.stringify(pipelineHistory));
                lastSnapshotTime = new Date();
                updateChangeHistoryDisplay();
                showNotification('Storage limit reached - keeping only recent history', 'warning');
            } catch (retryError) {
                console.error('Still cannot save to localStorage:', retryError);
                showNotification('Cannot save pipeline history - storage full', 'error');
            }
        }
    }
}

function loadPipelineHistory() {
    const saved = localStorage.getItem('pipelineHistory');
    if (saved) {
        try {
            pipelineHistory = JSON.parse(saved);
            // Clean up old history on load
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxHistoryDays);
            
            pipelineHistory = pipelineHistory.filter(snapshot => {
                const snapshotDate = new Date(snapshot.timestamp);
                return snapshotDate > cutoffDate;
            });
            
            updateChangeHistoryDisplay();
        } catch (error) {
            console.error('Error loading pipeline history:', error);
            pipelineHistory = [];
        }
    }
}

function detectPipelineChanges(newSnapshot, previousSnapshot) {
    if (!previousSnapshot) return [];
    
    const changes = [];
    const newLeads = new Map(newSnapshot.data.leads.map(lead => [lead.id, lead]));
    const oldLeads = new Map(previousSnapshot.data.leads.map(lead => [lead.id, lead]));
    
    // Check for stage changes
    newLeads.forEach((newLead, leadId) => {
        const oldLead = oldLeads.get(leadId);
        if (oldLead && oldLead.stage !== newLead.stage) {
            changes.push({
                type: 'stage_change',
                leadId: leadId,
                leadName: newLead.entity?.name || `Lead ${leadId}`,
                oldStage: oldLead.stage,
                newStage: newLead.stage,
                value: newLead.value,
                timestamp: newSnapshot.timestamp
            });
        }
    });
    
    // Check for new leads
    newLeads.forEach((newLead, leadId) => {
        if (!oldLeads.has(leadId)) {
            changes.push({
                type: 'new_lead',
                leadId: leadId,
                leadName: newLead.entity?.name || `Lead ${leadId}`,
                stage: newLead.stage,
                value: newLead.value,
                timestamp: newSnapshot.timestamp
            });
        }
    });
    
    // Check for removed leads
    oldLeads.forEach((oldLead, leadId) => {
        if (!newLeads.has(leadId)) {
            changes.push({
                type: 'removed_lead',
                leadId: leadId,
                leadName: oldLead.entity?.name || `Lead ${leadId}`,
                stage: oldLead.stage,
                value: oldLead.value,
                timestamp: newSnapshot.timestamp
            });
        }
    });
    
    return changes;
}

function calculateChangeSummary() {
    const recentChanges = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    for (let i = 1; i < pipelineHistory.length; i++) {
        const currentSnapshot = pipelineHistory[i];
        const previousSnapshot = pipelineHistory[i - 1];
        
        const snapshotDate = new Date(currentSnapshot.timestamp);
        if (snapshotDate > cutoffDate) {
            const changes = detectPipelineChanges(currentSnapshot, previousSnapshot);
            recentChanges.push(...changes);
        }
    }
    
    const summary = {
        totalChanges: recentChanges.length,
        stageChanges: recentChanges.filter(c => c.type === 'stage_change').length,
        newLeads: recentChanges.filter(c => c.type === 'new_lead').length,
        removedLeads: recentChanges.filter(c => c.type === 'removed_lead').length,
        totalValueAdded: recentChanges.filter(c => c.type === 'new_lead').reduce((sum, c) => sum + c.value, 0),
        totalValueRemoved: recentChanges.filter(c => c.type === 'removed_lead').reduce((sum, c) => sum + c.value, 0),
        lastUpdate: pipelineHistory.length > 0 ? new Date(pipelineHistory[pipelineHistory.length - 1].timestamp) : null
    };
    
    return summary;
}

function updateChangeHistoryDisplay() {
    const container = document.getElementById('changeHistoryContainer');
    if (!container) return;
    
    if (pipelineHistory.length === 0) {
        container.innerHTML = '<div class="no-changes">No pipeline changes recorded yet.</div>';
        return;
    }
    
    // Calculate summary statistics
    const summary = calculateChangeSummary();
    
    // Get changes from the last 7 days
    const recentChanges = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    for (let i = 1; i < pipelineHistory.length; i++) {
        const currentSnapshot = pipelineHistory[i];
        const previousSnapshot = pipelineHistory[i - 1];
        
        const snapshotDate = new Date(currentSnapshot.timestamp);
        if (snapshotDate > cutoffDate) {
            const changes = detectPipelineChanges(currentSnapshot, previousSnapshot);
            changes.forEach(change => {
                change.snapshotDate = currentSnapshot.date;
                change.snapshotTime = currentSnapshot.time;
            });
            recentChanges.push(...changes);
        }
    }
    
    // Sort changes by timestamp (newest first)
    recentChanges.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Group changes by date
    const changesByDate = {};
    recentChanges.forEach(change => {
        const date = change.snapshotDate;
        if (!changesByDate[date]) {
            changesByDate[date] = [];
        }
        changesByDate[date].push(change);
    });
    
    // Build HTML
    let html = '<div class="change-history-content">';
    
    // Add summary section
    html += '<div class="change-summary">';
    html += '<div class="summary-stats">';
    html += `<div class="summary-stat"><i class="fas fa-exchange-alt"></i> <span>${summary.stageChanges} Stage Changes</span></div>`;
    html += `<div class="summary-stat positive"><i class="fas fa-plus-circle"></i> <span>${summary.newLeads} New Leads</span></div>`;
    html += `<div class="summary-stat negative"><i class="fas fa-minus-circle"></i> <span>${summary.removedLeads} Removed Leads</span></div>`;
    html += `<div class="summary-stat"><i class="fas fa-chart-line"></i> <span>$${summary.totalValueAdded.toLocaleString()} Added</span></div>`;
    html += `<div class="summary-stat"><i class="fas fa-chart-line"></i> <span>$${summary.totalValueRemoved.toLocaleString()} Removed</span></div>`;
    html += '</div>';
    if (summary.lastUpdate) {
        html += `<div class="last-update">Last updated: ${summary.lastUpdate.toLocaleString()}</div>`;
    }
    html += '</div>';
    
    Object.keys(changesByDate).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
        const changes = changesByDate[date];
        html += `<div class="change-date-group">`;
        html += `<h4 class="change-date">${date}</h4>`;
        
        changes.forEach(change => {
            const changeClass = change.type === 'new_lead' ? 'positive' : 
                               change.type === 'removed_lead' ? 'negative' : 'neutral';
            
            html += `<div class="change-item ${changeClass}">`;
            html += `<div class="change-icon">`;
            
            if (change.type === 'stage_change') {
                html += `<i class="fas fa-exchange-alt"></i>`;
            } else if (change.type === 'new_lead') {
                html += `<i class="fas fa-plus-circle"></i>`;
            } else if (change.type === 'removed_lead') {
                html += `<i class="fas fa-minus-circle"></i>`;
            }
            
            html += `</div>`;
            html += `<div class="change-details">`;
            html += `<div class="change-description">`;
            
            if (change.type === 'stage_change') {
                html += `<strong>${change.leadName}</strong> moved from <span class="stage-badge">${change.oldStage}</span> to <span class="stage-badge">${change.newStage}</span>`;
            } else if (change.type === 'new_lead') {
                html += `<strong>${change.leadName}</strong> added to <span class="stage-badge">${change.stage}</span>`;
            } else if (change.type === 'removed_lead') {
                html += `<strong>${change.leadName}</strong> removed from <span class="stage-badge">${change.stage}</span>`;
            }
            
            html += `</div>`;
            html += `<div class="change-meta">`;
            html += `<span class="change-time">${change.snapshotTime}</span>`;
            if (change.value > 0) {
                html += `<span class="change-value">$${change.value.toLocaleString()}</span>`;
            }
            html += `</div>`;
            html += `</div>`;
            html += `</div>`;
        });
        
        html += `</div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function toggleChangeTracking() {
    changeTrackingEnabled = !changeTrackingEnabled;
    const toggleBtn = document.getElementById('toggleChangeTracking');
    if (toggleBtn) {
        toggleBtn.textContent = changeTrackingEnabled ? 'Disable Tracking' : 'Enable Tracking';
        toggleBtn.className = changeTrackingEnabled ? 'btn btn-warning' : 'btn btn-success';
    }
    
    if (changeTrackingEnabled) {
        showNotification('Pipeline change tracking enabled', 'success');
    } else {
        showNotification('Pipeline change tracking disabled', 'warning');
    }

    // Persist preference
    try { localStorage.setItem('ui:changeTrackingEnabled', JSON.stringify(changeTrackingEnabled)); } catch (_) {}
}

function clearChangeHistory() {
    if (confirm('Are you sure you want to clear all pipeline change history? This cannot be undone.')) {
        pipelineHistory = [];
        localStorage.removeItem('pipelineHistory');
        updateChangeHistoryDisplay();
        showNotification('Pipeline change history cleared', 'success');
    }
}

function clearStorage() {
    if (confirm('This will clear all localStorage data. This may help resolve storage issues. Continue?')) {
        // Clear all localStorage
        localStorage.clear();

        // Reset variables
        pipelineHistory = [];
        stageWeights = {};
        excludedStages = new Set();
        stageOrder = [];
        individualLeadWeights = {};

        updateChangeHistoryDisplay();
        showNotification('localStorage cleared successfully', 'success');
    }
}

// Historical Search Functions
function showHistoricalSearchModal() {
    const modal = document.getElementById('historicalSearchModal');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const stageFieldSelect = document.getElementById('stageFieldSelect');
    
    // Populate stage field dropdown
    if (currentData && currentData.fields) {
        stageFieldSelect.innerHTML = '<option value="">Auto-detect stage field</option>';
        
        currentData.fields.forEach(field => {
            const option = document.createElement('option');
            option.value = field.id;
            option.textContent = `${field.name} (${field.value_type})`;
            stageFieldSelect.appendChild(option);
        });
        
        // Auto-select stage field if found
        const stageField = currentData.fields.find(field => 
            field.name.toLowerCase().includes('stage') || 
            field.name.toLowerCase().includes('status') ||
            field.name.toLowerCase().includes('pipeline')
        );
        
        if (stageField) {
            stageFieldSelect.value = stageField.id;
        }
    }
    
    // Set default date range to last 30 days, then override with saved values if present
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    startDate.value = thirtyDaysAgo.toISOString().split('T')[0];
    endDate.value = today.toISOString().split('T')[0];

    // Restore saved historical search settings
    try {
        const saved = JSON.parse(localStorage.getItem('ui:historicalSearch') || '{}');
        if (saved.startDate) startDate.value = saved.startDate;
        if (saved.endDate) endDate.value = saved.endDate;
        if (typeof saved.includeNewLeads === 'boolean') {
            const c = document.getElementById('includeNewLeads');
            if (c) c.checked = saved.includeNewLeads;
        }
        if (typeof saved.includeStageChanges === 'boolean') {
            const c = document.getElementById('includeStageChanges');
            if (c) c.checked = saved.includeStageChanges;
        }
        if (typeof saved.includeRemovedLeads === 'boolean') {
            const c = document.getElementById('includeRemovedLeads');
            if (c) c.checked = saved.includeRemovedLeads;
        }
        if (saved.stageFieldId) stageFieldSelect.value = saved.stageFieldId;
    } catch (_) { /* ignore */ }
    
    modal.classList.remove('hidden');
}

function closeHistoricalSearchModal() {
    const modal = document.getElementById('historicalSearchModal');
    modal.classList.add('hidden');
}

function searchHistoricalChanges() {
    console.log('searchHistoricalChanges called');
    
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const includeNewLeads = document.getElementById('includeNewLeads').checked;
    const includeStageChanges = document.getElementById('includeStageChanges').checked;
    const includeRemovedLeads = document.getElementById('includeRemovedLeads').checked;
    
    console.log('Search parameters:', { startDate, endDate, includeNewLeads, includeStageChanges, includeRemovedLeads });
    
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
        showNotification('Start date must be before end date', 'error');
        return;
    }

    start.setHours(0, 0, 0, 0); // Normalize to start of day
    end.setHours(23, 59, 59, 999); // Include the entire end date

    console.log('Date range:', { start: start.toISOString(), end: end.toISOString() });
    
    // Get the stage field ID from current data or user selection
    if (!currentData || !currentData.fields) {
        showNotification('No pipeline data loaded. Please load pipeline data first.', 'error');
        return;
    }
    
    const stageFieldSelect = document.getElementById('stageFieldSelect');
    let fieldId = stageFieldSelect.value;

    // Persist historical search settings
    try {
        localStorage.setItem('ui:historicalSearch', JSON.stringify({
            startDate,
            endDate,
            includeNewLeads,
            includeStageChanges,
            includeRemovedLeads,
            stageFieldId: fieldId || ''
        }));
    } catch (_) { /* ignore */ }
    
    if (!fieldId) {
        // Auto-detect stage field
        const stageField = currentData.fields.find(field => 
            field.name.toLowerCase().includes('stage') || 
            field.name.toLowerCase().includes('status') ||
            field.name.toLowerCase().includes('pipeline')
        );
        
        if (!stageField) {
            showNotification('Could not find stage field. Please select a field manually.', 'error');
            return;
        }
        
        fieldId = stageField.id;
        console.log('Auto-detected stage field:', stageField);
    } else {
        const selectedField = currentData.fields.find(f => f.id == fieldId);
        console.log('Manually selected field:', selectedField);
    }
    
    // Log all fields to help identify the correct stage field
    console.log('Available fields:', currentData.fields.map(f => ({ id: f.id, name: f.name, type: f.value_type })));
    console.log('Using field ID:', fieldId);
    
    // Get field value changes using the Affinity API
    getFieldValueChanges(fieldId, start, end, {
        includeNewLeads,
        includeStageChanges,
        includeRemovedLeads
    });
}

function analyzeHistoricalChanges(startDate, endDate, options) {
    console.log('analyzeHistoricalChanges called with:', { startDate, endDate, options });
    
    const changes = [];
    
    if (!pipelineHistory || pipelineHistory.length < 2) {
        console.log('No pipeline history available or insufficient snapshots');
        return changes;
    }
    
    console.log('Pipeline history available, length:', pipelineHistory.length);
    
    // Sort history by timestamp
    const sortedHistory = [...pipelineHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    console.log('Sorted history timestamps:', sortedHistory.map(s => s.timestamp));
    
    // Find snapshots within the date range
    const relevantSnapshots = sortedHistory.filter(snapshot => {
        const snapshotDate = new Date(snapshot.timestamp);
        const isInRange = snapshotDate >= startDate && snapshotDate <= endDate;
        console.log(`Snapshot ${snapshot.timestamp}: ${snapshotDate.toISOString()} in range: ${isInRange}`);
        console.log(`  Start date: ${startDate.toISOString()}, End date: ${endDate.toISOString()}`);
        console.log(`  Snapshot date: ${snapshotDate.toISOString()}`);
        console.log(`  Comparison: ${snapshotDate} >= ${startDate} && ${snapshotDate} <= ${endDate}`);
        return isInRange;
    });
    
    console.log('Relevant snapshots found:', relevantSnapshots.length);
    
    if (relevantSnapshots.length < 2) {
        console.log('Insufficient snapshots in date range for comparison');
        return changes;
    }
    
    // Compare consecutive snapshots to find changes
    for (let i = 0; i < relevantSnapshots.length - 1; i++) {
        const currentSnapshot = relevantSnapshots[i];
        const nextSnapshot = relevantSnapshots[i + 1];
        
        const currentLeads = new Map(currentSnapshot.leads.map(lead => [lead.id, lead]));
        const nextLeads = new Map(nextSnapshot.leads.map(lead => [lead.id, lead]));
        
        // Find new leads
        if (options.includeNewLeads) {
            nextSnapshot.leads.forEach(lead => {
                if (!currentLeads.has(lead.id)) {
                    changes.push({
                        type: 'new_lead',
                        leadId: lead.id,
                        leadName: lead.entity?.name || `Lead ${lead.id}`,
                        stage: lead.stage,
                        value: lead.value,
                        timestamp: nextSnapshot.timestamp,
                        changeDate: new Date(nextSnapshot.timestamp)
                    });
                }
            });
        }
        
        // Find removed leads
        if (options.includeRemovedLeads) {
            currentSnapshot.leads.forEach(lead => {
                if (!nextLeads.has(lead.id)) {
                    changes.push({
                        type: 'removed_lead',
                        leadId: lead.id,
                        leadName: lead.entity?.name || `Lead ${lead.id}`,
                        stage: lead.stage,
                        value: lead.value,
                        timestamp: nextSnapshot.timestamp,
                        changeDate: new Date(nextSnapshot.timestamp)
                    });
                }
            });
        }
        
        // Find stage changes
        if (options.includeStageChanges) {
            currentSnapshot.leads.forEach(currentLead => {
                const nextLead = nextLeads.get(currentLead.id);
                if (nextLead && currentLead.stage !== nextLead.stage) {
                    changes.push({
                        type: 'stage_change',
                        leadId: currentLead.id,
                        leadName: currentLead.entity?.name || `Lead ${currentLead.id}`,
                        oldStage: currentLead.stage,
                        newStage: nextLead.stage,
                        value: nextLead.value,
                        timestamp: nextSnapshot.timestamp,
                        changeDate: new Date(nextSnapshot.timestamp)
                    });
                }
            });
        }
    }
    
    // Sort changes by timestamp (newest first)
    return changes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function getFieldValueChanges(fieldId, startDate, endDate, options) {
    const normalizedFieldId = String(fieldId).replace(/^field-/, '');
    console.log('getFieldValueChanges called with:', {
        fieldId: normalizedFieldId,
        startDate,
        endDate,
        options
    });

    if (!currentData || !currentData.leads) {
        showNotification('No pipeline data loaded. Please load pipeline data first.', 'error');
        return;
    }

    try {
        const changesByLead = {};

        // Fetch field value changes for each lead in parallel
        await Promise.all(currentData.leads.map(async lead => {
            try {
                const resp = await fetch(`/api/field-value-changes?field_id=${normalizedFieldId}&list_entry_id=${lead.id}`);
                if (!resp.ok) {
                    throw new Error(`HTTP error! status: ${resp.status}`);
                }
                const leadChanges = await resp.json();
                if (!Array.isArray(leadChanges)) return;
                changesByLead[lead.id] = leadChanges.map(change => ({ change, lead }));
            } catch (err) {
                console.error('Error fetching changes for lead', lead.id, err);
            }
        }));

        const processedChanges = processFieldValueChanges(changesByLead, startDate, endDate, options);
        console.log('Processed changes:', processedChanges);

        // Cache raw and processed changes for reconstructing pipeline snapshots
        lastFieldValueChanges = { changesByLead, startDate, endDate };
        lastProcessedChanges = processedChanges;

        displayHistoricalResults(processedChanges, startDate, endDate);
    } catch (error) {
        console.error('Error fetching field value changes:', error);
        showNotification('Failed to fetch field value changes: ' + error.message, 'error');
    }
}

function processFieldValueChanges(changesByLead, startDate, endDate, options) {
    const changes = [];

    Object.values(changesByLead).forEach(leadChanges => {
        // Sort by change time to track stage transitions
        leadChanges.sort((a, b) => new Date(a.change.changed_at) - new Date(b.change.changed_at));
        let previousStage = null;
        const leadEvents = [];

        leadChanges.forEach(({ change, lead }) => {
            const changeDate = new Date(change.changed_at);

            // Update stage context even if we're outside the range
            if (changeDate < startDate) {
                if (change.action_type === 0 || change.action_type === 2) {
                    previousStage = change.value?.text || previousStage;
                } else if (change.action_type === 1) {
                    previousStage = null;
                }
                return;
            }

            if (changeDate > endDate) {
                return;
            }

            const leadName = getLeadDisplayName(lead);
            const value = lead.value || 0;

            if (change.action_type === 0 && options.includeNewLeads) {
                const stage = change.value?.text || 'Unknown Stage';
                leadEvents.push({
                    type: 'new_lead',
                    leadId: lead.id,
                    leadName,
                    stage,
                    value,
                    timestamp: change.changed_at,
                    changeDate,
                    actionType: 'create',
                    changer: change.changer
                });
                previousStage = stage;
            } else if (change.action_type === 1 && options.includeRemovedLeads) {
                leadEvents.push({
                    type: 'removed_lead',
                    leadId: lead.id,
                    leadName,
                    stage: previousStage || 'Unknown Stage',
                    value,
                    timestamp: change.changed_at,
                    changeDate,
                    actionType: 'delete',
                    changer: change.changer
                });
                previousStage = null;
            } else if (change.action_type === 2 && options.includeStageChanges) {
                const newStage = change.value?.text || 'Unknown Stage';
                leadEvents.push({
                    type: 'stage_change',
                    leadId: lead.id,
                    leadName,
                    oldStage: previousStage || 'Unknown Stage',
                    newStage,
                    value,
                    timestamp: change.changed_at,
                    changeDate,
                    actionType: 'update',
                    changer: change.changer
                });
                previousStage = newStage;
            } else {
                // Keep track of stage even if we don't include the change
                if (change.action_type === 0 || change.action_type === 2) {
                    previousStage = change.value?.text || previousStage;
                } else if (change.action_type === 1) {
                    previousStage = null;
                }
            }
        });

        // Apply final stage to all recorded events for this lead
        leadEvents.forEach(evt => {
            evt.finalStage = previousStage;
        });
        changes.push(...leadEvents);
    });

    // Sort by timestamp (newest first)
    return changes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getLeadDisplayName(lead) {
    return lead?.entity?.name ||
           lead?.entity?.properties?.name ||
           [lead?.entity?.first_name, lead?.entity?.last_name].filter(Boolean).join(' ') ||
           `Lead ${lead?.entity_id || lead?.id}`;
}

async function showAvailableSnapshots() {
    const resultsContainer = document.getElementById('historicalResults');
    
    // Get the stage field ID from current data
    if (!currentData || !currentData.fields) {
        resultsContainer.innerHTML = `
            <div class="no-historical-results">
                <p>No pipeline data loaded.</p>
                <p>Please load pipeline data first to view field value changes.</p>
            </div>
        `;
        return;
    }
    
    // Find the stage field
    const stageField = currentData.fields.find(field => 
        field.name.toLowerCase().includes('stage') || 
        field.name.toLowerCase().includes('status') ||
        field.name.toLowerCase().includes('pipeline')
    );
    
    if (!stageField) {
        resultsContainer.innerHTML = `
            <div class="no-historical-results">
                <p>Could not find stage field.</p>
                <p>Please ensure pipeline data is loaded.</p>
            </div>
        `;
        return;
    }
    
    try {
        // Get all field value changes for the stage field
        const fieldId = String(stageField.id).replace(/^field-/, '');
        const response = await fetch(`/api/field-value-changes?field_id=${fieldId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const fieldValueChanges = await response.json();
        console.log('All field value changes:', fieldValueChanges);
        
        if (!fieldValueChanges || fieldValueChanges.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-historical-results">
                    <p>No field value changes found for stage field "${stageField.name}".</p>
                    <p>This could mean no changes have been made or the field doesn't support change tracking.</p>
                </div>
            `;
            return;
        }
        
        // Group changes by date
        const changesByDate = {};
        fieldValueChanges.forEach(change => {
            const changeDate = new Date(change.changed_at);
            const dateKey = changeDate.toLocaleDateString();
            if (!changesByDate[dateKey]) {
                changesByDate[dateKey] = [];
            }
            changesByDate[dateKey].push(change);
        });
        
        let html = `
            <div class="historical-summary">
                <h4>Field Value Changes for "${stageField.name}" (${fieldValueChanges.length} total)</h4>
            </div>
        `;
        
        Object.entries(changesByDate).sort((a, b) => new Date(b[0]) - new Date(a[0])).forEach(([date, changes]) => {
            html += `<div class="historical-date-group">`;
            html += `<h5>${date}</h5>`;
            
            changes.forEach(change => {
                const changeDate = new Date(change.changed_at);
                const actionType = change.action_type === 0 ? 'Create' : change.action_type === 1 ? 'Delete' : 'Update';
                const actionColor = change.action_type === 0 ? 'new-lead' : change.action_type === 1 ? 'removed-lead' : 'stage-change';
                
                html += `
                    <div class="historical-change-item ${actionColor}">
                        <div class="historical-change-header">
                            <i class="fas fa-${change.action_type === 0 ? 'plus-circle' : change.action_type === 1 ? 'minus-circle' : 'exchange-alt'}"></i> ${actionType}
                        </div>
                        <div class="historical-change-details">
                            <strong>Entity ID:</strong> ${change.entity_id}<br>
                            <strong>Stage:</strong> ${change.value?.text || 'Unknown'}<br>
                            <strong>Changed by:</strong> ${change.changer?.first_name} ${change.changer?.last_name}<br>
                            <strong>Action Type:</strong> ${change.action_type}
                        </div>
                        <div class="historical-change-date">${changeDate.toLocaleString()}</div>
                    </div>
                `;
            });
            
            html += `</div>`;
        });
        
        resultsContainer.innerHTML = html;
        
    } catch (error) {
        console.error('Error fetching field value changes:', error);
        resultsContainer.innerHTML = `
            <div class="no-historical-results">
                <p>Error fetching field value changes: ${error.message}</p>
            </div>
        `;
    }
}

function displayHistoricalResults(changes, startDate, endDate) {
    const resultsContainer = document.getElementById('historicalResults');
    
    if (changes.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-historical-results">
                <p>No changes found for the selected date range (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()})</p>
                <p>Try selecting a different date range or check if pipeline tracking is enabled.</p>
                <p><button onclick="showAvailableSnapshots()" class="btn btn-outline btn-sm">Show Available Data</button></p>
            </div>
        `;
        return;
    }
    
    // Group changes by date
    const changesByDate = {};
    changes.forEach(change => {
        const dateKey = change.changeDate.toLocaleDateString();
        if (!changesByDate[dateKey]) {
            changesByDate[dateKey] = [];
        }
        changesByDate[dateKey].push(change);
    });
    
    let resultsHTML = `
        <div class="historical-summary">
            <h4>Found ${changes.length} changes from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}</h4>
        </div>
    `;
    
    Object.entries(changesByDate).forEach(([date, dateChanges]) => {
        resultsHTML += `<div class="historical-date-group">`;
        resultsHTML += `<h5>${date}</h5>`;
        
        dateChanges.forEach(change => {
            const changeClass = change.type === 'new_lead' ? 'new-lead' : 
                              change.type === 'stage_change' ? 'stage-change' : 
                              change.type === 'removed_lead' ? 'removed-lead' : '';
            
            let changeHTML = `<div class="historical-change-item ${changeClass}">`;
            changeHTML += `<div class="historical-change-header">`;
            
            switch (change.type) {
                case 'new_lead':
                    changeHTML += `<i class="fas fa-plus-circle"></i> New Lead Added`;
                    break;
                case 'stage_change':
                    changeHTML += `<i class="fas fa-exchange-alt"></i> Stage Change`;
                    break;
                case 'removed_lead':
                    changeHTML += `<i class="fas fa-minus-circle"></i> Lead Removed`;
                    break;
            }
            
            changeHTML += `</div>`;
            changeHTML += `<div class="historical-change-details">`;
            
            switch (change.type) {
                case 'new_lead':
                    changeHTML += `<strong>${change.leadName}</strong> added to <strong>${change.stage}</strong> stage`;
                    changeHTML += `<br>Value: $${formatCurrency(change.value)}`;
                    break;
                case 'stage_change':
                    changeHTML += `<strong>${change.leadName}</strong> moved from <strong>${change.oldStage}</strong> to <strong>${change.newStage}</strong>`;
                    changeHTML += `<br>Value: $${formatCurrency(change.value)}`;
                    break;
                case 'removed_lead':
                    changeHTML += `<strong>${change.leadName}</strong> removed from <strong>${change.stage}</strong> stage`;
                    changeHTML += `<br>Value: $${formatCurrency(change.value)}`;
                    break;
            }
            
            changeHTML += `</div>`;
            changeHTML += `<div class="historical-change-date">${change.changeDate.toLocaleString()}</div>`;
            changeHTML += `</div>`;
            
            resultsHTML += changeHTML;
        });
        
        resultsHTML += `</div>`;
    });
    
    resultsContainer.innerHTML = resultsHTML;
    
    // Add apply changes button if we have results
    if (changes.length > 0) {
        resultsContainer.innerHTML += `
            <div class="historical-actions">
                <button onclick="applyHistoricalChanges('${startDate.toISOString()}', '${endDate.toISOString()}')" class="btn btn-primary">
                    <i class="fas fa-eye"></i> View This Period on Pipeline
                </button>
            </div>
        `;
    }
}

// Build a pipeline snapshot for a specific date using cached field value changes
function buildPipelineSnapshotFromChanges(changesByLead, targetDate) {
    if (!currentData) return null;

    const snapshot = JSON.parse(JSON.stringify(currentData));
    const stageSet = new Set();
    const target = new Date(targetDate);

    snapshot.leads = currentData.leads.map(lead => {
        const history = (changesByLead[lead.id] || []).map(c => c.change)
            .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));

        let stage = null;
        let exists = true;

        if (history.length === 0) {
            stage = lead.stage;
        } else {
            exists = false;
            for (const change of history) {
                const changeDate = new Date(change.changed_at);
                if (changeDate > target) break;

                if (change.action_type === 0 || change.action_type === 2) {
                    exists = true;
                    stage = change.value?.text || stage;
                } else if (change.action_type === 1) {
                    exists = false;
                    stage = null;
                }
            }
        }

        if (!exists || !stage) return null;
        const leadCopy = { ...lead, stage };
        stageSet.add(stage);
        return leadCopy;
    }).filter(Boolean);

    snapshot.stages = Array.from(stageSet);
    snapshot.totalLeads = snapshot.leads.length;
    snapshot.totalValue = snapshot.leads.reduce((sum, l) => sum + (l.value || 0), 0);
    snapshot.timestamp = target.toISOString();
    return snapshot;
}

function applyHistoricalChanges(startDate, endDate) {
    console.log('applyHistoricalChanges called with:', { startDate, endDate });

    if (!lastFieldValueChanges) {
        showNotification('No historical change data available', 'error');
        return;
    }

    const end = new Date(endDate);

    const snapshot = buildPipelineSnapshotFromChanges(lastFieldValueChanges.changesByLead, end);
    if (!snapshot) {
        showNotification('Unable to build snapshot for the selected period', 'error');
        return;
    }

    // Store current data for reverting
    if (!historicalMode) {
        historicalSnapshot = { ...currentData };
    }

    currentData = snapshot;
    historicalMode = true;

    // Update the UI
    updateVisualization();
    updateSummaryStats();

    // Add revert button to the pipeline changes section
    const revertBtn = document.getElementById('revertToCurrent');
    if (!revertBtn) {
        const changeControls = document.querySelector('.change-controls');
        if (changeControls) {
            const revertButton = document.createElement('button');
            revertButton.id = 'revertToCurrent';
            revertButton.className = 'btn btn-warning';
            revertButton.innerHTML = '<i class="fas fa-undo"></i> Revert to Current';
            revertButton.onclick = revertToCurrentData;
            changeControls.appendChild(revertButton);
        }
    }

    showNotification(`Showing pipeline as of ${end.toLocaleDateString()}`, 'success');
    closeHistoricalSearchModal();

    // Update the change history display to show historical mode
    updateChangeHistoryDisplay();
}

function revertToCurrentData() {
    console.log('revertToCurrentData called');
    
    if (historicalSnapshot) {
        currentData = { ...historicalSnapshot };
        historicalMode = false;
        historicalSnapshot = null;
        lastProcessedChanges = null;
        
        // Update the UI
        updateVisualization();
        updateSummaryStats();
        
        // Remove revert button
        const revertBtn = document.getElementById('revertToCurrent');
        if (revertBtn) {
            revertBtn.remove();
        }
        
        showNotification('Reverted to current pipeline data', 'success');
        
        // Update the change history display
        updateChangeHistoryDisplay();
    }
}

function refreshDataForTracking() {
    console.log('refreshDataForTracking called');
    console.log('Current data exists:', !!currentData);
    
    // Save current snapshot before refreshing (if we have data)
    if (currentData) {
        console.log('Saving current snapshot...');
        savePipelineSnapshot();
    }
    
    console.log('Loading pipeline data...');
    // Refresh the data
    loadPipelineData().then((data) => {
        console.log('Pipeline data refreshed successfully:', data);
        
        // Update the visualization to show new changes
        updateVisualization();
        
        showNotification('Pipeline data refreshed and changes tracked', 'success');
    }).catch(error => {
        console.error('Error refreshing data:', error);
        showNotification('Failed to refresh pipeline data: ' + error.message, 'error');
    });
}

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const toggleBtn = document.getElementById('toggleAutoRefresh');
    
    if (toggleBtn) {
        if (autoRefreshEnabled) {
            toggleBtn.textContent = 'Stop Auto Refresh';
            toggleBtn.className = 'btn btn-warning';
            toggleBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Auto Refresh';
            startAutoRefresh();
            showNotification(`Auto-refresh enabled (every ${autoRefreshMinutes} minutes)`, 'success');
        } else {
            toggleBtn.textContent = 'Auto Refresh';
            toggleBtn.className = 'btn btn-outline';
            toggleBtn.innerHTML = '<i class="fas fa-clock"></i> Auto Refresh';
            stopAutoRefresh();
            showNotification('Auto-refresh disabled', 'warning');
        }
    }

    // Persist preference
    try { localStorage.setItem('ui:autoRefreshEnabled', JSON.stringify(autoRefreshEnabled)); } catch (_) {}
}

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(() => {
        if (currentData && changeTrackingEnabled) {
            console.log('Auto-refreshing pipeline data...');
            refreshDataForTracking();
        }
    }, autoRefreshMinutes * 60 * 1000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function clearLocalStorageIfNeeded() {
    try {
        // Test if we can write to localStorage
        const testKey = 'storage_test_' + Date.now();
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        return true;
    } catch (error) {
        console.warn('localStorage is full, clearing old data');
        
        // Clear old data to make space
        const keysToKeep = ['stageWeights', 'excludedStages', 'stageOrder', 'individualLeadWeights', 'defaultSettings'];
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !keysToKeep.includes(key)) {
                keysToRemove.push(key);
            }
        }
        
        // Remove old keys
        keysToRemove.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.warn('Could not remove key:', key, e);
            }
        });
        
        return false;
    }
}

// Change analysis functions for funnel visualization
function getStageChangeStats(stageName) {
    // When viewing a historical period, derive stats from processed changes
    if (historicalMode && Array.isArray(lastProcessedChanges)) {
        const newLeadIds = new Set();
        const removedLeadIds = new Set();
        const passedThroughIds = new Set();
        let valueAdded = 0;
        let valueRemoved = 0;

        lastProcessedChanges.forEach(change => {
            const finalStage = currentData.leads.find(lead =>
                (lead.id == change.leadId || lead.entity_id == change.leadId)
            )?.stage;

            if (change.type === 'removed_lead' && change.stage === stageName) {
                removedLeadIds.add(change.leadId);
                valueRemoved += change.value || 0;
            } else if (finalStage === stageName) {
                if (change.type === 'new_lead' && change.stage === stageName) {
                    newLeadIds.add(change.leadId);
                    valueAdded += change.value || 0;
                } else if (change.type === 'stage_change' && change.newStage === stageName) {
                    newLeadIds.add(change.leadId);
                    valueAdded += change.value || 0;
                }
            } else {
                if (change.type === 'stage_change' && change.oldStage === stageName) {
                    passedThroughIds.add(change.leadId);
                } else if (change.type === 'new_lead' && change.stage === stageName) {
                    passedThroughIds.add(change.leadId);
                }
            }
        });

        return {
            newLeads: newLeadIds.size,
            removedLeads: removedLeadIds.size,
            stageChanges: passedThroughIds.size,
            valueAdded,
            valueRemoved,
            hasChanges: newLeadIds.size > 0 || removedLeadIds.size > 0
        };
    }

    if (pipelineHistory.length < 2) {
        return {
            newLeads: 0,
            removedLeads: 0,
            stageChanges: 0,
            valueAdded: 0,
            valueRemoved: 0,
            hasChanges: false
        };
    }

    const recentChanges = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    // Get changes from the last 7 days
    for (let i = 1; i < pipelineHistory.length; i++) {
        const currentSnapshot = pipelineHistory[i];
        const previousSnapshot = pipelineHistory[i - 1];

        const snapshotDate = new Date(currentSnapshot.timestamp);
        if (snapshotDate > cutoffDate) {
            const changes = detectPipelineChanges(currentSnapshot, previousSnapshot);
            recentChanges.push(...changes);
        }
    }

    const newLeadIds = new Set();
    const removedLeadIds = new Set();
    const passedThroughIds = new Set();
    let valueAdded = 0;
    let valueRemoved = 0;

    recentChanges.forEach(change => {
        const finalStage = currentData.leads.find(lead => lead.id == change.leadId)?.stage;

        if (change.type === 'removed_lead' && change.stage === stageName) {
            removedLeadIds.add(change.leadId);
            valueRemoved += change.value;
        } else if (finalStage === stageName) {
            if (change.type === 'new_lead' && change.stage === stageName) {
                newLeadIds.add(change.leadId);
                valueAdded += change.value;
            } else if (change.type === 'stage_change' && change.newStage === stageName) {
                newLeadIds.add(change.leadId);
                valueAdded += change.value;
            }
        } else {
            if (change.type === 'stage_change' && change.oldStage === stageName) {
                passedThroughIds.add(change.leadId);
            } else if (change.type === 'new_lead' && change.stage === stageName) {
                passedThroughIds.add(change.leadId);
            }
        }
    });

    return {
        newLeads: newLeadIds.size,
        removedLeads: removedLeadIds.size,
        stageChanges: passedThroughIds.size,
        valueAdded,
        valueRemoved,
        hasChanges: newLeadIds.size > 0 || removedLeadIds.size > 0
    };
}

function getLeadChangeInfo(leadId) {
    if (historicalMode && Array.isArray(lastProcessedChanges)) {
        const leadChanges = lastProcessedChanges.filter(change => change.leadId == leadId);
        if (leadChanges.length === 0) {
            return {
                isNew: false,
                isMoved: false,
                oldStage: null,
                changeDate: null,
                changeType: null
            };
        }
        const latestChange = leadChanges[0];
        return {
            isNew: latestChange.type === 'new_lead',
            isMoved: latestChange.type === 'stage_change',
            oldStage: latestChange.type === 'stage_change' ? latestChange.oldStage : null,
            changeDate: latestChange.changeDate || new Date(latestChange.timestamp),
            changeType: latestChange.type
        };
    }

    if (pipelineHistory.length < 2) {
        return {
            isNew: false,
            isMoved: false,
            oldStage: null,
            changeDate: null,
            changeType: null
        };
    }

    const recentChanges = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    // Get changes from the last 7 days
    for (let i = 1; i < pipelineHistory.length; i++) {
        const currentSnapshot = pipelineHistory[i];
        const previousSnapshot = pipelineHistory[i - 1];

        const snapshotDate = new Date(currentSnapshot.timestamp);
        if (snapshotDate > cutoffDate) {
            const changes = detectPipelineChanges(currentSnapshot, previousSnapshot);
            recentChanges.push(...changes);
        }
    }

    // Find changes for this specific lead
    const leadChanges = recentChanges.filter(change => change.leadId == leadId);

    if (leadChanges.length === 0) {
        return {
            isNew: false,
            isMoved: false,
            oldStage: null,
            changeDate: null,
            changeType: null
        };
    }

    const latestChange = leadChanges[0]; // Most recent change

    return {
        isNew: latestChange.type === 'new_lead',
        isMoved: latestChange.type === 'stage_change',
        oldStage: latestChange.type === 'stage_change' ? latestChange.oldStage : null,
        changeDate: new Date(latestChange.timestamp),
        changeType: latestChange.type
    };
}

function formatChangeDate(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return 'yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function getStageMovements() {
    // When viewing a historical period, compute movements from processed changes
    if (historicalMode && Array.isArray(lastProcessedChanges)) {
        const stageChanges = lastProcessedChanges.filter(c => c.type === 'stage_change');
        const movementGroups = {};
        const laneOffsets = {};

        stageChanges.forEach(change => {
            const laneKey = change.finalStage || 'removed';
            const key = `${change.oldStage}->${change.newStage}->${laneKey}`;
            if (!movementGroups[key]) {
                movementGroups[key] = {
                    fromStage: change.oldStage,
                    toStage: change.newStage,
                    finalStage: change.finalStage,
                    count: 0,
                    totalValue: 0,
                    movements: []
                };
            }
            movementGroups[key].count++;
            movementGroups[key].totalValue += change.value || 0;
            movementGroups[key].movements.push({
                fromStage: change.oldStage,
                toStage: change.newStage,
                leadId: change.leadId,
                leadName: change.leadName,
                value: change.value,
                timestamp: change.timestamp,
                changeDate: change.changeDate,
                finalStage: change.finalStage
            });
        });

        const groups = Object.values(movementGroups);
        groups.forEach(group => {
            const laneKey = group.finalStage || 'removed';
            if (laneOffsets[laneKey] === undefined) {
                laneOffsets[laneKey] = Object.keys(laneOffsets).length;
            }
            group.offset = laneOffsets[laneKey] * 40;
        });

        return groups;
    }

    if (pipelineHistory.length < 2) {
        return [];
    }

    const movements = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    // Get changes from the last 7 days
    for (let i = 1; i < pipelineHistory.length; i++) {
        const currentSnapshot = pipelineHistory[i];
        const previousSnapshot = pipelineHistory[i - 1];

        const snapshotDate = new Date(currentSnapshot.timestamp);
        if (snapshotDate > cutoffDate) {
            const changes = detectPipelineChanges(currentSnapshot, previousSnapshot);

            // Filter for stage changes only
            const stageChanges = changes.filter(change => change.type === 'stage_change');

            stageChanges.forEach(change => {
                movements.push({
                    fromStage: change.oldStage,
                    toStage: change.newStage,
                    leadId: change.leadId,
                    leadName: change.leadName,
                    value: change.value,
                    timestamp: change.timestamp
                });
            });
        }
    }

    // Group all movements by from/to stage pairs
    const movementGroups = {};
    movements.forEach(movement => {
        const key = `${movement.fromStage}->${movement.toStage}`;
        if (!movementGroups[key]) {
            movementGroups[key] = {
                fromStage: movement.fromStage,
                toStage: movement.toStage,
                count: 0,
                totalValue: 0,
                movements: []
            };
        }
        movementGroups[key].count++;
        movementGroups[key].totalValue += movement.value || 0;
        movementGroups[key].movements.push(movement);
    });

    return Object.values(movementGroups);
}

// Arrow tooltip and lead details functionality
let currentArrowTooltip = null;

function showArrowTooltip(movement, element) {
    // Remove existing tooltip
    hideArrowTooltip();
    
    // Create tooltip content
    const leadNames = movement.movements.map(m => m.leadName || `Lead ${m.leadId}`).slice(0, 5);
    const remainingCount = movement.movements.length - 5;
    
    let tooltipContent = `<strong>${movement.count} leads moved</strong><br>`;
    tooltipContent += `<strong>From:</strong> ${movement.fromStage}<br>`;
    tooltipContent += `<strong>To:</strong> ${movement.toStage}<br>`;
    tooltipContent += `<strong>Total Value:</strong> $${formatCurrency(movement.totalValue)}<br><br>`;
    
    if (leadNames.length > 0) {
        tooltipContent += `<strong>Leads:</strong><br>`;
        leadNames.forEach(name => {
            tooltipContent += `• ${name}<br>`;
        });
        if (remainingCount > 0) {
            tooltipContent += `• ... and ${remainingCount} more<br>`;
        }
    }
    
    tooltipContent += `<br><em>Click for full details</em>`;
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'arrow-tooltip';
    tooltip.innerHTML = tooltipContent;
    tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.95);
        color: white;
        padding: 12px;
        border-radius: 8px;
        font-size: 12px;
        max-width: 300px;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.2);
    `;
    
    document.body.appendChild(tooltip);
    currentArrowTooltip = tooltip;
    
    // Position tooltip near the arrow
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + rect.width + 10;
    let top = rect.top + rect.height / 2 - tooltipRect.height / 2;
    
    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > window.innerWidth) {
        left = rect.left - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight) {
        top = window.innerHeight - tooltipRect.height - 10;
    }
    if (top < 10) {
        top = 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function hideArrowTooltip() {
    if (currentArrowTooltip) {
        currentArrowTooltip.remove();
        currentArrowTooltip = null;
    }
}

function showArrowLeadDetails(movement) {
    const modal = document.getElementById('leadModal');
    const content = document.getElementById('modalContent');
    
    if (!modal || !content) return;
    
    const isClosedWon = defaultSettings.closedWonStage === movement.toStage;
    const isLost = defaultSettings.lostStages.includes(movement.toStage);
    
    let title = `Lead Movement: ${movement.fromStage} → ${movement.toStage}`;
    if (isClosedWon) {
        title = `Leads Won: ${movement.fromStage} → ${movement.toStage}`;
    } else if (isLost) {
        title = `Leads Lost: ${movement.fromStage} → ${movement.toStage}`;
    }
    
    let leadDetails = '';
    movement.movements.forEach((move, index) => {
        const leadName = move.leadName || `Lead ${move.leadId}`;
        const value = move.value ? `$${formatCurrency(move.value)}` : 'No value';
        const date = move.changeDate ? formatChangeDate(move.changeDate) : 
                    move.timestamp ? new Date(move.timestamp).toLocaleDateString() : 'Unknown date';
        
        leadDetails += `
            <div class="lead-movement-item">
                <div class="lead-movement-header">
                    <strong>${leadName}</strong>
                    <span class="lead-movement-value">${value}</span>
                </div>
                <div class="lead-movement-details">
                    <span class="lead-movement-date">Moved on ${date}</span>
                    <span class="lead-movement-direction">${move.fromStage} → ${move.toStage}</span>
                </div>
            </div>
        `;
    });
    
    content.innerHTML = `
        <h3>${title}</h3>
        <div class="movement-summary">
            <p><strong>Total Leads:</strong> ${movement.count}</p>
            <p><strong>Total Value:</strong> $${formatCurrency(movement.totalValue)}</p>
            <p><strong>Average Value:</strong> $${formatCurrency(movement.totalValue / movement.count)}</p>
        </div>
        <div class="lead-movements-list">
            <h4>Lead Details:</h4>
            ${leadDetails}
        </div>
    `;
    
    modal.classList.remove('hidden');
}
 
