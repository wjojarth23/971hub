import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';

const ONSHAPE_BASE_URL = PUBLIC_ONSHAPE_BASE_URL || 'https://frc971.onshape.com';
/* ── Auth helpers (add or replace) ─────────────────────────────── */

function getBasicAuth() {
  const cred = btoa(`${PUBLIC_ONSHAPE_ACCESS_KEY}:${PUBLIC_ONSHAPE_SECRET_KEY}`);
  return { 'Authorization': `Basic ${cred}` };
}

/* ── Translation Handler (for both STL and STEP) ─────────────────────────────── */
async function handlePartTranslation(documentId, wvm, wvmId, elementId, partId, format) {
    try {
        console.log(`Starting ${format} translation for part ${partId}`);
        
        // 1) Initiate translation using the PartStudio endpoint (not Assembly)
        const exportResp = await fetch(
            `${ONSHAPE_BASE_URL}/api/v11/partstudios/d/${documentId}/${wvm}/${wvmId}/e/${elementId}/translations`,
            {
                method: 'POST',
                headers: {
                    ...getBasicAuth(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    formatName: format,
                    partIds: partId,         // single-part string
                    onePartPerDoc: true,     // important for STEP files
                    storeInDocument: false   // external file
                })
            }
        );

        if (!exportResp.ok) {
            const errorText = await exportResp.text();
            console.error(`${format} translation initiation failed: ${exportResp.status} - ${errorText}`);
            return json({ error: `${format} translation initiation failed: ${exportResp.status}`, details: errorText }, { status: exportResp.status });
        }

        const { id: translationId } = await exportResp.json();
        console.log(`${format} Translation ID:`, translationId);

        // 2) Poll until DONE (with timeout)
        let state = 'ACTIVE';
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max
        let foreignId;
        
        while (state === 'ACTIVE' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            attempts++;
            
            const statusResp = await fetch(
                `${ONSHAPE_BASE_URL}/api/v11/translations/${translationId}`,
                { 
                    headers: {
                        ...getBasicAuth(),
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (!statusResp.ok) {
                const errorText = await statusResp.text();
                console.error(`Translation status check failed: ${statusResp.status} - ${errorText}`);
                return json({ error: `Translation status check failed: ${statusResp.status}`, details: errorText }, { status: statusResp.status });
            }
            
            const statusData = await statusResp.json();
            state = statusData.requestState;
            foreignId = (statusData.resultExternalDataIds || [])[0];
            console.log(`Translation state (attempt ${attempts}):`, state);
        }
        
        if (attempts >= maxAttempts) {
            return json({ error: `${format} translation timeout - translation took too long` }, { status: 408 });
        }

        if (state !== 'DONE') {
            return json({ error: `${format} translation failed with state: ${state}` }, { status: 500 });
        }

        if (!foreignId) {
            return json({ error: 'No external data ID found in translation result' }, { status: 500 });
        }

        console.log(`${format} translation complete, data ID =`, foreignId);

        // 3) Download the file
        const downloadResp = await fetch(
            `${ONSHAPE_BASE_URL}/api/v11/documents/d/${documentId}/externaldata/${foreignId}`,
            { 
                headers: {
                    ...getBasicAuth(),
                    'Accept': 'application/octet-stream'
                }
            }
        );
        
        if (!downloadResp.ok) {
            const errorText = await downloadResp.text();
            return json({ error: `Failed to download ${format} file: ${downloadResp.status}`, details: errorText }, { status: downloadResp.status });
        }
        
        const buffer = await downloadResp.arrayBuffer();
        
        const fileExt = format === 'STL' ? 'stl' : 'step';
        const contentType = format === 'STL' ? 'application/sla' : 'application/step';
        
        return new Response(buffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${partId}.${fileExt}"`,
                'Content-Length': buffer.byteLength.toString()
            }
        });
        
    } catch (error) {
        console.error(`Error in ${format} translation:`, error);
        return json({ error: `Internal server error during ${format} translation`, details: error.message }, { status: 500 });
    }
}

export async function GET({ url }) {
    const action = url.searchParams.get('action');
    const documentId = url.searchParams.get('documentId');
    const workspaceId = url.searchParams.get('workspaceId');
    const elementId = url.searchParams.get('elementId');

    console.log('Onshape API Request:', {
        action,
        documentId,
        workspaceId,
        elementId,
        allParams: Object.fromEntries(url.searchParams.entries())
    });

    if (!action || !documentId) {
        return json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        let apiPath;
        
        switch (action) {
            case 'document-info':
                apiPath = `/api/v11/documents/${documentId}`;
                break;
            case 'versions':
                apiPath = `/api/v11/documents/d/${documentId}/versions`;
                break;
            case 'version-details':
                const versionId = url.searchParams.get('versionId');
                if (!versionId) {
                    return json({ error: 'Missing versionId for version details request' }, { status: 400 });
                }
                apiPath = `/api/v11/documents/d/${documentId}/v/${versionId}`;
                break;
            case 'assembly-info':
                if (!workspaceId || !elementId) {
                    return json({ error: 'Missing workspaceId or elementId for assembly info request' }, { status: 400 });
                }
                apiPath = `/api/v11/assemblies/d/${documentId}/w/${workspaceId}/e/${elementId}`;
                break;
            case 'assembly-bom':
                if (!workspaceId || !elementId) {
                    return json({ error: 'Missing workspaceId or elementId for BOM request' }, { status: 400 });
                }
                const wvm = url.searchParams.get('wvm') || 'w';
                const wvmid = url.searchParams.get('wvmid') || workspaceId;
                const indented = url.searchParams.get('indented') || 'false';
                apiPath = `/api/v11/assemblies/d/${documentId}/${wvm}/${wvmid}/e/${elementId}/bom?indented=${indented}`;
                break;
            case 'part-bounding-box':
                if (!elementId) {
                    return json({ error: 'Missing elementId for bounding box request' }, { status: 400 });
                }
                const partWvm = url.searchParams.get('wvm') || 'w';
                const partWvmId = url.searchParams.get('wvmId') || workspaceId;
                const partId = url.searchParams.get('partId');
                if (!partId) {
                    return json({ error: 'Missing partId for bounding box request' }, { status: 400 });
                }
                apiPath = `/api/v11/parts/d/${documentId}/${partWvm}/${partWvmId}/e/${elementId}/partid/${partId}/boundingboxes`;
                break;            case 'download-stl':
                if (!elementId) {
                    return json({ error: 'Missing elementId for STL download' }, { status: 400 });
                }
                const stlWvm = url.searchParams.get('wvm') || 'w';
                const stlWvmId = url.searchParams.get('wvmId');
                const stlPartId = url.searchParams.get('partId');
                if (!stlPartId) {
                    return json({ error: 'Missing partId for STL download' }, { status: 400 });
                }
                if (!stlWvmId) {
                    return json({ error: 'Missing wvmId for STL download' }, { status: 400 });
                }
                
                // Use the new translation workflow for STL files
                return await handlePartTranslation(documentId, stlWvm, stlWvmId, elementId, stlPartId, 'STL');case 'translate-part':
                if (!elementId) {
                    return json({ error: 'Missing elementId for part translation' }, { status: 400 });
                }
                const transWvm = url.searchParams.get('wvm') || 'w';
                const transWvmId = url.searchParams.get('wvmId');
                const transPartId = url.searchParams.get('partId');
                const format = url.searchParams.get('format') || 'STEP';
                
                if (!transPartId) {
                    return json({ error: 'Missing partId for part translation' }, { status: 400 });
                }
                if (!transWvmId) {
                    return json({ error: 'Missing wvmId for part translation' }, { status: 400 });
                }
                
                // Use the new translation workflow for both STL and STEP
                return await handlePartTranslation(documentId, transWvm, transWvmId, elementId, transPartId, format);
            case 'download-step':
                if (!elementId) {
                    return json({ error: 'Missing elementId for STEP download' }, { status: 400 });
                }
                const stepWvm = url.searchParams.get('wvm') || 'w';
                const stepWvmId = url.searchParams.get('wvmId');
                const stepPartId = url.searchParams.get('partId');
                if (!stepPartId) {
                    return json({ error: 'Missing partId for STEP download' }, { status: 400 });
                }
                if (!stepWvmId) {
                    return json({ error: 'Missing wvmId for STEP download' }, { status: 400 });
                }
                
                // Use the new translation workflow for STEP files
                return await handlePartTranslation(documentId, stepWvm, stepWvmId, elementId, stepPartId, 'STEP');
            case 'check-translation':
                const translationId = url.searchParams.get('translationId');
                if (!translationId) {
                    return json({ error: 'Missing translationId for translation check' }, { status: 400 });
                }
                apiPath = `/api/v11/translations/${translationId}`;
                break;
            case 'download-translation-result':
                const resultTranslationId = url.searchParams.get('translationId');
                if (!resultTranslationId) {
                    return json({ error: 'Missing translationId for result download' }, { status: 400 });
                }
                
                // Get the external data ID from translation result
                const translationResp = await fetch(`${ONSHAPE_BASE_URL}/api/v11/translations/${resultTranslationId}`, {
                    headers: getBasicAuth()
                });
                if (!translationResp.ok) {
                    return json({ error: 'Failed to get translation result' }, { status: translationResp.status });
                }
                const translationData = await translationResp.json();
                const externalDataId = translationData.resultExternalDataIds?.[0];
                if (!externalDataId) {
                    return json({ error: 'No external data ID found in translation result' }, { status: 400 });
                }
                
                apiPath = `/api/v11/documents/d/${documentId}/externaldata/${externalDataId}`;
                break;            default:
                return json({ error: 'Invalid action. Available actions: document-info, versions, version-details, assembly-info, assembly-bom, part-bounding-box, download-stl, download-step, translate-part, check-translation, download-translation-result' }, { status: 400 });
        }const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout    // Build the full URL we're going to request
    /* Build absolute URL and decide auth type */
    const fullUrl = `${ONSHAPE_BASE_URL}${apiPath}`;
    const isFileDownload = action === 'download-stl' || action === 'download-translation-result';

    const headers = isFileDownload
    ? {
        ...getBasicAuth(),
        'Accept': 'application/vnd.onshape.v1+octet-stream'
      }
    : {
        ...getBasicAuth(),
        'Content-Type': 'application/json'
      };



    console.log('Using authentication type: Basic Auth');

          const response = await fetch(fullUrl, {
            method: 'GET',
            headers: headers,
            signal: controller.signal,
            redirect: 'manual' // Don't follow redirects automatically for file downloads
        });

        clearTimeout(timeoutId);        // Handle binary file downloads with proper 307 redirect handling
        if (action === 'download-stl' || action === 'download-translation-result') {
            console.log(`Download response status: ${response.status}`);
            console.log('Download response headers:', Object.fromEntries(response.headers.entries()));
            
            if (response.status === 307 && response.headers.get('location')) {
                // OnShape API returned a redirect to S3 - follow it
                const s3Url = response.headers.get('location');
                console.log('Following redirect to S3:', s3Url);
                
                const s3Response = await fetch(s3Url, {
                    method: 'GET',
                    headers: getBasicAuth(), // Re-authenticate for the S3 redirect
                    signal: controller.signal
                });
                
                if (!s3Response.ok) {
                    const errorText = await s3Response.text();
                    console.error(`S3 download error: ${s3Response.status} - ${errorText}`);
                    return json({ error: `S3 download error: ${s3Response.status}`, details: errorText }, { status: s3Response.status });
                }                
                const buffer = await s3Response.arrayBuffer();
                const fileExt = action === 'download-stl' ? 'stl' : 'step';
                
                return new Response(buffer, {
                    headers: {
                        'Content-Type': action === 'download-stl' ? 'application/sla' : 'application/step',
                        'Content-Disposition': `attachment; filename="part.${fileExt}"`,
                        'Content-Length': buffer.byteLength.toString()
                    }
                });            } else if (response.status === 200) {
                // Direct download (unlikely but possible)
                const buffer = await response.arrayBuffer();
                const fileExt = action === 'download-stl' ? 'stl' : 'step';
                
                return new Response(buffer, {
                    headers: {
                        'Content-Type': action === 'download-stl' ? 'application/sla' : 'application/step',
                        'Content-Disposition': `attachment; filename="part.${fileExt}"`,
                        'Content-Length': buffer.byteLength.toString()
                    }
                });
            } else {
                const errorText = await response.text();
                console.error(`OnShape download API error: ${response.status} - ${errorText}`);
                console.error(`Full URL: ${ONSHAPE_BASE_URL}${apiPath}`);
                console.error(`Headers:`, headers);
                return json({ error: `OnShape download API error: ${response.status}`, details: errorText, url: `${ONSHAPE_BASE_URL}${apiPath}` }, { status: response.status });
            }
        }

        // Handle regular API responses (non-downloads)
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`OnShape API error: ${response.status} - ${errorText}`);
            console.error(`Full URL: ${ONSHAPE_BASE_URL}${apiPath}`);
            console.error(`Headers:`, headers);
            return json({ error: `OnShape API error: ${response.status}`, details: errorText, url: `${ONSHAPE_BASE_URL}${apiPath}` }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error calling OnShape API:', error);
        
        if (error.name === 'AbortError') {
            return json({ error: 'OnShape API timeout - request took too long' }, { status: 408 });
        }
        
        return json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
