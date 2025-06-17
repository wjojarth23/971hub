<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { Settings, Package, Wrench, CheckCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  let user = null;
  let loading = true;
  let builds = [];
  let buildStats = {
    total: 0,
    pending: 0,
    ready_to_assemble: 0,
    assembled: 0
  };

  onMount(async () => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      goto('/');
      return;
    }

    // Get user profile
    userStore.subscribe(value => {
      user = value;
      loading = false;
    });

    await loadBuilds();
  });
  async function loadBuilds() {
    try {
      const { data, error } = await supabase
        .from('builds')
        .select(`
          *,
          subsystems(name, onshape_url),
          build_bom(
            id,
            part_name,
            part_type,
            status,
            added_to_parts_list
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      builds = data || [];
      
      // Calculate stats
      buildStats = {
        total: builds.length,
        pending: builds.filter(b => b.status === 'pending').length,
        ready_to_assemble: builds.filter(b => b.status === 'ready_to_assemble').length,
        assembled: builds.filter(b => b.status === 'assembled').length
      };
    } catch (error) {
      console.error('Error loading builds:', error);
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

  function getBuildProgress(build) {
    const bom = build.build_bom || [];
    if (bom.length === 0) return { percent: 0, manufactured: 0, total: 0 };
    
    const manufactured = bom.filter(item => 
      item.part_type === 'COTS' ? item.status === 'delivered' : item.status === 'manufactured'
    ).length;
    
    return {
      percent: Math.round((manufactured / bom.length) * 100),
      manufactured,
      total: bom.length
    };
  }
</script>

<svelte:head>
  <title>Build Center - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if user}
  <div class="build-container">
    <div class="page-header">
      <div class="header-content">
        <Settings size={32} />
        <div>
          <h1>Build Center</h1>
          <p>Manage build configurations and assembly processes</p>
        </div>
      </div>
    </div>

    <!-- Build Statistics -->
    <div class="stats-grid">
      <div class="stat-card">
        <Package size={24} />
        <div class="stat-info">
          <h3>{buildStats.total}</h3>
          <p>Total Builds</p>
        </div>
      </div>
      <div class="stat-card">
        <Clock size={24} />
        <div class="stat-info">
          <h3>{buildStats.pending}</h3>
          <p>Pending</p>
        </div>
      </div>
      <div class="stat-card">
        <Wrench size={24} />
        <div class="stat-info">
          <h3>{buildStats.ready_to_assemble}</h3>
          <p>Ready to Assemble</p>
        </div>
      </div>
      <div class="stat-card">
        <CheckCircle size={24} />
        <div class="stat-info">
          <h3>{buildStats.assembled}</h3>
          <p>Assembled</p>
        </div>
      </div>
    </div>

    <!-- Active Builds -->
    <div class="build-sections">
      <section class="section">
        <h2>All Builds</h2>
        {#if builds.length > 0}
          <div class="builds-grid">
            {#each builds as build}
              {@const progress = getBuildProgress(build)}
              <div class="build-card status-{build.status}">
                <div class="build-header">
                  <Package size={20} />
                  <div class="build-info">
                    <h3>{build.subsystems?.name || 'Unknown'} - {build.release_name}</h3>
                    <p>Build #{build.build_hash}</p>
                  </div>
                  <div class="build-status">
                    {#if build.status === 'pending'}
                      <Clock size={16} />
                      <span>Pending</span>
                    {:else if build.status === 'ready_to_assemble'}
                      <Wrench size={16} />
                      <span>Ready to Assemble</span>
                    {:else if build.status === 'assembled'}
                      <CheckCircle size={16} />
                      <span>Assembled</span>
                    {/if}
                  </div>
                </div>
                
                <div class="progress-bar">
                  <div class="progress-fill" style="width: {progress.percent}%"></div>
                </div>
                  <div class="build-details">
                  <p><strong>Progress:</strong> {progress.manufactured}/{progress.total} parts ({progress.percent}%)</p>
                  <p><strong>Created:</strong> {new Date(build.created_at).toLocaleDateString()}</p>
                  {#if build.assembled_at}
                    <p><strong>Assembled:</strong> {new Date(build.assembled_at).toLocaleDateString()}</p>
                  {/if}
                </div>

                <div class="build-actions">
                  {#if build.subsystems?.onshape_url}
                    <a href={build.subsystems.onshape_url} target="_blank" class="btn btn-secondary">
                      <ExternalLink size={14} />
                      View CAD
                    </a>
                  {/if}
                  
                  {#if build.status === 'ready_to_assemble'}
                    <button 
                      class="btn btn-primary" 
                      on:click={() => markAsAssembled(build.id)}
                    >
                      <CheckCircle size={14} />
                      Mark as Assembled
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <Package size={48} />
            <h3>No Builds Yet</h3>
            <p>Create your first build from the CAD subsystems page</p>
            <a href="/cad" class="btn btn-primary">
              Go to CAD Subsystems
            </a>
          </div>
        {/if}      </section>
    </div>
  </div>
{:else}
  <div class="error-container">
    <p>Please log in to access the Build Center.</p>
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

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .build-container {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  .page-header {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 4px;
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

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .stat-info h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1.5rem;
  }

  .stat-info p {
    margin: 0.25rem 0 0 0;
    color: #666;
    font-size: 0.9rem;
  }

  .build-sections {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .section {
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .section h2 {
    margin: 0 0 1.5rem 0;
    color: var(--secondary);
    font-size: 1.5rem;
  }

  .builds-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .build-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .build-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--accent);
  }

  .build-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .build-info {
    flex: 1;
  }

  .build-info h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1.1rem;
  }

  .build-info p {
    margin: 0.25rem 0 0 0;
    color: #666;
    font-size: 0.9rem;
  }

  .build-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .status-in-progress .build-status {
    background: #e3f2fd;
    color: #1976d2;
  }

  .status-pending .build-status {
    background: #fff3e0;
    color: var(--warning);
  }

  .status-completed .build-status {
    background: #e8f5e8;
    color: var(--success);
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .status-completed .progress-fill {
    background: var(--success);
  }

  .build-details p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: #666;
  }

  .build-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #666;
  }

  .empty-state h3 {
    margin: 1rem 0;
    color: var(--secondary);
  }

  .empty-state p {
    margin-bottom: 2rem;
    line-height: 1.5;
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .tool-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    transition: all 0.2s ease;
  }

  .tool-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--accent);
  }

  .tool-card h3 {
    margin: 0.5rem 0;
    color: var(--secondary);
    font-size: 1.1rem;
  }

  .tool-card p {
    margin: 0 0 1.5rem 0;
    color: #666;
    line-height: 1.5;
  }

  .qc-checklist {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .checklist-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .check-icon.completed {
    color: var(--success);
  }

  .check-icon.pending {
    color: var(--warning);
  }

  .checklist-content h4 {
    margin: 0;
    color: var(--secondary);
    font-size: 1rem;
  }

  .checklist-content p {
    margin: 0.25rem 0 0 0;
    color: #666;
    font-size: 0.9rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--secondary);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--secondary);
    border-color: var(--accent);
  }

  .btn-primary:hover {
    background: #d4a829;
    border-color: #d4a829;
  }

  .btn-secondary:hover {
    background: var(--primary);
    border-color: var(--accent);
    color: var(--accent);
  }

  .error-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    text-align: center;
  }

  @media (max-width: 768px) {
    .build-container {
      margin: 1rem;
      padding: 0;
    }

    .page-header {
      padding: 1.5rem;
    }

    .header-content {
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
    }

    .header-content h1 {
      font-size: 1.5rem;
    }

    .section {
      padding: 1.5rem;
    }

    .tools-grid {
      grid-template-columns: 1fr;
    }

    .build-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .build-status {
      align-self: flex-start;
    }
  }
</style>
