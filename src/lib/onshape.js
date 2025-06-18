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
    }    // Get document information
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

    // Get assembly information (replaces releases/versions for now)
    async getAssemblyInfo(documentId, workspaceId, elementId) {
        try {
            const params = new URLSearchParams({
                action: 'assembly-info',
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
            console.error('Error fetching assembly info:', error);
            throw error;
        }
    }    // Get document releases (placeholder - endpoint may not exist)
    async getDocumentReleases(documentId) {
        console.warn('Document releases endpoint may not be available in OnShape API v11. Using empty array.');
        return [];
    }    // Get document versions  
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

    // Get version details to check if it's a release
    async getVersionDetails(documentId, versionId) {
        try {
            const params = new URLSearchParams({
                action: 'version-details',
                documentId,
                versionId
            });
            
            const response = await fetch(`${this.apiRoute}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching version details:', error);
            throw error;
        }
    }

    // Get assembly BOM for a specific version
    async getAssemblyBOM(documentId, workspaceId, elementId, versionId = null) {
        try {
            const params = new URLSearchParams({
                action: 'assembly-bom',
                documentId,
                workspaceId,
                elementId
            });

            // If versionId is provided, use version mode, otherwise use workspace mode
            if (versionId) {
                params.append('wvm', 'v');
                params.append('wvmid', versionId);
            } else {
                params.append('wvm', 'w');
                params.append('wvmid', workspaceId);
            }
            
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

    // Placeholder for part properties (not available in current API endpoint structure)
    async getPartProperties(documentId, workspaceId, elementId, partId) {
        console.warn('Part properties endpoint not available in current OnShape API structure. Using empty object.');
        return {};
    }    // Analyze BOM and categorize parts
    async analyzeBOM(bom) {
        const analyzedParts = [];
        
        // BOM data structure:
        // - headers: array of {id, name, propertyName, valueType}
        // - rows: array of objects where keys are header IDs and values are the cell values
        const bomItems = bom.rows || [];
        const headers = bom.headers || [];
        
        console.log('Processing BOM items:', bomItems.length);
        console.log('BOM headers:', headers);
        
        // Create a map of header IDs to property names for easier lookup
        const headerMap = {};
        headers.forEach(header => {
            headerMap[header.id] = {
                propertyName: header.propertyName,
                name: header.name,
                valueType: header.valueType
            };
        });
        
        console.log('Header map:', headerMap);
        
        // Debug: log the first few items to see their structure
        if (bomItems.length > 0) {
            console.log('First BOM item structure:', bomItems[0]);
            console.log('Available properties:', Object.keys(bomItems[0]));
        }
        
        for (const item of bomItems) {
            try {
                console.log('Processing BOM item:', item);
                
                let partType = 'manufactured';
                let material = '';
                let workflow = '';
                
                // Extract part information using header mapping
                let partName = 'Unknown Part';
                let partNumber = '';
                let quantity = 1;
                let partId = '';
                let description = '';
                
                // Map the row data using headers
                for (const [headerId, value] of Object.entries(item)) {
                    const header = headerMap[headerId];
                    if (!header) continue;
                    
                    switch (header.propertyName) {
                        case 'item':
                        case 'name':
                            if (value) partName = value;
                            break;
                        case 'partNumber':
                            if (value) partNumber = value;
                            break;
                        case 'quantity':
                            if (value) quantity = parseFloat(value) || 1;
                            break;
                        case 'description':
                            if (value) description = value;
                            break;
                        case 'material':
                            if (value && typeof value === 'object') {
                                material = value.name || value.displayName || String(value);
                            } else if (value) {
                                material = String(value);
                            }
                            break;
                    }
                    
                    // Store part ID if this looks like an ID field
                    if (header.propertyName.includes('Id') || header.propertyName.includes('id')) {
                        partId = value || '';
                    }
                }
                
                console.log('Extracted data:', { partName, partNumber, quantity, partId, description, material });
                
                // Skip items that are excluded from BOM
                if (item.excludeFromBom === true) {
                    console.log('Skipping item excluded from BOM:', partName);
                    continue;
                }
                
                // Get part properties if available
                if (partId && partId !== '') {
                    try {
                        const properties = await this.getPartProperties(
                            bom.bomSource?.document?.id || bom.documentId,
                            bom.bomSource?.version?.id || bom.versionId,
                            bom.bomSource?.element?.id || bom.elementId,
                            partId
                        );
                        
                        // Analyze properties to determine part type and workflow
                        if (properties.material) {
                            material = properties.material;
                        }
                    } catch (propError) {
                        console.warn('Could not fetch part properties:', propError);
                    }
                }
                
                // Simple heuristics for part categorization
                const lowerPartName = partName.toLowerCase();
                if (lowerPartName.includes('screw') || lowerPartName.includes('bolt') || 
                    lowerPartName.includes('nut') || lowerPartName.includes('washer') ||
                    lowerPartName.includes('bearing') || lowerPartName.includes('motor')) {
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
                
                analyzedParts.push({
                    part_name: partName,
                    part_number: partNumber,
                    quantity: quantity,
                    part_type: partType,
                    material: material,
                    workflow: workflow,
                    onshape_part_id: partId,
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
                    part_name: 'Unknown Part',
                    part_number: '',
                    quantity: 1,
                    part_type: 'manufactured',
                    material: '',
                    workflow: 'mill',
                    onshape_part_id: '',
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
