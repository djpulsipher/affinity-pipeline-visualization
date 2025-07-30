// Global variables
let currentData = null;
let stageWeights = {};
let fieldMappings = {};
let currentView = 'pipeline'; // 'pipeline' or 'detailed'

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

    // Event listeners
    document.getElementById('saveApiKey').addEventListener('click', saveApiKey);
    document.getElementById('loadData').addEventListener('click', loadPipelineData);
    document.getElementById('resetWeights').addEventListener('click', resetWeights);
    document.getElementById('toggleView').addEventListener('click', toggleView);
    document.getElementById('refreshData').addEventListener('click', refreshData);
    document.getElementById('listSelect').addEventListener('change', onListChange);
    
    // Modal close
    document.querySelector('.close').addEventListener('click', closeModal);
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('leadModal');
        if (event.target === modal) {
            closeModal();
        }
    });

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
        const lists = await response.json();
        
        const listSelect = document.getElementById('listSelect');
        listSelect.innerHTML = '<option value="">Select a list...</option>';
        
        lists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = `${list.name} (${list.list_size} entries)`;
            listSelect.appendChild(option);
        });
        
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
        const fields = await response.json();
        
        // Populate field dropdowns
        populateFieldDropdown('stageField', fields, 'Status');
        populateFieldDropdown('valueField', fields, 'Amount');
        populateFieldDropdown('sourceField', fields, 'Source');
        
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
        }
        
        select.appendChild(option);
    });
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
        
        // Load pipeline data
        const response = await fetch(`/api/pipeline-data?listId=${listId}`);
        const data = await response.json();
        
        currentData = processPipelineData(data);
        initializeStageWeights();
        updateVisualization();
        updateSummaryStats();
        
        hideLoading();
        showNotification('Pipeline data loaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error loading pipeline data:', error);
        showNotification('Failed to load pipeline data', 'error');
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
        totalLeads: 0
    };
    
    data.pipeline_data.forEach(lead => {
        const leadData = {
            id: lead.id,
            entity_id: lead.entity_id,
            entity: lead.entity,
            stage: null,
            value: 0,
            source: null,
            field_values: lead.field_values
        };
        
        // Extract field values
        lead.field_values.forEach(fieldValue => {
            if (fieldValue.field_id == fieldMappings.stage) {
                leadData.stage = fieldValue.value?.text || fieldValue.value;
            } else if (fieldValue.field_id == fieldMappings.value) {
                leadData.value = parseFloat(fieldValue.value) || 0;
            } else if (fieldValue.field_id == fieldMappings.source) {
                leadData.source = fieldValue.value?.text || fieldValue.value;
            }
        });
        
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

// Initialize stage weights
function initializeStageWeights() {
    if (!currentData) return;
    
    const weightsContainer = document.getElementById('stageWeights');
    weightsContainer.innerHTML = '';
    
    currentData.stages.forEach((stage, index) => {
        const weight = 1 - (index * 0.1); // Default weights decreasing by stage
        stageWeights[stage] = Math.max(0.1, weight);
        
        const weightItem = document.createElement('div');
        weightItem.className = 'weight-item';
        weightItem.innerHTML = `
            <label>${stage}:</label>
            <input type="range" min="0" max="2" step="0.1" value="${weight}" 
                   onchange="updateStageWeight('${stage}', this.value)">
            <span class="weight-value">${weight}</span>
        `;
        weightsContainer.appendChild(weightItem);
    });
}

// Update stage weight
function updateStageWeight(stage, weight) {
    stageWeights[stage] = parseFloat(weight);
    document.querySelector(`input[onchange*="${stage}"]`).nextElementSibling.textContent = weight;
    updateVisualization();
    updateSummaryStats();
}

// Reset weights
function resetWeights() {
    initializeStageWeights();
    updateVisualization();
    updateSummaryStats();
}

// Update visualization
function updateVisualization() {
    if (!currentData) return;
    
    if (currentView === 'pipeline') {
        createPipelineVisualization();
    } else {
        createDetailedView();
    }
}

// Create pipeline visualization
function createPipelineVisualization() {
    const container = document.getElementById('pipelineViz');
    container.innerHTML = '';
    
    const width = container.clientWidth;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Group leads by stage
    const stageData = currentData.stages.map(stage => {
        const stageLeads = currentData.leads.filter(lead => lead.stage === stage);
        const totalValue = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
        const weightedValue = totalValue * (stageWeights[stage] || 1);
        
        return {
            stage,
            leads: stageLeads,
            totalValue,
            weightedValue,
            count: stageLeads.length
        };
    });
    
    // Scales
    const xScale = d3.scaleBand()
        .domain(currentData.stages)
        .range([margin.left, width - margin.right])
        .padding(0.1);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(stageData, d => d.weightedValue)])
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
        .attr('height', d => height - margin.bottom - yScale(d.weightedValue))
        .style('fill', (d, i) => colorSchemes.stages(i))
        .on('click', function(event, d) {
            showStageDetails(d);
        });
    
    // Stage labels
    stageGroups.append('text')
        .attr('class', 'stage-label')
        .attr('x', xScale.bandwidth() / 2)
        .attr('y', height - margin.bottom + 20)
        .text(d => d.stage)
        .style('fill', '#333')
        .style('font-size', '12px')
        .style('text-anchor', 'middle');
    
    // Value labels
    stageGroups.append('text')
        .attr('class', 'stage-value')
        .attr('x', xScale.bandwidth() / 2)
        .attr('y', d => yScale(d.weightedValue) - 10)
        .text(d => `$${formatCurrency(d.weightedValue)}`)
        .style('fill', '#333')
        .style('font-size', '11px')
        .style('text-anchor', 'middle');
    
    // Y-axis
    const yAxis = d3.axisLeft(yScale)
        .tickFormat(d => `$${formatCurrency(d)}`);
    
    svg.append('g')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(yAxis);
    
    // Add lead bubbles on top
    stageData.forEach(stageData => {
        stageData.leads.forEach((lead, index) => {
            const bubbleSize = Math.max(5, Math.min(15, lead.value / 10000));
            const x = xScale(stageData.stage) + xScale.bandwidth() / 2 + (index - stageData.leads.length / 2) * 8;
            const y = yScale(stageData.weightedValue) - 20 - (index * 10);
            
            svg.append('circle')
                .attr('class', `lead-bubble ${getValueClass(lead.value)}`)
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', bubbleSize)
                .on('click', function(event) {
                    event.stopPropagation();
                    showLeadDetails(lead);
                })
                .on('mouseover', function(event) {
                    showTooltip(event, lead);
                })
                .on('mouseout', hideTooltip);
        });
    });
    
    // Create legend
    createLegend();
}

