<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Package, CheckCircle, Clock, Wrench, ExternalLink, MapPin } from 'lucide-svelte';

  let user = null;
  let loading = true;
  let build = null;
  let buildId = $page.params.id;

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

    await loadBuildDetails();
    loading = false;
  });
  async function loadBuildDetails() {
    try {
      // Load build with subsystem details
      const { data, error } = await supabase
        .from('builds')
        .select(`
          *,
          subsystems(
            id,
            name,
            description,
            onshape_url,
            onshape_document_id,
            onshape_workspace_id,
            onshape_element_id
          )
        `)
        .eq('id', buildId)
        .single();

      if (error) throw error;
      build = data;

      // Get parts data for this build using part_ids
      if (build.part_ids && build.part_ids.length > 0) {
        // Get parts from parts table (manufactured parts)
        const { data: partsData, error: partsError } = await supabase
          .from('parts')
          .select('*')
          .in('id', build.part_ids);

        if (!partsError) {
          build.parts = partsData || [];
        }

        // Get purchasing data (COTS parts)
        const { data: purchasingData, error: purchasingError } = await supabase
          .from('purchasing')
          .select('*')
          .in('id', build.part_ids);

        if (!purchasingError) {
          build.purchasing = purchasingData || [];
        }
      } else {
        build.parts = [];
        build.purchasing = [];
      }

    } catch (error) {
      console.error('Error loading build details:', error);
      alert('Failed to load build details: ' + error.message);
      goto('/cad/build');
    }
  }

  async function markAsAssembled() {
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
      await loadBuildDetails();
    } catch (error) {
      console.error('Error marking as assembled:', error);
      alert('Failed to mark as assembled');
    }
  }
  function getBuildProgress() {
    if (!build) return { percent: 0, manufactured: 0, total: 0, status: 'No parts' };
    
    const allParts = [...(build.parts || []), ...(build.purchasing || [])];
    if (allParts.length === 0) return { percent: 0, manufactured: 0, total: 0, status: 'No parts' };
    
    const manufactured = allParts.filter(item => 
      item.status === 'complete' || item.status === 'delivered'
    ).length;
    
    const inProgress = allParts.filter(item => 
      item.status === 'in-progress' || item.status === 'cammed' || item.status === 'ordered'
    ).length;
    
    let status = 'Requested';
    if (manufactured === allParts.length) {
      status = 'Ready to Assemble';
    } else if (inProgress > 0 || manufactured > 0) {
      status = 'Manufacturing';
    }
    
    return {
      percent: Math.round((manufactured / allParts.length) * 100),
      manufactured,
      total: allParts.length,
      inProgress,
      status
    };
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'pending': return '⏳';
      case 'in-progress': return '🔄';
      case 'cammed': return '🔧';
      case 'complete': return '⚠️';
      case 'manufactured': return '✅';
      case 'ordered': return '📦';
      case 'delivered': return '✅';
      default: return '❓';
    }
  }

  function getWorkflowIcon(workflow) {
    switch (workflow) {
      case '3d-print': return '🖨️';
      case 'laser-cut': return '🔥';
      case 'mill': return '⚙️';
      case 'lathe': return '🔄';
      case 'router': return '🪚';
      case 'purchase': return '🛒';
      default: return '🔧';
    }
  }
</script>

<svelte:head>
  <title>Build Details - {build?.subsystems?.name || 'Unknown'} {build?.release_name || ''} - 971 Hub</title>
</svelte:head>

