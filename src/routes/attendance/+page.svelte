<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { Trophy, Users, Calendar, MapPin, Clock, TrendingUp, Award, Star } from 'lucide-svelte';
  
  let attendanceData = [];
  let dailySummary = [];
  let allowedIps = [];
  let loading = true;
  let selectedPeriod = 30; // days
  let totalUniqueUsers = 0;
  let totalLogins = 0;
  let averageAttendance = 0;

  const periods = [
    { value: 7, label: '7 Days' },
    { value: 14, label: '14 Days' },
    { value: 30, label: '30 Days' },
    { value: 90, label: '90 Days' }
  ];

  onMount(async () => {
    await loadAttendanceData();
    await loadDailySummary();
    await loadAllowedIps();
  });

  async function loadAttendanceData() {
    try {
      // Get attendance leaderboard data
      const { data, error } = await supabase
        .from('attendance_leaderboard_30_days')
        .select('*')
        .order('days_attended', { ascending: false });
      
      if (error) throw error;
      
      attendanceData = data || [];
      
      // Calculate summary statistics
      totalUniqueUsers = attendanceData.filter(user => user.days_attended > 0).length;
      totalLogins = attendanceData.reduce((sum, user) => sum + (user.total_logins || 0), 0);
      averageAttendance = totalUniqueUsers > 0 ? 
        (attendanceData.reduce((sum, user) => sum + (user.days_attended || 0), 0) / totalUniqueUsers).toFixed(1) : 0;
      
    } catch (error) {
      console.error('Error loading attendance data:', error);
      alert('Error loading attendance data. Please try again.');
    } finally {
      loading = false;
    }
  }

  async function loadDailySummary() {
    try {
      const { data, error } = await supabase
        .from('daily_attendance_summary')
        .select('*')
        .limit(30);
      
      if (error) throw error;
      dailySummary = data || [];
    } catch (error) {
      console.error('Error loading daily summary:', error);
    }
  }

  async function loadAllowedIps() {
    try {
      const { data, error } = await supabase
        .from('allowed_external_ips')
        .select('*')
        .order('location_name');
      
      if (error) throw error;
      allowedIps = data || [];
    } catch (error) {
      console.error('Error loading allowed IPs:', error);
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

  function getAttendanceRank(index, daysAttended) {
    if (daysAttended === 0) return null;
    return index + 1;
  }

  function getBadgeColor(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return 'default';
  }

  function getAttendancePercentage(daysAttended) {
    return ((daysAttended / selectedPeriod) * 100).toFixed(1);
  }

  async function exportAttendanceData() {
    try {
      // Prepare CSV data
      const headers = [
        'Rank',
        'Name',
        'Email',
        'Days Attended',
        'Attendance %',
        'Total Logins',
        'Last Login',
        'Locations Visited'
      ];
      
      const csvData = attendanceData
        .filter(user => user.days_attended > 0)
        .map((user, index) => [
          getAttendanceRank(index, user.days_attended),
          `"${user.full_name || 'Unknown'}"`,
          `"${user.email || ''}"`,
          user.days_attended || 0,
          getAttendancePercentage(user.days_attended || 0) + '%',
          user.total_logins || 0,
          formatDate(user.last_login),
          `"${(user.locations_visited || []).join(', ')}"`
        ]);
      
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
      ].join('\n');
      
      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `attendance_leaderboard_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error exporting attendance data:', error);
      alert('Error exporting data. Please try again.');
    }
  }
</script>

<svelte:head>
  <title>Attendance Leaderboard - 971 Manufacturing</title>
</svelte:head>

<div class="page-header">  <div class="header-content">
    <h1>
      <Trophy size={32} />
      Attendance Leaderboard
    </h1>
    <div class="header-actions">
      <a href="/attendance/settings" class="btn btn-secondary" style="text-decoration: none;">
        Settings
      </a>
      <button class="btn btn-secondary" on:click={exportAttendanceData}>
        Export CSV
      </button>
    </div>
  </div>
  <p class="page-description">
    Track team attendance and engagement over the last {selectedPeriod} days
  </p>
</div>

<!-- Summary Statistics -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-icon">
      <Users size={24} />
    </div>
    <div class="stat-content">
      <h3>{totalUniqueUsers}</h3>
      <p>Active Users</p>
    </div>
  </div>
  
  <div class="stat-card">
    <div class="stat-icon">
      <TrendingUp size={24} />
    </div>
    <div class="stat-content">
      <h3>{totalLogins}</h3>
      <p>Total Logins</p>
    </div>
  </div>
  
  <div class="stat-card">
    <div class="stat-icon">
      <Calendar size={24} />
    </div>
    <div class="stat-content">
      <h3>{averageAttendance}</h3>
      <p>Avg Days/User</p>
    </div>
  </div>
  
  <div class="stat-card">
    <div class="stat-icon">
      <MapPin size={24} />
    </div>
    <div class="stat-content">
      <h3>{allowedIps.length}</h3>
      <p>Locations</p>
    </div>
  </div>
</div>

{#if loading}
  <div class="card">
    <p>Loading attendance data...</p>
  </div>
{:else}
  <!-- Attendance Leaderboard -->
  <div class="card">
    <h2>
      <Award size={24} />
      Attendance Leaders ({selectedPeriod} Days)
    </h2>
    
    {#if attendanceData.filter(user => user.days_attended > 0).length === 0}
      <p>No attendance data available for the selected period.</p>
    {:else}
      <div class="leaderboard">
        {#each attendanceData.filter(user => user.days_attended > 0) as user, index}
          {@const rank = getAttendanceRank(index, user.days_attended)}
          <div class="leaderboard-item rank-{getBadgeColor(rank)}">
            <div class="rank-badge">
              {#if rank <= 3}
                <div class="medal medal-{getBadgeColor(rank)}">
                  {#if rank === 1}
                    <Trophy size={20} />
                  {:else if rank === 2}
                    <Award size={20} />
                  {:else}
                    <Star size={20} />
                  {/if}
                </div>
              {/if}
              <span class="rank-number">#{rank}</span>
            </div>
            
            <div class="user-info">
              <h3>{user.full_name || 'Unknown User'}</h3>
              <p class="user-email">{user.email || ''}</p>
            </div>
            
            <div class="attendance-stats">
              <div class="stat">
                <span class="stat-value">{user.days_attended}</span>
                <span class="stat-label">Days</span>
              </div>
              <div class="stat">
                <span class="stat-value">{getAttendancePercentage(user.days_attended)}%</span>
                <span class="stat-label">Attendance</span>
              </div>
              <div class="stat">
                <span class="stat-value">{user.total_logins}</span>
                <span class="stat-label">Logins</span>
              </div>
            </div>
            
            <div class="additional-info">
              <p class="last-login">
                <Clock size={16} />
                Last: {formatDate(user.last_login)}
              </p>
              {#if user.locations_visited && user.locations_visited.length > 0}
                <p class="locations">
                  <MapPin size={16} />
                  {user.locations_visited.join(', ')}
                </p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Daily Attendance Chart -->
  {#if dailySummary.length > 0}
    <div class="card">
      <h2>
        <Calendar size={24} />
        Daily Attendance Summary
      </h2>
      
      <div class="daily-summary">
        {#each dailySummary as day}
          <div class="day-card">
            <div class="day-date">
              {new Date(day.attendance_date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
              })}
            </div>
            <div class="day-stats">
              <div class="day-stat">
                <span class="stat-value">{day.unique_users}</span>
                <span class="stat-label">Users</span>
              </div>
              <div class="day-stat">
                <span class="stat-value">{day.total_logins}</span>
                <span class="stat-label">Logins</span>
              </div>
            </div>
            {#if day.locations_used && day.locations_used.length > 0}
              <div class="day-locations">
                {day.locations_used.join(', ')}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Allowed Locations -->
  {#if allowedIps.length > 0}
    <div class="card">
      <h2>
        <MapPin size={24} />
        Tracked Locations
      </h2>
      
      <div class="locations-grid">
        {#each allowedIps as location}
          <div class="location-card">
            <h3>{location.location_name}</h3>
            <p class="ip-address">{location.ip_address}</p>
            {#if location.description}
              <p class="description">{location.description}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .page-header {
    margin-bottom: 2rem;
  }
    .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .header-content h1 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: var(--secondary);
  }
  
  .header-actions {
    display: flex;
    gap: 0.75rem;
  }
  
  .page-description {
    color: #666;
    margin: 0;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
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
  
  .leaderboard {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .leaderboard-item {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 1rem;
    align-items: center;
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--primary);
    transition: all 0.2s ease;
  }
  
  .leaderboard-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  
  .rank-gold {
    background: linear-gradient(135deg, #fff8e1, #ffffff);
    border-color: #f1c40f;
  }
  
  .rank-silver {
    background: linear-gradient(135deg, #f8f9fa, #ffffff);
    border-color: #95a5a6;
  }
  
  .rank-bronze {
    background: linear-gradient(135deg, #fdf2e9, #ffffff);
    border-color: #e67e22;
  }
  
  .rank-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .medal {
    padding: 0.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .medal-gold {
    background: #f1c40f;
    color: white;
  }
  
  .medal-silver {
    background: #95a5a6;
    color: white;
  }
  
  .medal-bronze {
    background: #e67e22;
    color: white;
  }
  
  .rank-number {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--secondary);
  }
  
  .user-info h3 {
    margin: 0;
    color: var(--secondary);
  }
  
  .user-email {
    margin: 0;
    color: #666;
    font-size: 0.9rem;
  }
  
  .attendance-stats {
    display: flex;
    gap: 1.5rem;
  }
  
  .stat {
    text-align: center;
  }
  
  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
  }
  
  .stat-label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
  }
  
  .additional-info {
    text-align: right;
  }
  
  .last-login, .locations {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0;
    font-size: 0.9rem;
    color: #666;
  }
  
  .daily-summary {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
  }
  
  .day-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    text-align: center;
  }
  
  .day-date {
    font-weight: 600;
    color: var(--secondary);
    margin-bottom: 0.5rem;
  }
  
  .day-stats {
    display: flex;
    justify-content: space-around;
    margin-bottom: 0.5rem;
  }
  
  .day-stat .stat-value {
    font-size: 1.2rem;
    color: var(--accent);
  }
  
  .day-stat .stat-label {
    font-size: 0.7rem;
  }
  
  .day-locations {
    font-size: 0.8rem;
    color: #666;
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
  }
  
  .locations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }
  
  .location-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }
  
  .location-card h3 {
    margin: 0 0 0.5rem 0;
    color: var(--secondary);
  }
  
  .ip-address {
    font-family: 'Courier New', monospace;
    color: var(--accent);
    font-weight: 600;
    margin: 0.25rem 0;
  }
  
  .description {
    color: #666;
    font-size: 0.9rem;
    margin: 0.5rem 0 0 0;
  }
    @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
    
    .header-actions {
      width: 100%;
      justify-content: flex-start;
    }
    
    .leaderboard-item {
      grid-template-columns: 1fr;
      gap: 1rem;
      text-align: center;
    }
    
    .additional-info {
      text-align: center;
    }
    
    .attendance-stats {
      justify-content: center;
    }
  }
</style>
