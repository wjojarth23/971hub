# Database Setup for Build System

## IMPORTANT: CORRECT ARCHITECTURE

**The build system uses the CORRECT approach:**
- ✅ **`parts` table** - Contains all manufacturing parts (unchanged)
- ✅ **`purchasing` table** - Contains all COTS parts (unchanged) 
- ✅ **`builds` table** - Contains a `part_ids` array column that references IDs from parts/purchasing tables
- ❌ **NO `build_bom` table** - This was a mistake and has been corrected

## Required Database Migration

Run the **CORRECTED** migration to fix the database structure:

### Step 1: Run the Fix Migration

Execute this migration in your Supabase SQL editor:

1. Open your Supabase project dashboard
2. Go to the SQL Editor  
3. Copy and paste the contents of `migration_fix_builds.sql`
4. Click "Run" to execute

This will:
- ✅ Remove the incorrect `build_bom` table  
- ✅ Add `part_ids integer[]` column to `builds` table
- ✅ Create helper functions for managing builds
- ✅ Set up proper indexes

### Step 2: How It Works

**Correct Architecture:**
1. Parts are added to `parts` table (manufacturing) or `purchasing` table (COTS)
2. The part IDs are added to the `part_ids` array in the `builds` table
3. Build progress is calculated by looking up the actual parts by their IDs
4. Kitting locations come from the `parts` table `kitting_bin` field

**Example:**
```sql
-- Build references parts by ID
builds: {
  id: "uuid",
  part_ids: [123, 124, 125],  -- References parts.id and purchasing.id
  ...
}

-- Parts table has the actual part data
parts: {
  id: 123,
  name: "18t HTD pulley", 
  status: "complete",
  kitting_bin: "A1-5",
  ...
}
```

### Step 3: Test the System

1. Go to a CAD subsystem BOM page
2. Add a manufactured part - creates entry in `parts` table and adds ID to build
3. Add COTS parts - creates entries in `purchasing` table and adds IDs to build  
4. Check the Build page to see parts with real status and kitting locations

## What This Fixes

- ✅ No duplicate part tracking tables
- ✅ Parts table remains the single source of truth for manufacturing
- ✅ Purchasing table remains the single source of truth for COTS
- ✅ Builds just reference existing parts by ID
- ✅ Real-time status updates from actual manufacturing/purchasing progress
- ✅ Kitting locations from actual manufacturing data
