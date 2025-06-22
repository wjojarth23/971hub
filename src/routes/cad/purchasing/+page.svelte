<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { ShoppingCart, Package, DollarSign, Truck, CheckCircle, Clock, AlertTriangle, Edit, MapPin } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  let user = null;
  let loading = true;
  let purchasingItems = [];

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

    await loadPurchasingItems();
    loading = false;
  });

  async function loadPurchasingItems() {
    try {
      const { data, error } = await supabase
        .from('purchasing')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      purchasingItems = data || [];
    } catch (error) {
      console.error('Error loading purchasing items:', error);
      alert('Failed to load purchasing items');
    }
  }

  async function updateStatus(item, newStatus) {
    try {
      const { error } = await supabase
        .from('purchasing')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;
      
      await loadPurchasingItems();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  }

  async function updateKittingBin(item, kittingBin) {
    try {
      const { error } = await supabase
        .from('purchasing')
        .update({ 
          kitting_bin: kittingBin,
          status: kittingBin ? 'kitted' : item.status 
        })
        .eq('id', item.id);

      if (error) throw error;
      
      await loadPurchasingItems();
    } catch (error) {
      console.error('Error updating kitting bin:', error);
      alert('Failed to update kitting bin');
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'pending': return Clock;
      case 'ordered': return ShoppingCart;
      case 'delivered': return Truck;
      case 'kitted': return CheckCircle;
      default: return Package;
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'pending': return '#f39c12';
      case 'ordered': return '#3498db';
      case 'delivered': return '#27ae60';
      case 'kitted': return '#2ecc71';
      default: return '#95a5a6';
    }
  }
</script>

<svelte:head>
  <title>Purchasing - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading purchasing items...</p>
  </div>
{:else if user}
  <div class="purchasing-container">
    <div class="page-header">
      <div class="header-content">
        <ShoppingCart size={32} />
        <div>
          <h1>Purchasing List</h1>
          <p>Manage COTS parts, vendors, and purchase orders</p>
        </div>
      </div>
    </div>

    {#if purchasingItems.length > 0}
      <div class="purchasing-table-container">
        <table class="purchasing-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Vendor</th>
              <th>Part Number</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Status</th>
              <th>Kitting Location</th>
              <th>Project</th>
              <th>Requester</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each purchasingItems as item}
              <tr class="status-{item.status}">
                <td class="item-name">
                  <div class="name-cell">
                    <Package size={16} />
                    {item.name}
                  </div>
                </td>
                <td>
                  {#if item.vendor}
                    <span class="vendor-name">{item.vendor}</span>
                  {:else}
                    <span class="no-vendor">Not specified</span>
                  {/if}
                </td>
                <td>
                  {#if item.part_number}
                    <code class="part-number">{item.part_number}</code>
                  {:else}
                    <span class="no-part-number">-</span>
                  {/if}
                </td>
                <td class="quantity">
                  {item.quantity}
                </td>
                <td class="price">
                  {#if item.price}
                    ${item.price}
                  {:else if item.final_price}
                    ${item.final_price}
                  {:else}
                    <span class="no-price">TBD</span>
                  {/if}
                </td>                <td>
                  <div class="status-cell">
                    {#if item.status === 'pending'}
                      <Clock size={16} style="color: #f39c12" />
                    {:else if item.status === 'ordered'}
                      <ShoppingCart size={16} style="color: #3498db" />
                    {:else if item.status === 'delivered'}
                      <Truck size={16} style="color: #27ae60" />
                    {:else if item.status === 'kitted'}
                      <CheckCircle size={16} style="color: #2ecc71" />
                    {:else}
                      <Package size={16} style="color: #95a5a6" />
                    {/if}
                    <select 
                      class="status-select" 
                      value={item.status}
                      on:change={(e) => updateStatus(item, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="ordered">Ordered</option>
                      <option value="delivered">Delivered</option>
                      <option value="kitted">Kitted</option>
                    </select>
                  </div>
                </td>
                <td class="kitting-cell">
                  {#if item.kitting_bin}
                    <div class="kitting-display">
                      <MapPin size={14} />
                      <span>{item.kitting_bin}</span>
                    </div>
                  {:else}
                    <input 
                      class="kitting-input" 
                      placeholder="Enter location..."
                      on:keypress={(e) => {
                        if (e.key === 'Enter') {
                          updateKittingBin(item, e.target.value);
                        }
                      }}
                    />
                  {/if}
                </td>
                <td class="project-id">
                  {item.project_id}
                </td>
                <td class="requester">
                  {item.requester}
                </td>
                <td class="actions">
                  <button class="edit-btn" title="Edit item">
                    <Edit size={14} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-state">
        <ShoppingCart size={64} />
        <h3>No Purchasing Items</h3>
        <p>No COTS parts have been added to the purchasing list yet.</p>
        <p>Add COTS parts from the BOM page to get started.</p>
      </div>
    {/if}
  </div>
{:else}
  <div class="error-container">
    <p>Please log in to access the Purchasing Department.</p>
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
    --info: #3498db;
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

  .purchasing-container {
    max-width: 1400px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .page-header {
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
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

  .purchasing-table-container {
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }

  .purchasing-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .purchasing-table thead {
    background: var(--background);
    border-bottom: 2px solid var(--border);
  }

  .purchasing-table th {
    padding: 1rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: var(--secondary);
    border-right: 1px solid var(--border);
  }

  .purchasing-table th:last-child {
    border-right: none;
  }

  .purchasing-table td {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    vertical-align: middle;
  }

  .purchasing-table td:last-child {
    border-right: none;
  }

  .purchasing-table tbody tr:hover {
    background: #f8f9fa;
  }

  .item-name {
    font-weight: 500;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .vendor-name {
    color: var(--info);
    font-weight: 500;
  }

  .no-vendor {
    color: #999;
    font-style: italic;
  }

  .part-number {
    background: #f1f2f6;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8rem;
  }

  .no-part-number {
    color: #999;
  }

  .quantity {
    text-align: center;
    font-weight: 500;
  }

  .price {
    color: var(--success);
    font-weight: 500;
  }

  .no-price {
    color: #999;
    font-style: italic;
  }

  .status-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-select {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    background: var(--primary);
    color: var(--text);
  }

  .kitting-cell {
    min-width: 150px;
  }

  .kitting-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--success);
    font-weight: 500;
  }

  .kitting-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.8rem;
  }

  .kitting-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .project-id {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8rem;
    color: #666;
  }

  .requester {
    color: #666;
  }

  .actions {
    text-align: center;
  }

  .edit-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.5rem;
    cursor: pointer;
    color: var(--info);
    transition: all 0.2s ease;
  }

  .edit-btn:hover {
    background: var(--info);
    color: var(--primary);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 8px;
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

  /* Status row styling */
  .status-pending {
    border-left: 4px solid var(--warning);
  }

  .status-ordered {
    border-left: 4px solid var(--info);
  }

  .status-delivered {
    border-left: 4px solid var(--success);
  }

  .status-kitted {
    border-left: 4px solid #2ecc71;
  }

  @media (max-width: 1200px) {
    .purchasing-table {
      font-size: 0.8rem;
    }

    .purchasing-table th,
    .purchasing-table td {
      padding: 0.5rem;
    }
  }

  @media (max-width: 768px) {
    .purchasing-container {
      margin: 1rem;
      padding: 0;
    }

    .page-header {
      padding: 1.5rem;
    }

    .header-content {
      flex-direction: column;
      align-items: flex-start;
    }

    .purchasing-table-container {
      overflow-x: auto;
    }

    .purchasing-table {
      min-width: 800px;
    }
  }
</style>
