-- Update builds table to include 'manufacturing' status
-- Run this SQL to update the existing table
ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check;
ALTER TABLE builds ADD CONSTRAINT builds_status_check CHECK (status IN ('pending', 'manufacturing', 'ready_to_assemble', 'assembled'));

-- Update default status if needed
UPDATE builds SET status = 'pending' WHERE status IS NULL;
