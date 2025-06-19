import { json, error } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    // ChatGPT functionality has been removed
    // Using manual classification rules instead
    throw error(410, 'ChatGPT API endpoint has been removed. Using manual classification instead.');
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
    // ChatGPT functionality has been removed
    return json({
        success: false,
        error: 'ChatGPT API endpoint has been removed. Using manual classification instead.'
    });
}
