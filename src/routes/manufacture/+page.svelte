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
  let toastMessage = '';
  let showToast = false;
  
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

  // Fixed drag and drop handlers for better Vercel compatibility (kept for potential future use)
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
  }

  async function downloadFromOnshape(part) {
    try {
      // Special handling for laser cutter - download SVG instead of STEP
      if (part.workflow === 'laser-cut') {
        await downloadSVGForLaser(part);
        return;
      }

      // For lathe/mill, fetch drawing PDF via Onshape drawing translation
      if (part.workflow === 'lathe' || part.workflow === 'mill') {
        // We expect the drawing element id stored on the part record
        let drawingEid = part.onshape_drawing_element_id;
        if (!drawingEid) {
          // Fallback: the parts_with_download_urls view may be outdated and not include this newer column.
          // In that case, fetch the value directly from the base 'parts' table.
          const { data: partRow, error: partErr } = await supabase
            .from('parts')
            .select('onshape_drawing_element_id')
            .eq('id', part.id)
            .single();
          if (!partErr && partRow && partRow.onshape_drawing_element_id) {
            drawingEid = partRow.onshape_drawing_element_id;
          }
        }
        if (!drawingEid) {
          alert('This part requires a drawing. No drawing URL/EID found.');
          return;
        }
        const params = new URLSearchParams({
          action: 'translate-drawing',
          documentId: part.onshape_document_id,
          elementId: drawingEid,
          wvm: part.onshape_wvm || 'v',
          wvmId: part.onshape_wvmid
        });
        showToastMessage('Generating drawing PDF...');
        const resp = await fetch(`/api/onshape?${params}`);
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Failed to create drawing PDF (${resp.status})`);
        }
        const blob = await resp.blob();
        const fileName = `${part.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToastMessage('Drawing PDF downloaded.');
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
      
      showToastMessage('Download requested...');
      
      const response = await fetch(`/api/onshape?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
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
      
      showToastMessage(`${fileExt.toUpperCase()} file downloaded successfully!`);
    } catch (error) {
      console.error('Error downloading from Onshape:', error);
      showToastMessage(`Error downloading file: ${error.message}`);
      throw error;
    }
  }

  async function downloadFromStorage(fileName, partId) {
    try {
      showToastMessage('Download requested...');
      
      // Try to create signed URL for the filename as stored
      let { data, error } = await supabase.storage
        .from('manufacturing-files')
        .createSignedUrl(fileName, 60); // URL expires in 60 seconds
      
      // If that fails, it might be URL encoded, so try decoding it
      if (error && error.message.includes('Object not found')) {
        const decodedFileName = decodeURIComponent(fileName);
        const result = await supabase.storage
          .from('manufacturing-files')
          .createSignedUrl(decodedFileName, 60);
        data = result.data;
        error = result.error;
      }
      
      if (error) throw error;
      
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
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('manufacturing-files')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
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

  function triggerGcodeInput(partId) {
    const el = document.getElementById(`gcode-upload-${partId}`);
    if (el) el.click();
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

  function getStatusBadgeClass(status) {
    if (status === 'in-progress') return 'status-progress';
    if (status === 'cammed') return 'status-cammed';
    if (status === 'complete') return 'status-complete';
    return 'status-pending';
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
      
      const response = await fetch(`/api/onshape?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
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

<div class="page-header">
  <h1>Parts List</h1>
  <div class="page-actions">
    <a href="/create" class="btn btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
      <Upload size={16} />
      Create New Part
    </a>
    <button
      class="btn btn-secondary"
      on:click={exportToCSV}
      style="display: inline-flex; align-items: center; gap: 8px;"
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
  <div class="table-container">
    <table class="table">
      <thead>
        <tr>
          <th class="name-col">Name</th>
          <th>Workflow</th>
          <th class="mono">Project ID</th>
          <th>Qty</th>
          <th>Material</th>
          <th class="source-col">Source</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredParts as part (part.id)}
          <tr>
            <td class="name-col"><strong>{part.name}</strong></td>
            <td>
              <div class="workflow-badge">
                <svelte:component this={getWorkflowIcon(part.workflow)} size={14} />
                {getWorkflowLabel(part.workflow)}
              </div>
            </td>
            <td class="mono">{part.project_id}</td>
            <td>{part.quantity || 1}</td>
            <td class="text-muted">{part.material || '-'}</td>
            <td class="source-col">
              {#if part.source_type === 'onshape_api'}
                <div class="source-cell">
                  <span class="source-tag">
                    {#if part.workflow === 'laser-cut'}
                      SVG
                    {:else if part.workflow === 'lathe' || part.workflow === 'mill'}
                      PDF
                    {:else}
                      {part.file_format === 'stl' ? 'STL' : 'STEP'}
                    {/if}
                  </span>
                  <button class="btn btn-secondary btn-icon" aria-label="Download" title="Download" on:click={() => downloadFile(part, part.status)}>
                    <Download size={16} />
                  </button>
                </div>
              {:else if part.file_name}
                <div class="source-cell">
                  <span class="file-label">{part.file_name}</span>
                  <button class="btn btn-secondary btn-icon" aria-label="Download" title="Download" on:click={() => downloadFromStorage(part.file_name, part.id)}>
                    <Download size={16} />
                  </button>
                </div>
              {:else}
                <span class="text-muted">-</span>
              {/if}
            </td>
            <td>
              <span class="status-badge {getStatusBadgeClass(part.status)} status-table status-fade">{getStatusDisplay(part)}</span>
            </td>
            <td>{formatDate(part.created_at)}</td>
            <td>
              {#if part.status === 'pending'}
                <button
                  class="btn btn-secondary btn-sm"
                  on:click={() => updatePartStatus(part.id, 'in-progress')}
                  title="Start Work"
                >
                  <Clock size={14} />
                  Start
                </button>
              {:else if part.status === 'in-progress'}
                {#if part.workflow === 'router'}
                  <div class="actions-col">
                    <input
                      id="gcode-upload-{part.id}"
                      type="file"
                      accept=".gcode,.nc,.cnc,.tap,.ngc"
                      class="file-input-hidden"
                      on:change={(e) => handleGcodeFileUpload(e, part.id)}
                    />
                    <button
                      class="btn btn-secondary btn-sm"
                      on:click={() => triggerGcodeInput(part.id)}
                      title="Upload G-code"
                    >
                      <Upload size={14} />
                      Upload G-code
                    </button>
                  </div>
                {:else}
                  <div class="actions-col">
                    <button
                      class="btn btn-primary btn-sm"
                      on:click={() => completePart(part.id, 'delivered')}
                      title="Mark Delivered"
                    >
                      <Truck size={14} />
                      Delivered
                    </button>
                    <div class="kitting-inline">
                      <input
                        type="text"
                        placeholder="Bin ID"
                        class="form-input kitting-input"
                        on:keydown={(e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            completePart(part.id, 'kitting-bin', e.target.value.trim());
                          }
                        }}
                      />
                      <button
                        class="btn btn-secondary btn-sm btn-nowrap"
                        on:click={(e) => {
                          const input = e.target.previousElementSibling;
                          if (input && input.value.trim()) {
                            completePart(part.id, 'kitting-bin', input.value.trim());
                          }
                        }}
                        title="Move to Bin"
                      >
                        <Package size={14} />
                        Kit
                      </button>
                    </div>
                  </div>
                {/if}
              {:else if part.status === 'cammed' && part.workflow === 'router'}
                <div class="actions-col">
                  <button
                    class="btn btn-primary btn-sm"
                    on:click={() => completePart(part.id, 'delivered')}
                    title="Mark Delivered"
                  >
                    <Truck size={14} />
                    Delivered
                  </button>
                  <div class="kitting-inline">
                    <input
                      type="text"
                      placeholder="Bin ID"
                      class="form-input kitting-input"
                      on:keydown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          completePart(part.id, 'kitting-bin', e.target.value.trim());
                        }
                      }}
                    />
                    <button
                      class="btn btn-secondary btn-sm btn-nowrap"
                      on:click={(e) => {
                        const input = e.target.previousElementSibling;
                        if (input && input.value.trim()) {
                          completePart(part.id, 'kitting-bin', input.value.trim());
                        }
                      }}
                      title="Move to Bin"
                    >
                      <Package size={14} />
                      Kit
                    </button>
                  </div>
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- Toast Notification -->
{#if showToast}
  <div class="toast">
    {toastMessage}
  </div>
{/if}

<style>
  /* Uses global .page-header and .page-actions from app.css */

  .filters {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 0.25rem;
  }


  /* --- BOM-style Table Styling --- */
  /* Tables: rely on global .table/.table-container styles */
  .table tr { background: white; }
  .table tbody tr:nth-child(even) { background: #fcfcfc; }

  /* Skinnier columns for Name and Source */
  .table th.name-col,
  .table td.name-col {
    min-width: 120px;
    max-width: 180px;
    width: 1%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .table th.source-col,
  .table td.source-col {
  min-width: 80px;
  max-width: 120px;
    width: 1%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  /* Table-specific cell styles */

  /* Remove old .name-col min-width, handled above */

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .source-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
  max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-icon { border: 1px solid var(--border); background: var(--background); }

  .version-text {
    font-size: 0.75rem;
    color: #666;
  }

  .file-label {
  max-width: 100px;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  /* Button sizing relies on .btn-sm globally */

  .actions-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 140px;
  }

  .kitting-inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .kitting-input {
    min-width: 120px;
    margin: 0;
    padding: 0.5rem 0.5rem;
  }

  .workflow-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background: var(--background);
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 500;
    border: 1px solid var(--border);
    color: var(--secondary);
  }


  .source-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 0.75rem;
    border-radius: 4px;
    font-size: 0.8125rem;
    font-weight: 500;
    background: #e3e8f0;
    color: #333;
    border: 1px solid var(--border);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin-right: 0.25rem;
  }

  /* Remove ad-hoc .btn-table; using .btn btn-sm variants */

  /* Status badges: keep compact row height */
  .status-badge.status-table { display: inline-flex; align-items: center; height: 32px; min-width: 80px; }
  /* Provide badge background variables for fade to pick up */
  .status-badge.status-table.status-pending { --badge-bg: var(--warning); }
  .status-badge.status-table.status-progress { --badge-bg: #007bff; }
  .status-badge.status-table.status-cammed { --badge-bg: #6f42c1; }
  .status-badge.status-table.status-complete { --badge-bg: var(--success); }

  .text-muted { color: #6b7280; }

  .file-input-hidden {
    display: none;
  }

  /* Toast Notification Styles */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--secondary);
    color: var(--primary);
    padding: 12px 24px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 1000;
    font-weight: 500;
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

  @media (max-width: 900px) {
    .filters {
      grid-template-columns: 1fr;
    }
    .actions-col {
      min-width: auto;
    }
    .table th.name-col,
    .table td.name-col {
      min-width: 80px;
      max-width: 100px;
    }
    .table th.source-col,
    .table td.source-col {
      min-width: 70px;
      max-width: 100px;
    }
    .table thead th:nth-child(6),
    .table tbody td:nth-child(6) { /* Material */
      display: none;
    }
    .table thead th:nth-child(9),
    .table tbody td:nth-child(9) { /* Created */
      display: none;
    }
  }
</style>
