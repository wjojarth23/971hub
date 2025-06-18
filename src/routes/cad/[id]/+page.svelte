<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { onShapeAPI } from '$lib/onshape.js';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Triangle, Circle, Download, Settings, Plus, ShoppingCart, Zap, Copy } from 'lucide-svelte';

  let subsystemId = $page.params.id;
  let user = null;
  let loading = true;
  let subsystem = null;
  let timeline = [];
  let selectedVersion = null;
  let showBuildModal = false;
  let buildBOM = [];
  let stockTypes = [];
  let loadingBOM = false;
  let loadingBuild = false;

  onMount(async () => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      goto('/');
      return;
    }

    userStore.subscribe(value => {
      user = value;
    });

    await loadSubsystem();
    await loadStockTypes();
  });

  async function loadSubsystem() {
    try {
      const { data, error } = await supabase
        .from('subsystems')
        .select(`
          *,
          subsystem_members(user_id)
        `)
        .eq('id', subsystemId)
        .single();

      if (error) throw error;
      subsystem = data;      if (subsystem.onshape_document_id) {
        console.log('Loading timeline for OnShape document:', subsystem.onshape_document_id);
        await loadTimeline();
      } else {
        console.log('No OnShape document linked to this subsystem');
      }
    } catch (error) {
      console.error('Error loading subsystem:', error);
      goto('/cad');
    } finally {
      loading = false;
    }
  }  async function loadTimeline() {
    try {
      // Get document versions
      const allVersions = await onShapeAPI.getDocumentVersions(subsystem.onshape_document_id);
      console.log('OnShape all versions response:', allVersions);
      
      // Take the last 15 versions (newest first)
      // Sort by creation date descending and take first 15
      const sortedVersions = allVersions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const recentVersions = sortedVersions.slice(0, 15);
      console.log('Recent 15 versions (newest first):', recentVersions);

      // Process all versions - treat them all as buildable
      const timelineItems = recentVersions.map(version => ({
        ...version,
        type: 'version', // All versions are buildable now
        date: new Date(version.createdAt)
      }));

      timeline = timelineItems;
      
      console.log('Final timeline items:', timeline);
    } catch (error) {
      console.error('Error loading timeline:', error);
      timeline = [];
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
  async function createBuildFromRelease(release) {
    selectedVersion = release;
    loadingBOM = true;
    showBuildModal = true;

    try {
      console.log('Creating build from release:', release);
      
      // Get BOM from OnShape using the specific version ID
      const bom = await onShapeAPI.getAssemblyBOM(
        subsystem.onshape_document_id,
        subsystem.onshape_workspace_id,
        subsystem.onshape_element_id,
        release.id // Pass the version ID to get BOM from that specific version
      );

      console.log('BOM response:', bom);

      // Analyze and categorize BOM
      buildBOM = await analyzeBOM(bom);
      buildBOM = await autoAssignStock(buildBOM);

      console.log('Processed BOM:', buildBOM);

    } catch (error) {
      console.error('Error loading BOM:', error);
      alert('Failed to load BOM: ' + error.message);
      showBuildModal = false;
    } finally {
      loadingBOM = false;
    }
  }
  function isSubsystemMember() {
    const isMember = subsystem?.subsystem_members?.some(member => member.user_id === user?.id);
    console.log('Checking subsystem membership:', {
      subsystem: subsystem?.name,
      user: user?.id,
      members: subsystem?.subsystem_members,
      isMember
    });
    return isMember;
  }  async function analyzeBOM(bom) {
    const analyzedParts = [];
    
    console.log('Analyzing BOM structure:', bom);
    
    // Create a mapping from property names to header IDs for flexible lookup
    const propertyToHeaderId = {};
    bom.headers?.forEach(header => {
      const propName = header.propertyName || header.name?.toLowerCase();
      if (propName) {
        propertyToHeaderId[propName] = header.id;
      }
    });
    
    console.log('Property to Header ID mapping:', propertyToHeaderId);
    
    // Helper function to get value from row by property name
    function getValue(row, propertyName) {
      const headerId = propertyToHeaderId[propertyName];
      return headerId ? row.headerIdToValue?.[headerId] : null;
    }
    
    // Process each row in the BOM
    for (const row of bom.rows || []) {
      let partType = 'manufactured';
      let material = '';
      let workflow = '';
      
      // Extract data using property names (fallback to hardcoded IDs for known structure)
      const headerValues = row.headerIdToValue || {};
      
      // Try to get values using property names first, then fallback to known IDs
      const partName = getValue(row, 'name') || 
                      headerValues['57f3fb8efa3416c06701d60d'] || 
                      'Unknown Part';
      
      const partNumber = getValue(row, 'partNumber') || 
                        headerValues['57f3fb8efa3416c06701d60f'] || 
                        '';
      
      const quantity = getValue(row, 'quantity') || 
                      headerValues['5ace84d3c046ad611c65a0dd'] || 
                      1;
      
      const description = getValue(row, 'description') || 
                         headerValues['57f3fb8efa3416c06701d60e'] || 
                         '';
        const materialData = getValue(row, 'material') || 
                          headerValues['57f3fb8efa3416c06701d615'] || 
                          '';
      
      const vendor = getValue(row, 'vendor') || 
                    headerValues['57f3fb8efa3416c06701d612'] || 
                    '';
      
      console.log('Extracted data for row:', {
        partName,
        partNumber,
        quantity,
        description,
        materialData,
        vendor,
        isStandardContent: row.itemSource?.isStandardContent
      });
      
      // Extract material information
      if (materialData && typeof materialData === 'object') {
        material = materialData.displayName || materialData.name || '';
      } else if (typeof materialData === 'string') {
        material = materialData;
      }
      
      // Enhanced part categorization logic
      const partNameLower = partName.toLowerCase();
      const descriptionLower = description.toLowerCase();
      
      // Rule 1: If vendor is specified, it's COTS (overrides everything)
      if (vendor && vendor.trim() !== '') {
        partType = 'COTS';
      }
      // Rule 2: If part name contains "wcp", it's COTS
      else if (partNameLower.includes('wcp')) {
        partType = 'COTS';
      }
      // Rule 3: If part number starts with capital P, it's manufactured
      else if (partNumber && partNumber.match(/^P/)) {
        partType = 'manufactured';
      }
      // Rule 4: Standard OnShape content is COTS
      else if (row.itemSource?.isStandardContent === true) {
        partType = 'COTS';
      }
      // Rule 5: Common hardware/components (existing logic)
      else if (partNameLower.includes('screw') || partNameLower.includes('bolt') || 
          partNameLower.includes('nut') || partNameLower.includes('washer') ||
          partNameLower.includes('bearing') || partNameLower.includes('motor') ||
          partNameLower.includes('sensor') || partNameLower.includes('wire') ||
          partNameLower.includes('socket') || partNameLower.includes('cap screw') ||
          partNameLower.includes('button head') || partNameLower.includes('standoff') ||
          descriptionLower.includes('purchased') || descriptionLower.includes('cots')) {
        partType = 'COTS';
      } else {
        // Default to manufactured
        partType = 'manufactured';
      }      // Get bounding box for manufactured parts and determine workflow
      let boundingBox = { x: null, y: null, z: null };
      if (partType === 'manufactured' && row.itemSource?.partId && row.itemSource?.elementId) {
        try {
          const wvm = selectedVersion ? 'v' : 'w';
          const wvmId = selectedVersion ? selectedVersion.id : subsystem.onshape_workspace_id;
          
          const bbox = await onShapeAPI.getPartBoundingBox(
            subsystem.onshape_document_id,
            wvm,
            wvmId,
            row.itemSource.elementId, // Use the part's specific element ID, not the assembly element ID
            row.itemSource.partId
          );
          
          if (bbox && bbox.lowX !== undefined) {// Calculate dimensions from bounding box
            boundingBox.x = Math.abs(bbox.highX - bbox.lowX);
            boundingBox.y = Math.abs(bbox.highY - bbox.lowY);
            boundingBox.z = Math.abs(bbox.highZ - bbox.lowZ);
            
            // Intelligent workflow categorization based on dimensions
            if (boundingBox.x && boundingBox.y && boundingBox.z) {
              const dimensions = [boundingBox.x, boundingBox.y, boundingBox.z].sort((a, b) => a - b);
              const [smallest, middle, largest] = dimensions;
              
              // Convert from meters to inches for easier comparison (OnShape returns meters)
              const smallestInches = smallest * 39.3701;
              const middleInches = middle * 39.3701;
              const largestInches = largest * 39.3701;
              
              // Rule 1: Plates under 0.5" thick -> laser or router (prefer laser except metals)
              if (smallestInches < 0.5) {
                const materialLower = material.toLowerCase();
                if (materialLower.includes('aluminum') || materialLower.includes('steel') || 
                    materialLower.includes('stainless') || materialLower.includes('titanium') ||
                    materialLower.includes('brass') || materialLower.includes('copper')) {
                  workflow = 'mill'; // Metals can't be laser cut
                } else if (materialLower.includes('polycarbonate') || materialLower.includes('acrylic') ||
                          materialLower.includes('delrin') || materialLower.includes('lexan') ||
                          materialLower.includes('plexiglass') || materialLower.includes('pmma') ||
                          materialLower.includes('wood') || materialLower.includes('mdf') ||
                          materialLower.includes('plywood') || materialLower.includes('plastic')) {
                  workflow = 'laser-cut'; // Common laser-cut materials
                } else {
                  workflow = 'laser-cut'; // Default to laser for thin non-metal materials
                }
              }
              // Rule 2: Long stick-like shafts -> lathe
              else if (largestInches > 4 * middleInches && largestInches > 4 * smallestInches) {
                // If one dimension is significantly larger than the other two, it's shaft-like
                workflow = 'lathe';
              }
              // Rule 3: Everything else with no dimension under 0.5" -> mill
              else {
                workflow = 'mill';
              }
              
              console.log(`Part "${partName}" dimensions: ${smallestInches.toFixed(2)}" x ${middleInches.toFixed(2)}" x ${largestInches.toFixed(2)}" -> ${workflow}`);
            }
          }        } catch (error) {
          console.warn(`Failed to get bounding box for part "${partName}" (${partNumber}):`, error.message);
          // Don't let bounding box errors break the entire BOM processing
          // Fall back to material-based workflow determination
          if (material) {
            const materialLower = material.toLowerCase();
            if (materialLower.includes('aluminum') || materialLower.includes('steel') || 
                materialLower.includes('stainless') || materialLower.includes('titanium') ||
                materialLower.includes('brass') || materialLower.includes('copper')) {
              workflow = 'mill';
            } else if (materialLower.includes('polycarbonate') || materialLower.includes('acrylic') ||
                      materialLower.includes('delrin') || materialLower.includes('lexan') ||
                      materialLower.includes('plexiglass') || materialLower.includes('pmma') ||
                      materialLower.includes('wood') || materialLower.includes('mdf') ||
                      materialLower.includes('plywood')) {
              workflow = 'laser-cut';
            } else if (materialLower.includes('plastic') || materialLower.includes('pla') ||
                       materialLower.includes('abs') || materialLower.includes('petg') ||
                       materialLower.includes('nylon')) {
              workflow = '3d-print';
            } else {
              workflow = 'mill'; // default
            }
          } else {
            workflow = 'mill'; // default
          }
        }
      } else if (partType === 'manufactured') {
        // For manufactured parts without bounding box, use material-based workflow
        if (material) {
          const materialLower = material.toLowerCase();
          if (materialLower.includes('aluminum') || materialLower.includes('steel') || 
              materialLower.includes('stainless') || materialLower.includes('titanium') ||
              materialLower.includes('brass') || materialLower.includes('copper')) {
            workflow = 'mill';
          } else if (materialLower.includes('polycarbonate') || materialLower.includes('acrylic') ||
                    materialLower.includes('delrin') || materialLower.includes('lexan') ||
                    materialLower.includes('plexiglass') || materialLower.includes('pmma') ||
                    materialLower.includes('wood') || materialLower.includes('mdf') ||
                    materialLower.includes('plywood')) {
            workflow = 'laser-cut';
          } else if (materialLower.includes('plastic') || materialLower.includes('pla') ||
                     materialLower.includes('abs') || materialLower.includes('petg') ||
                     materialLower.includes('nylon')) {
            workflow = '3d-print';
          } else {
            workflow = 'mill'; // default
          }
        } else {
          workflow = 'mill'; // default
        }
      }
      
      analyzedParts.push({
        part_name: partName,
        part_number: partNumber,
        quantity: quantity,
        part_type: partType,
        material: material,
        workflow: workflow,
        onshape_part_id: row.itemSource?.partId || row.rowId || '',
        bounding_box_x: boundingBox.x,
        bounding_box_y: boundingBox.y,
        bounding_box_z: boundingBox.z,
        stock_assignment: '',
        status: 'pending'
      });
    }
    
    console.log('Analyzed parts:', analyzedParts);
    return analyzedParts;
  }

  async function autoAssignStock(parts) {
    for (const part of parts) {
      if (part.part_type === 'manufactured' && part.material) {
        // Find matching stock type
        const matchingStock = stockTypes.find(stock => 
          stock.material.toLowerCase().includes(part.material.toLowerCase()) &&
          stock.workflow === part.workflow
        );
        
        if (matchingStock) {
          part.stock_assignment = `${matchingStock.material} - ${matchingStock.stock_type}`;
        }
      }
    }
    
    return parts;
  }

  async function confirmBuild() {
    loadingBuild = true;
    try {
      const buildHash = `${subsystem.onshape_document_id}_${selectedVersion.id}_${Date.now()}`;
      
      const { data: build, error } = await supabase
        .from('builds')
        .insert([{
          subsystem_id: subsystem.id,
          release_id: selectedVersion.id,
          release_name: selectedVersion.name,
          build_hash: buildHash,
          created_by: user.id,
          status: 'pending'
        }])
        .select()
        .single();

      if (error) throw error;

      // Insert BOM items
      const bomItems = buildBOM.map(item => ({
        ...item,
        build_id: build.id
      }));

      const { error: bomError } = await supabase
        .from('build_bom')
        .insert(bomItems);

      if (bomError) throw bomError;

      alert('Build created successfully!');
      showBuildModal = false;
      
    } catch (error) {
      console.error('Error creating build:', error);
      alert('Failed to create build: ' + error.message);
    } finally {
      loadingBuild = false;
    }
  }

  async function addAllCOTSToPurchasing() {
    const cotsItems = buildBOM.filter(item => item.part_type === 'COTS');
    // Placeholder for now
    alert(`Would add ${cotsItems.length} COTS items to purchasing`);
  }

  async function manufactureIteration() {
    // Check for duplicate parts from previous builds of same subsystem
    try {
      const { data: previousBuilds, error } = await supabase
        .from('builds')
        .select(`
          id,
          build_bom(part_name, part_number, material, workflow)
        `)
        .eq('subsystem_id', subsystem.id)
        .neq('status', 'pending');

      if (error) throw error;

      const existingParts = new Set();
      previousBuilds.forEach(build => {
        build.build_bom.forEach(item => {
          existingParts.add(`${item.part_name}_${item.part_number}_${item.material}_${item.workflow}`);
        });
      });

      const newParts = buildBOM.filter(item => 
        item.part_type === 'manufactured' &&
        !existingParts.has(`${item.part_name}_${item.part_number}_${item.material}_${item.workflow}`)
      );

      alert(`Would add ${newParts.length} new manufactured parts to parts list`);
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      alert('Error checking for duplicate parts');
    }
  }

  async function buildDuplicate() {
    const manufacturedItems = buildBOM.filter(item => item.part_type === 'manufactured');
    alert(`Would add all ${manufacturedItems.length} manufactured parts to parts list`);
  }
</script>

<svelte:head>
  <title>{subsystem?.name || 'Subsystem'} Timeline - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading subsystem...</p>
  </div>
{:else if subsystem}
  <main class="main-content">
    <header class="page-header">
      <div class="header-content">
        <button class="back-button" on:click={() => goto('/cad')}>
          <ArrowLeft size={20} />
          Back to CAD
        </button>
        <div class="header-info">
          <h1>{subsystem.name}</h1>
          {#if subsystem.description}
            <p class="subsystem-description">{subsystem.description}</p>
          {/if}
        </div>
      </div>
    </header>    {#if subsystem.onshape_document_id}
      <section class="timeline-section">
        <h2>OnShape Timeline</h2>
        <div class="timeline-container">
          <div class="timeline">
            {#each timeline as item}
              <div class="timeline-item" class:release={item.type === 'release'}>
                <div class="timeline-marker">
                  {#if item.type === 'release'}
                    <Triangle size={12} />
                  {:else}
                    <Circle size={8} />
                  {/if}
                </div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <span class="timeline-name">{item.name}</span>
                    <span class="timeline-date">{item.date.toLocaleDateString()}</span>
                  </div>
                  {#if item.description}
                    <p class="timeline-description">{item.description}</p>
                  {/if}
                  {#if isSubsystemMember()}
                    <button 
                      class="btn btn-primary btn-sm"
                      on:click={() => createBuildFromRelease(item)}
                    >
                      <Settings size={14} />
                      Create Build
                    </button>
                  {:else}
                    <!-- Debug: Show why button is not visible -->
                    <p style="color: red; font-size: 12px;">Not a member or timeline empty. Timeline length: {timeline.length}</p>
                  {/if}
                </div>
              </div>
            {:else}
              <p>No timeline items found. Timeline data: {JSON.stringify(timeline)}</p>
            {/each}
          </div>
        </div>
      </section>
    {:else}
      <div class="no-onshape">
        <p>This subsystem is not linked to an OnShape document.</p>
      </div>
    {/if}
  </main>

  <!-- Build Modal -->
  {#if showBuildModal}
    <div class="modal-overlay">
      <div class="modal modal-large">
        <div class="modal-header">
          <h2>Build BOM - {selectedVersion?.name}</h2>
          <button class="close-btn" on:click={() => showBuildModal = false}>×</button>
        </div>
        
        <div class="modal-content">
          {#if loadingBOM}
            <div class="loading-container">
              <div class="loading-spinner"></div>
              <p>Loading BOM...</p>
            </div>
          {:else}
            <div class="bom-actions">
              <button class="btn btn-warning" on:click={addAllCOTSToPurchasing}>
                <ShoppingCart size={16} />
                Add All COTS to Purchasing
              </button>
              <button class="btn btn-primary" on:click={manufactureIteration}>
                <Zap size={16} />
                Manufacture Iteration
              </button>
              <button class="btn btn-secondary" on:click={buildDuplicate}>
                <Copy size={16} />
                Build Duplicate
              </button>
            </div>

            <div class="bom-table-container">
              <table class="bom-table">
                <thead>
                  <tr>
                    <th>Part Name</th>
                    <th>Part Number</th>
                    <th>Qty</th>
                    <th>Type</th>
                    <th>Material</th>
                    <th>Workflow</th>
                    <th>Stock Assignment</th>
                    <th>Action</th>
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
                      <td>{item.workflow || '-'}</td>
                      <td>
                        <select bind:value={item.stock_assignment}>
                          <option value="">Select Stock</option>
                          {#each stockTypes as stock}
                            <option value="{stock.material} - {stock.stock_type}">
                              {stock.material} - {stock.stock_type}
                            </option>
                          {/each}
                        </select>
                      </td>
                      <td>
                        <button class="btn btn-sm btn-outline">
                          <Plus size={14} />
                          Add
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="modal-actions">
              <button class="btn btn-secondary" on:click={() => showBuildModal = false}>
                Cancel
              </button>
              <button 
                class="btn btn-primary" 
                on:click={confirmBuild}
                disabled={loadingBuild}
              >
                {#if loadingBuild}
                  <div class="spinner-small"></div>
                {:else}
                  <Settings size={16} />
                {/if}
                Create Build
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{:else}
  <div class="error-container">
    <h2>Subsystem Not Found</h2>
    <p>The requested subsystem could not be found.</p>
    <button class="btn btn-primary" on:click={() => goto('/cad')}>
      Back to CAD
    </button>
  </div>
{/if}

<style>
  .main-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    text-decoration: none;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .back-button:hover {
    background: var(--background);
    border-color: var(--primary);
    color: var(--primary);
  }

  .header-info h1 {
    margin: 0;
    color: var(--text);
    font-size: 2rem;
    font-weight: 600;
  }

  .subsystem-description {
    margin: 0.5rem 0 0 0;
    color: var(--secondary);
  }

  .timeline-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .timeline-section h2 {
    margin: 0 0 1.5rem 0;
    color: var(--text);
    font-size: 1.5rem;
    font-weight: 600;
  }

  .timeline {
    position: relative;
    padding-left: 2rem;
  }

  .timeline::before {
    content: '';
    position: absolute;
    left: 0.75rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border);
  }

  .timeline-item {
    position: relative;
    margin-bottom: 2rem;
    padding-left: 2rem;
  }

  .timeline-marker {
    position: absolute;
    left: -2rem;
    top: 0.25rem;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 50%;
    color: var(--secondary);
  }

  .timeline-item.release .timeline-marker {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--surface);
  }

  .timeline-content {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .timeline-name {
    font-weight: 600;
    color: var(--text);
  }

  .timeline-date {
    font-size: 0.875rem;
    color: var(--secondary);
  }

  .timeline-description {
    margin: 0.5rem 0;
    color: var(--secondary);
    font-size: 0.875rem;
  }

  .no-onshape {
    text-align: center;
    padding: 3rem;
    color: var(--secondary);
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--surface);
    border-radius: 12px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-large {
    width: 1200px;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    color: var(--text);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--background);
    color: var(--text);
  }

  .modal-content {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .bom-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .bom-table-container {
    overflow-x: auto;
    margin-bottom: 1.5rem;
  }

  .bom-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
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
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .type-cots {
    background: var(--warning);
    color: var(--primary);
  }

  .type-manufactured {
    background: var(--success);
    color: var(--primary);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: var(--background);
    border-color: var(--primary);
    color: var(--primary);
  }

  .btn-primary {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--surface);
  }

  .btn-primary:hover {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--surface);
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--secondary);
    border-color: var(--secondary);
    color: var(--surface);
  }

  .btn-warning {
    background: var(--warning);
    border-color: var(--warning);
    color: var(--primary);
  }

  .btn-outline {
    background: transparent;
    border-color: var(--border);
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--secondary);
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--border);
    border-top: 2px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  .spinner-small {
    width: 1rem;
    height: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-top: 1px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error-container {
    text-align: center;
    padding: 3rem;
  }

  .error-container h2 {
    color: var(--text);
    margin-bottom: 1rem;
  }

  .error-container p {
    color: var(--secondary);
    margin-bottom: 2rem;
  }

  select {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.875rem;
  }
</style>