// Create detailed view
function createDetailedView() {
    const container = document.getElementById('detailedView');
    container.classList.remove('hidden');
    
    const leadDetails = document.getElementById('leadDetails');
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
                    <span class="label">Weighted Value:</span>
                    <span class="value">$${formatCurrency(lead.value * (stageWeights[lead.stage] || 1))}</span>
                </span>
            </div>
        `;
        
        leadDetails.appendChild(leadCard);
    });
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
        return sum + (lead.value * (stageWeights[lead.stage] || 1));
    }, 0);
    
    document.getElementById('totalValue').textContent = `$${formatCurrency(totalValue)}`;
    document.getElementById('totalLeads').textContent = totalLeads;
    document.getElementById('weightedValue').textContent = `$${formatCurrency(weightedValue)}`;
}

// Create legend
function createLegend() {
    const legendContainer = document.getElementById('legendItems');
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

// Show stage details
function showStageDetails(stageData) {
    const modal = document.getElementById('leadModal');
    const content = document.getElementById('modalContent');
    
    content.innerHTML = `
        <h3>${stageData.stage} Stage</h3>
        <div class="stage-stats">
            <p><strong>Total Value:</strong> $${formatCurrency(stageData.totalValue)}</p>
            <p><strong>Weighted Value:</strong> $${formatCurrency(stageData.weightedValue)}</p>
            <p><strong>Number of Leads:</strong> ${stageData.count}</p>
            <p><strong>Stage Weight:</strong> ${stageWeights[stageData.stage] || 1}x</p>
        </div>
        <h4>Leads in this stage:</h4>
        <div class="leads-list">
            ${stageData.leads.map(lead => `
                <div class="lead-item">
                    <strong>${lead.entity?.name || `Lead ${lead.id}`}</strong>
                    <span>$${formatCurrency(lead.value)}</span>
                    ${lead.source ? `<span>Source: ${lead.source}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `;
    
    modal.classList.remove('hidden');
}

// Show lead details
function showLeadDetails(lead) {
    const modal = document.getElementById('leadModal');
    const content = document.getElementById('modalContent');
    
    content.innerHTML = `
        <h3>${lead.entity?.name || `Lead ${lead.id}`}</h3>
        <div class="lead-detail-stats">
            <p><strong>Stage:</strong> ${lead.stage}</p>
            <p><strong>Value:</strong> $${formatCurrency(lead.value)}</p>
            <p><strong>Weighted Value:</strong> $${formatCurrency(lead.value * (stageWeights[lead.stage] || 1))}</p>
            ${lead.source ? `<p><strong>Source:</strong> ${lead.source}</p>` : ''}
            <p><strong>Lead ID:</strong> ${lead.id}</p>
            <p><strong>Entity ID:</strong> ${lead.entity_id}</p>
        </div>
        <h4>Field Values:</h4>
        <div class="field-values">
            ${lead.field_values.map(field => `
                <div class="field-item">
                    <strong>Field ID ${field.field_id}:</strong> ${field.value || 'N/A'}
                </div>
            `).join('')}
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
    document.getElementById('leadModal').classList.add('hidden');
}

// Refresh data
function refreshData() {
    if (currentData) {
        loadPipelineData();
    }
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
    loading.querySelector('p').textContent = message;
    loading.style.display = 'flex';
}

function hideLoading() {
    const loading = document.querySelector('.loading');
    loading.style.display = 'none';
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