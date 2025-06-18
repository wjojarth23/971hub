/**
 * Test script for ChatGPT BOM Classification
 * Run with: node test-chatgpt.js
 */

const testBOM = [
  {
    name: "Custom Aluminum Bracket",
    description: "CNC machined mounting bracket",
    material: "6061 Aluminum",
    part_number: "P001",
    bounding_box: "100x50x20mm",
    vendor: ""
  },
  {
    name: "Socket Head Cap Screw",
    description: "M5 x 20mm SHCS",
    material: "Steel",
    part_number: "M5x20-SHCS",
    bounding_box: "5x5x20mm",
    vendor: "McMaster-Carr"
  },
  {
    name: "3D Printed Housing",
    description: "Custom electronic enclosure",
    material: "PLA",
    part_number: "P002",
    bounding_box: "80x60x40mm",
    vendor: ""
  },
  {
    name: "Laser Cut Plate",
    description: "Mounting plate for sensors",
    material: "3mm Acrylic",
    part_number: "P003",
    bounding_box: "150x100x3mm",
    vendor: ""
  }
];

async function testClassification() {
  try {
    const response = await fetch('http://localhost:5173/api/chatgpt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bomData: testBOM
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    console.log('=== ChatGPT BOM Classification Test ===');
    console.log('Success:', result.success);
    
    if (result.success) {
      console.log('\nClassifications:');
      result.classifications.forEach((classification, index) => {
        console.log(`\n${index + 1}. ${classification.part_name}`);
        console.log(`   Classification: ${classification.classification}`);
        console.log(`   Process: ${classification.manufacturing_process || 'N/A'}`);
        console.log(`   Reasoning: ${classification.reasoning}`);
        console.log(`   Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
      });
      
      console.log('\nUsage:', result.usage);
    } else {
      console.error('Error:', result.error);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Test API connection first
async function testConnection() {
  try {
    const response = await fetch('http://localhost:5173/api/chatgpt', {
      method: 'GET'
    });

    const result = await response.json();
    
    console.log('=== API Connection Test ===');
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    
    if (result.success) {
      console.log('\n✅ API connection successful! Running classification test...\n');
      await testClassification();
    } else {
      console.log('\n❌ API connection failed:', result.error);
    }

  } catch (error) {
    console.error('Connection test failed:', error.message);
  }
}

// Run the tests
testConnection();
