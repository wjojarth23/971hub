<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';  import { Zap, Plus, Download, Square, Circle, RotateCw, Scissors, FileText, Package, AlertTriangle } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import stockData from '$lib/stock.json';
  import { NestingEngine, SVGProcessor, SheetSelector } from '$lib/nesting.js';

  let user = null;
  let loading = true;
  let currentView = 'overview'; // 'overview', 'sheets', 'layout'
  let stockRequests = [];
  let sheets = [];
  let selectedStockType = null;
  let selectedSheet = null;
  let availableParts = [];
  let selectedParts = [];
  let layoutPreview = null;
  let isLayouting = false;
  let showCreateSheetModal = false;
  let newSheet = {
    stock_type_id: '',
    width: 24,
    height: 48,
    material: '',
    thickness: 0,
    location: ''
  };

  // Available stock types for laser cutting
  $: laserStockTypes = stockData['laser-cut'] || [];

  onMount(async () => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      goto('/');
      return;
    }

    user = {
      id: session.user.id,
      email: session.user.email,
      full_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0]
    };
    
    userStore.set(user);
    await loadStockRequests();
    loading = false;
  });  async function loadStockRequests() {
    try {
      // Debug: Log available laser stock types
      console.log('Available laser stock types:', laserStockTypes);
      
      // Load parts that need to be cut (pending/in-progress laser-cut parts without sheets)
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('workflow', 'laser-cut')
        .in('status', ['pending', 'in-progress'])
        .is('sheet_id', null) // Only uncut parts
        .is('cut_date', null); // Double-check not already cut
      
      if (error) throw error;
      
      console.log(`Found ${data.length} parts needing laser cutting`, data);// Group by stock_type instead of generic material
      const requests = {};
      data.forEach(part => {
        // Use the stock_type field from parts, or derive from stock_assignment
        let stockType;
        let stockInfo;
        
        console.log('Processing part:', part.name, 'stock_assignment:', part.stock_assignment, 'material:', part.material);
        
        if (part.stock_type) {
          // Direct stock type ID (preferred)
          stockType = part.stock_type;
          stockInfo = laserStockTypes.find(s => s.id === stockType);
          console.log('Using direct stock_type:', stockType);
        } else if (part.stock_assignment) {
          // Find stock by description match (exact match first)
          stockInfo = laserStockTypes.find(s => s.description === part.stock_assignment);
          
          // If exact match fails, try trimming whitespace and case insensitive
          if (!stockInfo) {
            stockInfo = laserStockTypes.find(s => 
              s.description.toLowerCase().trim() === part.stock_assignment.toLowerCase().trim()
            );
          }
          
          stockType = stockInfo?.id;
          console.log('Looking for stock_assignment:', part.stock_assignment, 'found stockInfo:', stockInfo, 'stockType:', stockType);
        }
        
        // Fallback to generic material grouping only if no stock info found
        if (!stockType || !stockInfo) {
          console.log('Using fallback material grouping for:', part.material);
          const materialLower = part.material?.toLowerCase() || 'unknown';
          stockType = `${materialLower}_sheet`;
          stockInfo = laserStockTypes.find(s => 
            s.material.toLowerCase() === part.material?.toLowerCase()
          );
        }
        
        console.log('Final stock_type_id:', stockType, 'stockInfo:', stockInfo);
        
        if (!requests[stockType]) {
          requests[stockType] = {
            stock_type_id: stockType,
            stock_info: stockInfo,
            material: stockInfo?.material || part.material,
            description: stockInfo?.description || `${part.material} Sheet`,
            thickness: stockInfo?.thickness,
            workflow: part.workflow,
            parts: [],
            total_quantity: 0,
            estimated_area: 0
          };
        }
        requests[stockType].parts.push(part);
        requests[stockType].total_quantity += part.quantity || 1;
        
        // Rough area estimation (assuming rectangular parts)
        if (part.layout_x && part.layout_y) {
          requests[stockType].estimated_area += (part.layout_x * part.layout_y * (part.quantity || 1));
        }
      });
      
      stockRequests = Object.values(requests);
    } catch (error) {
      console.error('Error loading stock requests:', error);
    }
  }
  async function loadSheetsForStock(stockRequest) {
    try {
      const { data, error } = await supabase
        .from('sheet_utilization')  // Use the view for better data
        .select('*')
        .eq('stock_type_id', stockRequest.stock_type_id)
        .eq('status', 'available')
        .order('remaining_area', { ascending: false }); // Largest remaining area first
      
      if (error) throw error;
      sheets = data || [];
      selectedStockType = stockRequest;
      currentView = 'sheets';
    } catch (error) {
      console.error('Error loading sheets:', error);
    }
  }  async function selectSheet(sheet) {
    selectedSheet = sheet;
    
    // Load parts that match this specific stock type
    const stockRequest = stockRequests.find(req => 
      req.stock_type_id === sheet.stock_type_id
    );
    
    if (stockRequest) {
      availableParts = stockRequest.parts;
      selectedParts = [...availableParts]; // Start with all parts selected
      currentView = 'layout';
      
      // Load existing cut areas for this sheet
      await loadExistingCutAreas(sheet.id);
      
      // Auto-suggest optimal sheet if needed
      await findOptimalSheet();
    }
  }
  async function loadExistingCutAreas(sheetId) {
    try {
      const { data, error } = await supabase
        .from('sheets')
        .select('cut_areas, cut_svg_url, remaining_area')
        .eq('id', sheetId)
        .single();
      
      if (error) throw error;
      
      // Ensure cut_areas is a valid array
      const cutAreas = data?.cut_areas || [];
      selectedSheet.existingCutAreas = Array.isArray(cutAreas) ? cutAreas : [];
      selectedSheet.cut_svg_url = data?.cut_svg_url;
      selectedSheet.remaining_area = data?.remaining_area || selectedSheet.total_area;
      
      console.log(`Loaded ${selectedSheet.existingCutAreas.length} existing cut areas for sheet ${sheetId}`);
      console.log(`Remaining area: ${selectedSheet.remaining_area} sq in`);
      
      // Validate cut area format
      selectedSheet.existingCutAreas = selectedSheet.existingCutAreas.filter(area => 
        area && typeof area.x === 'number' && typeof area.y === 'number' && 
        typeof area.width === 'number' && typeof area.height === 'number'
      );
      
    } catch (error) {
      console.error('Error loading existing cut areas:', error);
      selectedSheet.existingCutAreas = [];
      selectedSheet.remaining_area = selectedSheet.total_area;
    }
  }async function findOptimalSheet() {
    if (selectedParts.length === 0) return;
    
    try {
      const result = await SheetSelector.findOptimalSheet(
        selectedParts, 
        sheets,
        {
          allowRotation: true,
          areaBuffer: 0.5, // 50% buffer
          spacing: 0.1,    // 0.1" spacing between parts
          margin: 0.2,     // 0.2" margin from sheet edges
          existingCutAreas: selectedSheet?.existingCutAreas || []
        }
      );
      
      if (result.success) {
        selectedSheet = result.optimalSheet;
        // Load existing cut areas for the optimal sheet
        await loadExistingCutAreas(selectedSheet.id);
        layoutPreview = result.layout;
        
        // Show efficiency information
        console.log(`Optimal sheet selected: ${result.optimalSheet.id}`);
        console.log(`Layout efficiency: ${(result.layout.efficiency * 100).toFixed(1)}%`);
        console.log(`Parts that fit: ${result.layout.placements.length}/${selectedParts.length}`);
        
        if (result.layout.failedParts.length > 0) {
          alert(`${result.layout.failedParts.length} parts could not fit and will need manual placement or a different sheet.`);
        }
      } else {
        alert(result.error + '. Please add more stock or reduce the number of parts.');
        console.error('Sheet selection failed:', result);
      }
    } catch (error) {
      console.error('Error finding optimal sheet:', error);
      alert('Error finding optimal sheet: ' + error.message);
    }
  }  async function performAutoLayout() {
    if (!selectedSheet || selectedParts.length === 0) return;
    
    isLayouting = true;
    
    try {
      console.log('Starting auto-layout with nesting engine...');
      const nestingEngine = new NestingEngine({
        allowRotation: true,
        rotationAngles: [0, 90, 180, 270],
        spacing: 0.1,     // 0.1" minimum spacing between parts
        margin: 0.2       // 0.2" margin from sheet edges
      });
      
      // Pass existing cut areas to avoid collisions
      const result = await nestingEngine.nestParts(
        selectedParts, 
        selectedSheet, 
        selectedSheet.existingCutAreas || []
      );
      
      if (result.placements.length === 0) {
        alert('No parts could be placed on this sheet. Try a larger sheet or fewer parts.');
        return;
      }
      
      layoutPreview = {
        sheet: selectedSheet,
        positions: result.placements,
        totalArea: result.totalAreaUsed,
        efficiency: result.efficiency,
        failedParts: result.failedParts,
        utilizationPercent: result.utilizationPercent,
        newCutAreas: result.newCutAreas
      };
      
      console.log(`Layout complete: ${result.placements.length}/${selectedParts.length} parts placed`);
      console.log(`Efficiency: ${(result.efficiency * 100).toFixed(1)}%`);
      console.log(`New cut areas: ${result.newCutAreas.length}`);
      
      if (result.failedParts.length > 0) {
        alert(`${result.failedParts.length} parts could not fit. Consider using a larger sheet or removing some parts.`);
      }
      
    } catch (error) {
      console.error('Error performing layout:', error);
      alert('Layout failed: ' + error.message);
    } finally {
      isLayouting = false;
    }
  }
  async function exportAndCut() {
    if (!layoutPreview || !selectedSheet) return;
    
    try {
      // Generate SVG for cutting using the new structure (new parts only)
      const cutSvg = generateCutSVG(layoutPreview);
      
      // Generate master sheet SVG showing all cut areas
      const allCutAreas = [...(selectedSheet.existingCutAreas || []), ...layoutPreview.newCutAreas];
      const masterSvg = SVGProcessor.generateMasterSheetSVG(selectedSheet, allCutAreas);
      
      // Upload SVGs to storage bucket
      const cutFileName = `cut_${selectedSheet.id}_${new Date().toISOString().replace(/:/g, '-')}.svg`;
      const masterFileName = `master_${selectedSheet.id}_${new Date().toISOString().replace(/:/g, '-')}.svg`;
      
      // Upload cut SVG to sheets bucket
      const { data: cutUpload, error: cutUploadError } = await supabase.storage
        .from('sheets')
        .upload(cutFileName, new Blob([cutSvg], { type: 'image/svg+xml' }));
      
      if (cutUploadError) throw cutUploadError;
      
      // Upload master SVG to sheets bucket
      const { data: masterUpload, error: masterUploadError } = await supabase.storage
        .from('sheets')
        .upload(masterFileName, new Blob([masterSvg], { type: 'image/svg+xml' }));
      
      if (masterUploadError) throw masterUploadError;
      
      // Get public URLs
      const { data: { publicUrl: cutUrl } } = supabase.storage
        .from('sheets')
        .getPublicUrl(cutFileName);
      
      const { data: { publicUrl: masterUrl } } = supabase.storage
        .from('sheets')
        .getPublicUrl(masterFileName);
      
      // Create cut record
      const { data: cutData, error: cutError } = await supabase
        .from('sheet_cuts')
        .insert({
          sheet_id: selectedSheet.id,
          part_ids: layoutPreview.positions.map(p => p.part.id),
          cut_svg_url: cutUrl,
          layout_data: layoutPreview,
          cut_areas: layoutPreview.newCutAreas,
          cut_by: user.id,
          area_used: layoutPreview.totalArea
        })
        .select()
        .single();
      
      if (cutError) throw cutError;
      
      // Update parts with sheet assignment and layout positions
      for (const position of layoutPreview.positions) {
        const { error: partError } = await supabase
          .from('parts')
          .update({
            sheet_id: selectedSheet.id,
            layout_x: position.x,
            layout_y: position.y,
            layout_rotation: position.rotation,
            status: 'cammed', // Mark as ready for cutting
            cut_date: new Date().toISOString()
          })
          .eq('id', position.part.id);
        
        if (partError) console.error('Error updating part:', partError);
      }
        // Update sheet with new cut areas and remaining area
      const updatedCutAreas = [...(selectedSheet.existingCutAreas || []), ...layoutPreview.newCutAreas];
      const newRemainingArea = Math.max(0, selectedSheet.remaining_area - layoutPreview.totalArea);
      
      const { error: sheetError } = await supabase
        .from('sheets')
        .update({
          remaining_area: newRemainingArea,
          cut_areas: updatedCutAreas,
          cut_svg_url: masterUrl, // URL to master SVG showing all cuts
          status: newRemainingArea < 10 ? 'exhausted' : 'in-use', // Mark as exhausted if < 10 sq in
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSheet.id);
      
      if (sheetError) throw sheetError;
      
      console.log(`Sheet updated: ${updatedCutAreas.length} total cut areas, ${newRemainingArea.toFixed(1)} sq in remaining`);
      
      // Download the cut SVG file (only new parts)
      downloadSVG(cutSvg, cutFileName);
      
      // Reset view
      currentView = 'overview';
      selectedSheet = null;
      selectedParts = [];
      layoutPreview = null;
      
      await loadStockRequests();
      
      alert(`Cut file generated successfully! Parts marked as cammed.\nCut SVG: ${cutFileName}\nMaster SVG: ${masterFileName}`);
      
    } catch (error) {
      console.error('Error exporting cut:', error);
      alert('Error generating cut file: ' + error.message);
    }
  }  function generateCutSVG(layout) {
    return SVGProcessor.generateCutSVG(layout, selectedSheet);
  }

  function downloadSVG(svg, filename) {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function createNewSheet() {
    try {
      const stockType = laserStockTypes.find(st => st.id === newSheet.stock_type_id);
      if (!stockType) {
        alert('Please select a valid stock type');
        return;
      }

      const { data, error } = await supabase
        .from('sheets')
        .insert({
          stock_type_id: newSheet.stock_type_id,
          stock_description: stockType.description,
          material: stockType.material,
          thickness: stockType.thickness,
          width: newSheet.width,
          height: newSheet.height,
          remaining_area: newSheet.width * newSheet.height,
          location: newSheet.location
        })
        .select()
        .single();

      if (error) throw error;

      showCreateSheetModal = false;
      newSheet = {
        stock_type_id: '',
        width: 24,
        height: 48,
        material: '',
        thickness: 0,
        location: ''
      };

      // Refresh sheets if we're viewing them
      if (selectedStockType) {
        await loadSheetsForStock(selectedStockType);
      }

      alert('Sheet created successfully!');
    } catch (error) {
      console.error('Error creating sheet:', error);
      alert('Error creating sheet: ' + error.message);
    }
  }
</script>

<svelte:head>
  <title>Laser Cutter - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading laser cutter interface...</p>
  </div>
{:else if user}
  <div class="laser-container">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <Zap size={32} />
        <div>
          <h1>Laser Cutter Control</h1>
          <p>Manage sheet layout, nesting, and cutting operations</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" on:click={() => showCreateSheetModal = true}>
          <Plus size={16} />
          Add Sheet
        </button>
      </div>
    </div>

    <!-- Navigation -->
    <div class="nav-tabs">
      <button 
        class="nav-tab {currentView === 'overview' ? 'active' : ''}"
        on:click={() => currentView = 'overview'}
      >
        <Package size={16} />
        Stock Overview
      </button>      <button 
        class="nav-tab {currentView === 'sheets' ? 'active' : ''}"
        class:disabled={!selectedStockType}
        on:click={() => selectedStockType && (currentView = 'sheets')}
      >
        <Square size={16} />
        Sheets ({selectedStockType?.description || 'None'})
      </button>
      <button 
        class="nav-tab {currentView === 'layout' ? 'active' : ''}"
        class:disabled={!selectedSheet}
        on:click={() => selectedSheet && (currentView = 'layout')}
      >
        <Circle size={16} />
        Layout ({selectedSheet ? `Sheet ${selectedSheet.id.substring(0, 8)}` : 'None'})
      </button>
    </div>

    <!-- Content Views -->
    {#if currentView === 'overview'}
      <div class="overview-section">
        <h2>Parts Awaiting Cut</h2>
        
        {#if stockRequests.length === 0}
          <div class="empty-state">
            <Scissors size={48} />
            <h3>No parts waiting to be cut</h3>
            <p>All laser-cut parts are either completed or assigned to sheets.</p>
          </div>
        {:else}
          <div class="stock-requests-grid">
            {#each stockRequests as request}
              <div class="stock-request-card">                <div class="request-header">
                  <h3>{request.description}</h3>
                  <span class="part-count">{request.parts.length} parts</span>
                </div>
                <div class="request-details">
                  <p><strong>Stock Type:</strong> {request.stock_type_id}</p>
                  <p><strong>Material:</strong> {request.material}</p>
                  {#if request.thickness}
                    <p><strong>Thickness:</strong> {request.thickness}"</p>
                  {/if}
                  <p><strong>Total Quantity:</strong> {request.total_quantity}</p>
                  {#if request.estimated_area > 0}
                    <p><strong>Est. Area:</strong> {request.estimated_area.toFixed(1)} sq in</p>
                  {/if}
                  <div class="part-list">
                    {#each request.parts.slice(0, 3) as part}
                      <span class="part-name">{part.name}</span>
                    {/each}
                    {#if request.parts.length > 3}
                      <span class="more-parts">+{request.parts.length - 3} more</span>
                    {/if}
                  </div>
                </div>                <div class="request-actions">
                  <button 
                    class="btn btn-primary"
                    on:click={() => loadSheetsForStock(request)}
                  >
                    Select Sheets
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    {:else if currentView === 'sheets'}
      <div class="sheets-section">
        <h2>Available Sheets - {selectedStockType.material}</h2>
        
        {#if sheets.length === 0}
          <div class="empty-state">
            <AlertTriangle size={48} />
            <h3>No sheets available</h3>
            <p>Add new {selectedStockType.material} sheets to begin cutting.</p>
            <button class="btn btn-primary" on:click={() => showCreateSheetModal = true}>
              <Plus size={16} />
              Add Sheet
            </button>
          </div>
        {:else}
          <div class="sheets-grid">
            {#each sheets as sheet}
              <div class="sheet-card" class:optimal={sheet.remaining_area >= 100}>
                <div class="sheet-header">
                  <h3>Sheet {sheet.id.substring(0, 8)}</h3>
                  <span class="sheet-status status-{sheet.status}">{sheet.status}</span>
                </div>
                <div class="sheet-details">
                  <p><strong>Size:</strong> {sheet.width}" × {sheet.height}"</p>
                  <p><strong>Thickness:</strong> {sheet.thickness}"</p>
                  <p><strong>Remaining:</strong> {sheet.remaining_area.toFixed(1)} sq in</p>
                  <p><strong>Used:</strong> {sheet.utilization_percent}%</p>
                  {#if sheet.location}
                    <p><strong>Location:</strong> {sheet.location}</p>
                  {/if}
                </div>
                <div class="sheet-utilization">
                  <div class="utilization-bar">
                    <div 
                      class="utilization-fill" 
                      style="width: {sheet.utilization_percent}%"
                    ></div>
                  </div>
                </div>
                <button 
                  class="btn btn-primary"
                  on:click={() => selectSheet(sheet)}
                >
                  Select Sheet
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    {:else if currentView === 'layout'}
      <div class="layout-section">
        <h2>Layout Parts on Sheet</h2>
        
        <div class="layout-controls">          <div class="sheet-info">
            <h3>Sheet: {selectedSheet.stock_description}</h3>
            <p>{selectedSheet.width}" × {selectedSheet.height}" | {selectedSheet.remaining_area.toFixed(1)} sq in available</p>
            {#if selectedSheet.existingCutAreas && selectedSheet.existingCutAreas.length > 0}
              <p class="cut-info">
                <AlertTriangle size={14} />
                {selectedSheet.existingCutAreas.length} areas already cut
                {#if selectedSheet.cut_svg_url}
                  | <a href={selectedSheet.cut_svg_url} target="_blank" class="svg-link">View Master SVG</a>
                {/if}
              </p>
            {:else}
              <p class="cut-info">✨ Blank sheet - no areas cut yet</p>
            {/if}
          </div>
          
          <div class="layout-actions">
            <button 
              class="btn btn-secondary"
              on:click={performAutoLayout}
              disabled={selectedParts.length === 0 || isLayouting}
            >
              {#if isLayouting}
                <RotateCw size={16} class="spin" />
                Calculating...
              {:else}
                <Circle size={16} />
                Auto Layout
              {/if}
            </button>
            
            {#if layoutPreview}
              <button class="btn btn-success" on:click={exportAndCut}>
                <Download size={16} />
                Cut & Export SVG
              </button>
            {/if}
          </div>
        </div>

        <div class="parts-selection">
          <h3>Parts to Cut ({selectedParts.length})</h3>
          <div class="parts-list">
            {#each availableParts as part}
              <label class="part-checkbox">
                <input 
                  type="checkbox" 
                  bind:group={selectedParts} 
                  value={part}
                />
                <span class="part-info">
                  <strong>{part.name}</strong>
                  <small>Qty: {part.quantity || 1}</small>
                  {#if part.layout_x && part.layout_y}
                    <small>{part.layout_x}" × {part.layout_y}"</small>
                  {/if}
                </span>
              </label>
            {/each}
          </div>
        </div>

        {#if layoutPreview}
          <div class="layout-preview">
            <h3>Layout Preview</h3>
            <div class="preview-stats">
              <p><strong>Parts:</strong> {layoutPreview.positions.length}</p>
              <p><strong>Area Used:</strong> {layoutPreview.totalArea.toFixed(1)} sq in</p>
              <p><strong>Efficiency:</strong> {(layoutPreview.efficiency * 100).toFixed(1)}%</p>
            </div>            <div class="sheet-preview">
              <svg 
                width="400" 
                height="{400 * (layoutPreview.sheet.height / layoutPreview.sheet.width)}" 
                viewBox="0 0 {layoutPreview.sheet.width} {layoutPreview.sheet.height}"
              >
                <!-- Sheet outline -->
                <rect 
                  x="0" y="0" 
                  width={layoutPreview.sheet.width} 
                  height={layoutPreview.sheet.height}
                  fill="none" 
                  stroke="#ccc" 
                  stroke-width="0.1"
                />
                
                <!-- Existing cut areas (in red) -->
                {#if selectedSheet.existingCutAreas}
                  {#each selectedSheet.existingCutAreas as cutArea}
                    <rect 
                      x={cutArea.x || 0} 
                      y={cutArea.y || 0}
                      width={cutArea.width || 0}
                      height={cutArea.height || 0}
                      fill="rgba(255, 0, 0, 0.3)"
                      stroke="red"
                      stroke-width="0.05"
                    />
                    <text 
                      x={(cutArea.x || 0) + (cutArea.width || 0)/2} 
                      y={(cutArea.y || 0) + (cutArea.height || 0)/2}
                      text-anchor="middle"
                      dominant-baseline="middle"
                      font-size="0.3"
                      fill="red"
                    >
                      CUT
                    </text>
                  {/each}
                {/if}
                
                <!-- New parts (in blue) -->
                {#each layoutPreview.positions as position, i}
                  <g transform="translate({position.x}, {position.y}) rotate({position.rotation || 0})">
                    <rect 
                      x="0" 
                      y="0"
                      width={position.width}
                      height={position.height}
                      fill="rgba(59, 130, 246, 0.3)"
                      stroke="#3b82f6"
                      stroke-width="0.05"
                    />
                    <text 
                      x={position.width/2} 
                      y={position.height/2}
                      text-anchor="middle"
                      dominant-baseline="middle"
                      font-size="0.5"
                      fill="#1f2937"
                    >
                      {position.part.name?.substring(0, 3) || (i + 1)}
                    </text>
                  </g>
                {/each}
                
                <!-- Show failed parts if any -->
                {#if layoutPreview.failedParts && layoutPreview.failedParts.length > 0}
                  <text x="10" y="20" font-size="0.8" fill="red">
                    {layoutPreview.failedParts.length} parts couldn't fit
                  </text>
                {/if}
              </svg>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <!-- Create Sheet Modal -->
  {#if showCreateSheetModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-overlay" on:click={() => showCreateSheetModal = false}>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="modal-content" on:click|stopPropagation>
        <h2>Create New Sheet</h2>
        
        <div class="form-group">
          <label for="stock-type">Stock Type</label>
          <select id="stock-type" bind:value={newSheet.stock_type_id} required>
            <option value="">Select stock type</option>
            {#each laserStockTypes as stockType}
              <option value={stockType.id}>{stockType.description}</option>
            {/each}
          </select>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="width">Width (inches)</label>
            <input 
              id="width" 
              type="number" 
              bind:value={newSheet.width}
              min="1"
              step="0.1"
              required
            />
          </div>
          <div class="form-group">
            <label for="height">Height (inches)</label>
            <input 
              id="height" 
              type="number" 
              bind:value={newSheet.height}
              min="1"
              step="0.1"
              required
            />
          </div>
        </div>
        
        <div class="form-group">
          <label for="location">Location (optional)</label>
          <input 
            id="location" 
            type="text" 
            bind:value={newSheet.location}
            placeholder="e.g., Rack A, Shelf 2"
          />
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-secondary" on:click={() => showCreateSheetModal = false}>
            Cancel
          </button>
          <button class="btn btn-primary" on:click={createNewSheet}>
            Create Sheet
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .laser-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header-content h1 {
    margin: 0;
    color: var(--text);
  }

  .header-content p {
    margin: 0;
    color: var(--text-secondary);
  }

  .header-actions {
    display: flex;
    gap: 1rem;
  }

  .nav-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--border);
  }

  .nav-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
  }

  .nav-tab:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  .nav-tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }

  .nav-tab.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stock-requests-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .stock-request-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .request-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .request-header h3 {
    margin: 0;
    color: var(--text);
  }

  .part-count {
    background: var(--primary);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .request-details p {
    margin: 0.5rem 0;
    color: var(--text-secondary);
  }

  .part-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .part-name {
    background: var(--surface-hover);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text);
  }

  .more-parts {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 0.875rem;
  }

  .request-actions {
    margin-top: 1.5rem;
  }

  .sheets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .sheet-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .sheet-card.optimal {
    border-color: var(--success);
    box-shadow: 0 0 0 1px var(--success);
  }

  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .sheet-header h3 {
    margin: 0;
    color: var(--text);
  }

  .sheet-status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .status-available {
    background: var(--success-bg);
    color: var(--success);
  }

  .status-in-use {
    background: var(--warning-bg);
    color: var(--warning);
  }

  .status-exhausted {
    background: var(--error-bg);
    color: var(--error);
  }

  .sheet-details p {
    margin: 0.5rem 0;
    color: var(--text-secondary);
  }

  .sheet-utilization {
    margin: 1rem 0;
  }

  .utilization-bar {
    width: 100%;
    height: 8px;
    background: var(--surface-hover);
    border-radius: 4px;
    overflow: hidden;
  }

  .utilization-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
  }

  .layout-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding: 1rem;
    background: var(--surface);
    border-radius: 8px;
  }

  .sheet-info h3 {
    margin: 0 0 0.25rem 0;
    color: var(--text);
  }
  .sheet-info p {
    margin: 0;
    color: var(--text-secondary);
  }

  .cut-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--warning) !important;
  }

  .svg-link {
    color: var(--primary);
    text-decoration: none;
  }

  .svg-link:hover {
    text-decoration: underline;
  }

  .layout-actions {
    display: flex;
    gap: 1rem;
  }

  .parts-selection {
    margin-bottom: 2rem;
  }

  .parts-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .part-checkbox {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .part-checkbox:hover {
    background: var(--surface-hover);
  }

  .part-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .part-info strong {
    color: var(--text);
  }

  .part-info small {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .layout-preview {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .preview-stats {
    display: flex;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }

  .preview-stats p {
    margin: 0;
    color: var(--text-secondary);
  }

  .sheet-preview {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem;
    background: white;
    max-width: fit-content;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary);
  }

  .empty-state h3 {
    margin: 1rem 0 0.5rem 0;
    color: var(--text);
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

  .modal-content {
    background: var(--background);
    border-radius: 8px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-content h2 {
    margin: 0 0 1.5rem 0;
    color: var(--text);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-weight: 500;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--text);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--surface-hover);
  }

  .btn-success {
    background: var(--success);
    color: white;
  }

  .btn-success:hover {
    background: var(--success-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top: 3px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  /* CSS Variables (add to your global styles) */
  :root {
    --background: #ffffff;
    --surface: #f8fafc;
    --surface-hover: #f1f5f9;
    --border: #e2e8f0;
    --text: #1e293b;
    --text-secondary: #64748b;
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --success: #10b981;
    --success-bg: #d1fae5;
    --success-hover: #059669;
    --warning: #f59e0b;
    --warning-bg: #fef3c7;
    --error: #ef4444;
    --error-bg: #fee2e2;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --background: #0f172a;
      --surface: #1e293b;
      --surface-hover: #334155;
      --border: #334155;
      --text: #f1f5f9;
      --text-secondary: #94a3b8;
    }
  }
</style>
