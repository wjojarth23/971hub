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
  });  async function loadBuilds() {
    try {
      const { data, error } = await supabase
        .from('builds')
        .select(`
          *,
          subsystems(name, onshape_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      builds = data || [];
      
      // Get parts data for each build
      for (const build of builds) {
        if (build.part_ids && build.part_ids.length > 0) {
          // Get parts from parts table
          const { data: partsData, error: partsError } = await supabase
            .from('parts')
            .select('*')
            .in('id', build.part_ids);

          if (!partsError) {
            build.parts = partsData || [];
          }

          // Get purchasing data (COTS parts might be in purchasing table)
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
      }
      
      // Calculate stats and update build statuses
      buildStats = {
        total: builds.length,
        pending: 0,
        ready_to_assemble: 0,
        assembled: 0
      };

      // Update build statuses based on part completion
      for (const build of builds) {
        if (build.status !== 'assembled') {
          const allParts = [...(build.parts || []), ...(build.purchasing || [])];
          if (allParts.length > 0) {
            // Check if all parts are completed
            const allPartsComplete = allParts.every(part => 
              part.status === 'complete' || part.status === 'delivered'
            );
            
            // Update build status if needed
            if (allPartsComplete && build.status === 'pending') {
              // Update build to ready_to_assemble
              await supabase
                .from('builds')
                .update({ status: 'ready_to_assemble' })
                .eq('id', build.id);
              build.status = 'ready_to_assemble';
            } else if (!allPartsComplete && allParts.some(part => part.status !== 'pending')) {
              // Update build to manufacturing if any parts are in progress
              await supabase
                .from('builds')
                .update({ status: 'manufacturing' })
                .eq('id', build.id);
              build.status = 'manufacturing';
            }
          }
        }
        
        // Count for stats
        if (build.status === 'pending') buildStats.pending++;
        else if (build.status === 'ready_to_assemble' || build.status === 'manufacturing') buildStats.ready_to_assemble++;
        else if (build.status === 'assembled') buildStats.assembled++;
      }
      
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
      status = 'Ready';
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
          <div class="builds-grid">            {#each builds as build}
              {@const progress = getBuildProgress(build)}
              <div class="build-card status-{build.status}" 
                   on:click={() => goto(`/cad/build/${build.id}`)} 
                   on:keydown={(e) => e.key === 'Enter' && goto(`/cad/build/${build.id}`)}
                   role="button" 
                   tabindex="0">                <div class="build-header">
                  <Package size={20} />
                  <div class="build-info">
                    <h3>{build.subsystems?.name || 'Unknown'} - {build.release_name}</h3>
                    <p>Build #{build.build_hash?.split('_')[1] || 'N/A'}</p>                  </div>
                  <div class="build-status">
                    {#if build.status === 'pending'}
                      <Clock size={16} />
                      <span>{progress.status}</span>
                    {:else if build.status === 'manufacturing'}
                      <Wrench size={16} />
                      <span>Manufacturing</span>
                    {:else if build.status === 'ready_to_assemble'}
                      <CheckCircle size={16} />
                      <span>Ready</span>
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
                  <p><strong>Status:</strong> {progress.status}</p>
                  <p><strong>Created:</strong> {new Date(build.created_at).toLocaleDateString()}</p>
                  {#if build.assembled_at}
                    <p><strong>Assembled:</strong> {new Date(build.assembled_at).toLocaleDateString()}</p>
                  {/if}
                </div>                <!-- PARTS TABLE FOR EACH BUILD -->
                {#if (build.parts && build.parts.length > 0) || (build.purchasing && build.purchasing.length > 0)}
                  <div class="parts-table-container" style="margin-top: 1.5rem;">
                    <table class="parts-table">
                      <thead>
                        <tr>
                          <th>Part Name</th>
                          <th>Requester</th>
                          <th>Qty</th>
                          <th>Type</th>
                          <th>Material</th>
                          <th>Workflow</th>
                          <th>Status</th>
                          <th>Kitting Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each build.parts || [] as part}
                          <tr>
                            <td>{part.name}</td>
                            <td>{part.requester}</td>
                            <td>{part.quantity}</td>
                            <td>
                              <span class="part-type type-manufactured">
                                Manufactured
                              </span>
                            </td>
                            <td>{part.material || '-'}</td>
                            <td>
                              <span class="workflow-badge workflow-{part.workflow}">
                                {part.workflow || '-'}
                              </span>
                            </td>
                            <td>
                              <span class="status-badge status-{part.status}">
                                {#if part.status === 'complete'}
                                  {#if part.delivered}
                                    ✅ Complete & Delivered
                                  {:else}
                                    ⚠️ Complete (Not Delivered)
                                  {/if}
                                {:else if part.status === 'pending'}
                                  ⏳ Pending
                                {:else if part.status === 'in-progress'}
                                  🔄 In Progress
                                {:else if part.status === 'cammed'}
                                  🔧 Cammed
                                {:else}
                                  {part.status}
                                {/if}
                              </span>
                            </td>
                            <td>
                              {#if part.kitting_bin}
                                <span class="kitting-location">
                                  📦 {part.kitting_bin}
                                </span>
                              {:else}
                                <span class="no-kitting">No location assigned</span>
                              {/if}
                            </td>
                          </tr>
                        {/each}
                        {#each build.purchasing || [] as part}
                          <tr>
                            <td>{part.name}</td>
                            <td>{part.requester}</td>
                            <td>{part.quantity}</td>
                            <td>
                              <span class="part-type type-cots">
                                COTS
                              </span>
                            </td>
                            <td>{part.material || '-'}</td>
                            <td>
                              <span class="workflow-badge workflow-purchase">
                                Purchase
                              </span>
                            </td>
                            <td>
                              <span class="status-badge status-{part.status}">
                                {#if part.status === 'delivered'}
                                  ✅ Delivered
                                {:else if part.status === 'ordered'}
                                  📦 Ordered
                                {:else if part.status === 'pending'}
                                  ⏳ Pending
                                {:else}
                                  {part.status}
                                {/if}
                              </span>
                            </td>
                            <td>
                              <span class="no-kitting">-</span>
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}<div class="build-actions">
                  <a href="/cad/build/{build.id}" class="btn btn-primary">
                    <ExternalLink size={14} />
                    View Details
                  </a>
                  
                  {#if build.subsystems?.onshape_url}
                    <a href={build.subsystems.onshape_url} target="_blank" class="btn btn-secondary">
                      <ExternalLink size={14} />
                      View CAD
                    </a>
                  {/if}
                  
                  <!-- BUILD FINISHED BUTTON LOGIC -->
                  {#if build.status !== 'assembled'}
                    {@const progress = getBuildProgress(build)}
                    {#if progress.status === 'Ready'}
                      <button class="btn btn-success" on:click|stopPropagation={() => markAsAssembled(build.id)}>
                        <CheckCircle size={14} />
                        Build Finished
                      </button>
                    {/if}
                  {/if}
                </div>
            </div>
          {/each}
        </div>
      {:else}        <div class="empty-state">
          <Package size={48} />
          <h3>No Builds Yet</h3>
          <p>Builds are automatically created when you add parts from CAD subsystem BOMs.</p>
          <p>To create your first build:</p>
          <ol style="text-align: left; margin: 1rem 0;">
            <li>Go to a CAD subsystem</li>
            <li>Generate or view a BOM</li>
            <li>Add parts to manufacturing or purchasing</li>
            <li>A build will be created automatically</li>
          </ol>
          <a href="/cad" class="btn btn-primary">
            Go to CAD Subsystems
          </a>
        </div>
      {/if}
    </section>
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
    cursor: pointer;
  }

  .build-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--accent);
    transform: translateY(-2px);
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

  /* Parts table styles */
  .parts-table-container {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-top: 1rem;
  }

  .parts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .parts-table th,
  .parts-table td {
    padding: 0.6rem 0.8rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .parts-table th {
    background: #f8f9fa;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .parts-table tr:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  .part-type {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .part-type.type-cots {
    background: #fff8e1;
    color: #f57f17;
    border: 1px solid #ffcc02;
  }

  .part-type.type-manufactured {
    background: #e1f5fe;
    color: #0277bd;
    border: 1px solid #81d4fa;
  }

  .workflow-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
    background: #f0f0f0;
    color: #333;
  }

  .workflow-badge.workflow-3d-print {
    background: #e8f5e8;
    color: #2e7d32;
  }

  .workflow-badge.workflow-laser-cut {
    background: #fff3e0;
    color: #f57c00;
  }

  .workflow-badge.workflow-mill {
    background: #e3f2fd;
    color: #1976d2;
  }

  .workflow-badge.workflow-lathe {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  .workflow-badge.workflow-router {
    background: #fce4ec;
    color: #c2185b;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .status-badge.status-pending {
    background: #fff8e1;
    color: #f57f17;
  }

  .status-badge.status-manufactured {
    background: #e8f5e8;
    color: #2e7d32;
  }

  .status-badge.status-delivered {
    background: #e8f5e8;
    color: #2e7d32;
  }

  .status-badge.status-in-progress {
    background: #e3f2fd;
    color: #1976d2;
  }

  .status-badge.status-cammed {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  .status-badge.status-ordered {
    background: #fff3e0;
    color: #f57c00;
  }

  .status-badge.status-complete {
    background: #e8f5e8;
    color: #2e7d32;
  }

  .kitting-location {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
    background: #e3f2fd;
    color: #1976d2;
    border: 1px solid #90caf9;
  }

  .no-kitting {
    color: #9e9e9e;
    font-style: italic;
    font-size: 0.7rem;
  }

  .parts-table th:nth-child(8),
  .parts-table td:nth-child(8) {
    min-width: 120px;
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
