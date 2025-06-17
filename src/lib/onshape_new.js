import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';

class OnShapeAPI {
    constructor() {
        this.accessKey = PUBLIC_ONSHAPE_ACCESS_KEY;
        this.secretKey = PUBLIC_ONSHAPE_SECRET_KEY;
        this.baseUrl = PUBLIC_ONSHAPE_BASE_URL || 'https://cad.onshape.com';
        // Use our server-side API route to avoid CORS issues
        this.apiRoute = '/api/onshape';
    }

    // Parse OnShape URL to extract document info
    parseOnShapeUrl(url) {
        // Support both standard and enterprise OnShape URLs
        const regex = /https:\/\/[^\/]+\.onshape\.com\/documents\/([a-f0-9]{24})\/w\/([a-f0-9]{24})\/e\/([a-f0-9]{24})/;
        const match = url.match(regex);
        
        if (match) {
            return {
                documentId: match[1],
                workspaceId: match[2],
                elementId: match[3]
            };
        }
        return null;
    }

    // Get document information
    async getDocumentInfo(documentId) {
        try {
            const response = await fetch(`${this.apiRoute}?action=document-info&documentId=${documentId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching document info:', error);
            throw error;
        }
    }

    // Get document versions
    async getDocumentVersions(documentId) {
        try {
            const response = await fetch(`${this.apiRoute}?action=versions&documentId=${documentId}`);
            
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
            const response = await fetch(`${this.apiRoute}?action=releases&documentId=${documentId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching document releases:', error);
            throw error;
        }
    }

    // Get assembly BOM
    async getAssemblyBOM(documentId, workspaceId, elementId) {
        try {
            const params = new URLSearchParams({
                action: 'assembly-bom',
                documentId,
                workspaceId,
                elementId
            });
            
            const response = await fetch(`${this.apiRoute}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching assembly BOM:', error);
            throw error;
        }
    }

    // Get part properties
    async getPartProperties(documentId, workspaceId, elementId, partId) {
        try {
            const params = new URLSearchParams({
                action: 'part-properties',
                documentId,
                workspaceId,
                elementId,
                partId
            });
            
            const response = await fetch(`${this.apiRoute}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching part properties:', error);
            throw error;
        }
    }

    // Analyze BOM and categorize parts
    async analyzeBOM(bom) {
        const analyzedParts = [];
        
        for (const item of bom.bomTable?.items || []) {
            try {
                let partType = 'manufactured';
                let material = '';
                let workflow = '';
                
                // Get part properties if available
                if (item.partId && item.partId !== '') {
                    try {
                        const properties = await this.getPartProperties(
                            bom.documentId,
                            bom.workspaceId,
                            bom.elementId,
                            item.partId
                        );
                        
                        // Analyze properties to determine part type and workflow
                        if (properties.material) {
                            material = properties.material;
                        }
                        
                        // Simple heuristics for part categorization
                        const partName = (item.item || '').toLowerCase();
                        if (partName.includes('screw') || partName.includes('bolt') || 
                            partName.includes('nut') || partName.includes('washer') ||
                            partName.includes('bearing') || partName.includes('motor')) {
                            partType = 'COTS';
                        } else {
                            // Determine workflow based on material and geometry
                            if (material.toLowerCase().includes('aluminum') || material.toLowerCase().includes('steel')) {
                                workflow = 'mill';
                            } else if (material.toLowerCase().includes('wood') || material.toLowerCase().includes('mdf')) {
                                workflow = 'laser-cut';
                            } else if (material.toLowerCase().includes('plastic') || material.toLowerCase().includes('pla')) {
                                workflow = '3d-print';
                            } else {
                                workflow = 'mill'; // default
                            }
                        }
                    } catch (propError) {
                        console.warn('Could not fetch part properties:', propError);
                    }
                }
                
                analyzedParts.push({
                    part_name: item.item || 'Unknown Part',
                    part_number: item.partNumber || '',
                    quantity: item.quantity || 1,
                    part_type: partType,
                    material: material,
                    workflow: workflow,
                    onshape_part_id: item.partId || '',
                    bounding_box_x: null,
                    bounding_box_y: null,
                    bounding_box_z: null,
                    stock_assignment: '',
                    status: 'pending'
                });
            } catch (error) {
                console.error('Error analyzing BOM item:', error);
                // Add with default values if analysis fails
                analyzedParts.push({
                    part_name: item.item || 'Unknown Part',
                    part_number: item.partNumber || '',
                    quantity: item.quantity || 1,
                    part_type: 'manufactured',
                    material: '',
                    workflow: 'mill',
                    onshape_part_id: item.partId || '',
                    bounding_box_x: null,
                    bounding_box_y: null,
                    bounding_box_z: null,
                    stock_assignment: '',
                    status: 'pending'
                });
            }
        }
        
        return analyzedParts;
    }

    // Auto-assign stock based on part properties and available stock
    async autoAssignStock(parts, stockTypes) {
        for (const part of parts) {
            if (part.part_type === 'manufactured' && part.material) {
                // Find matching stock type
                const matchingStock = stockTypes.find(stock => 
                    stock.material.toLowerCase().includes(part.material.toLowerCase()) &&
                    stock.workflow === part.workflow
                );
                
                if (matchingStock) {
                    part.stock_assignment = `${matchingStock.material} - ${matchingStock.stock_type}`;
                }
            }
        }
        
        return parts;
    }
}

export const onShapeAPI = new OnShapeAPI();
