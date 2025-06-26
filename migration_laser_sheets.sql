-- Migration to add laser cutter sheet management system
-- Run this in your Supabase SQL editor

-- 1. Create sheets table for tracking physical stock sheets
CREATE TABLE IF NOT EXISTS public.sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stock_type_id character varying NOT NULL, -- References stock.json IDs like "al_1_8_sheet"
  stock_description character varying NOT NULL, -- Human readable like "1/8" Aluminum Sheet"
  material character varying NOT NULL,
  thickness numeric NOT NULL,
  width numeric NOT NULL DEFAULT 24, -- Sheet width in inches (default 24"x48")
  height numeric NOT NULL DEFAULT 48, -- Sheet height in inches
  total_area numeric GENERATED ALWAYS AS (width * height) STORED,
  cut_svg_url character varying, -- URL to SVG file in 'sheets' bucket showing all cut areas
  cut_areas jsonb DEFAULT '[]'::jsonb, -- Array of cut area polygons for collision detection
  remaining_area numeric NOT NULL DEFAULT (24 * 48), -- Available area for new parts
  workflow character varying NOT NULL DEFAULT 'laser-cut',
  status character varying NOT NULL DEFAULT 'available' CHECK (status = ANY (ARRAY['available'::text, 'in-use'::text, 'exhausted'::text, 'damaged'::text])),
  location character varying, -- Physical location identifier
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sheets_pkey PRIMARY KEY (id)
);

-- 2. Create sheet_cuts table to track individual cutting sessions
CREATE TABLE IF NOT EXISTS public.sheet_cuts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL,
  part_ids text[] NOT NULL, -- Array of part IDs that were cut in this session
  cut_svg_url character varying NOT NULL, -- URL to SVG file in 'sheets' bucket for this cut session
  layout_data jsonb, -- Store tessellation layout data for reference
  cut_areas jsonb NOT NULL, -- Array of cut area polygons added in this session
  cut_date timestamp with time zone DEFAULT now(),
  cut_by uuid,
  area_used numeric NOT NULL DEFAULT 0,
  notes text,
  CONSTRAINT sheet_cuts_pkey PRIMARY KEY (id),
  CONSTRAINT sheet_cuts_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE CASCADE,
  CONSTRAINT sheet_cuts_cut_by_fkey FOREIGN KEY (cut_by) REFERENCES auth.users(id)
);

-- 3. Add sheet_id to parts table to track which sheet a part was cut from
ALTER TABLE public.parts 
ADD COLUMN IF NOT EXISTS sheet_id uuid,
ADD COLUMN IF NOT EXISTS cut_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS layout_x numeric, -- X position on sheet
ADD COLUMN IF NOT EXISTS layout_y numeric, -- Y position on sheet  
ADD COLUMN IF NOT EXISTS layout_rotation numeric DEFAULT 0; -- Rotation angle in degrees

-- Add foreign key constraint for sheet_id
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'parts_sheet_id_fkey') THEN
        ALTER TABLE public.parts 
        ADD CONSTRAINT parts_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.sheets(id);
    END IF;
END $$;

-- 4. Create stock_requests view to show parts needed by stock type
CREATE OR REPLACE VIEW public.stock_requests AS
SELECT 
  p.material,
  p.workflow,
  COUNT(*) as part_count,
  ARRAY_AGG(p.id) as part_ids,
  ARRAY_AGG(p.name) as part_names,
  SUM(p.quantity) as total_quantity
FROM public.parts p
WHERE p.workflow = 'laser-cut' 
  AND p.status IN ('pending', 'in-progress')
  AND p.sheet_id IS NULL  -- Only parts not yet assigned to sheets
GROUP BY p.material, p.workflow
ORDER BY part_count DESC;

-- 5. Create sheet_utilization view 
CREATE OR REPLACE VIEW public.sheet_utilization AS
SELECT 
  s.*,
  ROUND(((s.total_area - s.remaining_area) / s.total_area * 100)::numeric, 2) as utilization_percent,
  COUNT(sc.id) as cut_sessions,
  COUNT(p.id) as parts_cut
FROM public.sheets s
LEFT JOIN public.sheet_cuts sc ON s.id = sc.sheet_id
LEFT JOIN public.parts p ON s.id = p.sheet_id
GROUP BY s.id
ORDER BY s.remaining_area ASC, s.created_at DESC;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sheets_stock_type ON public.sheets(stock_type_id);
CREATE INDEX IF NOT EXISTS idx_sheets_material ON public.sheets(material);
CREATE INDEX IF NOT EXISTS idx_sheets_status ON public.sheets(status);
CREATE INDEX IF NOT EXISTS idx_sheets_remaining_area ON public.sheets(remaining_area);
CREATE INDEX IF NOT EXISTS idx_sheet_cuts_sheet_id ON public.sheet_cuts(sheet_id);
CREATE INDEX IF NOT EXISTS idx_sheet_cuts_cut_date ON public.sheet_cuts(cut_date);
CREATE INDEX IF NOT EXISTS idx_parts_sheet_id ON public.parts(sheet_id);
CREATE INDEX IF NOT EXISTS idx_parts_workflow_status ON public.parts(workflow, status);

-- 7. Enable RLS
ALTER TABLE public.sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_cuts ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies
DO $$ 
BEGIN
    -- Sheets policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sheets' AND policyname = 'Users can view all sheets') THEN
        CREATE POLICY "Users can view all sheets" ON public.sheets FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sheets' AND policyname = 'Users can insert sheets') THEN
        CREATE POLICY "Users can insert sheets" ON public.sheets FOR INSERT WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sheets' AND policyname = 'Users can update sheets') THEN
        CREATE POLICY "Users can update sheets" ON public.sheets FOR UPDATE USING (true);
    END IF;
    
    -- Sheet cuts policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sheet_cuts' AND policyname = 'Users can view all sheet_cuts') THEN
        CREATE POLICY "Users can view all sheet_cuts" ON public.sheet_cuts FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sheet_cuts' AND policyname = 'Users can insert sheet_cuts') THEN
        CREATE POLICY "Users can insert sheet_cuts" ON public.sheet_cuts FOR INSERT WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sheet_cuts' AND policyname = 'Users can update sheet_cuts') THEN
        CREATE POLICY "Users can update sheet_cuts" ON public.sheet_cuts FOR UPDATE USING (true);
    END IF;
END $$;

-- 9. Grant permissions
GRANT ALL ON public.sheets TO authenticated;
GRANT ALL ON public.sheet_cuts TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
