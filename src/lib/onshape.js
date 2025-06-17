import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';

class OnShapeAPI {
    constructor() {
        this.accessKey = PUBLIC_ONSHAPE_ACCESS_KEY;
        this.secretKey = PUBLIC_ONSHAPE_SECRET_KEY;
        this.baseUrl = PUBLIC_ONSHAPE_BASE_URL || 'https://cad.onshape.com';
    }

    // Generate basic authentication headers
    getAuthHeaders() {
        const credentials = btoa(`${this.accessKey}:${this.secretKey}`);
        return {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
        };
    }

    // Parse OnShape URL to extract document info
    parseOnShapeUrl(url) {
        const regex = /https:\/\/cad\.onshape\.com\/documents\/([a-f0-9]{24})\/w\/([a-f0-9]{24})\/e\/([a-f0-9]{24})/;
        const match = url.match(regex);
        
        if (match) {
            return {
                documentId: match[1],
                workspaceId: match[2],
                elementId: match[3]
            };
        }
        return null;
    }    // Get document information
    async getDocumentInfo(documentId) {
        try {
            const path = `/api/documents/${documentId}`;
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching document info:', error);
            throw error;
        }
    }

    // Get assembly information
    async getAssemblyInfo(documentId, workspaceId, elementId) {
        try {
            const path = `/api/assemblies/d/${documentId}/w/${workspaceId}/e/${elementId}`;
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching assembly info:', error);
            throw error;
        }
    }

    // Get document versions
    async getDocumentVersions(documentId) {
        try {
            const path = `/api/documents/${documentId}/versions`;
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching document versions:', error);
            throw error;
        }
    }

    // Get document releases
    async getDocumentReleases(documentId) {
        try {
            const path = `/api/documents/${documentId}/releases`;
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching document releases:', error);
            throw error;
        }
    }

    // Get assembly thumbnail
    async getAssemblyThumbnail(documentId, workspaceId, elementId) {
        try {
            const path = `/api/assemblies/d/${documentId}/w/${workspaceId}/e/${elementId}/shadedviews`;
            const query = 'outputHeight=300&outputWidth=300&pixelSize=0.003&edges=false&showAllParts=false&useAntiAliasing=true';
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}?${query}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.images && data.images.length > 0 ? data.images[0] : null;
        } catch (error) {
            console.error('Error fetching assembly thumbnail:', error);
            return null;
        }
    }

    // Get assembly BOM (Bill of Materials)
    async getAssemblyBOM(documentId, workspaceId, elementId, versionId = null) {
        try {
            let path = `/api/assemblies/d/${documentId}/w/${workspaceId}/e/${elementId}/bom`;
            if (versionId) {
                path = `/api/assemblies/d/${documentId}/v/${versionId}/e/${elementId}/bom`;
            }
            
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching assembly BOM:', error);
            throw error;
        }
    }

    // Get part properties (material, mass, etc.)
    async getPartProperties(documentId, workspaceId, elementId, partId) {
        try {
            const path = `/api/parts/d/${documentId}/w/${workspaceId}/e/${elementId}/partid/${partId}/properties`;
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching part properties:', error);
            return null;
        }
    }

    // Get bounding box for a part
    async getPartBoundingBox(documentId, workspaceId, elementId, partId) {
        try {
            const path = `/api/parts/d/${documentId}/w/${workspaceId}/e/${elementId}/partid/${partId}/boundingboxes`;
            const headers = this.getAuthHeaders();
            
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching part bounding box:', error);
            return null;
        }
    }

    // Generate unique build hash
    generateBuildHash(releaseId, timestamp) {
        const hashInput = `${releaseId}-${timestamp}`;
        return btoa(hashInput).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }

    // Determine if part is COTS based on name/properties
    isCOTSPart(partName, partNumber = '') {
        const cotsIndicators = [
            'bearing', 'screw', 'bolt', 'nut', 'washer', 'motor', 'sensor',
            'electronics', 'wire', 'cable', 'connector', 'fastener',
            'spring', 'pneumatic', 'cylinder', 'valve', 'fitting'
        ];
        
        const name = (partName + ' ' + partNumber).toLowerCase();
        return cotsIndicators.some(indicator => name.includes(indicator));
    }

    // Assign stock type based on material and dimensions
    assignStockType(material, boundingBox, stockTypes) {
        if (!material || !boundingBox) {
            return material ? `${material}-Other` : 'Unknown-Other';
        }

        const { x = 0, y = 0, z = 0 } = boundingBox;
        const maxDim = Math.max(x, y, z);
        
        // Find matching stock types for the material
        const matchingStocks = stockTypes.filter(stock => 
            stock.material.toLowerCase() === material.toLowerCase() &&
            x <= stock.max_dimension_x &&
            y <= stock.max_dimension_y &&
            z <= stock.max_dimension_z
        );

        if (matchingStocks.length > 0) {
            // Prefer the most specific match (smallest available stock)
            const bestMatch = matchingStocks.reduce((best, current) => {
                const bestVolume = best.max_dimension_x * best.max_dimension_y * best.max_dimension_z;
                const currentVolume = current.max_dimension_x * current.max_dimension_y * current.max_dimension_z;
                return currentVolume < bestVolume ? current : best;
            });
            
            return `${bestMatch.material}-${bestMatch.stock_type}`;
        }

        return `${material}-Other`;
    }
}

export const onShapeAPI = new OnShapeAPI();
