<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { Search, Filter, Clock, CheckCircle, Truck, Package } from 'lucide-svelte';
  
  let parts = [];
  let filteredParts = [];
  let loading = true;
  let searchTerm = '';
  let filterWorkflow = '';
  let filterStatus = '';
  
  const workflows = [
    { value: 'laser-cut', label: 'Laser Cut', icon: '🔥' },
    { value: 'router', label: 'Router', icon: '🔄' },
    { value: 'lathe', label: 'Lathe', icon: '🔧' },
    { value: 'mill', label: 'Mill', icon: '⚙️' },
    { value: '3d-print', label: '3D Print', icon: '🖨️' }
  ];
  const statuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' }
  ];

  onMount(async () => {
    await loadParts();
  });

  async function loadParts() {
    try {      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      parts = data || [];
      filterParts();
    } catch (error) {
      console.error('Error loading parts:', error);
      alert('Error loading parts. Please try again.');
    } finally {
      loading = false;
    }
  }
  function filterParts() {
    filteredParts = parts.filter(part => {
      const matchesSearch = !searchTerm || 
        part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.requester.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.project_id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesWorkflow = !filterWorkflow || part.workflow === filterWorkflow;
      const matchesStatus = !filterStatus || part.status === filterStatus;
      
      return matchesSearch && matchesWorkflow && matchesStatus;
    });
  }  async function downloadFile(fileName, partId, currentStatus) {
    try {
      console.log('Attempting to download file:', fileName);
      console.log('Part ID:', partId, 'Status:', currentStatus);
      
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
      
      // If part is still "pending", automatically mark it as "in-progress"
      if (currentStatus === 'pending') {
        await updatePartStatus(partId, 'in-progress');
      }
      
      // Open the signed URL in a new tab
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error downloading file:', error);
      alert(`Error downloading file: ${error.message}. The file may have been deleted or the filename may be incorrect.`);
    }
  }

  async function updatePartStatus(partId, newStatus) {
    try {      const { error } = await supabase
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
    return found ? found.icon : '📄';
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  $: {
    filterParts();
  }
</script>

<svelte:head>
  <title>Parts List - Manufacturing Management</title>
</svelte:head>

<h1>Parts List</h1>

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
              <span class="workflow-icon">{getWorkflowIcon(part.workflow)}</span>
              {getWorkflowLabel(part.workflow)}
            </div>
          </div>
          <div class="status-badge status-{part.status}">
            {part.status}
          </div>
        </div>
          <div class="part-details">
          <p><strong>Requester:</strong> {part.requester}</p>
          <p><strong>Project ID:</strong> {part.project_id}</p>
          <p><strong>Created:</strong> {formatDate(part.created_at)}</p>          {#if part.file_name}
            <p><strong>File:</strong> 
              <button 
                class="file-link" 
                on:click={() => downloadFile(part.file_name, part.id, part.status)}
                style="background: none; border: none; color: var(--color-accent); text-decoration: underline; cursor: pointer;"
              >
                Download {part.file_name}
              </button>
            </p>
          {/if}
          {#if part.kitting_bin}
            <p><strong>Kitting Bin:</strong> {part.kitting_bin}</p>
          {/if}
          {#if part.delivered}
            <p><strong>Status:</strong> Delivered</p>
          {/if}
        </div>        <div class="part-actions">
          {#if part.status === 'pending'}
            <button
              class="btn btn-secondary"
              on:click={() => updatePartStatus(part.id, 'in-progress')}
            >
              <Clock size={16} />
              Start Work
            </button>
          {:else if part.status === 'in-progress'}
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
          {:else if part.status === 'complete'}
            <div class="complete-indicator">
              <CheckCircle size={16} color="var(--success)" />
              Completed
            </div>
          {/if}
        </div>
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
    border-left: 4px solid var(--accent);
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
    border-radius: 20px;
    font-size: 0.875rem;
    font-weight: 500;
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
  
  .complete-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--success);
    font-weight: 500;
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
