import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';

const ONSHAPE_BASE_URL = PUBLIC_ONSHAPE_BASE_URL || 'https://cad.onshape.com';

function getAuthHeaders() {
    const credentials = btoa(`${PUBLIC_ONSHAPE_ACCESS_KEY}:${PUBLIC_ONSHAPE_SECRET_KEY}`);
    return {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
    };
}

export async function GET({ url }) {
    const action = url.searchParams.get('action');
    const documentId = url.searchParams.get('documentId');
    const workspaceId = url.searchParams.get('workspaceId');
    const elementId = url.searchParams.get('elementId');

    if (!action || !documentId) {
        return json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        let apiPath;        switch (action) {
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
                break;            case 'assembly-bom':
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
                break;
            default:
                return json({ error: 'Invalid action. Available actions: document-info, versions, version-details, assembly-info, assembly-bom, part-bounding-box' }, { status: 400 });
        }const response = await fetch(`${ONSHAPE_BASE_URL}${apiPath}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`OnShape API error: ${response.status} - ${errorText}`);
            console.error(`Full URL: ${ONSHAPE_BASE_URL}${apiPath}`);
            console.error(`Headers:`, getAuthHeaders());
            return json({ error: `OnShape API error: ${response.status}`, details: errorText, url: `${ONSHAPE_BASE_URL}${apiPath}` }, { status: response.status });
        }

        const data = await response.json();
        return json(data);

    } catch (error) {
        console.error('Error calling OnShape API:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
}
