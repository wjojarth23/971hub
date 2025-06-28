<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { Search, Filter, Clock, CheckCircle, Truck, Package, Download, Zap, Wrench, FileText, Upload } from 'lucide-svelte';
  import DataTable from '$lib/components/DataTable.svelte';
    
  let parts = [];
  let filteredParts = [];
  let loading = true;
  let searchTerm = '';
  let filterWorkflow = '';
  let filterStatus = '';
  let toastMessage = '';
  let showToast = false;
  let selectedPart = null;
  let showActionsModal = false;
  
  const workflows = [
    { value: 'laser-cut', label: 'Laser Cut', icon: Zap },
    { value: 'router', label: 'Router', icon: Wrench },
    { value: 'lathe', label: 'Lathe', icon: FileText },
    { value: 'mill', label: 'Mill', icon: FileText },
    { value: '3d-print', label: '3D Print', icon: Upload }
  ];
  
  const statuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'cammed', label: 'Cammed' },
    { value: 'complete', label: 'Complete' }
  ];

  onMount(async () => {
    await loadParts();
  });

  // Fixed drag and drop handlers for better Vercel compatibility
  function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('active');
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('active');
  }
  async function loadParts() {
    try {
      // Use the new view that includes Onshape parameters and download URLs
      const { data, error } = await supabase
        .from('parts_with_download_urls')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      parts = data || [];
    } catch (error) {
      console.error('Error loading parts:', error);
      alert('Error loading parts. Please try again.');
    } finally {
      loading = false;
    }
  }
  async function downloadFile(part, currentStatus) {
    try {
      console.log('Attempting to download file for part:', part.name);
      console.log('Part source type:', part.source_type);
      
      // If part is still "pending", automatically mark it as "in-progress"
      if (currentStatus === 'pending') {
        await updatePartStatus(part.id, 'in-progress');
      }
      
      if (part.source_type === 'onshape_api') {
        // Handle Onshape API download
        await downloadFromOnshape(part);
      } else {
        // Handle storage bucket download (legacy parts created via create route)
        await downloadFromStorage(part.file_name, part.id);
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      alert(`Error downloading file: ${error.message}`);
    }
  }  async function downloadFromOnshape(part) {
    try {
      console.log('Downloading from Onshape API for part:', part.name);
      console.log('Part data:', {
        name: part.name,
        workflow: part.workflow,
        file_format: part.file_format,
        onshape_document_id: part.onshape_document_id,
        onshape_element_id: part.onshape_element_id,
        onshape_part_id: part.onshape_part_id,
        onshape_wvm: part.onshape_wvm,
        onshape_wvmid: part.onshape_wvmid
      });

      // Special handling for laser cutter - download SVG instead of STEP
      if (part.workflow === 'laser-cut') {
        await downloadSVGForLaser(part);
        return;
      }

      // Use the new translation workflow for both STL and STEP
      const action = 'translate-part';
      
      // Build the API URL
      const params = new URLSearchParams({
        action: action,
        documentId: part.onshape_document_id,
        elementId: part.onshape_element_id,
        partId: part.onshape_part_id,
        wvm: part.onshape_wvm,
        wvmId: part.onshape_wvmid,
        format: part.file_format === 'stl' ? 'STL' : 'STEP'
      });
      
      console.log('API parameters:', Object.fromEntries(params.entries()));
      console.log('Full API URL:', `/api/onshape?${params}`);
      
      showToastMessage('Download requested...');
      
      const response = await fetch(`/api/onshape?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error Response:', errorData);
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
        // Create blob and download
      const blob = await response.blob();
      const fileExt = part.file_format === 'stl' ? 'stl' : 'step';
      const fileName = `${part.name.replace(/[^a-zA-Z0-9]/g, '_')}.${fileExt}`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Onshape file downloaded successfully:', fileName);
      showToastMessage(`${fileExt.toUpperCase()} file downloaded successfully!`);
    } catch (error) {
      console.error('Error downloading from Onshape:', error);
      showToastMessage(`Error downloading file: ${error.message}`);
      throw error;
    }
  }
  async function downloadFromStorage(fileName, partId) {
    try {
      console.log('Downloading from storage bucket:', fileName);
      showToastMessage('Download requested...');
      
      // Try to create signed URL for the filename as stored
      let { data, error } = await supabase.storage
        .from('manufacturing-files')
        .createSignedUrl(fileName, 60); // URL expires in 60 seconds
      
      // If that fails, it might be URL encoded, so try decoding it
      if (error && error.message.includes('Object not found')) {
        console.log('First attempt failed, trying decoded filename...');
        const decodedFileName = decodeURIComponent(fileName);
        console.log('Decoded filename:', decodedFileName);
        const result = await supabase.storage
          .from('manufacturing-files')
          .createSignedUrl(decodedFileName, 60);
        data = result.data;
        error = result.error;
      }
      
      if (error) throw error;
      
      console.log('Signed URL generated successfully:', data.signedUrl);
      
      // Open the signed URL in a new tab
      window.open(data.signedUrl, '_blank');
      showToastMessage('File download started!');
    } catch (error) {
      console.error('Error downloading from storage:', error);
      showToastMessage(`Error downloading file: ${error.message}`);
      throw new Error(`Error downloading file: ${error.message}. The file may have been deleted or the filename may be incorrect.`);
    }
  }

  async function uploadGcodeFile(partId, file) {
    try {
      // Upload G-code file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_gcode_${partId}.${fileExt}`;
      
      console.log('Uploading G-code file:', fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('manufacturing-files')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      console.log('G-code file uploaded successfully:', uploadData.path);
      
      // Get the public URL for the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from('manufacturing-files')
        .getPublicUrl(fileName);
      
      // Update the part with G-code file info and change status to 'cammed'
      const { error: updateError } = await supabase
        .from('parts')
        .update({ 
          gcode_file_name: fileName,
          gcode_file_url: publicUrl,
          status: 'cammed',
          updated_at: new Date().toISOString()
        })
        .eq('id', partId);
      
      if (updateError) throw updateError;
      
      await loadParts();
      alert('G-code file uploaded successfully! Part status updated to Cammed.');
    } catch (error) {
      console.error('Error uploading G-code file:', error);
      alert(`Error uploading G-code file: ${error.message}`);
    }
  }

  function handleGcodeFileUpload(event, partId) {
    const file = event.target.files[0];
    if (file) {
      uploadGcodeFile(partId, file);
      event.target.value = ''; // Reset input
    }
  }

  function handleGcodeDrop(event, partId) {
    event.preventDefault();
    event.currentTarget.classList.remove('active');
      const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const allowedExtensions = ['gcode', 'nc', 'cnc', 'tap', 'ngc'];
      
      if (!allowedExtensions.includes(fileExtension)) {
        alert('Please upload a G-code file (.gcode, .nc, .cnc, .tap, or .ngc)');
        return;
      }
      
      uploadGcodeFile(partId, file);
    }
  }

  async function updatePartStatus(partId, newStatus) {
    try {
      const { error } = await supabase
        .from('parts')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', partId);
      
      if (error) throw error;
      await loadParts();
      showActionsModal = false;
    } catch (error) {
      console.error('Error updating part status:', error);
      alert('Error updating part status. Please try again.');
    }
  }

  async function completePart(partId, deliveryMethod, kittingBin = '') {
    try {
      const updateData = {
        status: 'complete',
        delivered: deliveryMethod === 'delivered',
        updated_at: new Date().toISOString()
      };
      
      if (deliveryMethod === 'kitting-bin' && kittingBin) {
        updateData.kitting_bin = kittingBin;
      }
      
      const { error } = await supabase
        .from('parts')
        .update(updateData)
        .eq('id', partId);
      
      if (error) throw error;
      await loadParts();
      showActionsModal = false;
    } catch (error) {
      console.error('Error completing part:', error);
      alert('Error completing part. Please try again.');
    }
  }

  function openActionsModal(part) {
    selectedPart = part;
    showActionsModal = true;
  }

  function closeActionsModal() {
    selectedPart = null;
    showActionsModal = false;
  }

  function getWorkflowLabel(workflow) {
    const found = workflows.find(w => w.value === workflow);
    return found ? found.label : workflow;
  }

  function getWorkflowIcon(workflow) {
    const found = workflows.find(w => w.value === workflow);
    return found ? found.icon : FileText;
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  function getStatusDisplay(part) {
    if (part.status === 'complete') {
      if (part.kitting_bin) {
        return part.kitting_bin;
      } else if (part.delivered) {
        return 'Delivered';
      }
      return 'Complete';
    }
    return part.status;
  }
  async function exportToCSV() {
    try {
      // Fetch all parts data from the view
      const { data, error } = await supabase
        .from('parts_with_download_urls')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        alert('No parts data to export.');
        return;
      }
      
      // Define CSV headers
      const headers = [
        'ID',
        'Name',
        'Requester',
        'Project ID',
        'Workflow',
        'Quantity',
        'Material',
        'Status',
        'Source Type',
        'File Name',
        'File Format',
        'Onshape Document ID',
        'Onshape Version',
        'Kitting Bin',
        'Delivered',
        'Created Date',
        'Updated Date'
      ];
      
      // Convert data to CSV format
      const csvContent = [
        headers.join(','), // Header row
        ...data.map(part => [
          part.id || '',
          `"${(part.name || '').replace(/"/g, '""')}"`, // Escape quotes
          `"${(part.requester || '').replace(/"/g, '""')}"`,
          `"${(part.project_id || '').replace(/"/g, '""')}"`,
          part.workflow || '',
          part.quantity || 1,
          `"${(part.material || '').replace(/"/g, '""')}"`,
          part.status || '',
          part.source_type || '',
          `"${(part.file_name || '').replace(/"/g, '""')}"`,
          part.file_format || '',
          part.onshape_document_id || '',
          part.onshape_wvmid || '',
          `"${(part.kitting_bin || '').replace(/"/g, '""')}"`,
          part.delivered ? 'Yes' : 'No',
          part.created_at ? new Date(part.created_at).toLocaleString() : '',
          part.updated_at ? new Date(part.updated_at).toLocaleString() : ''
        ].join(','))
      ].join('\n');
      
      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `parts_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Error exporting data. Please try again.');
    }
  }

  // Reactive statement that filters parts when search term, filters, or parts array changes
  $: filteredParts = parts.filter(part => {
    const matchesSearch = !searchTerm || 
      part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.requester.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.project_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesWorkflow = !filterWorkflow || part.workflow === filterWorkflow;
    const matchesStatus = !filterStatus || part.status === filterStatus;
    
    return matchesSearch && matchesWorkflow && matchesStatus;
  });

  // Toast notification functions
  function showToastMessage(message) {
    toastMessage = message;
    showToast = true;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  // SVG download function for laser cutter
  async function downloadSVGForLaser(part) {
    try {
      console.log('Downloading SVG for laser cutter, part:', part.name);
      showToastMessage('Download requested - Converting to SVG...');
      
      // Build the API URL for SVG conversion
      const params = new URLSearchParams({
        action: 'convert-to-svg',
        documentId: part.onshape_document_id,
        elementId: part.onshape_element_id,
        partId: part.onshape_part_id,
        wvm: part.onshape_wvm,
        wvmId: part.onshape_wvmid
      });
      
      console.log('SVG API parameters:', Object.fromEntries(params.entries()));
      console.log('Full SVG API URL:', `/api/onshape?${params}`);
      
      const response = await fetch(`/api/onshape?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('SVG API Error Response:', errorData);
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Create blob and download SVG
      const blob = await response.blob();
      const fileName = `${part.name.replace(/[^a-zA-Z0-9]/g, '_')}.svg`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('SVG file downloaded successfully:', fileName);
      showToastMessage('SVG file downloaded successfully!');
    } catch (error) {
      console.error('Error downloading SVG:', error);
      showToastMessage(`Error downloading SVG: ${error.message}`);
    }
  }
</script>

<svelte:head>
  <title>Parts List - Manufacturing Management</title>
</svelte:head>

<!-- Toolbar and filters moved into a single block for DataTable toolbar slot -->
<!-- Remove extra .card container and margin-bottom from toolbar -->
<!-- Pass as slot="toolbar" to DataTable below -->

{#if loading}
  <div class="loading-state">
    <div class="loading-spinner"></div>
    <p>Loading parts...</p>
  </div>
{:else if filteredParts.length === 0}
  <div class="empty-state">
    <div class="empty-icon">
      <Package size={48} />
    </div>
    <h3>No parts found</h3>
    <p>{parts.length === 0 ? 'Create your first part to get started!' : 'Try adjusting your filters or search terms.'}</p>
    {#if parts.length === 0}
      <a href="/manufacture/create" class="btn btn-primary">
        <Upload size={16} />
        Create New Part
      </a>
    {/if}
  </div>
{:else}
  <DataTable
    bare
    {loading}
    rows={filteredParts}
    columns={[
      { label: 'Part Name', accessor: 'name' },
      { label: 'Requester', accessor: 'requester' },
      { label: 'Project', accessor: 'project_id' },
      { label: 'Type', accessor: 'workflow' },
      { label: 'Qty', accessor: 'quantity' },
      { label: 'Material', accessor: 'material' },
      { label: 'Status', accessor: 'status' },
      { label: 'Created', accessor: 'created_at' },
      { label: 'Download', accessor: 'download' },
      { label: '', accessor: 'actions' }
    ]}
  >
    <svelte:fragment slot="toolbar">
      <div class="page-header">
        <div class="page-title">
          <h1>Parts Manufacturing</h1>
          <p class="page-subtitle">Manage and track manufacturing requests</p>
        </div>
        <div class="page-actions">
          <a href="/manufacture/laser" class="btn btn-laser">
            <Zap size={16} />
            Laser Cutter
          </a>
          <a href="/manufacture/create" class="btn btn-primary">
            <Upload size={16} />
            Create Part
          </a>
          <button class="btn btn-secondary" on:click={exportToCSV}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>
      
      <div class="filters-container">
        <div class="filter-group">
          <label class="filter-label">
            <Search size={14} />
            Search
          </label>
          <input
            type="text"
            class="filter-input"
            placeholder="Search parts, requesters, or projects..."
            bind:value={searchTerm}
          />
        </div>
        <div class="filter-group">
          <label class="filter-label">
            <Filter size={14} />
            Type
          </label>
          <select class="filter-select" bind:value={filterWorkflow}>
            <option value="">All Types</option>
            {#each workflows as workflow}
              <option value={workflow.value}>{workflow.label}</option>
            {/each}
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">
            <CheckCircle size={14} />
            Status
          </label>
          <select class="filter-select" bind:value={filterStatus}>
            <option value="">All Statuses</option>
            {#each statuses as status}
              <option value={status.value}>{status.label}</option>
            {/each}
          </select>
        </div>
        <div class="filter-stats">
          <span class="stat-item">
            {filteredParts.length} of {parts.length} parts
          </span>
        </div>
      </div>
    </svelte:fragment>
    <svelte:fragment slot="cell" let:row let:rowIndex let:col>
      {#if col.accessor === 'workflow'}
        <div class="workflow-cell">
          <svelte:component this={getWorkflowIcon(row.workflow)} size={14} />
          <span>{getWorkflowLabel(row.workflow)}</span>
        </div>
      {:else if col.accessor === 'status'}
        <span class="status-badge status-{row.status}">
          {getStatusDisplay(row)}
        </span>
      {:else if col.accessor === 'created_at'}
        <span class="date-cell">{formatDate(row.created_at)}</span>
      {:else if col.accessor === 'quantity'}
        <span class="quantity-cell">{row.quantity || 1}</span>
      {:else if col.accessor === 'material'}
        <span class="material-cell" title={row.material || 'Not specified'}>
          {row.material || 'Not specified'}
        </span>
      {:else if col.accessor === 'download'}
        <div class="download-cell">
          {#if row.source_type === 'onshape_api'}
            <button
              class="download-link"
              on:click={() => downloadFile(row, row.status)}
              title="Download {row.workflow === 'laser-cut' ? 'SVG' : (row.file_format === 'stl' ? 'STL' : 'STEP')} file"
            >
              <Download size={14} />
              {row.workflow === 'laser-cut' ? 'SVG' : (row.file_format === 'stl' ? 'STL' : 'STEP')}
            </button>
          {:else if row.file_name}
            <button
              class="download-link"
              on:click={() => downloadFromStorage(row.file_name, row.id)}
              title="Download {row.file_name}"
            >
              <Download size={14} />
              File
            </button>
          {/if}
          {#if row.gcode_file_name}
            <a
              href={row.gcode_file_url}
              target="_blank"
              class="download-link secondary"
              title="Download G-code file"
            >
              <FileText size={14} />
              G-code
            </a>
          {/if}
        </div>
      {:else if col.accessor === 'actions'}
        <button 
          class="actions-button" 
          on:click={() => openActionsModal(row)}
          title="View actions for {row.name}"
        >
          <Wrench size={14} />
          Actions
        </button>
      {:else if col.accessor === 'name'}
        <div class="name-cell">
          <span class="part-name" title={row.name}>{row.name}</span>
          {#if row.source_type === 'onshape_api'}
            <span class="onshape-badge" title="From Onshape">OS</span>
          {/if}
        </div>
      {:else}
        <span title={row[col.accessor] || ''}>{row[col.accessor] || ''}</span>
      {/if}
    </svelte:fragment>
  </DataTable>
{/if}

<!-- Actions Modal -->
{#if showActionsModal && selectedPart}
  <div class="modal-backdrop" on:click={closeActionsModal} role="presentation"></div>
  <div class="modal actions-modal" role="dialog" aria-labelledby="modal-title">
    <div class="modal-header">
      <h2 id="modal-title">Actions for {selectedPart.name}</h2>
      <button class="modal-close" on:click={closeActionsModal} aria-label="Close modal">
        &times;
      </button>
    </div>
    <div class="modal-body">
      {#if selectedPart.status === 'pending'}
        <div class="action-section">
          <h3>Start Manufacturing</h3>
          <p>Mark this part as in progress to begin work.</p>
          <button
            class="btn btn-primary"
            on:click={() => updatePartStatus(selectedPart.id, 'in-progress')}
          >
            <Clock size={16} />
            Start Work
          </button>
        </div>
      {:else if selectedPart.status === 'in-progress'}
        {#if selectedPart.workflow === 'router'}
          <div class="action-section">
            <h3>Router Workflow</h3>
            <div class="workflow-steps">
              <div class="step">
                <span class="step-number">1</span>
                <span class="step-text">Download STEP file from table</span>
              </div>
              <div class="step">
                <span class="step-number">2</span>
                <span class="step-text">Process in CAM software</span>
              </div>
              <div class="step">
                <span class="step-number">3</span>
                <span class="step-text">Upload G-code file below</span>
              </div>
            </div>
            <div class="gcode-upload-section">
              <label class="upload-label" for="gcode-upload-modal">Upload G-code File:</label>
              <div class="file-upload-area"
                on:click={() => document.getElementById(`gcode-upload-modal`).click()}
                on:dragover={handleDragOver}
                on:dragleave={handleDragLeave}
                on:drop={(e) => handleGcodeDrop(e, selectedPart.id)}
                role="button"
                tabindex="0"
                on:keydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    document.getElementById(`gcode-upload-modal`).click();
                  }
                }}>
                <input
                  id="gcode-upload-modal"
                  type="file"
                  accept=".gcode,.nc,.cnc,.tap,.ngc"
                  class="file-input-hidden"
                  on:change={(e) => handleGcodeFileUpload(e, selectedPart.id)}
                />
                <Upload size={24} />
                <span class="upload-text">Drop G-code file or click to browse</span>
                <span class="file-info">Accepts: .gcode, .nc, .cnc, .tap, .ngc</span>
              </div>
            </div>
          </div>
        {:else}
          <div class="action-section">
            <h3>Complete Part</h3>
            <p>Mark this part as complete and specify delivery method.</p>
            <div class="completion-actions">
              <button
                class="btn btn-primary"
                on:click={() => completePart(selectedPart.id, 'delivered')}
              >
                <Truck size={16} />
                Mark as Delivered
              </button>
              <div class="kitting-section">
                <input
                  type="text"
                  placeholder="Enter Kitting Bin ID"
                  class="kitting-input"
                  on:keydown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      completePart(selectedPart.id, 'kitting-bin', e.target.value.trim());
                    }
                  }}
                />
                <button
                  class="btn btn-secondary"
                  on:click={(e) => {
                    const input = e.target.parentElement.querySelector('.kitting-input');
                    if (input.value.trim()) {
                      completePart(selectedPart.id, 'kitting-bin', input.value.trim());
                    }
                  }}
                >
                  <Package size={16} />
                  To Kitting Bin
                </button>
              </div>
            </div>
          </div>
        {/if}
      {:else if selectedPart.status === 'cammed' && selectedPart.workflow === 'router'}
        <div class="action-section">
          <h3>Complete Machining</h3>
          <p>G-code uploaded. Mark as complete and specify delivery method.</p>
          <div class="completion-actions">
            <button
              class="btn btn-primary"
              on:click={() => completePart(selectedPart.id, 'delivered')}
            >
              <Truck size={16} />
              Mark as Delivered
            </button>
            <div class="kitting-section">
              <input
                type="text"
                placeholder="Enter Kitting Bin ID"
                class="kitting-input"
                on:keydown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    completePart(selectedPart.id, 'kitting-bin', e.target.value.trim());
                  }
                }}
              />
              <button
                class="btn btn-secondary"
                on:click={(e) => {
                  const input = e.target.parentElement.querySelector('.kitting-input');
                  if (input.value.trim()) {
                    completePart(selectedPart.id, 'kitting-bin', input.value.trim());
                  }
                }}
              >
                <Package size={16} />
                To Kitting Bin
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="action-section">
          <h3>No Actions Available</h3>
          <p>This part is complete or no actions are currently available.</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Toast Notification -->
{#if showToast}
  <div class="toast">
    {toastMessage}
  </div>
{/if}

<style>
  /* Page Layout */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }

  .page-title h1 {
    margin: 0 0 0.25rem 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--gray-900);
  }

  .page-subtitle {
    margin: 0;
    color: var(--gray-600);
    font-size: 0.875rem;
  }

  .page-actions {
    display: flex;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  /* Filters */
  .filters-container {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr auto;
    gap: 1rem;
    align-items: end;
    padding: 1rem 0;
    border-top: 1px solid var(--border);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .filter-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--gray-600);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .filter-input,
  .filter-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.875rem;
    background: var(--primary);
    color: var(--text);
    transition: all 0.2s ease;
  }

  .filter-input:focus,
  .filter-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(241, 195, 49, 0.1);
  }

  .filter-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0;
  }

  .stat-item {
    font-size: 0.75rem;
    color: var(--gray-500);
    font-weight: 500;
  }

  /* Loading and Empty States */
  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--gray-200);
    border-top: 3px solid var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  .empty-icon {
    color: var(--gray-400);
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    color: var(--gray-900);
    font-size: 1.125rem;
  }

  .empty-state p {
    margin: 0 0 1.5rem 0;
    color: var(--gray-600);
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Table Cell Styles */
  .workflow-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--gray-700);
    font-weight: 500;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .part-name {
    font-weight: 500;
    color: var(--gray-900);
  }

  .onshape-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: #f1c331;
    color: #1f2937;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .date-cell {
    color: var(--gray-600);
    font-size: 0.875rem;
  }

  .quantity-cell {
    font-weight: 500;
    color: var(--gray-700);
  }

  .material-cell {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--gray-600);
    font-size: 0.875rem;
  }

  .download-cell {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .download-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: none;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .download-link:hover {
    background: var(--accent);
    color: var(--gray-900);
  }

  .download-link.secondary {
    border-color: var(--gray-300);
    color: var(--gray-600);
  }

  .download-link.secondary:hover {
    background: var(--gray-100);
    color: var(--gray-700);
  }

  .actions-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--gray-100);
    border: 1px solid var(--gray-300);
    border-radius: 6px;
    color: var(--gray-700);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .actions-button:hover {
    background: var(--gray-200);
    border-color: var(--gray-400);
    color: var(--gray-800);
  }

  /* Button Styles */
  .btn-laser {
    background: #ff6b35;
    color: white;
    border: 1px solid #ff6b35;
  }
  
  .btn-laser:hover {
    background: #e55a2b;
    border-color: #e55a2b;
  }

  /* Modal Styles */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--primary);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    z-index: 1001;
    width: 90vw;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 1.5rem 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--gray-900);
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--gray-400);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: color 0.2s ease;
  }

  .modal-close:hover {
    color: var(--gray-600);
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
  }

  .action-section {
    margin-bottom: 1.5rem;
  }

  .action-section:last-child {
    margin-bottom: 0;
  }

  .action-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--gray-900);
  }

  .action-section p {
    margin: 0 0 1rem 0;
    color: var(--gray-600);
    font-size: 0.875rem;
  }

  .workflow-steps {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--accent);
    color: var(--gray-900);
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .step-text {
    color: var(--gray-700);
    font-size: 0.875rem;
  }

  .completion-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .kitting-section {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .kitting-input {
    flex: 1;
    margin: 0;
  }

  .gcode-upload-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .upload-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--gray-700);
  }

  .file-upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border: 2px dashed var(--border);
    border-radius: 8px;
    background: var(--gray-50);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    gap: 0.75rem;
  }

  .file-upload-area:hover,
  .file-upload-area.active {
    border-color: var(--accent);
    background: rgba(241, 195, 49, 0.05);
  }

  .file-input-hidden {
    display: none;
  }

  .upload-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--gray-700);
  }

  .file-info {
    font-size: 0.75rem;
    color: var(--gray-500);
  }

  /* Toast Notification */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--gray-900);
    color: var(--primary);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    z-index: 1000;
    font-weight: 500;
    font-size: 0.875rem;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Responsive Design */
  @media (max-width: 1024px) {
    .filters-container {
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .filter-stats {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    .page-actions {
      justify-content: stretch;
    }

    .page-actions > * {
      flex: 1;
      justify-content: center;
    }

    .filters-container {
      grid-template-columns: 1fr;
    }

    .modal {
      width: 95vw;
      max-height: 90vh;
    }

    .modal-header,
    .modal-body {
      padding: 1rem;
    }

    .kitting-section {
      flex-direction: column;
    }
  }
</style>
