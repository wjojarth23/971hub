import { json } from '@sveltejs/kit';
import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';

export async function GET({ url }) {
    const showSensitive = url.searchParams.get('show') === 'true';
    
    return json({
        hasOnShapeAccessKey: !!PUBLIC_ONSHAPE_ACCESS_KEY,
        hasOnShapeSecretKey: !!PUBLIC_ONSHAPE_SECRET_KEY,
        onShapeBaseUrl: PUBLIC_ONSHAPE_BASE_URL,
        environment: process.env.NODE_ENV || 'unknown',
        vercel: !!process.env.VERCEL,
        timestamp: new Date().toISOString(),
        // Only show sensitive data if explicitly requested and in development
        ...(showSensitive && process.env.NODE_ENV === 'development' ? {
            accessKeyLength: PUBLIC_ONSHAPE_ACCESS_KEY?.length || 0,
            secretKeyLength: PUBLIC_ONSHAPE_SECRET_KEY?.length || 0
        } : {})
    });
}
