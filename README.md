# Affinity Pipeline Visualization

An advanced interactive pipeline visualization tool for Affinity CRM that provides comprehensive lead tracking, contact intelligence, and sales pipeline analytics. This tool helps you visualize your leads, track their progress through different stages, analyze contact patterns, and optimize your sales process with intelligent stage weighting and lead aging insights.

## 🚀 Features

### Core Visualization
- **Interactive Pipeline Visualization**: Visualize your leads as they progress through different stages with funnel and bar chart views
- **Dynamic Stage Weighting**: Adjust the importance of each stage in real-time with intuitive sliders
- **Stage Management**: Reorder stages, exclude stages from calculations, and customize your pipeline view
- **Color-coded Leads**: Leads are color-coded based on their value, source, and contact urgency
- **Dual View Modes**: Switch between pipeline visualization and detailed lead cards

### Contact Intelligence
- **Contact Direction Tracking**: See who contacted whom (e.g., "Sean Brown emailed Harry Jones")
- **Contact Type Identification**: Display the type of last contact (email, meeting, event, etc.)
- **Lead Age Calculation**: Track how long leads have been in your pipeline since first contact
- **Contact Urgency**: Color-coded indicators for contact urgency based on days since last interaction
- **Average Contact Metrics**: View average days since last contact and average lead age by stage

### Advanced Analytics
- **Weighted Value Calculations**: Real-time weighted value based on stage importance
- **Average Lead Age**: Track average lead age across all stages and per individual stage
- **Contact Pattern Analysis**: Understand your team's contact patterns and response needs
- **Stage Performance Metrics**: Detailed statistics for each pipeline stage
- **$100M Goal Tracker**: Track progress toward revenue goals with visual indicators

### Data Management
- **Default Value Rules**: Set intelligent default values based on field conditions
- **Closed/Won Management**: Special handling for closed deals with committed amounts
- **Field Mapping**: Flexible field selection for stages, values, sources, and lead age
- **Real-time Updates**: Refresh data and see changes immediately
- **Data Export**: View detailed lead information in organized formats

### User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Modal Details**: Click on leads or stages to see comprehensive information
- **Tooltips**: Hover for quick information previews
- **Debug Mode**: Advanced logging for troubleshooting and development
- **API Key Management**: Secure storage and management of your Affinity API key

## 📋 Prerequisites

- Node.js (version 14 or higher)
- An Affinity CRM account with API access
- Your Affinity API key
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd affinity-pipeline-visualization
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit the `.env` file and add your Affinity API key:
   ```
   AFFINITY_API_KEY=your_actual_api_key_here
   PORT=4000
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:4000`

## 🔑 Getting Your Affinity API Key

1. Log into your Affinity account
2. Go to Settings (gear icon in the left sidebar)
3. Navigate to the API section
4. Generate a new API key
5. Copy the key and add it to your `.env` file

