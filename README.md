# Affinity Pipeline Visualization

A comprehensive pipeline visualization tool for Affinity CRM that provides real-time insights into your sales pipeline with advanced analytics and change tracking.

## Features

### Core Pipeline Visualization
- Interactive funnel and pipeline visualizations
- Real-time data from Affinity CRM
- Customizable stage weights and exclusions
- Lead-level detail views
- Source and value analysis

### Pipeline Change Tracking (NEW!)
- **Automatic Change Detection**: Tracks when leads move between stages, are added, or removed
- **Historical Timeline**: Shows all pipeline changes from the past 7 days
- **Change Summary**: Provides overview statistics of pipeline activity
- **Auto-Refresh**: Option to automatically refresh data every 5 minutes
- **Manual Tracking**: Manual refresh and tracking controls
- **Persistent Storage**: Changes are saved locally and persist between sessions

### Advanced Analytics
- Lead age calculations
- Contact frequency analysis
- Individual lead weight adjustments
- Default value rules for different lead types
- Goal tracking with visual progress indicators

## Pipeline Change Tracking

The new change tracking feature allows you to monitor how your pipeline evolves over time:

### How It Works
1. **Automatic Snapshots**: Every time you load or refresh pipeline data, a snapshot is automatically saved
2. **Change Detection**: The system compares consecutive snapshots to detect:
   - Stage changes (leads moving between stages)
   - New leads added to the pipeline
   - Leads removed from the pipeline
3. **Visual Timeline**: Changes are displayed in a chronological timeline grouped by date
4. **Summary Statistics**: Quick overview of total changes, new leads, removed leads, and value changes

### Using Change Tracking
1. **Enable/Disable**: Use the "Disable Tracking" button to turn tracking on/off
2. **Manual Refresh**: Click "Refresh & Track" to manually update data and capture changes
3. **Auto-Refresh**: Enable "Auto Refresh" to automatically update data every 5 minutes
4. **Clear History**: Use "Clear History" to remove all stored change data
5. **View Changes**: Scroll through the change history to see detailed information about each change

### Change Types
- **Stage Changes**: When a lead moves from one stage to another
- **New Leads**: When leads are added to the pipeline
- **Removed Leads**: When leads are removed from the pipeline

Each change entry shows:
- Lead name and ID
- Previous and new stages (for stage changes)
- Lead value
- Timestamp of the change
- Visual indicators (icons and colors)

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `env.example` to `.env` and add your Affinity API key
4. Start the server: `npm start`
5. Open your browser to `http://localhost:3000`

## Configuration

### API Key
- Enter your Affinity API key in the header
- Click "Save" to store it locally

### Pipeline Configuration
1. Select your target list from the dropdown
2. Choose the stage field (e.g., "Status")
3. Select the value field (e.g., "Deal Size")
4. Optionally choose source and first email fields
5. Click "Load Pipeline Data"

### Stage Management
- Adjust stage weights using the sliders
- Exclude stages from visualization
- Reorder stages for custom flow
- Set individual lead weights

## Usage

### Basic Pipeline View
1. Load your pipeline data
2. View the funnel visualization
3. Click on stages to see detailed lead information
4. Use the toggle to switch between funnel and pipeline views

### Change Tracking
1. Load pipeline data to start tracking
2. Use "Refresh & Track" to capture changes
3. Enable auto-refresh for continuous monitoring
4. Review the change history to understand pipeline evolution

### Advanced Features
- Set default values for different lead types
- Adjust individual lead weights
- Track progress toward revenue goals
- Analyze lead age and contact patterns

## API Endpoints

- `GET /api/lists` - Get available lists
- `GET /api/fields/:listId` - Get list fields
- `GET /api/pipeline-data?listId=:id` - Get pipeline data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details. 