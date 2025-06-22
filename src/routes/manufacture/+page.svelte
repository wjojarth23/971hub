<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { Search, Filter, Clock, CheckCircle, Truck, Package, Download, Zap, Wrench, FileText, Upload } from 'lucide-svelte';
  
  let parts = [];
  let filteredParts = [];
  let loading = true;
  let searchTerm = '';
  let filterWorkflow = '';
  let filterStatus = '';
  
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
        file_format: part.file_format,
        onshape_document_id: part.onshape_document_id,
        onshape_element_id: part.onshape_element_id,
        onshape_part_id: part.onshape_part_id,
        onshape_wvm: part.onshape_wvm,
        onshape_wvmid: part.onshape_wvmid
      });

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
    } catch (error) {
      console.error('Error downloading from Onshape:', error);
      throw error;
    }
  }

  async function downloadFromStorage(fileName, partId) {
    try {
      console.log('Downloading from storage bucket:', fileName);
      
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
    } catch (error) {
      console.error('Error downloading from storage:', error);
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
    } catch (error) {
      console.error('Error completing part:', error);
      alert('Error completing part. Please try again.');
    }
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
</script>

<svelte:head>
  <title>Parts List - Manufacturing Management</title>
</svelte:head>

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
  <h1>Parts List</h1>
  <div style="display: flex; gap: 10px;">
    <a href="/create" class="btn btn-primary" style="text-decoration: none; display: flex; align-items: center; gap: 8px;">
      <Upload size={16} />
      Create New Part
    </a>
    <button
      class="btn btn-secondary"
      on:click={exportToCSV}
      style="display: flex; align-items: center; gap: 8px;"
    >
      <Download size={16} />
      Export CSV
    </button>
  </div>
</div>

<div class="card">
  <div class="filters">
    <div class="form-group">
      <label class="form-label">
        <Search size={16} />
        Search
      </label>
      <input
        type="text"
        class="form-input"
        placeholder="Search by name, requester, or project ID..."
        bind:value={searchTerm}
      />
    </div>
    
    <div class="form-group">
      <label class="form-label">
        <Filter size={16} />
        Workflow
      </label>
      <select class="form-select" bind:value={filterWorkflow}>
        <option value="">All Workflows</option>
        {#each workflows as workflow}
          <option value={workflow.value}>{workflow.label}</option>
        {/each}
      </select>
    </div>
    
    <div class="form-group">
      <label class="form-label">
        <Filter size={16} />
        Status
      </label>
      <select class="form-select" bind:value={filterStatus}>
        <option value="">All Statuses</option>
        {#each statuses as status}
          <option value={status.value}>{status.label}</option>
        {/each}
      </select>
    </div>
  </div>
</div>

{#if loading}
  <div class="card">
    <p>Loading parts...</p>
  </div>
{:else if filteredParts.length === 0}
  <div class="card">
    <p>No parts found. {parts.length === 0 ? 'Create your first part!' : 'Try adjusting your filters.'}</p>
  </div>
{:else}
  <div class="parts-grid">
    {#each filteredParts as part (part.id)}
      <div class="card part-card">
        <div class="part-header">
          <div class="part-info">
            <h3>{part.name}</h3>
            <div class="workflow-badge">
              <svelte:component this={getWorkflowIcon(part.workflow)} size={16} />
              {getWorkflowLabel(part.workflow)}
            </div>
          </div>
          <div class="status-badge status-{part.status}">
            {getStatusDisplay(part)}
          </div>
        </div>
        
        <div class="part-details">
          <p><strong>Requester:</strong> {part.requester}</p>
          <p><strong>Project ID:</strong> {part.project_id}</p>
          <p><strong>Quantity:</strong> {part.quantity || 1}x</p>          {#if part.material}
            <p><strong>Material:</strong> {part.material}</p>
          {/if}
          <p><strong>Created:</strong> {formatDate(part.created_at)}</p>
          {#if part.source_type === 'onshape_api'}            <p><strong>Source:</strong> 
              <span class="onshape-badge">
                Onshape ({part.file_format === 'stl' ? 'STL' : 'STEP'})
              </span>
            </p>
            <p><strong>Version:</strong> {part.onshape_wvm}/{part.onshape_wvmid}</p>
            <p>              <button 
                class="file-link download-btn" 
                on:click={() => downloadFile(part, part.status)}
                style="background: none; border: none; color: var(--color-accent); text-decoration: underline; cursor: pointer;"
              >
                Download {part.file_format === 'stl' ? 'STL' : 'STEP'} file
              </button>
            </p>
          {:else if part.file_name}
            <p><strong>File:</strong> 
              <button 
                class="file-link" 
                on:click={() => downloadFromStorage(part.file_name, part.id)}
                style="background: none; border: none; color: var(--color-accent); text-decoration: underline; cursor: pointer;"
              >
                Download {part.file_name}
              </button>
            </p>
          {/if}
          {#if part.gcode_file_name}
            <p><strong>G-code File:</strong> 
              <a 
                href={part.gcode_file_url}
                target="_blank"
                class="file-link"
              >
                Download {part.gcode_file_name}
              </a>
            </p>
          {/if}
          {#if part.kitting_bin}
            <p><strong>Kitting Bin:</strong> {part.kitting_bin}</p>
          {/if}
          {#if part.delivered}
            <p><strong>Status:</strong> Delivered</p>
          {/if}
        </div>
        
        {#if part.status === 'pending' || part.status === 'in-progress' || (part.status === 'cammed' && part.workflow === 'router')}
          <div class="part-actions">
            {#if part.status === 'pending'}
              <button
                class="btn btn-secondary"
                on:click={() => updatePartStatus(part.id, 'in-progress')}
              >
                <Clock size={16} />
                Start Work
              </button>
            {:else if part.status === 'in-progress'}
              {#if part.workflow === 'router'}
                <div class="router-cam-section">
                  <p><strong>Step 1:</strong> Download STEP file above</p>
                  <p><strong>Step 2:</strong> Upload G-code file after CAM processing</p>
                    <div class="gcode-upload">
                    <label class="form-label" for="gcode-upload-{part.id}">Upload G-code File:</label>
                    <div class="file-upload-area" 
                         on:click={() => document.getElementById(`gcode-upload-${part.id}`).click()}
                         on:dragover={handleDragOver}
                         on:dragleave={handleDragLeave}
                         on:drop={(e) => handleGcodeDrop(e, part.id)}
                         role="button"
                         tabindex="0"
                         on:keydown={(e) => {
                           if (e.key === 'Enter' || e.key === ' ') {
                             document.getElementById(`gcode-upload-${part.id}`).click();
                           }
                         }}>
                      <input
                        id="gcode-upload-{part.id}"
                        type="file"
                        accept=".gcode,.nc,.cnc,.tap"
                        class="file-input-hidden"
                        on:change={(e) => handleGcodeFileUpload(e, part.id)}
                      />
                      <Upload size={32} />
                      <span class="upload-text">Drop your G-code file here or click to browse</span>
                      <span class="file-info">Only G-code files are accepted (.gcode, .nc, .cnc, .tap)</span>
                    </div>
                  </div>
                </div>
              {:else}
                <div class="complete-actions">
                  <button
                    class="btn"
                    on:click={() => completePart(part.id, 'delivered')}
                  >
                    <Truck size={16} />
                    Mark Delivered
                  </button>
                  <div class="kitting-action">
                    <input
                      type="text"
                      placeholder="Kitting Bin ID"
                      class="form-input kitting-input"
                      on:keydown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          completePart(part.id, 'kitting-bin', e.target.value.trim());
                        }
                      }}
                    />
                    <button
                      class="btn btn-secondary"
                      on:click={(e) => {
                        const input = e.target.previousElementSibling;
                        if (input.value.trim()) {
                          completePart(part.id, 'kitting-bin', input.value.trim());
                        }
                      }}
                    >
                      <Package size={16} />
                      To Bin
                    </button>
                  </div>
                </div>
              {/if}
            {:else if part.status === 'cammed' && part.workflow === 'router'}
              <div class="complete-actions">
                <button
                  class="btn"
                  on:click={() => completePart(part.id, 'delivered')}
                >
                  <Truck size={16} />
                  Mark Delivered
                </button>
                <div class="kitting-action">
                  <input
                    type="text"
                    placeholder="Kitting Bin ID"
                    class="form-input kitting-input"
                    on:keydown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        completePart(part.id, 'kitting-bin', e.target.value.trim());
                      }
                    }}
                  />
                  <button
                    class="btn btn-secondary"
                    on:click={(e) => {
                      const input = e.target.previousElementSibling;
                      if (input.value.trim()) {
                        completePart(part.id, 'kitting-bin', input.value.trim());
                      }
                    }}
                  >
                    <Package size={16} />
                    To Bin
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .filters {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .parts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1rem;
  }
  
  .part-card {
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  
  .part-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  
  .part-info h3 {
    margin: 0 0 0.5rem 0;
    color: var(--secondary);
  }
  
  .workflow-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--background);
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid var(--border);
  }
  
  .part-details {
    margin-bottom: 1rem;
  }
  
  .part-details p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }
  
  .file-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 500;
  }
    .file-link:hover {
    text-decoration: underline;
  }
  
  .onshape-badge {
    display: inline-flex;
    align-items: center;
    background: #f1c331;
    color: #333;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }
  
  .download-btn {
    font-weight: 600;
  }
  
  .part-actions {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
  
  .complete-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .kitting-action {
    display: flex;
    gap: 0.5rem;
  }
  
  .kitting-input {
    flex: 1;
    margin: 0;
  }
  
  .router-cam-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .router-cam-section p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text);
  }
  
  .gcode-upload {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .file-upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border: 2px dashed var(--border);
    border-radius: 4px;
    background: var(--background);
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    gap: 0.75rem;
  }
  
  .file-upload-area:hover,
  .file-upload-area.active {
    border-color: var(--accent);
    background: rgba(241, 195, 49, 0.1);
  }
  
  .file-input-hidden {
    display: none;
  }
  
  .upload-text {
    font-size: 1rem;
    font-weight: 500;
    color: var(--secondary);
  }
  
  .file-info {
    font-size: 0.8rem;
    color: #666;
    font-style: italic;
  }
  
  @media (max-width: 768px) {
    .filters {
      grid-template-columns: 1fr;
    }
    
    .parts-grid {
      grid-template-columns: 1fr;
    }
    
    .kitting-action {
      flex-direction: column;
    }
  }
</style>