<div class="main-content">
  {#if loading}
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading build details...</p>
    </div>  {:else if build}
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="header-left">
          <button class="back-button" on:click={() => goto('/cad/build')}>
            <ArrowLeft size={16} />
            Back to Builds
          </button>
          <div class="header-info">
            <h1>
              <Package size={32} />
              {build.subsystems?.name || 'Unknown Subsystem'} - {build.release_name}
            </h1>
            <p class="build-hash">Build #{build.build_hash?.split('_')[1] || build.id.substring(0, 8)}</p>
            <div class="build-meta">
              <span>Created: {new Date(build.created_at).toLocaleDateString()}</span>
              {#if build.assembled_at}
                <span>Assembled: {new Date(build.assembled_at).toLocaleDateString()}</span>
              {/if}
            </div>
          </div>
        </div>        <div class="header-right">
          {#if build.subsystems?.onshape_url}
            <a href={build.subsystems.onshape_url} target="_blank" class="btn btn-secondary">
              <ExternalLink size={16} />
              View CAD
            </a>
          {/if}
          
          {#if build.status !== 'assembled'}
            {@const progress = getBuildProgress()}
            {#if progress.status === 'Ready to Assemble'}
              <button class="btn btn-success" on:click={markAsAssembled}>
                <CheckCircle size={16} />
                Mark as Assembled
              </button>
            {/if}
          {/if}
        </div>
      </div>
    </div>    <!-- Build Status -->
    <div class="status-section">
      <div class="status-card status-{build.status}">
        <div class="status-header">
          {#if build.status === 'pending'}
            <Clock size={24} />
            <span>Pending</span>
          {:else if build.status === 'manufacturing'}
            <Wrench size={24} />
            <span>Manufacturing</span>
          {:else if build.status === 'ready_to_assemble'}
            <CheckCircle size={24} />
            <span>Ready to Assemble</span>
          {:else if build.status === 'assembled'}
            <CheckCircle size={24} />
            <span>Assembled</span>
          {/if}
        </div>
        
        {#if build}
          {@const progress = getBuildProgress()}
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" style="width: {progress.percent}%"></div>
            </div>
            <p class="progress-text">
              {progress.manufactured}/{progress.total} parts complete ({progress.percent}%)
            </p>
          </div>
        {/if}
      </div>
    </div>    <!-- Parts Details -->
    <div class="parts-section">
      <h2>Build Components</h2>
      {#if build.parts || build.purchasing}
        {@const allParts = [...(build.parts || []), ...(build.purchasing || [])]}
        {#if allParts.length > 0}
          <div class="parts-table-container">
            <table class="parts-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Workflow</th>
                  <th>Quantity</th>
                  <th>Material</th>
                  <th>Status</th>
                  <th>Kitting Location</th>
                  <th>Date Added</th>
                </tr>
              </thead>
              <tbody>
                {#each allParts as part}
                  <tr class="status-{part.status}">
                    <td class="part-name">
                      <div class="name-cell">
                        <Package size={16} />
                        <div>
                          <div class="name">{part.name || part.part_name || 'Unnamed Part'}</div>
                          {#if part.part_number}
                            <div class="part-number">P/N: {part.part_number}</div>
                          {/if}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="type-badge type-{part.workflow === 'purchase' ? 'cots' : 'manufactured'}">
                        {part.workflow === 'purchase' ? 'COTS' : 'Manufactured'}
                      </span>
                    </td>
                    <td>
                      <span class="workflow-badge workflow-{part.workflow}">
                        {getWorkflowIcon(part.workflow)} {part.workflow || 'N/A'}
                      </span>
                    </td>
                    <td class="quantity">
                      {part.quantity || 1}
                    </td>
                    <td class="material">
                      {part.material || '-'}
                    </td>
                    <td>
                      <span class="status-badge status-{part.status}">
                        {getStatusIcon(part.status)} {part.status}
                      </span>
                    </td>
                    <td class="kitting">
                      {#if part.kitting_bin}
                        <div class="kitting-location">
                          <MapPin size={14} />
                          {part.kitting_bin}
                        </div>
                      {:else}
                        <span class="no-kitting">Not assigned</span>
                      {/if}
                    </td>
                    <td class="date">
                      {new Date(part.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-state">
            <Package size={48} />
            <h3>No Parts in This Build</h3>
            <p>No parts have been added to this build yet.</p>
          </div>
        {/if}
      {:else}
        <div class="empty-state">
          <Package size={48} />
          <h3>No Parts in This Build</h3>
          <p>No parts have been added to this build yet.</p>
        </div>
      {/if}
    </div>
  {:else}
    <div class="error-container">
      <h2>Build Not Found</h2>
      <p>The requested build could not be found.</p>
      <button class="btn btn-primary" on:click={() => goto('/cad/build')}>
        <ArrowLeft size={16} />
        Back to Builds
      </button>
    </div>
  {/if}
</div>

<style>
  .main-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
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
    border-top: 3px solid #FFD700;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .header-content {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 2rem;
  }

  .header-left {
    flex: 1;
  }

  .header-right {
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
    margin-bottom: 1rem;
  }

  .back-button:hover {
    background: var(--surface);
    border-color: #FFD700;
    color: #FFD700;
  }

  .header-info h1 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: var(--text);
    font-size: 2rem;
    font-weight: 600;
  }

  .build-hash {
    margin: 0.5rem 0;
    color: var(--secondary);
    font-family: monospace;
    font-size: 1rem;
  }

  .build-meta {
    display: flex;
    gap: 1.5rem;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--secondary);
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
    text-decoration: none;
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    border-color: #FFD700;
    color: #FFD700;
  }

  .btn-success {
    background: #27ae60;
    color: white;
  }

  .btn-success:hover {
    background: #229954;
  }

  .status-section {
    margin-bottom: 2rem;
  }

  .status-card {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .status-card.status-pending {
    border-left: 4px solid #f39c12;
  }

  .status-card.status-manufacturing {
    border-left: 4px solid #3498db;
  }

  .status-card.status-ready_to_assemble {
    border-left: 4px solid #27ae60;
  }

  .status-card.status-assembled {
    border-left: 4px solid #2ecc71;
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-bar {
    width: 100%;
    height: 12px;
    background: #f0f0f0;
    border-radius: 6px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #27ae60, #2ecc71);
    transition: width 0.3s ease;
  }

  .progress-text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--secondary);
  }

  .parts-section {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .parts-section h2 {
    margin: 0 0 1.5rem 0;
    color: var(--text);
  }

  .parts-table-container {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .parts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .parts-table thead {
    background: var(--background);
    border-bottom: 2px solid var(--border);
  }

  .parts-table th {
    padding: 1rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: var(--text);
    border-right: 1px solid var(--border);
  }

  .parts-table th:last-child {
    border-right: none;
  }

  .parts-table td {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    vertical-align: middle;
  }

  .parts-table td:last-child {
    border-right: none;
  }

  .parts-table tbody tr:hover {
    background: #f8f9fa;
  }

  .part-name {
    font-weight: 500;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .name-cell .name {
    font-weight: 500;
    color: var(--text);
  }

  .name-cell .part-number {
    font-size: 0.8rem;
    color: #666;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .type-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .type-badge.type-cots {
    background: #fff8e1;
    color: #f57f17;
  }

  .type-badge.type-manufactured {
    background: #e3f2fd;
    color: #1976d2;
  }

  .quantity {
    text-align: center;
    font-weight: 500;
  }

  .material {
    color: #666;
  }

  .kitting {
    color: #666;
  }

  .kitting-location {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--success);
    font-weight: 500;
  }

  .no-kitting {
    color: #999;
    font-style: italic;
  }

  .date {
    color: #666;
    font-size: 0.85rem;
  }

  /* Status row styling */
  .parts-table tr.status-pending {
    border-left: 4px solid var(--warning);
  }

  .parts-table tr.status-in-progress {
    border-left: 4px solid #3498db;
  }

  .parts-table tr.status-complete {
    border-left: 4px solid var(--success);
  }

  .parts-table tr.status-delivered {
    border-left: 4px solid var(--success);
  }

  .parts-table tr.status-ordered {
    border-left: 4px solid #3498db;
  }

  .parts-table tr.status-kitted {
    border-left: 4px solid #2ecc71;
  }

  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    gap: 1rem;
  }

  :root {
    --primary: #ffffff;
    --secondary: #6c757d;
    --accent: #FFD700;
    --background: #f8f9fa;
    --surface: #ffffff;
    --border: #e1e5e9;
    --text: #2c3e50;
    --success: #27ae60;
    --warning: #f39c12;
    --danger: #e74c3c;
  }
</style>
