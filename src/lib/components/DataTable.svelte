<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let columns: Array<{
    label: string;
    accessor: string;
    class?: string;
    style?: string;
    thClass?: string;
    thStyle?: string;
  }> = [];

  export let rows: Array<any> = [];

  export let loading: boolean = false;

  const dispatch = createEventDispatcher();
</script>

<div class="datatable-container">
  <div class="datatable-toolbar">
    <slot name="toolbar" />
  </div>

  {#if loading}
    <div class="datatable-loading">
      <div class="datatable-spinner"></div>
      <span>Loading...</span>
    </div>
  {:else}
    <div class="datatable-table-container">
      <table class="datatable-table">
        <thead>
          <tr>
            {#each columns as col}
              <th class={col.thClass} style={col.thStyle}>{col.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if rows.length === 0}
            <tr>
              <td colspan={columns.length} class="datatable-empty">No data</td>
            </tr>
          {:else}
            {#each rows as row, rowIndex}
              <tr>
                {#each columns as col}
                  <td class={col.class} style={col.style}>
                    <slot name="cell" {row} {rowIndex} {col}>
                      {row[col.accessor]}
                    </slot>
                  </td>
                {/each}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
.datatable-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  background: var(--primary, #fff);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  border: 1px solid var(--border, #e1e5e9);
  padding-bottom: 1rem;
}

.datatable-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0.5rem 1.5rem;
  border-bottom: 1px solid var(--border, #e1e5e9);
  min-height: 56px;
  gap: 1rem;
}

.datatable-table-container {
  overflow-x: auto;
  padding: 0 1.5rem;
}

.datatable-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
  background: var(--primary, #fff);
}

.datatable-table th,
.datatable-table td {
  padding: 0.75rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border, #e1e5e9);
  vertical-align: middle;
}

.datatable-table th {
  background: var(--background, #f8f9fa);
  font-weight: 600;
  color: var(--text, #2c3e50);
  font-size: 1rem;
}

.datatable-table tr:hover td {
  background: #f8f9fa;
}

.datatable-empty {
  text-align: center;
  color: #888;
  font-style: italic;
  padding: 2rem 0;
}

.datatable-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 0;
}

.datatable-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border, #e1e5e9);
  border-top: 3px solid #FFD700;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg);}
  100% { transform: rotate(360deg);}
}
</style>
