<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { onShapeAPI } from '$lib/onshape.js';
  import { Users, Plus, Link, Upload, Settings, FileText, ExternalLink, UserPlus, Download } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  let user = null;
  let loading = true;
  let subsystems = [];
  let showCreateModal = false;
  let showLinkModal = false;
  let showBuildModal = false;
  let selectedSubsystem = null;
  let selectedRelease = null;
  let newSubsystem = { name: '', description: '' };
  let onshapeUrl = '';
  let fileInput;
  let loadingOnShape = false;
  let onshapeData = {};
  let builds = [];
  let stockTypes = [];
  let buildBOM = [];
  let loadingBuild = false;
  onMount(async () => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      goto('/');
      return;
    }

    // Ensure user profile exists
    await ensureUserProfile(session.user);

    // Get user profile
    userStore.subscribe(value => {
      user = value;
      loading = false;
    });

    await loadSubsystems();
    await loadBuilds();
    await loadStockTypes();
  });

  async function ensureUserProfile(authUser) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
          id: authUser.id,
          display_name: authUser.user_metadata?.display_name || authUser.user_metadata?.full_name || authUser.email.split('@')[0],
          full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.display_name || '',
          email: authUser.email,
          role: authUser.user_metadata?.role || 'member',
          permissions: authUser.user_metadata?.permissions || 'basic'
        }, {
          onConflict: 'id'
        });

      if (error) console.error('Error ensuring user profile:', error);
    } catch (error) {
      console.error('Error ensuring user profile:', error);
    }
  }async function loadSubsystems() {
    try {
      const { data, error } = await supabase
        .from('subsystems')
        .select(`
          *,
          subsystem_members(user_id),
          lead_user:user_profiles!lead_user_id(display_name, email)
        `);

      if (error) throw error;
      subsystems = data || [];
        // Load OnShape data for subsystems with linked documents
      for (const subsystem of subsystems) {
        if (subsystem.onshape_document_id && onShapeAPI.accessKey && onShapeAPI.secretKey) {
          try {
            const releases = await onShapeAPI.getDocumentReleases(subsystem.onshape_document_id);
            onshapeData[subsystem.id] = { releases: releases || [] };
          } catch (error) {
            console.error(`Error loading OnShape data for ${subsystem.name}:`, error);
            onshapeData[subsystem.id] = { releases: [] };
          }
        } else if (subsystem.onshape_document_id) {
          onshapeData[subsystem.id] = { releases: [] };
        }
      }
    } catch (error) {
      console.error('Error loading subsystems:', error);
    }
  }

  async function createSubsystem() {
    if (!newSubsystem.name.trim()) return;

    try {
      const { data, error } = await supabase
        .from('subsystems')
        .insert([{
          name: newSubsystem.name,
          description: newSubsystem.description,
          lead_user_id: user.id
        }])
        .select()
        .single();

      if (error) throw error;

      // Add creator as a member
      await supabase
        .from('subsystem_members')
        .insert([{
          subsystem_id: data.id,
          user_id: user.id
        }]);

      newSubsystem = { name: '', description: '' };
      showCreateModal = false;
      await loadSubsystems();
    } catch (error) {
      console.error('Error creating subsystem:', error);
      alert('Failed to create subsystem');
    }
  }

  async function joinSubsystem(subsystemId) {
    try {
      const { error } = await supabase
        .from('subsystem_members')
        .insert([{
          subsystem_id: subsystemId,
          user_id: user.id
        }]);

      if (error) throw error;
      await loadSubsystems();
    } catch (error) {
      if (error.code === '23505') {
        alert('You are already a member of this subsystem');
      } else {
        console.error('Error joining subsystem:', error);
        alert('Failed to join subsystem');
      }
    }
  }

  async function linkOnShapeDocument() {
    loadingOnShape = true;
    try {
      const parsedUrl = onShapeAPI.parseOnShapeUrl(onshapeUrl);
      if (!parsedUrl) {
        alert('Invalid OnShape URL format');
        return;
      }

      // Update subsystem with OnShape info
      const { error } = await supabase
        .from('subsystems')
        .update({
          onshape_url: onshapeUrl,
          onshape_document_id: parsedUrl.documentId,
          onshape_workspace_id: parsedUrl.workspaceId,
          onshape_element_id: parsedUrl.elementId
        })
        .eq('id', selectedSubsystem)
        .eq('lead_user_id', user.id);

      if (error) throw error;

      // Fetch OnShape data
      try {
        const [docInfo, versions, releases] = await Promise.all([
          onShapeAPI.getDocumentInfo(parsedUrl.documentId),
          onShapeAPI.getDocumentVersions(parsedUrl.documentId),
          onShapeAPI.getDocumentReleases(parsedUrl.documentId)
        ]);

        onshapeData = { docInfo, versions, releases };
      } catch (onshapeError) {
        console.error('OnShape API error:', onshapeError);
        // Still save the URL even if API fails
      }

      onshapeUrl = '';
      showLinkModal = false;
      selectedSubsystem = null;
      await loadSubsystems();
    } catch (error) {
      console.error('Error linking OnShape document:', error);
      alert('Failed to link OnShape document');
    } finally {
      loadingOnShape = false;
    }
  }

  async function handleFileUpload(subsystemId) {
    const files = fileInput.files;
    if (!files || files.length === 0) return;

    try {
      for (const file of files) {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `subsystems/${subsystemId}/${fileName}`;

        // Upload file to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from('cad-files')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Save file info to database
        const { error: dbError } = await supabase
          .from('subsystem_files')
          .insert([{
            subsystem_id: subsystemId,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user.id
          }]);

        if (dbError) throw dbError;
      }

      fileInput.value = '';
      alert('Files uploaded successfully');
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Failed to upload files');
    }
  }
  async function loadBuilds() {
    try {
      const { data, error } = await supabase
        .from('builds')
        .select(`
          *,
          subsystems(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      builds = data || [];
    } catch (error) {
      console.error('Error loading builds:', error);
    }
  }

  async function loadStockTypes() {
    try {
      const { data, error } = await supabase
        .from('stock_types')
        .select('*');

      if (error) throw error;
      stockTypes = data || [];
    } catch (error) {
      console.error('Error loading stock types:', error);
    }
  }

  async function createBuildFromRelease(subsystemId, release) {
    loadingBuild = true;
    selectedSubsystem = subsystemId;
    selectedRelease = release;
    
    try {
      const subsystem = subsystems.find(s => s.id === subsystemId);
      if (!subsystem.onshape_document_id) {
        alert('No OnShape document linked to this subsystem');
        return;
      }

      // Generate unique build hash
      const buildHash = onShapeAPI.generateBuildHash(release.id, Date.now());

      // Create build record
      const { data: buildData, error: buildError } = await supabase
        .from('builds')
        .insert([{
          subsystem_id: subsystemId,
          release_id: release.id,
          release_name: release.name,
          build_hash: buildHash,
          created_by: user.id
        }])
        .select()
        .single();

      if (buildError) throw buildError;

      // Get BOM from OnShape
      const bom = await onShapeAPI.getAssemblyBOM(
        subsystem.onshape_document_id,
        subsystem.onshape_workspace_id,
        subsystem.onshape_element_id,
        release.versionId
      );

      // Process BOM items
      const bomItems = [];
      for (const item of bom.bomTable?.items || []) {
        const isCOTS = onShapeAPI.isCOTSPart(item.item?.name || '', item.item?.partNumber || '');
        
        let boundingBox = null;
        let material = null;
        
        if (!isCOTS && item.item?.partId) {
          try {
            const [properties, bbox] = await Promise.all([
              onShapeAPI.getPartProperties(
                subsystem.onshape_document_id,
                subsystem.onshape_workspace_id,
                subsystem.onshape_element_id,
                item.item.partId
              ),
              onShapeAPI.getPartBoundingBox(
                subsystem.onshape_document_id,
                subsystem.onshape_workspace_id,
                subsystem.onshape_element_id,
                item.item.partId
              )
            ]);
            
            material = properties?.material || 'Unknown';
            boundingBox = bbox?.lowCoordinate && bbox?.highCoordinate ? {
              x: bbox.highCoordinate[0] - bbox.lowCoordinate[0],
              y: bbox.highCoordinate[1] - bbox.lowCoordinate[1],
              z: bbox.highCoordinate[2] - bbox.lowCoordinate[2]
            } : null;
          } catch (error) {
            console.error('Error getting part details:', error);
          }
        }

        const stockAssignment = isCOTS ? null : onShapeAPI.assignStockType(material, boundingBox, stockTypes);

        bomItems.push({
          build_id: buildData.id,
          part_name: item.item?.name || 'Unknown Part',
          part_number: item.item?.partNumber || '',
          quantity: item.quantity || 1,
          part_type: isCOTS ? 'COTS' : 'manufactured',
          material: material,
          stock_assignment: stockAssignment,
          bounding_box_x: boundingBox?.x,
          bounding_box_y: boundingBox?.y,
          bounding_box_z: boundingBox?.z,
          onshape_part_id: item.item?.partId,
          status: isCOTS ? 'delivered' : 'pending'
        });
      }

      // Insert BOM items
      if (bomItems.length > 0) {
        const { error: bomError } = await supabase
          .from('build_bom')
          .insert(bomItems);

        if (bomError) throw bomError;
      }

      buildBOM = bomItems;
      showBuildModal = true;
      await loadBuilds();
    } catch (error) {
      console.error('Error creating build:', error);
      alert('Failed to create build: ' + error.message);
    } finally {
      loadingBuild = false;
    }
  }

  async function addAllCOTSToPurchasing(buildId) {
    try {
      const { error } = await supabase
        .from('build_bom')
        .update({ added_to_purchasing: true })
        .eq('build_id', buildId)
        .eq('part_type', 'COTS');

      if (error) throw error;
      alert('All COTS parts added to purchasing (placeholder)');
    } catch (error) {
      console.error('Error adding COTS to purchasing:', error);
      alert('Failed to add COTS parts to purchasing');
    }
  }

  async function addManufacturedIteration(buildId) {
    try {
      // Get current build's manufactured parts
      const { data: currentParts, error: currentError } = await supabase
        .from('build_bom')
        .select('part_name, part_number, material, stock_assignment')
        .eq('build_id', buildId)
        .eq('part_type', 'manufactured');

      if (currentError) throw currentError;

      // Get all previous builds for the same subsystem
      const { data: build, error: buildError } = await supabase
        .from('builds')
        .select('subsystem_id')
        .eq('id', buildId)
        .single();

      if (buildError) throw buildError;

      const { data: previousParts, error: previousError } = await supabase
        .from('build_bom')
        .select('part_name, part_number, material, stock_assignment')
        .in('build_id', 
          builds
            .filter(b => b.subsystem_id === build.subsystem_id && b.id !== buildId)
            .map(b => b.id)
        )
        .eq('part_type', 'manufactured');

      if (previousError) throw previousError;

      // Find parts that are not identical to previous builds
      const newParts = currentParts.filter(current => 
        !previousParts.some(previous => 
          previous.part_name === current.part_name &&
          previous.part_number === current.part_number &&
          previous.material === current.material &&
          previous.stock_assignment === current.stock_assignment
        )
      );

      // Update only new parts
      const { error: updateError } = await supabase
        .from('build_bom')
        .update({ added_to_parts_list: true })
        .eq('build_id', buildId)
        .eq('part_type', 'manufactured')
        .in('part_name', newParts.map(p => p.part_name));

      if (updateError) throw updateError;
      alert(`${newParts.length} new manufactured parts added to parts list`);
    } catch (error) {
      console.error('Error adding manufactured iteration:', error);
      alert('Failed to add manufactured parts');
    }
  }

  async function buildDuplicate(buildId) {
    try {
      const { error } = await supabase
        .from('build_bom')
        .update({ added_to_parts_list: true })
        .eq('build_id', buildId);

      if (error) throw error;
      alert('All parts added to parts list');
    } catch (error) {
      console.error('Error building duplicate:', error);
      alert('Failed to add all parts');
    }
  }

  async function addSinglePartToList(bomItemId) {
    try {
      const { error } = await supabase
        .from('build_bom')
        .update({ added_to_parts_list: true })
        .eq('id', bomItemId);

      if (error) throw error;
    } catch (error) {
      console.error('Error adding part to list:', error);
      alert('Failed to add part to list');
    }
  }

  async function markAsAssembled(buildId) {
    try {
      const { error } = await supabase
        .from('builds')
        .update({ 
          status: 'assembled',
          assembled_at: new Date().toISOString(),
          assembled_by: user.id
        })
        .eq('id', buildId);

      if (error) throw error;
      await loadBuilds();
    } catch (error) {
      console.error('Error marking as assembled:', error);
      alert('Failed to mark as assembled');
    }
  }

  function isSubsystemMember(subsystem) {
    return subsystem.subsystem_members.some(member => member.user_id === user?.id);
  }

  function isSubsystemLead(subsystem) {
    return subsystem.lead_user_id === user?.id;
  }
</script>

<svelte:head>
  <title>CAD Subsystems - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if user}
  <div class="cad-container">
    <div class="page-header">
      <div class="header-content">
        <Settings size={32} />
        <div>
          <h1>CAD Subsystems</h1>
          <p>Manage robot subsystems with OnShape integration</p>
        </div>
      </div>
      <button class="btn btn-primary" on:click={() => showCreateModal = true}>
        <Plus size={16} />
        Create Subsystem
      </button>
    </div>

    <div class="subsystems-grid">
      {#each subsystems as subsystem}
        <div class="subsystem-card">
          <div class="subsystem-header">
            <h3>{subsystem.name}</h3>
            <div class="subsystem-badges">
              {#if isSubsystemLead(subsystem)}
                <span class="badge badge-lead">Lead</span>
              {/if}
              {#if isSubsystemMember(subsystem)}
                <span class="badge badge-member">Member</span>
              {/if}
            </div>
          </div>
          
          {#if subsystem.description}
            <p class="subsystem-description">{subsystem.description}</p>
          {/if}

          <div class="subsystem-info">
            <div class="info-item">
              <Users size={16} />
              <span>{subsystem.subsystem_members.length} member{subsystem.subsystem_members.length !== 1 ? 's' : ''}</span>
            </div>            {#if subsystem.lead_user}
              <div class="info-item">
                <span class="lead-label">Lead:</span>
                <span>{subsystem.lead_user?.display_name || subsystem.lead_user?.email || 'Unknown'}</span>
              </div>
            {/if}
          </div>          {#if subsystem.onshape_url}
            <div class="onshape-section">
              <div class="onshape-header">
                <Link size={16} />
                <span>OnShape Document</span>
                <a href={subsystem.onshape_url} target="_blank" class="external-link">
                  <ExternalLink size={14} />
                </a>
              </div>
              
              {#if onshapeData[subsystem.id]?.releases?.length > 0}
                <div class="releases-section">
                  <h4>Releases</h4>
                  <div class="releases-list">
                    {#each onshapeData[subsystem.id].releases as release}
                      <div class="release-item">
                        <div class="release-info">
                          <span class="release-name">{release.name}</span>
                          <span class="release-date">{new Date(release.createdTime).toLocaleDateString()}</span>
                        </div>
                        {#if isSubsystemMember(subsystem)}
                          <button 
                            class="btn btn-build" 
                            on:click={() => createBuildFromRelease(subsystem.id, release)}
                            disabled={loadingBuild}
                          >
                            {#if loadingBuild}
                              <div class="spinner-small"></div>
                            {:else}
                              <Settings size={14} />
                            {/if}
                            Build
                          </button>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="subsystem-actions">
            {#if isSubsystemLead(subsystem)}
              {#if !subsystem.onshape_url}
                <button 
                  class="btn btn-secondary" 
                  on:click={() => { selectedSubsystem = subsystem.id; showLinkModal = true; }}
                >
                  <Link size={16} />
                  Link OnShape
                </button>
              {/if}
              <label class="btn btn-secondary">
                <Upload size={16} />
                Upload Files
                <input 
                  type="file" 
                  multiple 
                  bind:this={fileInput} 
                  on:change={() => handleFileUpload(subsystem.id)}
                  style="display: none;"
                />
              </label>
            {:else if isSubsystemMember(subsystem)}
              <label class="btn btn-secondary">
                <Upload size={16} />
                Upload Files
                <input 
                  type="file" 
                  multiple 
                  bind:this={fileInput} 
                  on:change={() => handleFileUpload(subsystem.id)}
                  style="display: none;"
                />
              </label>
            {:else}
              <button 
                class="btn btn-primary" 
                on:click={() => joinSubsystem(subsystem.id)}
              >
                <UserPlus size={16} />
                Join Subsystem
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if subsystems.length === 0}
        <div class="empty-state">
          <Settings size={48} />
          <h3>No Subsystems Yet</h3>
          <p>Create your first subsystem to get started with CAD management</p>
          <button class="btn btn-primary" on:click={() => showCreateModal = true}>
            <Plus size={16} />
            Create First Subsystem
          </button>
        </div>      {/if}
    </div>

    <!-- Builds Overview -->
    {#if builds.length > 0}
      <div class="builds-section">
        <h2>All Builds</h2>
        <div class="builds-grid">
          {#each builds as build}
            <div class="build-card">
              <div class="build-header">
                <h3>{build.subsystems?.name || 'Unknown'} - {build.release_name}</h3>
                <span class="build-status status-{build.status}">
                  {build.status.replace('_', ' ')}
                </span>
              </div>
              <div class="build-info">
                <div class="info-item">
                  <span>Build Hash:</span>
                  <code>{build.build_hash}</code>
                </div>
                <div class="info-item">
                  <span>Created:</span>
                  <span>{new Date(build.created_at).toLocaleDateString()}</span>
                </div>
                {#if build.creator}
                  <div class="info-item">
                    <span>By:</span>
                    <span>{build.creator.email}</span>
                  </div>
                {/if}
                {#if build.assembled_at}
                  <div class="info-item">
                    <span>Assembled:</span>
                    <span>{new Date(build.assembled_at).toLocaleDateString()}</span>
                  </div>
                {/if}
              </div>
              <div class="build-actions">
                {#if build.status === 'ready_to_assemble'}
                  <button 
                    class="btn btn-primary" 
                    on:click={() => markAsAssembled(build.id)}
                  >
                    Mark as Assembled
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Create Subsystem Modal -->
  {#if showCreateModal}
    <div class="modal-overlay" on:click={() => showCreateModal = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h2>Create New Subsystem</h2>
          <button class="close-btn" on:click={() => showCreateModal = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="subsystem-name">Name</label>
            <input 
              id="subsystem-name"
              type="text" 
              bind:value={newSubsystem.name}
              placeholder="e.g., Drivetrain, Arm, Intake"
              required
            />
          </div>
          <div class="form-group">
            <label for="subsystem-description">Description (optional)</label>
            <textarea 
              id="subsystem-description"
              bind:value={newSubsystem.description}
              placeholder="Brief description of the subsystem"
              rows="3"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => showCreateModal = false}>
            Cancel
          </button>
          <button class="btn btn-primary" on:click={createSubsystem}>
            <Plus size={16} />
            Create Subsystem
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Link OnShape Modal -->
  {#if showLinkModal}
    <div class="modal-overlay" on:click={() => showLinkModal = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h2>Link OnShape Document</h2>
          <button class="close-btn" on:click={() => showLinkModal = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="onshape-url">OnShape Assembly URL</label>
            <input 
              id="onshape-url"
              type="url" 
              bind:value={onshapeUrl}
              placeholder="https://cad.onshape.com/documents/..."
              required
            />
            <small>Paste the URL of your OnShape assembly document</small>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => showLinkModal = false}>
            Cancel
          </button>
          <button 
            class="btn btn-primary" 
            on:click={linkOnShapeDocument}
            disabled={loadingOnShape}
          >
            {#if loadingOnShape}
              <div class="spinner-small"></div>
            {:else}
              <Link size={16} />
            {/if}
            Link Document
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Build BOM Modal -->
  {#if showBuildModal}
    <div class="modal-overlay" on:click={() => showBuildModal = false}>
      <div class="modal modal-large" on:click|stopPropagation>
        <div class="modal-header">
          <h2>Build BOM - {selectedRelease?.name}</h2>
          <button class="close-btn" on:click={() => showBuildModal = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="bom-actions">
            <button 
              class="btn btn-primary" 
              on:click={() => addAllCOTSToPurchasing(builds.find(b => b.release_id === selectedRelease?.id)?.id)}
            >
              Add All COTS to Purchasing
            </button>
            <button 
              class="btn btn-secondary" 
              on:click={() => addManufacturedIteration(builds.find(b => b.release_id === selectedRelease?.id)?.id)}
            >
              Manufacture Iteration
            </button>
            <button 
              class="btn btn-secondary" 
              on:click={() => buildDuplicate(builds.find(b => b.release_id === selectedRelease?.id)?.id)}
            >
              Build Duplicate
            </button>
          </div>

          <div class="bom-table">
            <table>
              <thead>
                <tr>
                  <th>Part Name</th>
                  <th>Part Number</th>
                  <th>Qty</th>
                  <th>Type</th>
                  <th>Material</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each buildBOM as item, index}
                  <tr>
                    <td>{item.part_name}</td>
                    <td>{item.part_number || '-'}</td>
                    <td>{item.quantity}</td>
                    <td>
                      <span class="type-badge type-{item.part_type.toLowerCase()}">
                        {item.part_type}
                      </span>
                    </td>
                    <td>{item.material || '-'}</td>
                    <td>{item.stock_assignment || '-'}</td>
                    <td>
                      <span class="status-badge status-{item.status}">
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <button 
                        class="btn btn-small" 
                        on:click={() => addSinglePartToList(item.id)}
                        disabled={item.added_to_parts_list}
                      >
                        {item.added_to_parts_list ? 'Added' : 'Add'}
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => showBuildModal = false}>
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <div class="error-container">
    <p>Please log in to access CAD Subsystems.</p>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--background);
    color: var(--text);
  }

  :root {
    --primary: #ffffff;
    --secondary: #1a1a1a;
    --accent: #f1c40f;
    --background: #f8f9fa;
    --border: #e1e5e9;
    --text: #2c3e50;
    --success: #27ae60;
    --warning: #f39c12;
    --danger: #e74c3c;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 1rem;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top: 3px solid var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top: 2px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .cad-container {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
  }  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--background);
    border-radius: 4px;
    border: 1px solid var(--border);
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header-content h1 {
    margin: 0;
    color: var(--secondary);
    font-size: 2rem;
  }

  .header-content p {
    margin: 0.5rem 0 0 0;
    color: #666;
    font-size: 1.1rem;
  }

  .subsystems-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }
  .subsystem-card {
    background: var(--primary);
    border-radius: 4px;
    border: 1px solid var(--border);
    padding: 1.5rem;
    margin-bottom: 1rem;
    transition: all 0.2s ease;
  }

  .subsystem-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .subsystem-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .subsystem-header h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1.3rem;
  }

  .subsystem-badges {
    display: flex;
    gap: 0.5rem;
  }
  .badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-lead {
    background: var(--accent);
    color: var(--secondary);
  }

  .badge-member {
    background: var(--success);
    color: var(--primary);
  }

  .subsystem-description {
    color: #666;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .subsystem-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #666;
    font-size: 0.9rem;
  }

  .lead-label {
    font-weight: 500;
    color: var(--secondary);
  }
  .onshape-section {
    background: var(--background);
    border-radius: 4px;
    border: 1px solid var(--border);
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .onshape-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--secondary);
    font-weight: 500;
  }

  .external-link {
    color: var(--accent);
    text-decoration: none;
    margin-left: auto;
  }

  .external-link:hover {
    color: var(--secondary);
  }

  .releases-section {
    margin-top: 1rem;
  }

  .releases-section h4 {
    margin: 0 0 0.75rem 0;
    color: var(--secondary);
    font-size: 1rem;
  }

  .releases-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .release-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .release-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .release-name {
    font-weight: 500;
    color: var(--secondary);
  }

  .release-date {
    font-size: 0.85rem;
    color: #666;
  }

  .btn-build {
    background: var(--success);
    color: var(--primary);
    border-color: var(--success);
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
  }

  .btn-build:hover:not(:disabled) {
    background: #229954;
    border-color: #229954;
  }

  .btn-small {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
  }
  .builds-section {
    margin-top: 2rem;
    background: var(--primary);
    border-radius: 4px;
    border: 1px solid var(--border);
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .builds-section h2 {
    margin: 0 0 1.5rem 0;
    color: var(--secondary);
    font-size: 1.5rem;
  }

  .builds-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }
  .build-card {
    background: var(--primary);
    border-radius: 4px;
    border: 1px solid var(--border);
    padding: 1.5rem;
    margin-bottom: 1rem;
    transition: all 0.2s ease;
  }

  .build-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .build-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .build-header h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1.1rem;
  }
  .build-status {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .build-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .build-info .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
  }

  .build-info .info-item span:first-child {
    font-weight: 500;
    color: var(--secondary);
  }

  .build-info code {
    background: var(--primary);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .build-actions {
    display: flex;
    gap: 0.75rem;
  }

  .modal-large {
    max-width: 90%;
    width: 1000px;
  }

  .bom-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .bom-table {
    overflow-x: auto;
  }

  .bom-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .bom-table th,
  .bom-table td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .bom-table th {
    background: var(--background);
    font-weight: 500;
    color: var(--secondary);
  }
  .type-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .type-cots {
    background: var(--warning);
    color: var(--secondary);
  }

  .type-manufactured {
    background: var(--success);
    color: var(--primary);
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-pending {
    background: #f39c12;
    color: var(--primary);
  }

  .status-delivered {
    background: var(--success);
    color: var(--primary);
  }

  .status-manufactured {
    background: var(--success);
    color: var(--primary);
  }

  .status-ordered {
    background: #3498db;
    color: var(--primary);
  }

  .status-ready_to_assemble {
    background: var(--success);
    color: var(--primary);
  }

  .status-assembled {
    background: var(--secondary);
    color: var(--primary);
  }

  /* ...existing styles... */
</style>
