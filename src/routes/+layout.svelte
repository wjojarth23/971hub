<script>
  import '../app.css';
</script>

<main class="container">
  <slot />
</main>

<style>
  :global(html) {
    background-color: var(--background);
  }
</style>
