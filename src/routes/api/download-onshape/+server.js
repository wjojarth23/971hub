import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';

const ONSHAPE_BASE_URL = PUBLIC_ONSHAPE_BASE_URL || 'https://frc971.onshape.com';

function getBasicAuth() {
  const credentials = btoa(`${PUBLIC_ONSHAPE_ACCESS_KEY}:${PUBLIC_ONSHAPE_SECRET_KEY}`);
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json'
  };
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const { documentId, workspaceId, elementId, partId, wvm, wvmid, format, filename } = body;

    if (!documentId || !elementId || !partId) {
      return json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log('Download request:', { documentId, workspaceId, elementId, partId, wvm, wvmid, format, filename });

    // Build the URL for part export
    const exportUrl = `${ONSHAPE_BASE_URL}/api/v5/parts/d/${documentId}/${wvm || 'w'}/${wvmid || workspaceId}/e/${elementId}/partid/${partId}/export`;
    
    const exportBody = {
      format: format || 'step',
      units: 'millimeter',
      ...(format === 'stl' && {
        mode: 'binary',
        grouping: true,
        scale: 1.0,
        units: 'millimeter',
        angleTolerance: 0.1,
        chordTolerance: 0.1
      })
    };

    console.log('Export URL:', exportUrl);
    console.log('Export body:', exportBody);

    const response = await fetch(exportUrl, {
      method: 'POST',
      headers: getBasicAuth(),
      body: JSON.stringify(exportBody)
    });

    console.log('Export response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Export error response:', errorText);
      return json({ 
        error: `Export failed: ${response.status} - ${errorText}` 
      }, { status: response.status });
    }

    // Get the file content
    const fileBuffer = await response.arrayBuffer();
    
    if (fileBuffer.byteLength === 0) {
      return json({ error: 'Empty file received from Onshape' }, { status: 500 });
    }

    // Return the file content with appropriate headers
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': format === 'stl' ? 'application/octet-stream' : 'application/step',
        'Content-Disposition': `attachment; filename="${filename || `part.${format}`}"`,
        'Content-Length': fileBuffer.byteLength.toString()
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
