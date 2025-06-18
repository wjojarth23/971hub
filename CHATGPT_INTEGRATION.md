# ChatGPT BOM Classification Integration

This document explains how to set up and use the ChatGPT-4-mini integration for intelligent part classification and tool assignment in the 971 Hub application.

## Overview

The ChatGPT integration enhances the BOM (Bill of Materials) analysis by using AI to:
- Classify parts as COTS (Commercial Off-The-Shelf) or manufactured
- Assign appropriate manufacturing processes (mill, laser-cut, 3d-print, waterjet, router, lathe)
- Provide reasoning for classification decisions
- Show confidence levels for AI decisions

## Setup Instructions

### 1. Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (it starts with `sk-`)

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env` in your project root:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

### 3. Install Dependencies

The integration uses the existing SvelteKit fetch API, so no additional packages are required.

## Features

### AI-Enhanced BOM Analysis

When you create a build from an OnShape version, the system will:

1. **Extract BOM data** from OnShape including:
   - Part names and descriptions
   - Materials
   - Vendor information
   - Part numbers
   - Bounding box dimensions

2. **Send to ChatGPT-4-mini** for intelligent analysis

3. **Receive classifications** including:
   - COTS vs manufactured decision
   - Manufacturing process assignment
   - Reasoning for decisions
   - Confidence levels (0-100%)

4. **Display enhanced information** in the BOM table with:
   - AI reasoning tooltips
   - Confidence indicators
   - Workflow badges
   - Bounding box dimensions

### Fallback System

If ChatGPT is unavailable or fails:
- Automatically falls back to rule-based classification
- Uses material types and dimensions for workflow assignment
- Continues normal operation without interruption

### Manufacturing Process Assignment

The AI considers multiple factors to assign processes:

- **Mill**: Metal parts, complex 3D geometry, precision requirements
- **Laser-cut**: Thin sheet materials (wood, acrylic, thin metal)
- **3D-print**: Plastic parts, complex geometries, prototypes
- **Waterjet**: Thick materials, hard-to-machine materials
- **Router**: Large wood parts, thick materials
- **Lathe**: Cylindrical parts, shafts, tubes

## Usage

### Testing the Connection

1. Open a subsystem with an OnShape document
2. Create a build from any version
3. Click "Test AI Connection" button
4. Verify the connection is working

### Viewing AI Classifications

In the BOM table, you'll see:
- **Type**: COTS or manufactured classification
- **Workflow**: Manufacturing process with color-coded badges
- **Bounding Box**: Part dimensions in millimeters
- **AI Reasoning**: Brief explanation (hover for full text)
- **Confidence**: Visual bar showing AI confidence level

### Understanding Confidence Levels

- **90-100%**: High confidence (green)
- **70-89%**: Medium confidence (yellow/orange)
- **0-69%**: Low confidence (red)

## Troubleshooting

### Common Issues

1. **"OpenAI API key not configured"**
   - Check your `.env` file has the correct API key
   - Restart your development server after adding the key

2. **"API connection failed"**
   - Verify your API key is valid and has credits
   - Check your internet connection
   - Try the "Test AI Connection" button

3. **"Fallback Logic" showing instead of AI reasoning**
   - The ChatGPT API call failed, but the system is working
   - Check the console for error messages
   - Verify your API key and credits

### Debug Information

Check the browser console for detailed logs:
- BOM data being sent to ChatGPT
- API responses and errors
- Fallback logic activation

## API Costs

ChatGPT-4-mini is very cost-effective:
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Typical BOM analysis costs less than $0.01

## Security

- API key is stored securely server-side
- Never exposed to client browser
- All requests go through your server

## Customization

### Modifying the AI Prompt

Edit the system prompt in `/src/routes/api/chatgpt/+server.js`:

```javascript
const systemPrompt = `
You are an expert manufacturing engineer...
// Customize this prompt for your specific needs
`;
```

### Adding New Manufacturing Processes

1. Update the prompt to include new processes
2. Add CSS styles for new workflow badges in the Svelte component
3. Update the fallback logic if needed

## Example BOM Analysis

**Input:**
```json
{
  "name": "Aluminum Bracket",
  "material": "6061 Aluminum",
  "bounding_box": "50x30x10mm",
  "description": "Custom mounting bracket"
}
```

**AI Output:**
```json
{
  "classification": "manufactured",
  "manufacturing_process": "mill",
  "reasoning": "Custom aluminum part requiring precision machining",
  "confidence": 0.95
}
```

## Support

For issues or questions:
1. Check the browser console for error messages
2. Test the API connection using the built-in test button
3. Verify your OpenAI API key and account status
4. Check the fallback logic is working as expected
