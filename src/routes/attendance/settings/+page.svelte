<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { addAllowedIP, removeAllowedIP, getAllowedIPs } from '$lib/attendance.js';
  import { Settings, Plus, Trash2, MapPin, Globe, Shield, AlertCircle } from 'lucide-svelte';
  
  let allowedIps = [];
  let loading = true;
  let showAddForm = false;
  let newIP = {
    ip_address: '',
    location_name: '',
    description: ''
  };
  let saving = false;
  let errorMessage = '';

  onMount(async () => {
    await loadAllowedIPs();
  });

  async function loadAllowedIPs() {
    try {
      loading = true;
      allowedIps = await getAllowedIPs();
    } catch (error) {
      console.error('Error loading allowed IPs:', error);
      errorMessage = 'Failed to load allowed IPs. Please try again.';
    } finally {
      loading = false;
    }
  }

  async function handleAddIP() {
    if (!newIP.ip_address || !newIP.location_name) {
      errorMessage = 'IP address and location name are required.';
      return;
    }

    try {
      saving = true;
      errorMessage = '';
      
      const success = await addAllowedIP(
        newIP.ip_address.trim(),
        newIP.location_name.trim(),
        newIP.description.trim()
      );

      if (success) {
        await loadAllowedIPs();
        resetForm();
        showAddForm = false;
      } else {
        errorMessage = 'Failed to add IP address. It may already exist.';
      }
    } catch (error) {
      console.error('Error adding IP:', error);
      errorMessage = 'Error adding IP address. Please try again.';
    } finally {
      saving = false;
    }
  }

  async function handleRemoveIP(ipAddress) {
    if (!confirm(`Are you sure you want to remove ${ipAddress}?`)) {
      return;
    }

    try {
      const success = await removeAllowedIP(ipAddress);
      if (success) {
        await loadAllowedIPs();
      } else {
        errorMessage = 'Failed to remove IP address. Please try again.';
      }
    } catch (error) {
      console.error('Error removing IP:', error);
      errorMessage = 'Error removing IP address. Please try again.';
    }
  }

  function resetForm() {
    newIP = {
      ip_address: '',
      location_name: '',
      description: ''
    };
    errorMessage = '';
  }

  function validateIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>Attendance Settings - IP Management</title>
</svelte:head>

<div class="page-header">
  <h1>
    <Settings size={32} />
    Attendance Settings
  </h1>
  <p class="page-description">
    Manage allowed external IP addresses for attendance tracking
  </p>
</div>

<!-- Info Banner -->
<div class="info-banner">
  <div class="info-content">
    <Shield size={20} />
    <div>
      <h3>How Attendance Tracking Works</h3>
      <p>Users accessing the system from these external IP addresses will automatically have their attendance logged. This is useful for tracking when team members are physically present at specific locations.</p>
    </div>
  </div>
</div>

