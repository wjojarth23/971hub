# Manufacturing Management System

A Svelte-based web application for managing manufacturing workflows including laser cutting, routing, lathe work, milling, and 3D printing operations.

## Features

- **Part Request Creation**: Users can create manufacturing requests with specific file requirements
- **Workflow Management**: Support for 5 manufacturing processes:
  - Laser Cut (SVG files)
  - Router (STEP files)  
  - Lathe (PDF files)
  - Mill (PDF files)
  - 3D Print (STL files)
- **Parts List Management**: View, filter, and manage all part requests
- **Status Tracking**: Track parts through pending → in-progress → complete states
- **Delivery Management**: Mark parts as delivered or assign to kitting bins
- **File Upload**: Drag-and-drop file upload with validation

## Tech Stack

- **Frontend**: SvelteKit
- **Backend**: Supabase (Database + File Storage)
- **Styling**: Custom CSS with CSS Variables
- **Icons**: Lucide Svelte

## Supabase Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization
4. Fill in project details:
   - **Name**: Manufacturing Management
   - **Database Password**: Choose a strong password
   - **Region**: Choose closest to your location
5. Click "Create new project"

### 2. Database Schema Setup

Once your project is created, go to the SQL Editor and run this SQL to create the required tables:

```sql
-- Create the parts table
CREATE TABLE parts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  requester TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workflow TEXT NOT NULL CHECK (workflow IN ('laser-cut', 'router', 'lathe', 'mill', '3d-print')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  material TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'complete')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  kitting_bin TEXT,
  delivered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create an index for better query performance
CREATE INDEX idx_parts_status ON parts(status);
CREATE INDEX idx_parts_workflow ON parts(workflow);
CREATE INDEX idx_parts_project_id ON parts(project_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update updated_at
CREATE TRIGGER update_parts_updated_at BEFORE UPDATE ON parts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS (adjust based on your authentication needs)
-- For now, we'll allow all operations (you should restrict this in production)
CREATE POLICY "Allow all operations on parts" ON parts
FOR ALL USING (true) WITH CHECK (true);
```

### 3. Storage Setup

1. In your Supabase dashboard, go to **Storage**
2. Click "New Bucket"
3. Create a bucket named `manufacturing-files`
4. Set it as **Public** (for easier file access)
5. Click "Create Bucket"

### 4. Configure Storage Policies

Since you can't run SQL directly, create these policies through the Supabase Dashboard:

Go to **Storage > Policies** and create these policies for the `storage.objects` table:

**Policy 1: Allow uploads**
- Name: `Allow uploads`
- Allowed operation: `INSERT`
- Target roles: `public` (or `authenticated` if you prefer)
- USING expression: Leave empty
- WITH CHECK expression: `bucket_id = 'manufacturing-files'`

**Policy 2: Allow downloads**
- Name: `Allow downloads`  
- Allowed operation: `SELECT`
- Target roles: `public` (or `authenticated` if you prefer)
- USING expression: `bucket_id = 'manufacturing-files'`
- WITH CHECK expression: Leave empty

**Policy 3: Allow deletes** (optional, for admin functions)
- Name: `Allow deletes`
- Allowed operation: `DELETE`
- Target roles: `public` (or `authenticated` if you prefer)  
- USING expression: `bucket_id = 'manufacturing-files'`
- WITH CHECK expression: Leave empty

### 5. Get Your Credentials

1. Go to **Settings** → **API**
2. Copy your **Project URL**
3. Copy your **anon public** key
4. In your project, create a `.env` file:

```bash
PUBLIC_SUPABASE_URL=your_project_url_here
PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 6. Optional: Add Sample Data

You can add some sample data to test the application:

```sql
INSERT INTO parts (name, requester, project_id, workflow, status, file_name, file_url) VALUES
('Motor Mount Bracket', 'John Doe', 'PROJ-001', 'laser-cut', 'pending', 'motor_mount.svg', 'https://example.com/motor_mount.svg'),
('Gear Housing', 'Jane Smith', 'PROJ-002', 'mill', 'in-progress', 'gear_housing.pdf', 'https://example.com/gear_housing.pdf'),
('Custom Spacer', 'Bob Johnson', 'PROJ-003', '3d-print', 'complete', 'spacer.stl', 'https://example.com/spacer.stl');
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up your `.env` file with Supabase credentials
4. Run the development server: `npm run dev`

## File Upload Configuration

The application is configured to accept specific file types for each workflow:

- **Laser Cut**: `.svg` files
- **Router**: `.step` files
- **Lathe**: `.pdf` files
- **Mill**: `.pdf` files
- **3D Print**: `.stl` files

Files are uploaded to the Supabase Storage bucket and referenced in the database.

## Color Scheme

The application uses a custom color scheme defined in CSS variables:

- **Primary**: White (#ffffff)
- **Secondary**: Black (#000000ff)
- **Accent**: Gold (#f1c331)

## Security Considerations

- Enable Row Level Security (RLS) on all tables
- Implement proper authentication for production use
- Restrict storage bucket access based on user roles
- Validate file types and sizes on the backend
- Implement proper error handling and logging

## Production Deployment

1. Build the application: `npm run build`
2. Deploy to your preferred hosting platform (Vercel, Netlify, etc.)
3. Set environment variables in your deployment platform
4. Update Supabase CORS settings if needed
5. Review and tighten security policies

### Migration for Existing Databases

If you already have a parts table and need to add the new quantity and material fields, run this migration:

```sql
-- Add quantity and material columns to existing parts table
ALTER TABLE parts 
ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
ADD COLUMN material TEXT NOT NULL DEFAULT '';

-- Update any existing parts to have a default material value
UPDATE parts SET material = 'Not specified' WHERE material = '';
```
