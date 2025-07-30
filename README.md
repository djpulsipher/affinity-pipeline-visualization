# Affinity Pipeline Visualization

An interactive pipeline visualization tool for Affinity CRM that allows you to visualize your leads, track their progress through different stages, and analyze their potential value with adjustable stage weights.

## Features

- **Interactive Pipeline Visualization**: Visualize your leads as they progress through different stages
- **Dynamic Stage Weighting**: Adjust the importance of each stage in real-time
- **Color-coded Leads**: Leads are color-coded based on their value and source
- **Detailed Analytics**: View total value, weighted value, and lead counts
- **Real-time Updates**: Refresh data and see changes immediately
- **Responsive Design**: Works on desktop and mobile devices
- **Modal Details**: Click on leads or stages to see detailed information

## Prerequisites

- Node.js (version 14 or higher)
- An Affinity CRM account with API access
- Your Affinity API key

## Installation

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
   PORT=3000
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Getting Your Affinity API Key

1. Log into your Affinity account
2. Go to Settings (gear icon in the left sidebar)
3. Navigate to the API section
4. Generate a new API key
5. Copy the key and add it to your `.env` file

For detailed instructions, visit: [How to obtain your API Key](https://support.affinity.co/hc/en-us/articles/360032633992-How-to-obtain-your-API-Key)

## Usage

### Initial Setup

1. **Enter your API Key**: In the header, enter your Affinity API key and click "Save"
2. **Select a List**: Choose the list containing your leads/opportunities
3. **Configure Fields**: 
   - **Stage Field**: Select the field that represents the pipeline stage (e.g., "Status")
   - **Value Field**: Select the field containing the lead value (e.g., "Amount")
   - **Source Field**: (Optional) Select the field indicating lead source
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
  - Click on a stage bar to see stage details
  - Click on a lead bubble to see lead details

#### Stage Weights
- **Adjust Weights**: Use the sliders to adjust the importance of each stage
- **Real-time Updates**: Changes are reflected immediately in the visualization
- **Reset Weights**: Click "Reset Weights" to return to default values

#### Summary Statistics
- **Total Value**: Sum of all lead values
- **Total Leads**: Number of leads in the pipeline
- **Weighted Value**: Sum of all lead values multiplied by their stage weights

### Detailed View
- Click "Toggle View" to switch to a detailed card view of all leads
- Each card shows lead information and can be clicked for more details

## API Endpoints

The application provides several API endpoints that proxy to the Affinity API:

- `GET /api/lists` - Get all available lists
- `GET /api/lists/:listId/list-entries` - Get list entries for a specific list
- `GET /api/lists/:listId/fields` - Get fields for a specific list
- `GET /api/field-values` - Get field values for entities
- `GET /api/opportunities` - Get opportunities
- `GET /api/pipeline-data` - Get aggregated pipeline data for visualization

## Data Structure

The application processes Affinity data into the following structure:

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
      field_values: array
    }
  ],
  stages: array,
  sources: array,
  totalValue: number,
  totalLeads: number
}
```

## Customization

### Adding New Field Types
To support additional field types, modify the `processPipelineData` function in `public/app.js`.

### Changing Color Schemes
Update the `colorSchemes` object in `public/app.js` to customize colors for different data types.

### Modifying Stage Weight Logic
Edit the `initializeStageWeights` function to change how default weights are calculated.

## Troubleshooting

### Common Issues

1. **"Failed to load lists"**
   - Check that your API key is correct
   - Ensure your Affinity account has API access enabled
   - Verify the API key has the necessary permissions

2. **"No data displayed"**
   - Make sure you've selected the correct fields
   - Check that your list contains leads with the selected stage field
   - Verify that the value field contains numeric data

3. **"Visualization not updating"**
   - Try refreshing the page
   - Check the browser console for JavaScript errors
   - Ensure all required fields are selected

### Debug Mode

To enable debug logging, add this to your browser console:
```javascript
localStorage.setItem('debug', 'true');
```

## Development

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
└── README.md             # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues related to:
- **Affinity API**: Contact Affinity support
- **This Application**: Open an issue in the repository

## Changelog

### Version 1.0.0
- Initial release
- Interactive pipeline visualization
- Dynamic stage weighting
- Real-time data updates
- Responsive design
- Modal details view 