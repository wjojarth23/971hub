-- Function to handle user profile creation/update on auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name, full_name, email, role, permissions)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', ''),
        new.email,
        COALESCE(new.raw_user_meta_data->>'role', 'member'),
        COALESCE(new.raw_user_meta_data->>'permissions', 'basic')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = new.email,
        role = COALESCE(new.raw_user_meta_data->>'role', user_profiles.role),
        permissions = COALESCE(new.raw_user_meta_data->>'permissions', user_profiles.permissions),
        updated_at = NOW();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create/update user profile
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User profiles table (stores displayable user info since auth.users is not directly accessible)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    display_name VARCHAR(255),
    full_name VARCHAR(255),
    email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'member',
    permissions VARCHAR(50) DEFAULT 'basic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subsystems table
CREATE TABLE IF NOT EXISTS subsystems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lead_user_id UUID REFERENCES auth.users(id),
    onshape_url TEXT,
    onshape_document_id VARCHAR(255),
    onshape_workspace_id VARCHAR(255),
    onshape_element_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subsystem members table (for joining subsystems)
CREATE TABLE IF NOT EXISTS subsystem_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subsystem_id, user_id)
);

-- File uploads table (for when OnShape is not available)
CREATE TABLE IF NOT EXISTS subsystem_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by UUID REFERENCES auth.users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Builds table
CREATE TABLE IF NOT EXISTS builds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    release_id VARCHAR(255) NOT NULL, -- OnShape release ID
    release_name VARCHAR(255) NOT NULL,
    build_hash VARCHAR(64) UNIQUE NOT NULL, -- Unique hash for this build
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'ready_to_assemble', 'assembled')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assembled_at TIMESTAMP WITH TIME ZONE,
    assembled_by UUID REFERENCES auth.users(id)
);

-- Build BOM (Bill of Materials) table
CREATE TABLE IF NOT EXISTS build_bom (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    build_id UUID REFERENCES builds(id) ON DELETE CASCADE,
    part_name VARCHAR(255) NOT NULL,
    part_number VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    part_type VARCHAR(50) NOT NULL CHECK (part_type IN ('COTS', 'manufactured')),
    material VARCHAR(100),
    stock_assignment VARCHAR(100), -- e.g., "Aluminum-6061", "Steel-A36", "Aluminum-Other"
    workflow VARCHAR(100), -- e.g., "CNC Milling", "3D Printing", "Laser Cutting"
    bounding_box_x DECIMAL(10,3),
    bounding_box_y DECIMAL(10,3),
    bounding_box_z DECIMAL(10,3),
    onshape_part_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'delivered', 'manufactured')),
    added_to_parts_list BOOLEAN DEFAULT FALSE,
    added_to_purchasing BOOLEAN DEFAULT FALSE
);

