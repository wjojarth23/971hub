# Laser Cutter Management System

This system provides comprehensive sheet layout, nesting, and cutting management for laser cutting operations. It automatically optimizes part placement on sheets using advanced tessellation algorithms and tracks the complete cutting lifecycle.

## Features

### 📋 Sheet Management
- **Universal Sheet Storage**: Database-backed inventory of all laser cutting sheets
- **Stock Integration**: Create sheets from predefined stock types or custom dimensions
- **Real-time Tracking**: Monitor remaining area and utilization for each sheet
- **Location Management**: Track physical storage locations

### 🧩 Intelligent Part Nesting
- **Automatic Layout**: Advanced tessellation algorithm with rotation support
- **Material Optimization**: 50% area buffer calculation with efficiency scoring
- **Collision Detection**: Prevents part overlap with configurable spacing
- **Multi-angle Rotation**: Tests 0°, 90°, 180°, 270° orientations for optimal fit

### ✂️ Cut Management
- **SVG Generation**: Produces laser-ready SVG files with proper coordinate system
- **Zero-point at Top-Right**: Matches common laser cutter conventions
- **Progressive Tracking**: Maintains history of all cuts on each sheet
- **Status Updates**: Automatically marks parts as "cammed" when assigned to sheets

### 🎯 Smart Sheet Selection
- **Area Estimation**: Calculates total part area with configurable buffer
- **Efficiency Sorting**: Prioritizes sheets by remaining area (smallest first)
- **Feasibility Check**: Verifies actual tessellation before recommendation
- **Fallback Handling**: Graceful error handling when no suitable sheet exists

## Workflow

### 1. Overview Dashboard
- View all parts awaiting laser cutting
- Group by material type with quantity summaries
- Real-time area estimation for planning

### 2. Sheet Selection
- Browse available sheets filtered by material
- View utilization percentages and remaining areas
- Automatic optimal sheet recommendation
- Create new sheets from stock types or custom dimensions

### 3. Part Layout
- Select which parts to include in the cut
- Run automatic tessellation algorithm
- Preview layout with efficiency metrics
- Manual part selection/deselection

### 4. Export & Cut
- Generate SVG with proper coordinate system (0,0 at top-right)
- Download cut file for laser operation
- Update part status to "cammed"
- Record cut session in database
- Update sheet remaining area

## Technical Implementation

### Database Schema
```sql
-- Core sheet tracking
sheets: id, stock_type_id, material, thickness, width, height, remaining_area, cut_svg, status

-- Cut session history  
sheet_cuts: id, sheet_id, part_ids[], cut_svg, layout_data, cut_date, area_used

-- Part assignment
parts: sheet_id, layout_x, layout_y, layout_rotation, cut_date
```

### Nesting Algorithm
- **Bottom-Left Fill (BLF)**: Primary placement strategy
- **Rotation Testing**: Evaluates all allowed angles for each part
- **Collision Detection**: Rectangle-based overlap checking with spacing
- **Scoring System**: Position preference + adjacency bonus + waste penalty

### SVG Processing
- **Coordinate Transformation**: Maps layout to laser coordinate system
- **Path Optimization**: Simplified outline generation for complex geometries
- **Metadata Embedding**: Part IDs and names for traceability
- **Scaling Support**: Proper inch-based measurements

## Configuration Options

### Nesting Parameters
```javascript
{
  allowRotation: true,           // Enable part rotation
  rotationAngles: [0, 90, 180, 270], // Allowed rotation angles
  spacing: 0.1,                  // Minimum spacing between parts (inches)
  margin: 0.2,                   // Margin from sheet edges (inches)
  areaBuffer: 0.5                // 50% area estimation buffer
}
```

### Stock Types
Supports all materials from `stock.json`:
- Aluminum sheets (1/16", 1/8", 1/4", 3/8")
- Polycarbonate sheets (1/16", 1/8", 1/4", 3/8") 
- SRPP sheets (1/16", 1/8", 1/4", 3/8")
- Wood/Birch sheets (1/16", 1/8", 1/4", 3/8")
- Delrin sheets (1/16", 1/8", 1/4", 3/8")

## Setup Instructions

### 1. Database Migration
```sql
-- Run the laser cutter schema migration
\i migration_laser_sheets.sql

-- Optional: Load sample data for testing  
\i sample_laser_data.sql
```

### 2. Navigation Setup
The laser cutter is accessible from:
- `/manufacture/laser` - Direct URL
- Manufacture page → "Laser Cutter" button

### 3. Permissions
Requires authenticated user with basic manufacturing permissions.

## API Endpoints

### GET `/api/laser`
- `?action=stock-requests` - Get parts awaiting cuts grouped by material
- `?action=sheets&stockTypeId=...` - Get available sheets for stock type
- `?action=optimize-layout&sheetId=...&partIds=...` - Get layout optimization

### POST `/api/laser`
- `?action=create-sheet` - Create new sheet
- `?action=cut-parts` - Process cutting session

## Error Handling

### Common Scenarios
- **No Suitable Sheets**: "Please add stock or manually lay out"
- **Parts Don't Fit**: Shows count of failed parts with suggestions
- **Area Insufficient**: Recommends larger sheets or fewer parts
- **Tessellation Failures**: Graceful fallback with error details

### Recovery Options
- Manual sheet creation with custom dimensions
- Part quantity reduction
- Alternative material selection
- Multi-sheet cutting sessions

## Performance Considerations

### Optimization Features
- Database views for efficient sheet utilization queries
- Indexed searches on material, status, and remaining area
- Lazy loading of layout calculations
- Client-side SVG preview rendering

### Scalability
- Supports unlimited sheets and parts
- Efficient nesting algorithm (O(n²) typical case)
- Batch part processing for large cuts
- Historical data retention with archiving support

## Future Enhancements

### Planned Features
- [ ] CAM integration for automatic G-code generation
- [ ] Material waste analytics and reporting
- [ ] Advanced nesting with No-Fit Polygon (NFP) algorithm
- [ ] Multi-sheet layout optimization
- [ ] Cost estimation with material pricing
- [ ] Inventory alerts for low stock levels
- [ ] QR code integration for sheet tracking

### Integration Opportunities
- OnShape API for real-time part geometry
- Laser cutter direct control via REST API
- Material supplier inventory synchronization
- Production scheduling and job queuing

This system provides a complete solution for efficient laser cutting operations while maintaining full traceability and optimization throughout the manufacturing process.
