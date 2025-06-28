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

  // If true, removes background, border, and padding from container
  export let bare: boolean = false;

  const dispatch = createEventDispatcher();
</script>

<div class="datatable-container {bare ? 'bare' : ''}">
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
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  border: 1px solid var(--border, #e1e5e9);
}

.datatable-container.bare {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

.datatable-toolbar {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border, #e1e5e9);
  background: var(--primary, #fff);
  border-radius: 8px 8px 0 0;
}

.datatable-table-container {
  overflow-x: auto;
  overflow-y: visible;
  width: 100%;
}

.datatable-table {
  width: 100%;
  min-width: 800px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.9rem;
  background: var(--primary, #fff);
  table-layout: auto;
}

.datatable-table th,
.datatable-table td {
  padding: 0.75rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border, #e1e5e9);
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.datatable-table th {
  background: #f8fafb;
  font-weight: 600;
  color: var(--text, #374151);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  position: sticky;
  top: 0;
  z-index: 10;
}

.datatable-table tr:last-child td {
  border-bottom: none;
}

.datatable-table tbody tr {
  transition: background-color 0.15s ease;
}

.datatable-table tbody tr:hover {
  background-color: #f9fafb;
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