<!-- Error Message -->
{#if errorMessage}
  <div class="error-banner">
    <AlertCircle size={20} />
    {errorMessage}
    <button on:click={() => errorMessage = ''} class="close-btn">×</button>
  </div>
{/if}

<!-- Add New IP Form -->
<div class="card">
  <div class="card-header">
    <h2>
      <Plus size={24} />
      Add Allowed IP Address
    </h2>
    <button 
      class="btn btn-primary" 
      on:click={() => showAddForm = !showAddForm}
    >
      {showAddForm ? 'Cancel' : 'Add IP'}
    </button>
  </div>

  {#if showAddForm}
    <form on:submit|preventDefault={handleAddIP} class="add-ip-form">
      <div class="form-grid">
        <div class="form-group">
          <label for="ip-address" class="form-label">
            <Globe size={16} />
            IP Address *
          </label>
          <input
            id="ip-address"
            type="text"
            class="form-input"
            placeholder="192.168.1.100"
            bind:value={newIP.ip_address}
            class:invalid={newIP.ip_address && !validateIP(newIP.ip_address)}
            required
          />
          {#if newIP.ip_address && !validateIP(newIP.ip_address)}
            <span class="error-text">Please enter a valid IP address</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="location-name" class="form-label">
            <MapPin size={16} />
            Location Name *
          </label>
          <input
            id="location-name"
            type="text"
            class="form-input"
            placeholder="Main Workshop"
            bind:value={newIP.location_name}
            required
          />
        </div>
      </div>

      <div class="form-group">
        <label for="description" class="form-label">Description</label>
        <textarea
          id="description"
          class="form-input"
          placeholder="Optional description of this location..."
          bind:value={newIP.description}
          rows="2"
        ></textarea>
      </div>

      <div class="form-actions">
        <button 
          type="submit" 
          class="btn btn-primary"
          disabled={saving || !newIP.ip_address || !newIP.location_name || !validateIP(newIP.ip_address)}
        >
          {saving ? 'Adding...' : 'Add IP Address'}
        </button>
        <button 
          type="button" 
          class="btn btn-secondary"
          on:click={() => { showAddForm = false; resetForm(); }}
        >
          Cancel
        </button>
      </div>
    </form>
  {/if}
</div>

<!-- Allowed IPs List -->
<div class="card">
  <h2>
    <Shield size={24} />
    Allowed IP Addresses ({allowedIps.length})
  </h2>

  {#if loading}
    <p>Loading allowed IP addresses...</p>
  {:else if allowedIps.length === 0}
    <div class="empty-state">
      <Globe size={48} />
      <h3>No IP Addresses Configured</h3>
      <p>Add your first allowed IP address to start tracking attendance.</p>
      <button class="btn btn-primary" on:click={() => showAddForm = true}>
        <Plus size={16} />
        Add IP Address
      </button>
    </div>
  {:else}
    <div class="ip-list">
      {#each allowedIps as ip (ip.id)}
        <div class="ip-card">
          <div class="ip-info">
            <div class="ip-header">
              <h3>{ip.location_name}</h3>
              <span class="ip-address">{ip.ip_address}</span>
            </div>
            {#if ip.description}
              <p class="ip-description">{ip.description}</p>
            {/if}
            <div class="ip-meta">
              <span class="created-date">
                Added: {formatDate(ip.created_at)}
              </span>
              {#if ip.updated_at !== ip.created_at}
                <span class="updated-date">
                  Updated: {formatDate(ip.updated_at)}
                </span>
              {/if}
            </div>
          </div>
          
          <div class="ip-actions">
            <button 
              class="btn btn-danger btn-sm"
              on:click={() => handleRemoveIP(ip.ip_address)}
              title="Remove this IP address"
            >
              <Trash2 size={16} />
              Remove
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Usage Instructions -->
<div class="card">
  <h2>Usage Instructions</h2>
  <div class="instructions">
    <div class="instruction-item">
      <div class="step-number">1</div>
      <div class="step-content">
        <h3>Add External IP Addresses</h3>
        <p>Add the external IP addresses of locations where you want to track attendance (e.g., workshop, lab, meeting rooms).</p>
      </div>
    </div>
    
    <div class="instruction-item">
      <div class="step-number">2</div>
      <div class="step-content">
        <h3>Automatic Tracking</h3>
        <p>When users log in from these IP addresses, their attendance will be automatically recorded with the date and time.</p>
      </div>
    </div>
    
    <div class="instruction-item">
      <div class="step-number">3</div>
      <div class="step-content">
        <h3>View Leaderboard</h3>
        <p>Check the <a href="/attendance" class="text-link">Attendance Leaderboard</a> to see who has been most active over the past 30 days.</p>
      </div>
    </div>
  </div>
</div>

<style>
  .page-header {
    margin-bottom: 2rem;
  }
  
  .page-header h1 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0 0 0.5rem 0;
    color: var(--secondary);
  }
  
  .page-description {
    color: #666;
    margin: 0;
  }
  
  .info-banner {
    background: linear-gradient(135deg, #e3f2fd, #f8f9fa);
    border: 1px solid #2196f3;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }
  
  .info-content {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .info-content h3 {
    margin: 0 0 0.5rem 0;
    color: var(--secondary);
  }
  
  .info-content p {
    margin: 0;
    color: #666;
    line-height: 1.5;
  }
  
  .error-banner {
    background: #ffebee;
    border: 1px solid #f44336;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #c62828;
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    margin-left: auto;
    color: #c62828;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .card-header h2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--secondary);
  }
  
  .add-ip-form {
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
  }
  
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .form-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: var(--secondary);
  }
  
  .form-input {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .form-input.invalid {
    border-color: #f44336;
  }
  
  .error-text {
    color: #f44336;
    font-size: 0.875rem;
  }
  
  .form-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #666;
  }
  
  .empty-state h3 {
    margin: 1rem 0 0.5rem 0;
    color: var(--secondary);
  }
  
  .empty-state p {
    margin: 0 0 2rem 0;
  }
  
  .ip-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .ip-card {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
  }
  
  .ip-info {
    flex: 1;
  }
  
  .ip-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  
  .ip-header h3 {
    margin: 0;
    color: var(--secondary);
  }
  
  .ip-address {
    font-family: 'Courier New', monospace;
    background: var(--accent);
    color: var(--primary);
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 600;
  }
  
  .ip-description {
    margin: 0.5rem 0;
    color: #666;
    line-height: 1.4;
  }
  
  .ip-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: #888;
  }
  
  .ip-actions {
    margin-left: 1rem;
  }
  
  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }
  
  .btn-danger {
    background: #f44336;
    color: white;
    border: 1px solid #f44336;
  }
  
  .btn-danger:hover {
    background: #d32f2f;
    border-color: #d32f2f;
  }
  
  .instructions {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .instruction-item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .step-number {
    background: var(--accent);
    color: var(--primary);
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    flex-shrink: 0;
  }
  
  .step-content h3 {
    margin: 0 0 0.5rem 0;
    color: var(--secondary);
  }
  
  .step-content p {
    margin: 0;
    color: #666;
    line-height: 1.5;
  }
  
  .text-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 500;
  }
  
  .text-link:hover {
    text-decoration: underline;
  }
  
  @media (max-width: 768px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
    
    .card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
    
    .ip-card {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }
    
    .ip-actions {
      margin-left: 0;
    }
    
    .ip-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    
    .form-actions {
      flex-direction: column;
    }
  }
</style>
