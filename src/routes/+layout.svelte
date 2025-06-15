<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { FileText, List, Settings } from 'lucide-svelte';
</script>

<div class="header">
  <div class="container">
    <nav class="nav">
      <div class="nav-brand">Manufacturing Management</div>      <ul class="nav-links">
        <li>
          <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>
            <List size={16} />
            Parts List
          </a>
        </li>
        <li>
          <a href="/create" class="nav-link" class:active={$page.url.pathname === '/create'}>
            <FileText size={16} />
            Create Part
          </a>
        </li>
      </ul>
    </nav>
  </div>
</div>

<main class="container">
  <slot />
</main>

<style>
  :global(html) {
    background-color: var(--background);
  }
</style>
