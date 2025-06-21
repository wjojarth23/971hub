import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';

const ONSHAPE_BASE_URL = PUBLIC_ONSHAPE_BASE_URL || 'https://frc971.onshape.com';

function getAuthHeaders(isFileDownload = false) {
    const credentials = btoa(`${PUBLIC_ONSHAPE_ACCESS_KEY}:${PUBLIC_ONSHAPE_SECRET_KEY}`);
    const headers = {
        'Authorization': `Basic ${credentials}`
    };
    
    // Only add Content-Type for non-file downloads
    if (!isFileDownload) {
        headers['Content-Type'] = 'application/json';
    }
    
    // Debug: Log credential info (but don't log actual credentials)
    console.log('Auth setup:', {
        hasAccessKey: !!PUBLIC_ONSHAPE_ACCESS_KEY,
        hasSecretKey: !!PUBLIC_ONSHAPE_SECRET_KEY,
        accessKeyLength: PUBLIC_ONSHAPE_ACCESS_KEY?.length || 0,
        secretKeyLength: PUBLIC_ONSHAPE_SECRET_KEY?.length || 0,
        isFileDownload
    });
    
    return headers;
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
                apiPath = `/api/v11/parts/d/${documentId}/${stlWvm}/${stlWvmId}/e/${elementId}/partid/${stlPartId}/stl`;
                break;
            case 'download-parasolid':
                if (!elementId) {
                    return json({ error: 'Missing elementId for Parasolid download' }, { status: 400 });
                }
                const paraslidWvm = url.searchParams.get('wvm') || 'w';
                const paraslidWvmId = url.searchParams.get('wvmId');
                const paraslidPartId = url.searchParams.get('partId');
                if (!paraslidPartId) {
                    return json({ error: 'Missing partId for Parasolid download' }, { status: 400 });
                }
                if (!paraslidWvmId) {
                    return json({ error: 'Missing wvmId for Parasolid download' }, { status: 400 });
                }
                apiPath = `/api/v11/parts/d/${documentId}/${paraslidWvm}/${paraslidWvmId}/e/${elementId}/partid/${paraslidPartId}/parasolid`;
                break;
            default:
                return json({ error: 'Invalid action. Available actions: document-info, versions, version-details, assembly-info, assembly-bom, part-bounding-box, download-stl, download-parasolid' }, { status: 400 });
        }        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const fullUrl = `${ONSHAPE_BASE_URL}${apiPath}`;
        console.log('Making Onshape API request to:', fullUrl);

        // Determine if this is a file download request
        const isFileDownload = action === 'download-stl' || action === 'download-parasolid';
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: getAuthHeaders(isFileDownload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`OnShape API error: ${response.status} - ${errorText}`);
            console.error(`Full URL: ${ONSHAPE_BASE_URL}${apiPath}`);
            console.error(`Headers:`, getAuthHeaders());
            return json({ error: `OnShape API error: ${response.status}`, details: errorText, url: `${ONSHAPE_BASE_URL}${apiPath}` }, { status: response.status });
        }

        // Handle binary file downloads
        if (action === 'download-stl' || action === 'download-parasolid') {
            const buffer = await response.arrayBuffer();
            const fileExt = action === 'download-stl' ? 'stl' : 'x_t';
            
            return new Response(buffer, {
                headers: {
                    'Content-Type': action === 'download-stl' ? 'application/sla' : 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="part.${fileExt}"`,
                    'Content-Length': buffer.byteLength.toString()
                }
            });
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
