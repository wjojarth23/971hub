-- Migration: Add Router CAM Workflow Support
-- Date: 2025-06-14
-- Description: Adds support for router workflow with STEP file download -> G-code upload -> cammed status

-- 1. Update the status check constraint to include 'cammed' status
ALTER TABLE parts DROP CONSTRAINT parts_status_check;
ALTER TABLE parts ADD CONSTRAINT parts_status_check 
CHECK (status IN ('pending', 'in-progress', 'cammed', 'complete'));

-- 2. Add g-code file storage columns
ALTER TABLE parts 
ADD COLUMN gcode_file_name TEXT,
ADD COLUMN gcode_file_url TEXT;

-- 3. Create index for the new status
CREATE INDEX idx_parts_status_cammed ON parts(status) WHERE status = 'cammed';

-- 4. Add comments for documentation
COMMENT ON COLUMN parts.gcode_file_name IS 'G-code filename for router workflow (after CAM processing)';
COMMENT ON COLUMN parts.gcode_file_url IS 'G-code file URL in storage for router workflow';

-- 5. Update any existing in-progress router parts to maintain current workflow
-- (This is optional - only run if you want existing router parts to follow the new workflow)
-- UPDATE parts 
-- SET status = 'in-progress' 
-- WHERE workflow = 'router' AND status = 'in-progress';

-- 6. Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'parts' 
  AND column_name IN ('gcode_file_name', 'gcode_file_url', 'status')
ORDER BY ordinal_position;
