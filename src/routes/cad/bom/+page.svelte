<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { onShapeAPI } from '$lib/onshape.js';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Plus, CheckCircle, ShoppingCart, Zap, Package } from 'lucide-svelte';
  import stockData from '$lib/stock.json';

  // Get subsystem ID and version ID from URL params
  let subsystemId = $page.url.searchParams.get('subsystem');
  let versionId = $page.url.searchParams.get('version');
  
  let user = null;
  let loading = true;
  let subsystem = null;
  let version = null;
  let buildBOM = [];
  let addedPartsSet = new Set();
  let processingAdd = false;
  onMount(async () => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      goto('/');
      return;
    }    // Use session user data directly - no database lookup needed
    user = {
      id: session.user.id,
      email: session.user.email,
      full_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
      role: 'member',
      permissions: ['basic']
    };
    
    userStore.set(user);
    console.log('User set from auth data:', user);

    await loadData();
  });  async function loadData() {
    if (!subsystemId || !versionId) {
      alert('Missing subsystem or version ID');
      goto('/cad');
      return;
    }

    try {
      // Load subsystem data first
      const { data: subsystemData, error: subsystemError } = await supabase
        .from('subsystems')
        .select('*')
        .eq('id', subsystemId)
        .single();

      if (subsystemError) throw subsystemError;
      subsystem = subsystemData;

      // Get the actual version name from Onshape API
      if (subsystem.onshape_document_id) {
        try {
          const allVersions = await onShapeAPI.getDocumentVersions(subsystem.onshape_document_id);
          const currentVersion = allVersions.find(v => v.id === versionId);
          
          if (currentVersion) {
            version = { 
              id: versionId, 
              name: currentVersion.name || `Version ${versionId.substring(0, 8)}` 
            };
          } else {
            // Fallback if version not found
            version = { id: versionId, name: `Version ${versionId.substring(0, 8)}` };
          }
        } catch (versionError) {
          console.error('Error fetching version name:', versionError);
          // Fallback to short version of ID
          version = { id: versionId, name: `Version ${versionId.substring(0, 8)}` };
        }
      } else {
        // No Onshape document, use fallback
        version = { id: versionId, name: `Version ${versionId.substring(0, 8)}` };
      }

      console.log('Version data loaded:', version);

      // Load BOM
      await loadBOM();
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data: ' + error.message);
      
      // Even if subsystem loading fails, create a mock subsystem to allow BOM operations
      if (!subsystem) {
        subsystem = {
          id: subsystemId,
          name: `Subsystem ${subsystemId}`,
          onshape_document_id: '',
          onshape_workspace_id: '',
          onshape_element_id: ''
        };
      }
      
      // Set fallback version data
      if (!version) {
        version = { id: versionId, name: `Version ${versionId.substring(0, 8)}` };
      }
    } finally {
      loading = false;
    }
  }
  async function loadBOM() {
    try {
      // Get BOM from OnShape
      const bom = await onShapeAPI.getAssemblyBOM(
        subsystem.onshape_document_id,
        subsystem.onshape_workspace_id,
        subsystem.onshape_element_id,
        versionId
      );

      // Analyze and categorize BOM
      buildBOM = await onShapeAPI.analyzeBOM(bom, subsystem.onshape_workspace_id);
      
      // Auto-assign stock for all manufactured parts
      buildBOM.forEach((part, index) => {
        if (part.part_type === 'manufactured') {
          autoAssignStock(index);
        }
      });

    } catch (error) {
      console.error('Error loading BOM:', error);
      console.log('Creating mock BOM data for testing...');
      
      // Create mock BOM data for testing when OnShape API fails
      buildBOM = [
        {
          part_name: '18t HTD pulley',
          part_number: 'P002570',
          quantity: 4,
          part_type: 'manufactured',
          workflow: 'mill',
          material: 'Aluminum',
          onshape_part_id: 'mock_part_id_1',
          bounding_box_x: 50,
          bounding_box_y: 50,
          bounding_box_z: 10
        }
      ];
      
      // Auto-assign stock for mock parts
      buildBOM.forEach((part, index) => {
        if (part.part_type === 'manufactured') {
          autoAssignStock(index);
        }
      });
      
      alert('Failed to load BOM from OnShape. Using mock data for testing.');
    }
  }

  function autoAssignStock(index) {
    const part = buildBOM[index];
    if (!part || part.part_type === 'COTS') return;

    const workflow = part.workflow || 'mill';
    const stocks = getStocksForWorkflow(workflow);
    
    if (stocks.length > 0) {
      // Simple auto-assignment logic based on bounding box
      const volume = (part.bounding_box_x || 0) * (part.bounding_box_y || 0) * (part.bounding_box_z || 0);
      
      // Find best fitting stock
      const suitableStock = stocks.find(stock => {
        // This is a simplified logic - you might want more sophisticated matching
        return true; // For now, just assign the first available stock
      });

      if (suitableStock) {
        part.stock_assignment = suitableStock.description;
      }
    }
  }

  function getStocksForWorkflow(workflow) {
    return stockData[workflow] || [];
  }

  function updatePartType(index, newType) {
    if (buildBOM[index]) {
      buildBOM[index].part_type = newType;
      
      if (newType === 'COTS') {
        buildBOM[index].workflow = 'purchase';
        buildBOM[index].manufacturing_process = null;
      } else {
        buildBOM[index].workflow = buildBOM[index].manufacturing_process || 'mill';
      }
      
      autoAssignStock(index);
      buildBOM = [...buildBOM]; // Force reactivity
    }
  }

  function updateWorkflow(index, newWorkflow) {
    if (buildBOM[index]) {
      buildBOM[index].workflow = newWorkflow;
      buildBOM[index].manufacturing_process = newWorkflow === 'purchase' ? null : newWorkflow;
      
      autoAssignStock(index);
      buildBOM = [...buildBOM]; // Force reactivity
    }
  }
  async function addPartToManufacturing(item) {
    console.log('addPartToManufacturing called with:', item);
    console.log('Current user:', user);
    console.log('Current version:', version);
    
    if (!user || !version) {
      console.error('Missing user or version:', { user, version });
      alert('User or version not available');
      return;
    }

    // Check if already added
    const partKey = item.part_number || item.part_name || `${item.part_name}_${Date.now()}`;
    if (addedPartsSet.has(partKey)) {
      alert('Part already added to manufacturing queue');
      return;
    }

    // Only add manufactured parts
    if (item.part_type === 'COTS') {
      alert('COTS items are not added to manufacturing queue.');
      return;
    }    processingAdd = true;
    
    try {      // Determine file format based on workflow
      let file_format = null;
      const workflow = item.workflow || item.manufacturing_process;
      const partId = item.onshape_part_id;
      const partStudioElementId = item.onshape_part_studio_element_id; // Use Part Studio element ID
      const wvm = 'v';
      const wvmid = version.id;

      // Validate that we have the Part Studio element ID
      if (!partStudioElementId) {
        throw new Error(`Missing Part Studio element ID for part "${item.part_name}". Cannot download file without Part Studio reference.`);
      }

      // Determine file format based on workflow
      if (workflow === 'router') {
        file_format = 'parasolid';
      } else if (workflow === '3d-print') {
        file_format = 'stl';
      } else if (workflow === 'laser-cut' || workflow === 'lathe' || workflow === 'mill') {
        file_format = 'parasolid'; // Use parasolid for machining operations
      } else {
        file_format = 'step'; // Default fallback
      }

      const project_id = `${subsystem.name}-${version.name}`;

      // Insert into parts table with Onshape API parameters
      const { data: partData, error: partsError } = await supabase
        .from('parts')
        .insert([{
          name: item.part_name || item.part_number || "Unnamed Part",
          requester: user.display_name || user.full_name || user.email,
          project_id,
          workflow,
          status: 'pending',
          quantity: item.quantity || 1,
          material: item.material || '',
          // Onshape API fields - use Part Studio element ID for downloads
          onshape_document_id: subsystem.onshape_document_id,
          onshape_wvm: wvm,
          onshape_wvmid: wvmid,
          onshape_element_id: partStudioElementId, // Part Studio element ID (not assembly)
          onshape_part_id: partId,
          file_format: file_format,
          is_onshape_part: true,
          // Leave legacy fields empty for Onshape parts
          file_name: '',
          file_url: ''
        }])
        .select();

      if (partsError) throw partsError;

      console.log('Part added to manufacturing queue:', partData);

      // Mark as added
      addedPartsSet = new Set([...addedPartsSet, partKey]);
      buildBOM = [...buildBOM]; // Force reactivity

      alert(`Successfully added ${item.part_name} to manufacturing queue!`);
      
    } catch (error) {
      console.error('Error adding part:', error);
      alert('Failed to add part: ' + error.message);
    } finally {
      processingAdd = false;
    }
  }

  function handleAddClick(item) {
    console.log('Add button clicked for:', item);
    addPartToManufacturing(item);
  }

  async function addAllCOTSToPurchasing() {
    const cotsItems = buildBOM.filter(item => item.part_type === 'COTS');
    if (cotsItems.length === 0) {
      alert('No COTS items found in BOM');
      return;
    }

    try {
      // Add all COTS items to purchasing
      for (const item of cotsItems) {
        const { error } = await supabase
          .from('purchasing')
          .insert([{
            name: item.part_name || item.part_number || "Unnamed Part",
            requester: user.display_name || user.full_name || user.email,
            project_id: `${subsystem.name}-${version.name}`,
            quantity: item.quantity || 1,
            material: item.material || '',
            status: 'pending'
          }]);

        if (error) throw error;
      }

      alert(`Successfully added ${cotsItems.length} COTS items to purchasing!`);
    } catch (error) {
      console.error('Error adding COTS items:', error);
      alert('Failed to add COTS items: ' + error.message);
    }
  }
