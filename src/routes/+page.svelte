<script>
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase.js';
  import { Upload, FileText, Wrench, Zap } from 'lucide-svelte';
  
  let partName = '';
  let requesterName = '';
  let projectId = '';
  let workflow = '';
  let quantity = 1;
  let material = '';
  let uploadedFile = null;
  let isSubmitting = false;

  const workflows = [
    { id: 'laser-cut', name: 'Laser Cut', fileType: 'svg', icon: Zap, color: 'workflow-laser' },
    { id: 'router', name: 'Router', fileType: 'step', icon: Wrench, color: 'workflow-router' },
    { id: 'lathe', name: 'Lathe', fileType: 'pdf', icon: FileText, color: 'workflow-lathe' },
    { id: 'mill', name: 'Mill', fileType: 'pdf', icon: FileText, color: 'workflow-mill' },
    { id: '3d-print', name: '3D Print', fileType: 'stl', icon: Upload, color: 'workflow-3d-print' }
  ];

  const materialOptions = {
    'lathe': ['1/2" Thunderhex', '3/8" Thunderhex'],
    'mill': ['Aluminum', 'Steel', 'Delrin'],
    'router': [
      '1/8" Polycarbonate', '1/4" Polycarbonate', '3/8" Polycarbonate',
      '1/8" SSRP', '1/4" SSRP', '3/8" SSRP',
      '1/8" Plywood', '1/4" Plywood', '3/8" Plywood',
      '1/16" Aluminum', '1/8" Aluminum', '1/4" Aluminum', '3/8" Aluminum',
      '1x2 1/16" Tube', '1x1 1/16" Tube', '1x2 1/8" Tube', '1x1 1/8" Tube'
    ],
    '3d-print': ['PLA', 'ABS', 'PETG', 'PETG-CF'],
    'laser-cut': [
      '1/8" Polycarbonate', '1/4" Polycarbonate', '3/8" Polycarbonate',
      '1/8" SSRP', '1/4" SSRP', '3/8" SSRP',
      '1/8" Plywood', '1/4" Plywood', '3/8" Plywood'
    ]
  };

  $: selectedWorkflow = workflows.find(w => w.id === workflow);
  $: requiredFileType = selectedWorkflow?.fileType || '';
  $: availableMaterials = workflow ? materialOptions[workflow] || [] : [];

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (requiredFileType && fileExtension !== requiredFileType) {
        alert(`Please upload a ${requiredFileType.toUpperCase()} file for ${selectedWorkflow.name} workflow.`);
        event.target.value = '';
        return;
      }
      uploadedFile = file;
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('active');
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('active');
  }

  function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('active');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (requiredFileType && fileExtension !== requiredFileType) {
        alert(`Please upload a ${requiredFileType.toUpperCase()} file for ${selectedWorkflow.name} workflow.`);
        return;
      }
      uploadedFile = file;
    }
  }

  async function handleSubmit() {
    if (!partName || !requesterName || !projectId || !workflow || !material || !uploadedFile || !quantity || quantity < 1) {
      alert('Please fill in all fields, select a material, upload a file, and specify a valid quantity.');
      return;
    }

    isSubmitting = true;
    
    try {
      // Upload file to Supabase Storage
      const fileExt = uploadedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${partName.replace(/[^a-zA-Z0-9]/g, '_')}.${fileExt}`;
      
      console.log('Attempting to upload file:', fileName);
      console.log('File size:', uploadedFile.size);
      console.log('File type:', uploadedFile.type);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('manufacturing-files')
        .upload(fileName, uploadedFile);
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }
      
      console.log('Upload successful:', uploadData);
      
      // Save part data to database
      const { data: insertData, error: insertError } = await supabase
        .from('parts')
        .insert([
          {
            name: partName,
            requester: requesterName,
            project_id: projectId,
            workflow: workflow,
            quantity: quantity,
            material: material,
            file_name: fileName,
            file_url: fileName, // Store filename for compatibility, but we'll use file_name for downloads
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      
      if (insertError) throw insertError;
      
      alert('Part request submitted successfully!');
      
      // Reset form
      partName = '';
      requesterName = '';
      projectId = '';
      workflow = '';
      quantity = 1;
      material = '';
      uploadedFile = null;
      document.getElementById('file-input').value = '';
      
      // Redirect to parts list
      goto('/parts');
      
    } catch (error) {
      console.error('Error submitting part request:', error);
      
      let errorMessage = 'Error submitting part request. ';
      if (error.message?.includes('bucket')) {
        errorMessage += 'Storage bucket not found. Please check your Supabase setup.';
      } else if (error.message?.includes('policy')) {
        errorMessage += 'Storage permissions issue. Please check your storage policies.';
      } else if (error.message?.includes('authentication')) {
        errorMessage += 'Authentication error. Please check your Supabase keys.';
      } else {
        errorMessage += `Details: ${error.message}`;
      }
      
      alert(errorMessage);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Create Part - Manufacturing Management</title>
</svelte:head>

<style>
  .upload-icon-button {
    background: transparent;
    border: 2px solid #ccc;
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--color-accent, #666);
    gap: 8px;
  }

  .browse-text {
    color: #999;
    font-size: 14px;
    font-weight: normal;
  }

  .upload-icon-button:hover {
    border-color: #999;
    background-color: #f8f9fa;
  }

  .upload-icon-button:active {
    transform: scale(0.98);
  }
</style>

<div class="grid grid-2">
  <div class="card">
    <h1 style="margin-bottom: 30px; color: var(--color-secondary);">Create New Part Request</h1>
    
    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="part-name" class="form-label">Part Name</label>
        <input
          id="part-name"
          type="text"
          class="form-input"
          bind:value={partName}
          placeholder="Enter part name"
          required
        />
      </div>

      <div class="form-group">
        <label for="requester" class="form-label">Requester Name</label>
        <input
          id="requester"
          type="text"
          class="form-input"
          bind:value={requesterName}
          placeholder="Enter your name"
          required
        />
      </div>

      <div class="form-group">
        <label for="project-id" class="form-label">Project ID</label>
        <input
          id="project-id"
          type="text"
          class="form-input"
          bind:value={projectId}
          placeholder="Enter project ID"
          required
        />
      </div>

      <div class="form-group">
        <label for="quantity" class="form-label">Quantity</label>
        <input
          id="quantity"
          type="number"
          class="form-input"
          bind:value={quantity}
          placeholder="Enter quantity (e.g., 8)"
          min="1"
          max="1000"
          required
        />
        <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
          Specify how many of this part you need (e.g., 8x for eight pieces)
        </small>
      </div>

      <div class="form-group">
        <label for="workflow" class="form-label">Manufacturing Process</label>
        <select
          id="workflow"
          class="form-select"
          bind:value={workflow}
          required
        >
          <option value="">Select a workflow</option>
          {#each workflows as wf}
            <option value={wf.id}>{wf.name}</option>
          {/each}
        </select>
      </div>

      {#if workflow}
        <div class="form-group">
          <label for="material" class="form-label">Material</label>
          <input
            id="material"
            type="text"
            class="form-input"
            bind:value={material}
            list="material-options"
            placeholder="Select or type material"
            required
          />
          <datalist id="material-options">
            {#each availableMaterials as mat}
              <option value={mat}></option>
            {/each}
          </datalist>
          <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
            Select from common materials or type your own
          </small>
        </div>
      {/if}

      {#if selectedWorkflow}
        <div class="form-group">
          <label class="form-label">
            Upload {selectedWorkflow.fileType.toUpperCase()} File
            <span class="workflow-badge {selectedWorkflow.color}">
              {selectedWorkflow.name}
            </span>
          </label>
          
          <div
            class="file-input"
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
            role="button"
            tabindex="0"
          >
            <input
              id="file-input"
              type="file"
              accept=".{selectedWorkflow.fileType}"
              on:change={handleFileUpload}
              style="display: none;"
            />
            
            <div style="display: flex; flex-direction: column; align-items: center;">
              <button
                type="button"
                class="upload-icon-button"
                on:click={() => document.getElementById('file-input').click()}
              >
                <Upload size={32} />
                <span class="browse-text">Browse</span>
              </button>
              
              <p style="margin-top: 8px; margin-bottom: 4px; text-align: center;">
                {#if uploadedFile}
                  <strong>Selected:</strong> {uploadedFile.name}
                {:else}
                  Drop your {selectedWorkflow.fileType.toUpperCase()} file here or click to browse
                {/if}
              </p>
              <p style="font-size: 12px; color: #666; margin-top: 0; margin-bottom: 0; text-align: center;">
                Only {selectedWorkflow.fileType.toUpperCase()} files are accepted
              </p>
            </div>
          </div>
        </div>
      {/if}

      <button
        type="submit"
        class="btn btn-primary"
        style="width: 100%; margin-top: 20px; text-align: center; justify-content: center;"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          Submitting...
        {:else}
          Submit Part Request
        {/if}
      </button>
    </form>
  </div>

  <div class="card">
    <h2 style="margin-bottom: 20px; color: var(--color-secondary);">Manufacturing Workflows</h2>
    
    <div class="grid">
      {#each workflows as wf}
        <div class="card" style="padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <svelte:component this={wf.icon} size={20} />
            <h3 style="margin: 0; font-size: 16px;">{wf.name}</h3>
            <span class="workflow-badge {wf.color}">{wf.fileType.toUpperCase()}</span>
          </div>
          <p style="font-size: 14px; color: #666; margin: 0;">
            {#if wf.id === 'laser-cut'}
              Vector-based cutting using laser technology. Requires SVG files with proper paths.
            {:else if wf.id === 'router'}
              CNC routing for precise cuts and shapes. Requires STEP files with 3D geometry.
            {:else if wf.id === 'lathe'}
              Rotational machining for cylindrical parts. Requires PDF technical drawings.
            {:else if wf.id === 'mill'}
              Multi-axis milling for complex geometries. Requires PDF technical drawings.
            {:else if wf.id === '3d-print'}
              Additive manufacturing layer by layer. Requires STL mesh files.
            {/if}
          </p>
        </div>
      {/each}
    </div>
  </div>
</div>
