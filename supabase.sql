-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.build_bom (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  build_id uuid,
  part_name character varying NOT NULL,
  part_number character varying,
  quantity integer NOT NULL DEFAULT 1,
  part_type character varying NOT NULL CHECK (part_type::text = ANY (ARRAY['COTS'::character varying, 'manufactured'::character varying]::text[])),
  material character varying,
  stock_assignment character varying,
  workflow character varying,
  bounding_box_x numeric,
  bounding_box_y numeric,
  bounding_box_z numeric,
  onshape_part_id character varying,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'ordered'::character varying, 'delivered'::character varying, 'manufactured'::character varying]::text[])),
  added_to_parts_list boolean DEFAULT false,
  added_to_purchasing boolean DEFAULT false,
  CONSTRAINT build_bom_pkey PRIMARY KEY (id),
  CONSTRAINT build_bom_build_id_fkey FOREIGN KEY (build_id) REFERENCES public.builds(id)
-- Add file_url to build_bom for manufacturing file links (parasolid, STL, etc.)
ALTER TABLE public.build_bom ADD COLUMN file_url text;
);
CREATE TABLE public.builds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subsystem_id uuid,
  release_id character varying NOT NULL,
  release_name character varying NOT NULL,
  build_hash character varying NOT NULL UNIQUE,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'ready_to_assemble'::character varying, 'assembled'::character varying]::text[])),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  assembled_at timestamp with time zone,
  assembled_by uuid,
  CONSTRAINT builds_pkey PRIMARY KEY (id),
  CONSTRAINT builds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT builds_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id),
  CONSTRAINT builds_assembled_by_fkey FOREIGN KEY (assembled_by) REFERENCES auth.users(id)
);
CREATE TABLE public.drill_holes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sheet_id uuid,
  position_x numeric NOT NULL,
  position_y numeric NOT NULL,
  diameter numeric DEFAULT 3.0,
  depth numeric DEFAULT 5.0,
  feed_rate integer DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT drill_holes_pkey PRIMARY KEY (id),
  CONSTRAINT drill_holes_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.sheets(id)
);
CREATE TABLE public.manufacturing_workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  machine_type character varying NOT NULL,
  material_compatibility ARRAY,
  max_dimensions jsonb,
  setup_time_minutes integer DEFAULT 0,
  cost_per_hour numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT manufacturing_workflows_pkey PRIMARY KEY (id)
);
CREATE TABLE public.parts (
  id bigint NOT NULL DEFAULT nextval('parts_id_seq'::regclass),
  name text NOT NULL,
  requester text NOT NULL,
  project_id text NOT NULL,
  workflow text NOT NULL CHECK (workflow = ANY (ARRAY['laser-cut'::text, 'router'::text, 'lathe'::text, 'mill'::text, '3d-print'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in-progress'::text, 'cammed'::text, 'complete'::text])),
  file_name text NOT NULL,
  file_url text NOT NULL,
  kitting_bin text,
  delivered boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  material text NOT NULL DEFAULT ''::text,
  gcode_file_name text,
  gcode_file_url text,
  CONSTRAINT parts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  thickness numeric DEFAULT 0,
  material text DEFAULT 'MDF'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sheets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.stock_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  material_type character varying NOT NULL,
  form_factor character varying NOT NULL,
  dimensions jsonb NOT NULL,
  material_grade character varying,
  supplier character varying,
  cost_per_unit numeric,
  unit_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_materials_pkey PRIMARY KEY (id)
);
CREATE TABLE public.stock_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  material character varying NOT NULL,
  stock_type character varying NOT NULL,
  workflow character varying,
  max_dimension_x numeric,
  max_dimension_y numeric,
  max_dimension_z numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.subsystem_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subsystem_id uuid,
  file_name character varying NOT NULL,
  file_path text NOT NULL,
  file_type character varying,
  file_size integer,
  uploaded_by uuid,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subsystem_files_pkey PRIMARY KEY (id),
  CONSTRAINT subsystem_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id),
  CONSTRAINT subsystem_files_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id)
);
CREATE TABLE public.subsystem_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subsystem_id uuid,
  user_id uuid,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subsystem_members_pkey PRIMARY KEY (id),
  CONSTRAINT subsystem_members_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id),
  CONSTRAINT subsystem_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.subsystems (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  lead_user_id uuid,
  onshape_url text,
  onshape_document_id character varying,
  onshape_workspace_id character varying,
  onshape_element_id character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subsystems_pkey PRIMARY KEY (id),
  CONSTRAINT subsystems_lead_user_id_fkey FOREIGN KEY (lead_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.toolpaths (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sheet_id uuid,
  name text NOT NULL,
  gcode_content text NOT NULL,
  position_x numeric DEFAULT 0,
  position_y numeric DEFAULT 0,
  rotation numeric DEFAULT 0,
  scale_x numeric DEFAULT 1,
  scale_y numeric DEFAULT 1,
  enabled boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT toolpaths_pkey PRIMARY KEY (id),
  CONSTRAINT toolpaths_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.sheets(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email character varying,
  full_name character varying,
  role character varying DEFAULT 'member'::character varying,
  permissions ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);