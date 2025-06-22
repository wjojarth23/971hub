-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.builds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subsystem_id uuid,
  release_id character varying NOT NULL,
  release_name character varying NOT NULL,
  build_hash character varying NOT NULL UNIQUE,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'manufacturing'::character varying::text, 'ready_to_assemble'::character varying::text, 'assembled'::character varying::text])),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  assembled_at timestamp with time zone,
  assembled_by uuid,
  CONSTRAINT builds_pkey PRIMARY KEY (id),
  CONSTRAINT builds_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id),
  CONSTRAINT builds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT builds_assembled_by_fkey FOREIGN KEY (assembled_by) REFERENCES auth.users(id)
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
  onshape_document_id character varying,
  onshape_wvm character varying,
  onshape_wvmid character varying,
  onshape_element_id character varying,
  onshape_part_id character varying,
  file_format character varying CHECK (file_format::text = ANY (ARRAY['stl'::character varying, 'parasolid'::character varying, 'step'::character varying, 'iges'::character varying]::text[])),
  is_onshape_part boolean DEFAULT false,
  CONSTRAINT parts_pkey PRIMARY KEY (id)
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