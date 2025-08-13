<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { ShoppingCart, Package, DollarSign, Truck, CheckCircle, Clock, AlertTriangle, Edit, MapPin, Download, Settings, X, Link as LinkIcon } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  let user = null;
  let loading = true;
  let parts = [];
  let showKittingModal = false;
  let selectedPart = null;

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

    await loadParts();
    loading = false;
  });

  async function loadParts() {
    try {
      // Load COTS purchasing items
      const { data, error } = await supabase
        .from('purchasing')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      parts = data || [];
    } catch (error) {
      console.error('Error loading parts:', error);
      alert('Failed to load parts');
    }
  }

  async function updatePartStatus(part, statusField, newStatus) {
    try {
      const { error } = await supabase
        .from('purchasing')
        .update({ [statusField]: newStatus })
        .eq('id', part.id);

      if (error) throw error;
      
      await loadParts();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  }

  async function updateKittingLocationFor(part, location) {
    try {
      const { error } = await supabase
        .from('purchasing')
        .update({ kitting_bin: location })
        .eq('id', part.id);

      if (error) throw error;
      await loadParts();
    } catch (error) {
      console.error('Error updating kitting location:', error);
      alert('Failed to update kitting location');
    }
  }

  function downloadPart(part) {
    // For purchasing, open vendor URL if present
    if (part?.url) {
      window.open(part.url, '_blank', 'noopener');
    } else {
      alert('No link available for this item');
    }
  }

  function getWorkflowDisplay(workflow) {
    if (!workflow) return 'Not specified';
    return workflow.charAt(0).toUpperCase() + workflow.slice(1);
  }
</script>

<svelte:head>
  <title>Purchasing (COTS) - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading parts...</p>
  </div>
{:else if user}
  <div class="parts-container">
    <div class="page-header">
      <div class="header-content">
        <ShoppingCart size={32} />
        <div>
          <h1>Purchasing (COTS)</h1>
          <p>Track vendor parts, orders, delivery, and kitting</p>
        </div>
      </div>
    </div>

    {#if parts.length > 0}
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Vendor</th>
              <th>Part #</th>
              <th>Project ID</th>
              <th>Requester</th>
              <th>Quantity</th>
              <th>Link</th>
              <th>Status</th>
              <th>Kit</th>
            </tr>
          </thead>
          <tbody>
            {#each parts as part}
              <tr>
                <td class="part-name">
                  <div class="name-cell">
                    {part.name}
                  </div>
                </td>
                <td class="material">
                  {part.vendor || '—'}
                </td>
                <td class="project-id">
                  {part.part_number || '—'}
                </td>
                <td class="project-id">
                  {part.project_id || '-'}
                </td>
                <td class="requester">
                  {part.requester || 'Unknown'}
                </td>
                <td class="quantity">
                  {part.quantity || 1}
                </td>
                <td class="download">
                  <button class="btn btn-secondary btn-sm" on:click={() => downloadPart(part)} title="Open vendor link">
                    <LinkIcon size={16} />
                  </button>
                </td>
                <td class="status">
                  <select 
                    class="status-select colorful" 
                    value={part.status || 'pending'}
                    data-status={part.status || 'pending'}
                    on:change={(e) => updatePartStatus(part, 'status', e.target.value)}
                  >
                    <option value="pending" data-color="#ffc107">Pending</option>
                    <option value="ordered" data-color="#6c5ce7">Ordered</option>
                    <option value="delivered" data-color="#27ae60">Delivered</option>
                    <option value="kitted" data-color="#2ecc71">Kitted</option>
                  </select>
                </td>
                <td class="kit">
                  <div class="kit-inline">
                    <input 
                      type="text" 
                      class="form-input kit-input" 
                      placeholder="Bin/Location"
                      value={part.kitting_bin || ''}
                      on:keydown={(e) => { if (e.key === 'Enter') updateKittingLocationFor(part, e.target.value.trim()); }}
                      on:blur={(e) => updateKittingLocationFor(part, e.target.value.trim())}
                    />
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-state">
  <ShoppingCart size={64} />
        <h3>No Parts Found</h3>
  <p>No purchasing items have been added yet.</p>
  <p>Add COTS items via your BOM flow or purchasing tools.</p>
      </div>
    {/if}
  </div>

  <!-- Kitting modal removed; inline input used instead -->
{:else}
  <div class="error-container">
    <p>Please log in to access Parts Management.</p>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--background);
    color: var(--text);
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

  .parts-container {
    max-width: 1600px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .page-header {
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: var(--shadow-sm);
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

  /* removed unused table CSS (relies on global) */

  .part-name {
    font-weight: 500;
    min-width: 200px;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .material {
    color: #666;
  }

  .project-id {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8rem;
    color: #666;
  }

  .requester {
    color: #666;
  }

  .download {
    text-align: center;
  }

  /* removed legacy download-btn styles */

  .status-select {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    background: var(--primary);
    color: var(--text);
    min-width: 120px;
  }

  /* Selected value background by data-status */
  .status-select.colorful[data-status="pending"] {
    background: #fff3cd;
    color: #8a6d3b;
    border-color: #ffe69c;
  }
  .status-select.colorful[data-status="ordered"] {
    background: #ede7f6;
    color: #5e35b1;
    border-color: #c5b3e6;
  }
  .status-select.colorful[data-status="ordered"] {
    background: #ede7f6;
    color: #5e35b1;
    border-color: #c5b3e6;
  }
  .status-select.colorful[data-status="delivered"] {
    background: #e8f5e9;
    color: #2e7d32;
    border-color: #a5d6a7;
  }
  .status-select.colorful[data-status="kitted"] {
    background: #e0f7fa;
    color: #006064;
    border-color: #80deea;
  }

  /* Colorful dropdown options and selected background */
  .status-select.colorful option[value="pending"] { background: #fff3cd; }
  .status-select.colorful option[value="ordered"] { background: #ede7f6; }
  .status-select.colorful option[value="delivered"] { background: #e8f5e9; }
  .status-select.colorful option[value="kitted"] { background: #e0f7fa; }

  .kit-inline { display: flex; align-items: center; gap: 0.5rem; }
  .kit-input { min-width: 140px; padding: 0.375rem 0.5rem; }

  /* removed unused states */

  /* removed old kit button styles */

  /* Modal Styles */
  /* removed modal styles */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: #666;
  }

  .empty-state h3 {
    margin: 1rem 0 0.5rem 0;
    color: var(--secondary);
  }

  .empty-state p {
    margin: 0.25rem 0;
    color: #999;
  }

  .error-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    text-align: center;
  }

  @media (max-width: 1400px) { }

  @media (max-width: 1200px) { .parts-container { margin: 1rem; padding: 0; } .page-header { padding: 1.5rem; } .header-content { flex-direction: column; align-items: flex-start; } }

  @media (max-width: 768px) { }
</style>