-- Stock types for material assignment
CREATE TABLE IF NOT EXISTS stock_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    material VARCHAR(100) NOT NULL,
    stock_type VARCHAR(100) NOT NULL,
    workflow VARCHAR(100),
    max_dimension_x DECIMAL(10,3),
    max_dimension_y DECIMAL(10,3),
    max_dimension_z DECIMAL(10,3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock materials table
CREATE TABLE IF NOT EXISTS stock_materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    material_type VARCHAR(100) NOT NULL, -- aluminum, steel, plastic, etc.
    form_factor VARCHAR(100) NOT NULL, -- sheet, bar, tube, etc.
    dimensions JSONB NOT NULL, -- {"width": 12, "height": 24, "thickness": 0.125}
    material_grade VARCHAR(100), -- 6061-T6, 304SS, etc.
    supplier VARCHAR(255),
    cost_per_unit DECIMAL(10,2),
    unit_type VARCHAR(50), -- sqft, linear_ft, piece, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Manufacturing workflows table
CREATE TABLE IF NOT EXISTS manufacturing_workflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    machine_type VARCHAR(100) NOT NULL, -- cnc_mill, laser_cutter, 3d_printer, etc.
    material_compatibility TEXT[], -- array of compatible materials
    max_dimensions JSONB, -- {"x": 12, "y": 24, "z": 6}
    setup_time_minutes INTEGER DEFAULT 0,
    cost_per_hour DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for CAD files
INSERT INTO storage.buckets (id, name, public) VALUES ('cad-files', 'cad-files', false);

-- Create storage policies for CAD files
CREATE POLICY "Users can view files for their subsystems" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'cad-files' AND
        (storage.foldername(name))[2] IN (
            SELECT subsystem_id::text FROM subsystem_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can upload files to their subsystems" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'cad-files' AND
        (storage.foldername(name))[2] IN (
            SELECT subsystem_id::text FROM subsystem_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'cad-files' AND
        owner = auth.uid()
    );

-- Insert some default stock materials
INSERT INTO stock_materials (material_type, form_factor, dimensions, material_grade, supplier, cost_per_unit, unit_type) VALUES
('aluminum', 'sheet', '{"width": 12, "height": 24, "thickness": 0.125}', '6061-T6', 'McMaster-Carr', 45.50, 'sheet'),
('aluminum', 'sheet', '{"width": 12, "height": 24, "thickness": 0.25}', '6061-T6', 'McMaster-Carr', 78.25, 'sheet'),
('aluminum', 'bar', '{"width": 1, "height": 1, "length": 72}', '6061-T6', 'McMaster-Carr', 32.10, 'piece'),
('aluminum', 'tube', '{"outer_diameter": 1, "inner_diameter": 0.75, "length": 72}', '6061-T6', 'McMaster-Carr', 28.75, 'piece'),
('steel', 'sheet', '{"width": 12, "height": 24, "thickness": 0.125}', 'mild_steel', 'McMaster-Carr', 25.30, 'sheet'),
('plastic', 'sheet', '{"width": 12, "height": 24, "thickness": 0.25}', 'delrin', 'McMaster-Carr', 52.80, 'sheet');

-- Insert some default manufacturing workflows
INSERT INTO manufacturing_workflows (name, description, machine_type, material_compatibility, max_dimensions, setup_time_minutes, cost_per_hour) VALUES
('CNC Milling - Aluminum', 'CNC milling for aluminum parts', 'cnc_mill', ARRAY['aluminum'], '{"x": 10, "y": 6, "z": 4}', 30, 75.00),
('Laser Cutting - Sheet Metal', 'Laser cutting for sheet materials', 'laser_cutter', ARRAY['aluminum', 'steel', 'plastic'], '{"x": 24, "y": 12, "z": 0.5}', 15, 45.00),
('3D Printing - PLA', '3D printing for plastic prototypes', '3d_printer', ARRAY['plastic'], '{"x": 8, "y": 8, "z": 6}', 10, 15.00),
('Waterjet Cutting', 'Waterjet cutting for thick materials', 'waterjet', ARRAY['aluminum', 'steel'], '{"x": 48, "y": 24, "z": 4}', 45, 85.00);

-- Enable Row Level Security
ALTER TABLE subsystems ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsystem_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsystem_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturing_workflows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view all profiles" ON user_profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can create their own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for subsystems
CREATE POLICY "Users can view all subsystems" ON subsystems
    FOR SELECT USING (true);

CREATE POLICY "Users can create subsystems" ON subsystems
    FOR INSERT WITH CHECK (auth.uid() = lead_user_id);

CREATE POLICY "Subsystem leads can update their subsystems" ON subsystems
    FOR UPDATE USING (auth.uid() = lead_user_id);

CREATE POLICY "Subsystem leads can delete their subsystems" ON subsystems
    FOR DELETE USING (auth.uid() = lead_user_id);

-- RLS Policies for subsystem_members
CREATE POLICY "Users can view all subsystem memberships" ON subsystem_members
    FOR SELECT USING (true);

CREATE POLICY "Users can join subsystems" ON subsystem_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave subsystems" ON subsystem_members
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for subsystem_files
CREATE POLICY "Users can view files for subsystems they're in" ON subsystem_files
    FOR SELECT USING (
        subsystem_id IN (
            SELECT subsystem_id FROM subsystem_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Subsystem members can upload files" ON subsystem_files
    FOR INSERT WITH CHECK (
        subsystem_id IN (
            SELECT subsystem_id FROM subsystem_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "File uploaders can delete their files" ON subsystem_files
    FOR DELETE USING (auth.uid() = uploaded_by);

-- RLS Policies for builds
CREATE POLICY "Users can view builds for subsystems they're in" ON builds
    FOR SELECT USING (
        subsystem_id IN (
            SELECT subsystem_id FROM subsystem_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Subsystem leads can create builds" ON builds
    FOR INSERT WITH CHECK (
        subsystem_id IN (
            SELECT id FROM subsystems WHERE lead_user_id = auth.uid()
        )
    );

CREATE POLICY "Subsystem members can update builds" ON builds
    FOR UPDATE USING (
        subsystem_id IN (
            SELECT subsystem_id FROM subsystem_members WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for build_bom
CREATE POLICY "Users can view BOM for builds they have access to" ON build_bom
    FOR SELECT USING (
        build_id IN (
            SELECT b.id FROM builds b
            JOIN subsystem_members sm ON b.subsystem_id = sm.subsystem_id
            WHERE sm.user_id = auth.uid()
        )
    );

CREATE POLICY "Subsystem members can update BOM" ON build_bom
    FOR ALL USING (
        build_id IN (
            SELECT b.id FROM builds b
            JOIN subsystem_members sm ON b.subsystem_id = sm.subsystem_id
            WHERE sm.user_id = auth.uid()
        )
    );

-- RLS Policies for stock_types
CREATE POLICY "Users can view stock types" ON stock_types
    FOR SELECT USING (true);

-- RLS Policies for subsystem_files updates
CREATE POLICY "Subsystem members can update files" ON subsystem_files
    FOR UPDATE USING (
        subsystem_id IN (
            SELECT subsystem_id FROM subsystem_members WHERE user_id = auth.uid()
        )
    );