For detailed instructions, visit: [How to obtain your API Key](https://support.affinity.co/hc/en-us/articles/360032633992-How-to-obtain-your-API-Key)

## 📖 Usage

### Initial Setup

1. **Enter your API Key**: In the header, enter your Affinity API key and click "Save"
2. **Select a List**: Choose the list containing your leads/opportunities
3. **Configure Fields**: 
   - **Stage Field**: Select the field that represents the pipeline stage (e.g., "Status")
   - **Value Field**: Select the field containing the lead value (e.g., "Amount")
   - **Source Field**: (Optional) Select the field indicating lead source
   - **First Email Field**: Select the field for calculating lead age (e.g., "First Email")
4. **Load Data**: Click "Load Pipeline Data" to fetch and visualize your data

### Using the Visualization

#### Pipeline View
- **Stage Bars**: Each bar represents a pipeline stage with the height showing weighted value
- **Lead Bubbles**: Individual leads are shown as colored circles on top of the bars
- **Color Coding**: 
  - Green: High value leads ($100K+)
  - Yellow: Medium value leads ($10K-$99K)
  - Red: Low value leads (<$10K)
- **Click Interactions**: 
  - Click on a stage bar to see stage details with contact information
  - Click on a lead bubble to see comprehensive lead details

#### Stage Management
- **Adjust Weights**: Use the sliders to adjust the importance of each stage (0-2x multiplier)
- **Reorder Stages**: Click "Reorder Stages" to drag and drop stages into custom order
- **Exclude Stages**: Check the "Exclude" box to remove stages from calculations
- **Real-time Updates**: Changes are reflected immediately in the visualization
- **Reset Weights**: Click "Reset Weights" to return to default values

#### Contact Intelligence
- **Contact Direction**: See who initiated contact (e.g., "Sean Brown emailed Harry Jones")
- **Contact Type**: View the type of interaction (email, meeting, event, etc.)
- **Lead Age**: Track days since first contact for each lead
- **Contact Urgency**: Color-coded indicators for response urgency
- **Average Metrics**: View average contact days and lead age by stage

#### Default Value Management
- **Global Default**: Set a default value for leads without specific values
- **Conditional Rules**: Create rules like "If Industry = 'Healthcare', default value = $500K"
- **Stage-specific Defaults**: Set different defaults based on pipeline stage
- **Closed/Won Handling**: Special configuration for closed deals

### Detailed View
- Click "Toggle View" to switch to a detailed card view of all leads
- Each card shows comprehensive lead information including:
  - Stage and value
  - Contact direction and type
  - Lead age and last contact
  - Source information
- Click any card for detailed modal view

## 📊 Data Structure

The application processes Affinity data into the following enhanced structure:

```javascript
{
  leads: [
    {
      id: number,
      entity_id: number,
      entity: object,
      stage: string,
      value: number,
      source: string,
      contactDirection: string,    // "Sean Brown emailed Harry Jones"
      contactType: string,         // "email", "meeting", "event"
      firstEmail: string,          // ISO date string
      leadAge: number,             // Days since first contact
      lastContact: string,         // ISO date string
      field_values: array
    }
  ],
  stages: array,
  sources: array,
  totalValue: number,
  totalLeads: number,
  fields: array
}
```

## ⚙️ Configuration

### Stage Weights
- **Range**: 0.0 to 2.0 (0 = excluded, 1 = normal, 2 = double importance)
- **Default**: All stages start at 1.0
- **Persistence**: Weights are saved in browser localStorage

### Default Value Rules
- **Global Default**: Applied to all leads without specific values
- **Conditional Rules**: Format: "If [Field] = [Value], then default = [Amount]"
- **Priority**: Rules are applied in order, first match wins

### Contact Intelligence
- **Auto-detection**: Automatically detects email, meeting, and event interactions
- **Direction Logic**: Shows actual sender and recipient names
- **Type Display**: Shows interaction type for all contact types

## 🔧 API Endpoints

The application provides several API endpoints that proxy to the Affinity API:

- `GET /api/lists` - Get all available lists
- `GET /api/lists/:listId/list-entries` - Get list entries with field values
- `GET /api/lists/:listId/fields` - Get fields for a specific list
- `GET /api/field-values` - Get field values for entities
- `GET /api/opportunities` - Get opportunities
- `GET /api/pipeline-data` - Get aggregated pipeline data for visualization
- `GET /api/test-fields/:listId` - Test and categorize fields by type

## 🎨 Customization

### Adding New Field Types
To support additional field types, modify the field processing logic in `public/app.js`.

### Changing Color Schemes
Update the `colorSchemes` object in `public/app.js` to customize colors for different data types.

### Modifying Contact Logic
Edit the contact direction and type extraction logic to handle new interaction types.

### Custom Calculations
Add new metrics by extending the calculation functions in `public/app.js`.

## 🐛 Troubleshooting

### Common Issues

1. **"Failed to load lists"**
   - Check that your API key is correct
   - Ensure your Affinity account has API access enabled
   - Verify the API key has the necessary permissions

2. **"No data displayed"**
   - Make sure you've selected the correct fields
   - Check that your list contains leads with the selected stage field
   - Verify that the value field contains numeric data

3. **"Contact information not showing"**
   - Ensure the "Last Contact" relationship-intelligence field is available
   - Check that leads have recent contact activity
   - Verify field permissions in Affinity

4. **"Lead age not calculating"**
   - Select the correct "First Email" field
   - Ensure the field contains valid date data
   - Check field permissions and data availability

### Debug Mode

To enable debug logging:
1. Click the "Debug Mode" button in the interface, or
2. Add this to your browser console:
   ```javascript
   localStorage.setItem('debug', 'true');
   ```

### Console Logs
The application provides detailed console logging for:
- Field processing and mapping
- Contact direction extraction
- Lead age calculations
- API responses and errors

## 🏗️ Development

### Running in Development Mode
```bash
npm run dev
```

This will start the server with nodemon for automatic restarts during development.

### Project Structure
```
├── server.js              # Express server and API routes
├── public/                # Frontend files
│   ├── index.html         # Main HTML file
│   ├── styles.css         # CSS styles
│   └── app.js            # JavaScript application
├── package.json           # Dependencies and scripts
├── env.example           # Environment variables template
├── DEPLOYMENT.md         # Deployment instructions
├── SETUP.md              # Detailed setup guide
└── README.md             # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues related to:
- **Affinity API**: Contact Affinity support
- **This Application**: Open an issue in the repository

## 📝 Changelog

### Version 2.0.0 (Current)
- **Contact Intelligence**: Added contact direction and type tracking
- **Lead Age Calculation**: Track and display lead age from first contact
- **Stage Management**: Reorder, exclude, and customize stage weights
- **Default Value Rules**: Intelligent default value system
- **Closed/Won Tracking**: Special handling for closed deals
- **Average Metrics**: Average contact days and lead age calculations
- **Enhanced UI**: Improved modal displays and detailed views
- **Debug Mode**: Advanced logging and troubleshooting tools

### Version 1.0.0
- Initial release with basic pipeline visualization
- Dynamic stage weighting
- Real-time data updates
- Responsive design
- Modal details view 