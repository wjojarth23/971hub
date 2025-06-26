-- Sample data for testing the laser cutter system
-- Run this after running the migration_laser_sheets.sql

-- Insert some sample sheets
INSERT INTO public.sheets (stock_type_id, stock_description, material, thickness, width, height, remaining_area, location) VALUES
('al_1_8_sheet', '1/8" Aluminum Sheet', 'Aluminum', 0.125, 24, 48, 1152, 'Rack A-1'),
('al_1_8_sheet', '1/8" Aluminum Sheet', 'Aluminum', 0.125, 24, 48, 800, 'Rack A-2'),
('pc_1_4_sheet', '1/4" Polycarbonate Sheet', 'Polycarbonate', 0.25, 24, 48, 1152, 'Rack B-1'),
('pc_1_8_sheet', '1/8" Polycarbonate Sheet', 'Polycarbonate', 0.125, 24, 48, 950, 'Rack B-2'),
('delrin_1_8_sheet', '1/8" Delrin Sheet', 'Delrin', 0.125, 24, 48, 1152, 'Rack C-1');

-- Insert some sample parts that need laser cutting
INSERT INTO public.parts (name, requester, project_id, workflow, status, file_name, file_url, quantity, material, layout_x, layout_y) VALUES
('Front Panel', 'John Doe', 'Robot-2024', 'laser-cut', 'pending', 'front_panel.svg', '', 2, 'Aluminum', 6, 4),
('Side Bracket', 'Jane Smith', 'Robot-2024', 'laser-cut', 'pending', 'side_bracket.svg', '', 4, 'Aluminum', 3, 2),
('Motor Mount', 'Bob Wilson', 'Chassis-2024', 'laser-cut', 'pending', 'motor_mount.svg', '', 2, 'Aluminum', 4, 3),
('Electronics Cover', 'Alice Johnson', 'Control-2024', 'laser-cut', 'pending', 'cover.svg', '', 1, 'Polycarbonate', 8, 6),
('Sensor Housing', 'Mike Davis', 'Sensors-2024', 'laser-cut', 'pending', 'housing.svg', '', 6, 'Delrin', 2, 2),
('Spacer Ring', 'Sarah Lee', 'Drive-2024', 'laser-cut', 'pending', 'spacer.svg', '', 10, 'Delrin', 1, 1),
('Gear Guard', 'Tom Brown', 'Drive-2024', 'laser-cut', 'in-progress', 'guard.svg', '', 2, 'Polycarbonate', 5, 3);

-- Set a proper onshape document ID for one part (optional, for testing)
UPDATE public.parts 
SET onshape_document_id = 'sample_doc_id',
    onshape_element_id = 'sample_element_id',
    onshape_part_id = 'sample_part_id',
    onshape_wvm = 'w',
    onshape_wvmid = 'sample_workspace_id',
    file_format = 'step',
    is_onshape_part = true
WHERE name = 'Front Panel';

-- Create some historical cut data to show sheet utilization
-- (This shows parts that have already been cut from some sheets)
INSERT INTO public.sheet_cuts (sheet_id, part_ids, cut_svg, area_used, notes)
SELECT 
  s.id,
  ARRAY['sample_part_1', 'sample_part_2'],
  '<svg><rect x="2" y="2" width="4" height="2" stroke="black" fill="none"/></svg>',
  8,
  'Previous cutting session'
FROM public.sheets s 
WHERE s.remaining_area < 1152
LIMIT 2;
