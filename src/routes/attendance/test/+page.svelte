<script>
  import { onMount } from 'svelte';
  import { trackUserAttendance, getUserAttendanceStats } from '$lib/attendance.js';
  import { userStore } from '$lib/stores/user.js';
  import { Shield, MapPin, Calendar, Clock, TestTube } from 'lucide-svelte';
  
  let user = null;
  let currentIP = null;
  let attendanceLogged = false;
  let userStats = null;
  let testing = false;

  onMount(async () => {
    // Subscribe to user store
    const unsubscribe = userStore.subscribe(value => {
      user = value;
      if (user) {
        loadUserStats();
      }
    });

    // Get current IP for display
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      currentIP = data.ip;
    } catch (error) {
      console.error('Could not fetch IP:', error);
    }

    return unsubscribe;
  });

  async function loadUserStats() {
    if (!user?.id) return;
    
    try {
      userStats = await getUserAttendanceStats(user.id);
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  async function testAttendanceTracking() {
    if (!user?.id) {
      alert('Please log in first');
      return;
    }

    testing = true;
    try {
      attendanceLogged = await trackUserAttendance(user.id);
      await loadUserStats(); // Refresh stats after test
    } catch (error) {
      console.error('Error testing attendance:', error);
      alert('Error testing attendance tracking');
    } finally {
      testing = false;
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>Attendance Test - Debug Info</title>
</svelte:head>

<div class="page-header">
  <h1>
    <TestTube size={32} />
    Attendance Tracking Test
  </h1>
  <p class="page-description">
    Test and debug attendance tracking functionality
  </p>
</div>

<!-- Current Status -->
<div class="card">
  <h2>
    <Shield size={24} />
    Current Status
  </h2>
  
  <div class="status-grid">
    <div class="status-item">
      <div class="status-label">Current User:</div>
      <div class="status-value">
        {user ? `${user.full_name} (${user.email})` : 'Not logged in'}
      </div>
    </div>
    
    <div class="status-item">
      <div class="status-label">Your External IP:</div>
      <div class="status-value ip-address">
        {currentIP || 'Loading...'}
      </div>
    </div>
    
    <div class="status-item">
      <div class="status-label">Last Test Result:</div>
      <div class="status-value">
        {#if attendanceLogged === null}
          Not tested yet
        {:else if attendanceLogged}
          <span class="success">✅ Attendance logged</span>
        {:else}
          <span class="warning">⚠️ IP not in allowed list</span>
        {/if}
      </div>
    </div>
  </div>
  
  <div class="test-section">
    <button 
      class="btn btn-primary" 
      on:click={testAttendanceTracking}
      disabled={testing || !user}
    >
      {testing ? 'Testing...' : 'Test Attendance Tracking'}
    </button>
    <p class="test-description">
      This will attempt to log your attendance from your current IP address.
    </p>
  </div>
</div>

<!-- User Statistics -->
{#if user && userStats}
  <div class="card">
    <h2>
      <Calendar size={24} />
      Your Attendance Stats (Last 30 Days)
    </h2>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">
          <Calendar size={24} />
        </div>
        <div class="stat-content">
          <h3>{userStats.days_attended || 0}</h3>
          <p>Days Attended</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon">
          <Clock size={24} />
        </div>
        <div class="stat-content">
          <h3>{userStats.total_logins || 0}</h3>
          <p>Total Logins</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon">
          <MapPin size={24} />
        </div>
        <div class="stat-content">
          <h3>{userStats.locations_visited ? userStats.locations_visited.length : 0}</h3>
          <p>Locations</p>
        </div>
      </div>
    </div>
    
    <div class="detailed-stats">
      <div class="stat-row">
        <span class="stat-label">Last Login:</span>
        <span class="stat-value">{formatDate(userStats.last_login)}</span>
      </div>
      
      <div class="stat-row">
        <span class="stat-label">First Login (30 days):</span>
        <span class="stat-value">{formatDate(userStats.first_login_in_period)}</span>
      </div>
      
      {#if userStats.locations_visited && userStats.locations_visited.length > 0}
        <div class="stat-row">
          <span class="stat-label">Locations Visited:</span>
          <span class="stat-value">{userStats.locations_visited.join(', ')}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Instructions -->
<div class="card">
  <h2>How to Set Up Attendance Tracking</h2>
  
  <div class="instructions">
    <div class="instruction-step">
      <div class="step-number">1</div>
      <div class="step-content">
        <h3>Add Your Location's IP</h3>
        <p>Go to <a href="/attendance/settings" class="text-link">Attendance Settings</a> and add your current IP address ({currentIP}) to the allowed list.</p>
      </div>
    </div>
    
    <div class="instruction-step">
      <div class="step-number">2</div>
      <div class="step-content">
        <h3>Test the Connection</h3>
        <p>Use the "Test Attendance Tracking" button above to verify that your IP is recognized.</p>
      </div>
    </div>
    
    <div class="instruction-step">
      <div class="step-number">3</div>
      <div class="step-content">
        <h3>Automatic Tracking</h3>
        <p>Once configured, attendance will be automatically logged every time you or team members access the system from allowed locations.</p>
      </div>
    </div>
  </div>
</div>

<!-- Debug Information -->
<div class="card debug-card">
  <h2>Debug Information</h2>
  
  <div class="debug-section">
    <h3>User Object:</h3>
    <pre class="debug-code">{JSON.stringify(user, null, 2)}</pre>
  </div>
  
  <div class="debug-section">
    <h3>User Stats:</h3>
    <pre class="debug-code">{JSON.stringify(userStats, null, 2)}</pre>
  </div>
  
  <div class="debug-section">
    <h3>Current IP:</h3>
    <pre class="debug-code">{currentIP}</pre>
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
  
  .status-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  
  .status-label {
    font-weight: 500;
    color: var(--secondary);
  }
  
  .status-value {
    font-family: 'Courier New', monospace;
    color: #666;
  }
  
  .ip-address {
    background: var(--accent);
    color: var(--primary);
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-weight: 600;
  }
  
  .success {
    color: #4caf50;
    font-weight: 600;
  }
  
  .warning {
    color: #ff9800;
    font-weight: 600;
  }
  
  .test-section {
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
    text-align: center;
  }
  
  .test-description {
    margin: 1rem 0 0 0;
    color: #666;
    font-size: 0.9rem;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .stat-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .stat-icon {
    background: var(--accent);
    color: var(--primary);
    padding: 0.75rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .stat-content h3 {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--secondary);
  }
  
  .stat-content p {
    margin: 0;
    color: #666;
    font-size: 0.9rem;
  }
  
  .detailed-stats {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
  
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
  }
  
  .stat-label {
    font-weight: 500;
    color: var(--secondary);
  }
  
  .instructions {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .instruction-step {
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
  
  .debug-card {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
  }
  
  .debug-section {
    margin-bottom: 1.5rem;
  }
  
  .debug-section h3 {
    margin: 0 0 0.5rem 0;
    color: var(--secondary);
    font-size: 1rem;
  }
  
  .debug-code {
    background: #343a40;
    color: #f8f9fa;
    padding: 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    overflow-x: auto;
    white-space: pre-wrap;
    margin: 0;
  }
  
  @media (max-width: 768px) {
    .status-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }
    
    .stat-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }
  }
</style>
