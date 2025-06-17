<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase.js';
  import { userStore } from '$lib/stores/user.js';
  import { ShoppingCart, Package, DollarSign, Truck, CheckCircle, Clock, AlertTriangle } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  let user = null;
  let loading = true;

  onMount(async () => {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      goto('/');
      return;
    }

    // Get user profile
    userStore.subscribe(value => {
      user = value;
      loading = false;
    });
  });
</script>

<svelte:head>
  <title>Purchasing - 971 Hub</title>
</svelte:head>

{#if loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if user}
  <div class="purchasing-container">
    <div class="page-header">
      <div class="header-content">
        <ShoppingCart size={32} />
        <div>
          <h1>Purchasing Department</h1>
          <p>Manage procurement, vendors, and purchase orders</p>
        </div>
      </div>
    </div>

    <div class="purchasing-sections">
      <!-- Purchase Orders -->
      <section class="section">
        <h2>Recent Purchase Orders</h2>
        <div class="orders-grid">
          <div class="order-card status-pending">
            <div class="order-header">
              <Package size={20} />
              <div class="order-info">
                <h3>Aluminum Extrusion Kit</h3>
                <p>PO #PO-2024-015</p>
              </div>
              <div class="order-status">
                <Clock size={16} />
                <span>Pending</span>
              </div>
            </div>
            <div class="order-details">
              <p><strong>Vendor:</strong> Industrial Supply Co.</p>
              <p><strong>Total:</strong> $1,245.50</p>
              <p><strong>Expected:</strong> June 25, 2025</p>
            </div>
          </div>

          <div class="order-card status-shipped">
            <div class="order-header">
              <Truck size={20} />
              <div class="order-info">
                <h3>Electronic Components</h3>
                <p>PO #PO-2024-014</p>
              </div>
              <div class="order-status">
                <Truck size={16} />
                <span>Shipped</span>
              </div>
            </div>
            <div class="order-details">
              <p><strong>Vendor:</strong> Electronics Plus</p>
              <p><strong>Total:</strong> $856.75</p>
              <p><strong>Tracking:</strong> UPS1234567890</p>
            </div>
          </div>

          <div class="order-card status-delivered">
            <div class="order-header">
              <CheckCircle size={20} />
              <div class="order-info">
                <h3>Fasteners & Hardware</h3>
                <p>PO #PO-2024-013</p>
              </div>
              <div class="order-status">
                <CheckCircle size={16} />
                <span>Delivered</span>
              </div>
            </div>
            <div class="order-details">
              <p><strong>Vendor:</strong> Bolt Depot</p>
              <p><strong>Total:</strong> $432.25</p>
              <p><strong>Delivered:</strong> June 15, 2025</p>
            </div>
          </div>

          <div class="order-card status-urgent">
            <div class="order-header">
              <AlertTriangle size={20} />
              <div class="order-info">
                <h3>Motors & Actuators</h3>
                <p>PO #PO-2024-016</p>
              </div>
              <div class="order-status">
                <AlertTriangle size={16} />
                <span>Urgent</span>
              </div>
            </div>
            <div class="order-details">
              <p><strong>Vendor:</strong> Motion Control Ltd.</p>
              <p><strong>Total:</strong> $2,150.00</p>
              <p><strong>Needed by:</strong> June 20, 2025</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Budget Overview -->
      <section class="section">
        <h2>Budget Overview</h2>
        <div class="budget-grid">
          <div class="budget-card">
            <DollarSign size={24} />
            <div class="budget-info">
              <h3>Total Budget</h3>
              <p class="budget-amount">$25,000.00</p>
            </div>
          </div>
          <div class="budget-card">
            <Package size={24} />
            <div class="budget-info">
              <h3>Spent This Month</h3>
              <p class="budget-amount spent">$8,450.50</p>
            </div>
          </div>
          <div class="budget-card">
            <CheckCircle size={24} />
            <div class="budget-info">
              <h3>Remaining Budget</h3>
              <p class="budget-amount remaining">$16,549.50</p>
            </div>
          </div>
        </div>
        <div class="budget-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 33.8%"></div>
          </div>
          <p class="progress-text">33.8% of budget used</p>
        </div>
      </section>

      <!-- Vendor Management -->
      <section class="section">
        <h2>Preferred Vendors</h2>
        <div class="vendors-grid">
          <div class="vendor-card">
            <div class="vendor-header">
              <h3>Industrial Supply Co.</h3>
              <div class="vendor-rating">
                <span class="rating-stars">★★★★★</span>
                <span class="rating-score">4.8/5</span>
              </div>
            </div>
            <div class="vendor-details">
              <p><strong>Specialties:</strong> Aluminum, Steel, Raw Materials</p>
              <p><strong>Orders:</strong> 15 this year</p>
              <p><strong>Avg. Delivery:</strong> 3-5 days</p>
              <p><strong>Contact:</strong> orders@industrialsupply.com</p>
            </div>
          </div>

          <div class="vendor-card">
            <div class="vendor-header">
              <h3>Electronics Plus</h3>
              <div class="vendor-rating">
                <span class="rating-stars">★★★★☆</span>
                <span class="rating-score">4.5/5</span>
              </div>
            </div>
            <div class="vendor-details">
              <p><strong>Specialties:</strong> PCBs, Sensors, Controllers</p>
              <p><strong>Orders:</strong> 12 this year</p>
              <p><strong>Avg. Delivery:</strong> 2-3 days</p>
              <p><strong>Contact:</strong> sales@electronicsplus.com</p>
            </div>
          </div>

          <div class="vendor-card">
            <div class="vendor-header">
              <h3>Motion Control Ltd.</h3>
              <div class="vendor-rating">
                <span class="rating-stars">★★★★★</span>
                <span class="rating-score">4.9/5</span>
              </div>
            </div>
            <div class="vendor-details">
              <p><strong>Specialties:</strong> Motors, Actuators, Pneumatics</p>
              <p><strong>Orders:</strong> 8 this year</p>
              <p><strong>Avg. Delivery:</strong> 5-7 days</p>
              <p><strong>Contact:</strong> info@motioncontrol.com</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="section">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <button class="action-btn primary">
            <ShoppingCart size={20} />
            <span>Create Purchase Order</span>
          </button>
          <button class="action-btn secondary">
            <Package size={20} />
            <span>Check Inventory</span>
          </button>
          <button class="action-btn secondary">
            <DollarSign size={20} />
            <span>Budget Report</span>
          </button>
          <button class="action-btn secondary">
            <Truck size={20} />
            <span>Track Shipments</span>
          </button>
        </div>
      </section>
    </div>
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
    max-width: 1200px;
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

  .purchasing-sections {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .section {
    background: var(--primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .section h2 {
    margin: 0 0 1.5rem 0;
    color: var(--secondary);
    font-size: 1.5rem;
  }

  .orders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
  }

  .order-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .order-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--accent);
  }

  .order-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .order-info {
    flex: 1;
  }

  .order-info h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1.1rem;
  }

  .order-info p {
    margin: 0.25rem 0 0 0;
    color: #666;
    font-size: 0.9rem;
  }

  .order-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .status-pending .order-status {
    background: #fff3e0;
    color: var(--warning);
  }

  .status-shipped .order-status {
    background: #e3f2fd;
    color: var(--info);
  }

  .status-delivered .order-status {
    background: #e8f5e8;
    color: var(--success);
  }

  .status-urgent .order-status {
    background: #ffebee;
    color: var(--danger);
  }

  .order-details p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: #666;
  }

  .budget-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .budget-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .budget-info h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1rem;
  }

  .budget-amount {
    margin: 0.5rem 0 0 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--secondary);
  }

  .budget-amount.spent {
    color: var(--warning);
  }

  .budget-amount.remaining {
    color: var(--success);
  }

  .budget-progress {
    margin-top: 1rem;
  }

  .progress-bar {
    width: 100%;
    height: 12px;
    background: var(--border);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .progress-text {
    margin: 0;
    color: #666;
    font-size: 0.9rem;
    text-align: center;
  }

  .vendors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
  }

  .vendor-card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .vendor-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--accent);
  }

  .vendor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .vendor-header h3 {
    margin: 0;
    color: var(--secondary);
    font-size: 1.1rem;
  }

  .vendor-rating {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }

  .rating-stars {
    color: #ffc107;
    font-size: 1rem;
  }

  .rating-score {
    font-size: 0.8rem;
    color: #666;
  }

  .vendor-details p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: #666;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--secondary);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn.primary {
    background: var(--accent);
    color: var(--secondary);
    border-color: var(--accent);
  }

  .action-btn.primary:hover {
    background: #d4a829;
    border-color: #d4a829;
  }

  .action-btn.secondary:hover {
    background: var(--primary);
    border-color: var(--accent);
    color: var(--accent);
  }

  .error-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    text-align: center;
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
      text-align: left;
    }

    .header-content h1 {
      font-size: 1.5rem;
    }

    .section {
      padding: 1.5rem;
    }

    .orders-grid {
      grid-template-columns: 1fr;
    }

    .budget-grid {
      grid-template-columns: 1fr;
    }

    .vendors-grid {
      grid-template-columns: 1fr;
    }

    .actions-grid {
      grid-template-columns: 1fr;
    }

    .order-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .order-status {
      align-self: flex-start;
    }

    .vendor-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .vendor-rating {
      align-items: flex-start;
    }
  }
</style>
