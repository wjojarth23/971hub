import { json, error } from '@sveltejs/kit';
import { OPENAI_API_KEY } from '$env/static/private';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    try {
        if (!OPENAI_API_KEY) {
            throw error(500, 'OpenAI API key not configured');
        }

        const { bomData } = await request.json();

        if (!bomData || !Array.isArray(bomData)) {
            throw error(400, 'Invalid BOM data provided');
        }        // System prompt for part classification
        const systemPrompt = `
You are a tool that processes a Bill of Materials for a First Robotics Competition (FRC) robot, which includes various parts with different specifications, including many that are available commercially from frc vendors.

Your task is to analyze a Bill of Materials (BOM) and classify each part into one of the following categories:
1. COTS (Commercial Off-The-Shelf) - Standard parts like screws, bolts, bearings, motors, electronics, gears, belts, etc. that can be purchased from vendors.
2. manufactured - Custom parts that need to be made in-house

For manufactured parts, assign the appropriate manufacturing process:
- mill: For metal parts requiring precision machining (aluminum, steel, brass, titanium, etc.)
- laser-cut: For sheet materials (wood, acrylic, thin metals, MDF, plywood, polycarbonate sheets)
- 3d-print: For plastic parts, especially nylon, PLA, ABS, PETG, glass-filled nylon, carbon fiber nylon, etc.
- router: For thick wood parts, large flat parts not suitable for laser cutting

Consider these factors in your analysis:
- Bounding box dimensions (length x width x height)
- Material type and properties
- Part name and description
- Vendor information (if present, likely COTS)
- Part number patterns (standardized numbers often indicate COTS)
- Common manufacturing constraints and capabilities

Return your response as a JSON object with a "parts" array, where each part has these fields:
{
  "part_name": "original part name",
  "classification": "COTS" or "manufactured",
  "manufacturing_process": "mill" | "laser-cut" | "3d-print" | "router" | null
}

Be practical and consider real-world manufacturing scenarios. When in doubt, prefer COTS if the part could reasonably be purchased.
`;

        // Format the BOM data for ChatGPT
        const formattedBOM = bomData.map((item, index) => ({
            index: index + 1,
            name: item.name || item.part_name || 'Unknown',
            description: item.description || '',
            vendor: item.vendor || '',
            material: item.material || '',
            part_number: item.part_number || item.partNumber || '',
            bounding_box: item.bounding_box || `${item.bounding_box_x || 0}x${item.bounding_box_y || 0}x${item.bounding_box_z || 0}mm`,
            quantity: item.quantity || 1
        }));

        const userPrompt = `
Please analyze the following Bill of Materials and classify each part:

BOM Data:
${JSON.stringify(formattedBOM, null, 2)}

Provide classification for each part following the specified JSON format with a "parts" array.
`;

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 4000,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('OpenAI API error:', errorData);
            throw error(response.status, `OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw error(500, 'No response content from ChatGPT');
        }

        // Parse the JSON response
        let classifications;
        try {
            const parsed = JSON.parse(content);
            classifications = parsed.parts || parsed.classifications || parsed;
            
            // Ensure it's an array
            if (!Array.isArray(classifications)) {
                classifications = Object.values(classifications);
            }
        } catch (parseError) {
            console.error('Failed to parse ChatGPT response:', content);
            throw error(500, 'Invalid JSON response from ChatGPT');
        }

        return json({
            success: true,
            classifications,
            usage: data.usage
        });

    } catch (err) {
        console.error('ChatGPT API route error:', err);
        
        if (err.status) {
            throw err; // Re-throw SvelteKit errors
        }
        
        throw error(500, `Internal server error: ${err.message}`);
    }
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
    // Test endpoint
    try {
        if (!OPENAI_API_KEY) {
            return json({ 
                success: false, 
                error: 'OpenAI API key not configured' 
            });
        }

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello, please respond with "API connection successful"'
                    }
                ],
                max_tokens: 50
            })
        });

        if (!response.ok) {
            return json({ 
                success: false, 
                error: `API test failed: ${response.status}` 
            });
        }

        const data = await response.json();
        const isSuccessful = data.choices[0]?.message?.content?.includes('successful') || false;

        return json({
            success: isSuccessful,
            message: isSuccessful ? 'API connection successful' : 'API connection test failed',
            response: data.choices[0]?.message?.content
        });

    } catch (err) {
        return json({
            success: false,
            error: err.message
        });
    }
}
