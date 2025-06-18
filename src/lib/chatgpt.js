/**
 * ChatGPT Service for Part Classification and Tool Assignment
 * Uses server-side API route to securely call OpenAI's GPT-4-mini API
 */

class ChatGPTService {
    constructor() {
        this.apiRoute = '/api/chatgpt';
    }

    /**
     * Classify parts using ChatGPT API via server-side route
     * @param {Array} bomData - Array of BOM items with columns: Bounding Box, Name, Description, Vendor, Material, Part Number
     * @returns {Promise<Array>} - Array of classified parts
     */
    async classifyParts(bomData) {
        try {
            const response = await fetch(this.apiRoute, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    bomData: bomData
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Classification failed');
            }

            return data.classifications;

        } catch (error) {
            console.error('ChatGPT classification error:', error);
            throw error;
        }
    }

    /**
     * Fallback classification using simple heuristics
     * Used when ChatGPT API is not available
     */
    fallbackClassification(bomData) {
        return bomData.map(item => {
            const name = (item.name || item.part_name || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const partNumber = (item.part_number || item.partNumber || '').toLowerCase();
            const material = (item.material || '').toLowerCase();
            const vendor = (item.vendor || '').toLowerCase();            // COTS identification patterns
            const cotsPatterns = [
                'screw', 'bolt', 'nut', 'washer', 'bearing', 'motor', 'sensor',
                'switch', 'led', 'resistor', 'capacitor', 'arduino', 'raspberry',
                'servo', 'stepper', 'encoder', 'spring', 'gasket', 'o-ring',
                'cable', 'wire', 'connector', 'button', 'battery', 'fuse',
                'gear', 'belt', 'pulley', 'wheel'
            ];

            // Check for COTS indicators
            const isCOTS = cotsPatterns.some(pattern => 
                name.includes(pattern) || description.includes(pattern)
            ) || vendor !== '' || /^[0-9A-Z-]+$/.test(partNumber) || name.match(/^\d+$/); // Just numbers as names are often COTSlet manufacturingProcess = null;
            if (!isCOTS) {
                // Determine manufacturing process based on material and size
                const boundingBoxX = item.bounding_box_x || 0;
                const boundingBoxY = item.bounding_box_y || 0;
                const boundingBoxZ = item.bounding_box_z || 0;
                const minDimension = Math.min(boundingBoxX, boundingBoxY, boundingBoxZ);
                const maxDimension = Math.max(boundingBoxX, boundingBoxY, boundingBoxZ);

                // If we have bounding box data, use it for better classification
                if (boundingBoxX > 0 && boundingBoxY > 0 && boundingBoxZ > 0) {
                    // Convert from meters to mm for analysis
                    const minMM = minDimension * 1000;
                    const maxMM = maxDimension * 1000;
                    
                    if (material.includes('aluminum') || material.includes('steel') || material.includes('brass')) {
                        manufacturingProcess = 'mill';
                    } else if (material.includes('wood') || material.includes('mdf') || material.includes('plywood')) {
                        manufacturingProcess = minMM < 20 ? 'laser-cut' : 'router';
                    } else if (material.includes('acrylic') || (material.includes('plastic') && minMM < 10)) {
                        manufacturingProcess = 'laser-cut';
                    } else if (material.includes('plastic') || material.includes('pla') || material.includes('abs') || material.includes('nylon')) {
                        manufacturingProcess = '3d-print';
                    } else if (maxMM > 200) {
                        manufacturingProcess = 'router';
                    } else {
                        manufacturingProcess = 'mill'; // default
                    }
                } else {
                    // No bounding box data, classify based on material only
                    if (material.includes('aluminum') || material.includes('steel') || material.includes('brass')) {
                        manufacturingProcess = 'mill';
                    } else if (material.includes('wood') || material.includes('mdf') || material.includes('plywood')) {
                        manufacturingProcess = 'laser-cut'; // assume thin sheet                    } else if (material.includes('acrylic')) {
                        manufacturingProcess = 'laser-cut';
                    } else if (material.includes('plastic') || material.includes('pla') || material.includes('abs') || 
                               material.includes('nylon') || material.includes('petg') || material.includes('glass-filled')) {
                        manufacturingProcess = '3d-print';
                    } else {
                        manufacturingProcess = 'mill'; // default when unsure
                    }                }
            }

            return {
                part_name: item.name || item.part_name || 'Unknown',
                classification: isCOTS ? 'COTS' : 'manufactured',
                manufacturing_process: manufacturingProcess
            };
        });
    }

    /**
     * Test the API connection
     */
    async testConnection() {
        try {
            const response = await fetch(this.apiRoute, {
                method: 'GET'
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            return data.success;

        } catch (error) {
            console.error('API connection test failed:', error);
            return false;
        }
    }
}

export const chatGPTService = new ChatGPTService();
