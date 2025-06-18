import { PUBLIC_ONSHAPE_ACCESS_KEY, PUBLIC_ONSHAPE_SECRET_KEY, PUBLIC_ONSHAPE_BASE_URL } from '$env/static/public';
import { chatGPTService } from './chatgpt.js';

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
    }    // Get assembly BOM for a specific version
    async getAssemblyBOM(documentId, workspaceId, elementId, versionId = null) {
        try {
            const params = new URLSearchParams({
                action: 'assembly-bom',
                documentId,
                workspaceId,
                elementId,
                indented: 'false'  // Return flattened BOM with all rows collapsed
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
    }    // Get part bounding box
    async getPartBoundingBox(documentId, wvm, wvmId, elementId, partId) {
        try {            const params = new URLSearchParams({
                action: 'part-bounding-box',
                documentId,
                wvm,
                wvmId,
                elementId,
                partId
            });
            
            console.log('Bounding box request params:', {
                documentId, wvm, wvmId, elementId, partId
            });
            
            const response = await fetch(`${this.apiRoute}?${params}`);
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`Bounding box API error ${response.status}:`, errorText);
                console.error('Request URL:', `${this.apiRoute}?${params}`);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching part bounding box:', error);
            throw error;
        }
    }

    // Placeholder for part properties (not available in current API endpoint structure)
    async getPartProperties(documentId, workspaceId, elementId, partId) {
        console.warn('Part properties endpoint not available in current OnShape API structure. Using empty object.');
        return {};
    }    // Analyze BOM and categorize parts using ChatGPT
    async analyzeBOM(bom) {
        const analyzedParts = [];
        
        // BOM data structure:
        // - headers: array of {id, name, propertyName, valueType}
        // - rows: array of objects with headerIdToValue mapping
        const bomItems = bom.rows || [];
        const headers = bom.headers || [];
        
        console.log('Processing BOM items:', bomItems.length);
        console.log('BOM headers:', headers);
        
        // Create a map of header IDs to property information
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
            console.log('Header ID to value mapping:', bomItems[0].headerIdToValue);
        }
        
        // Prepare data for ChatGPT analysis
        const bomDataForAI = [];
        
        for (const item of bomItems) {
            try {
                console.log('Processing BOM item:', item);
                
                // Skip items that are excluded from BOM
                if (item.excludeFromBom === true) {
                    console.log('Skipping item excluded from BOM');
                    continue;
                }
                
                // Extract part information using OnShape's headerIdToValue structure
                const headerValues = item.headerIdToValue || {};
                
                let partName = 'Unknown Part';
                let partNumber = '';
                let quantity = 1;
                let partId = '';
                let description = '';
                let material = '';
                let vendor = '';
                
                // Map the row data using headers
                for (const [headerId, value] of Object.entries(headerValues)) {
                    const header = headerMap[headerId];
                    if (!header) continue;
                    
                    console.log(`Processing header ${headerId} (${header.propertyName}):`, value);
                    
                    switch (header.propertyName) {
                        case 'item':
                        case 'name':
                            if (value) partName = String(value);
                            break;
                        case 'partNumber':
                            if (value) partNumber = String(value);
                            break;
                        case 'quantity':
                            if (value) quantity = parseFloat(value) || 1;
                            break;
                        case 'description':
                            if (value) description = String(value);
                            break;
                        case 'vendor':
                            if (value) vendor = String(value);
                            break;
                        case 'material':
                            if (value && typeof value === 'object') {
                                material = value.displayName || value.name || String(value);
                            } else if (value) {
                                material = String(value);
                            }
                            break;
                    }
                }
                
                // Get part ID from item source
                if (item.itemSource && item.itemSource.partId) {
                    partId = item.itemSource.partId;
                }
                
                console.log('Extracted data:', { 
                    partName, 
                    partNumber, 
                    quantity, 
                    partId, 
                    description, 
                    material, 
                    vendor 
                });
                  // Get bounding box information if available
                let boundingBox = null;
                let boundingBoxX = null;
                let boundingBoxY = null;
                let boundingBoxZ = null;
                
                if (partId && partId !== '' && item.itemSource?.elementId) {
                    try {
                        // Try to get bounding box, but don't let failures block the analysis
                        const bbox = await this.getPartBoundingBox(
                            bom.bomSource?.document?.id || bom.documentId,
                            'w', // workspace
                            bom.bomSource?.workspace?.id || bom.workspaceId,
                            item.itemSource.elementId, // Use the part's specific element ID
                            partId
                        );
                        
                        if (bbox && bbox.highX !== undefined && bbox.lowX !== undefined) {
                            boundingBoxX = Math.abs(bbox.highX - bbox.lowX); // Keep in meters for now
                            boundingBoxY = Math.abs(bbox.highY - bbox.lowY);
                            boundingBoxZ = Math.abs(bbox.highZ - bbox.lowZ);
                            boundingBox = `${(boundingBoxX * 1000).toFixed(1)}x${(boundingBoxY * 1000).toFixed(1)}x${(boundingBoxZ * 1000).toFixed(1)}mm`;
                            
                            console.log(`Successfully got bounding box for ${partName}:`, boundingBox);
                        }
                    } catch (bboxError) {
                        console.warn(`Could not fetch bounding box for "${partName}" (${partNumber}):`, bboxError.message);
                        // Continue without bounding box - this is not critical for classification
                    }
                } else {
                    console.log(`Skipping bounding box for "${partName}" - missing partId or elementId`);
                }
                
                // Add to data for AI analysis
                bomDataForAI.push({
                    name: partName,
                    description: description,
                    vendor: vendor,
                    material: material,
                    part_number: partNumber,
                    bounding_box: boundingBox || 'Unknown',
                    bounding_box_x: boundingBoxX,
                    bounding_box_y: boundingBoxY,
                    bounding_box_z: boundingBoxZ,
                    quantity: quantity,
                    onshape_part_id: partId
                });
                
            } catch (error) {
                console.error('Error processing BOM item:', error);
            }
        }
        
        console.log('BOM data prepared for AI:', bomDataForAI);
        
        // Use ChatGPT to classify parts
        let classifications = [];
        try {
            console.log('Sending BOM data to ChatGPT for classification...');
            classifications = await chatGPTService.classifyParts(bomDataForAI);
            console.log('ChatGPT classifications received:', classifications);
        } catch (aiError) {
            console.warn('ChatGPT classification failed, using fallback method:', aiError);
            classifications = chatGPTService.fallbackClassification(bomDataForAI);
        }
        
        // Combine BOM data with AI classifications
        for (let i = 0; i < bomDataForAI.length; i++) {
            const bomItem = bomDataForAI[i];
            const classification = classifications[i] || {
                classification: 'manufactured',
                manufacturing_process: 'mill'
            };
            
            // Map classification to our part type system
            let partType = classification.classification === 'COTS' ? 'COTS' : 'manufactured';
            let workflow = classification.manufacturing_process || 'mill';
            
            analyzedParts.push({
                part_name: bomItem.name,
                part_number: bomItem.part_number,
                quantity: bomItem.quantity,
                part_type: partType,
                material: bomItem.material,
                workflow: workflow,
                onshape_part_id: bomItem.onshape_part_id,
                bounding_box_x: bomItem.bounding_box_x,
                bounding_box_y: bomItem.bounding_box_y,
                bounding_box_z: bomItem.bounding_box_z,
                stock_assignment: '',
                status: 'pending',
                vendor: bomItem.vendor,
                description: bomItem.description
            });
        }
        
        console.log('Final analyzed parts:', analyzedParts);
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
