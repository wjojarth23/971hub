-- Subsystems table
CREATE TABLE IF NOT EXISTS subsystems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lead_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    onshape_assembly_url TEXT,
    onshape_document_id TEXT,
    onshape_workspace_id TEXT,
    onshape_element_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subsystem members table
CREATE TABLE IF NOT EXISTS subsystem_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'lead', 'member'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subsystem_id, user_id)
);

-- CAD files table (for non-OnShape files)
CREATE TABLE IF NOT EXISTS cad_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    file_type VARCHAR(50),
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OnShape versions table (to track versions/releases)
CREATE TABLE IF NOT EXISTS onshape_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL,
    version_name TEXT,
    is_release BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE subsystems ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsystem_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cad_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE onshape_versions ENABLE ROW LEVEL SECURITY;

-- Policies for subsystems
CREATE POLICY "Users can view all subsystems" ON subsystems FOR SELECT USING (true);
CREATE POLICY "Users can create subsystems" ON subsystems FOR INSERT WITH CHECK (auth.uid() = lead_user_id);
CREATE POLICY "Subsystem leads can update their subsystems" ON subsystems FOR UPDATE USING (auth.uid() = lead_user_id);
CREATE POLICY "Subsystem leads can delete their subsystems" ON subsystems FOR DELETE USING (auth.uid() = lead_user_id);

-- Policies for subsystem_members
CREATE POLICY "Users can view subsystem members" ON subsystem_members FOR SELECT USING (true);
CREATE POLICY "Users can join subsystems" ON subsystem_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave subsystems" ON subsystem_members FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Subsystem leads can manage members" ON subsystem_members FOR ALL USING (
    EXISTS (
        SELECT 1 FROM subsystems 
        WHERE subsystems.id = subsystem_members.subsystem_id 
        AND subsystems.lead_user_id = auth.uid()
    )
);

-- Policies for cad_files
CREATE POLICY "Subsystem members can view CAD files" ON cad_files FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM subsystem_members 
        WHERE subsystem_members.subsystem_id = cad_files.subsystem_id 
        AND subsystem_members.user_id = auth.uid()
    )
);
CREATE POLICY "Subsystem members can upload CAD files" ON cad_files FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM subsystem_members 
        WHERE subsystem_members.subsystem_id = cad_files.subsystem_id 
        AND subsystem_members.user_id = auth.uid()
    )
);

-- Policies for onshape_versions
CREATE POLICY "Subsystem members can view OnShape versions" ON onshape_versions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM subsystem_members 
        WHERE subsystem_members.subsystem_id = onshape_versions.subsystem_id 
        AND subsystem_members.user_id = auth.uid()
    )
);
