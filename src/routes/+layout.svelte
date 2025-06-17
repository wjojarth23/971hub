<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { LogOut, Move3d, Hammer, Wrench, Receipt, Home, Briefcase, Router } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  let user = null;

  onMount(async () => {
    // Check if user is already logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await loadUserProfile(session.user);
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await loadUserProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        user = null;
        userStore.set(null);
      }
    });

    return () => subscription?.unsubscribe();
  });

  async function loadUserProfile(authUser) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
        // Use auth user data as fallback
        user = {
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.name || '',
          role: authUser.user_metadata?.role || 'pending',
          permissions: authUser.user_metadata?.permissions || 'none'
        };
        userStore.set(user);
        return;
      }

      const userProfile = {
        id: authUser.id,
        email: authUser.email,
        full_name: data?.full_name || authUser.user_metadata?.name || '',
        role: data?.role || authUser.user_metadata?.role || 'pending',
        permissions: data?.permissions || authUser.user_metadata?.permissions || 'none',
        created_at: data?.created_at || authUser.created_at
      };

      user = userProfile;
      userStore.set(userProfile);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
    goto('/');
  }

  // Check if current route is active
  function isActive(path) {
    return $page.url.pathname === path;
  }
</script>

{#if user}
  <!-- Navigation Header -->
  <header class="nav-header">    <div class="nav-container">
      <div class="brand">
        <Briefcase size={28} />
        <h1>971 Hub</h1>
      </div>
      
      <!-- Desktop Navigation -->
      <nav class="desktop-nav">
        <a href="/" class="nav-link" class:active={isActive('/')}>
          <Home size={18} />
          Home
        </a>
        <a href="/manufacture" class="nav-link" class:active={isActive('/manufacture')}>
          <Hammer size={18} />
          Manufacture
        </a>
        <a href="/cad" class="nav-link" class:active={isActive('/cad')}>
          <Move3d size={18} />
          CAD
        </a>
        <a href="/cad/build" class="nav-link" class:active={isActive('/cad/build')}>
          <Wrench size={18} />
          Build
        </a>
        <a href="/cad/purchasing" class="nav-link" class:active={isActive('/cad/purchasing')}>
          <Receipt size={18} />
          Purchasing
        </a>        <a href="/manufacture/router" class="nav-link" class:active={isActive('/manufacture/router')}>
          <Router size={18} />
          Router
        </a>
      </nav>

      <!-- User Menu - Simplified -->      <div class="user-menu">
        <button class="logout-link" on:click={handleLogout}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  </header>
{/if}

<main class="container">
  <slot />
</main>

<style>
  :global(html) {
    background-color: var(--background);
  }

  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--background);
    color: var(--text);
  }

  :global(:root) {
    --primary: #ffffff;
    --secondary: #1a1a1a;
    --accent: #f1c40f;
    --background: #f8f9fa;
    --border: #e1e5e9;
    --text: #2c3e50;
  }

  /* Navigation Header Styles */
  .nav-header {
    background: var(--primary);
    border-bottom: 1px solid var(--border);
    width: 100vw;
    position: relative;
    left: 50%;
    right: 50%;
    margin-left: -50vw;
    margin-right: -50vw;
    margin-bottom: 2rem;
  }
  .nav-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    max-width: 1400px;
    margin: 0 auto;
    min-height: 60px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--secondary);
    flex-shrink: 0;
  }

  .brand h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .desktop-nav {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    justify-content: center;
    margin: 0 2rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-radius: 6px;
    text-decoration: none;
    color: var(--secondary);
    font-weight: 500;
    font-size: 0.95rem;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .nav-link:hover {
    background: var(--background);
    border-color: var(--border);
    color: var(--accent);
  }

  .nav-link.active {
    background: var(--accent);
    color: var(--primary);
    border-color: var(--accent);
  }
  .user-menu {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .logout-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    color: #666;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 4px;
  }

  .logout-link:hover {
    color: var(--accent);
    background: var(--background);
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
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

  .btn-secondary {
    background: var(--background);
    color: var(--secondary);
  }
  .btn-secondary:hover {
    background: var(--primary);
    border-color: var(--accent);    color: var(--accent);
  }
</style>