</script>

<div class="main-content">
  <div class="page-header">
    <div class="header-content">
      <button class="back-button" on:click={() => goto('/cad')}>
        <ArrowLeft size={16} />
        Back to CAD
      </button>
      <div class="header-info">
        <h1>Build BOM</h1>
        {#if subsystem && version}
          <p class="subsystem-description">{subsystem.name} - {version.name}</p>
        {/if}
      </div>
    </div>
  </div>

  {#if loading}
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading BOM...</p>
    </div>
  {:else}
    <div class="bom-section">
      <div class="bom-actions">
        <button class="btn btn-warning" on:click={addAllCOTSToPurchasing}>
          <ShoppingCart size={16} />
          Add All COTS to Purchasing
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
              <th>Workflow</th>
              <th>Material</th>
              <th>Dimensions</th>
              <th>Stock Assignment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {#each buildBOM as item, index}
              <tr>
                <td>
                  <div class="part-name">
                    {item.part_name}
                    {#if item.description}
                      <div class="part-description">{item.description}</div>
                    {/if}
                  </div>
                </td>
                <td>{item.part_number || '-'}</td>
                <td>{item.quantity}</td>
                <td>
                  <select
                    class="type-dropdown {item.part_type === 'COTS' ? 'type-cots' : 'type-manufactured'}"
                    value={item.part_type}
                    on:change={(e) => updatePartType(index, e.target.value)}
                  >
                    <option value="COTS">COTS</option>
                    <option value="manufactured">Manufactured</option>
                  </select>
                </td>
                <td>
                  {#if item.part_type === 'COTS'}
                    <span class="workflow-badge workflow-purchase">Purchase</span>
                  {:else}
                    <select 
                      class="workflow-dropdown workflow-{item.workflow || 'mill'}" 
                      value={item.workflow || 'mill'} 
                      on:change={(e) => updateWorkflow(index, e.target.value)}
                    >
                      <option value="3d-print">3D Print</option>
                      <option value="laser-cut">Laser Cut</option>
                      <option value="lathe">Lathe</option>
                      <option value="mill">Mill</option>
                      <option value="router">Router</option>
                    </select>
                  {/if}
                </td>
                <td>{item.material || '-'}</td>
                <td>
                  {#if item.bounding_box_x && item.bounding_box_y && item.bounding_box_z}
                    <div class="bounding-box">
                      {(item.bounding_box_x * 1000).toFixed(1)} × {(item.bounding_box_y * 1000).toFixed(1)} × {(item.bounding_box_z * 1000).toFixed(1)} mm
                    </div>
                  {:else}
                    <span class="no-data">No dimensions</span>
                  {/if}
                </td>
                <td>
                  <select bind:value={item.stock_assignment}>
                    <option value="">Select Stock</option>
                    {#each getStocksForWorkflow(item.workflow || 'mill') as stock}
                      <option value={stock.description}>
                        {stock.description}
                      </option>
                    {/each}
                  </select>
                </td>
                <td>
                  <button
                    class="btn btn-sm btn-primary add-btn"
                    on:click={() => handleAddClick(item)}
                    disabled={addedPartsSet.has(item.part_number || item.part_name) || processingAdd}
                    class:added={addedPartsSet.has(item.part_number || item.part_name)}
                  >
                    {#if addedPartsSet.has(item.part_number || item.part_name)}
                      <CheckCircle size={14} />
                      Added
                    {:else}
                      <Plus size={14} />
                      Add
                    {/if}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .main-content {
    max-width: 1400px;
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
    cursor: pointer;
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

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    gap: 1rem;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top: 3px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .bom-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .bom-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-dark);
  }

  .btn-warning {
    background: #ff9800;
    color: white;
  }

  .btn-warning:hover {
    background: #f57c00;
  }

  .btn-sm {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
  }

  .bom-table-container {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
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
    font-weight: 600;
    color: var(--text);
  }

  .bom-table tr:hover {
    background: var(--background);
  }

  .part-name {
    font-weight: 500;
  }

  .part-description {
    font-size: 0.75rem;
    color: var(--secondary);
    margin-top: 0.25rem;
  }

  .type-dropdown,
  .workflow-dropdown {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.8125rem;
    background: white;
    cursor: pointer;
  }

  .type-cots {
    background: #fff8e1 !important;
    color: #f57f17 !important;
    border-color: #ffcc02 !important;
  }

  .type-manufactured {
    background: #e1f5fe !important;
    color: #0277bd !important;
    border-color: #81d4fa !important;
  }

  .workflow-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .workflow-purchase {
    background: #fff8e1;
    color: #f57f17;
  }

  .bounding-box {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .no-data {
    color: var(--secondary);
    font-style: italic;
  }

  .add-btn {
    min-width: 80px;
  }

  .add-btn.added {
    background: #e8f5e8 !important;
    color: #388e3c !important;
    border: 1px solid #a5d6a7 !important;
    cursor: not-allowed !important;
  }

  .add-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  select {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.8125rem;
    background: white;
    cursor: pointer;
  }
</style>
