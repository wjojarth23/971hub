/**
 * Test script for Manual Part Classification
 * Run with: node test-classification.js
 */

// Mock data for testing
const testBOM = [
    // COTS examples
    {
        name: "Acetal Bearing",
        part_number: "BRG-001",
        material: "acetal",
        vendor: "WCP",
        bounding_box_x: 0.02,
        bounding_box_y: 0.02,
        bounding_box_z: 0.01
    },
    {
        name: "WCP Gearbox",
        part_number: "WCP-123",
        material: "aluminum",
        vendor: "West Coast Products",
        bounding_box_x: 0.1,
        bounding_box_y: 0.08,
        bounding_box_z: 0.06
    },
    {
        name: "Belt Drive",
        part_number: "BELT-456",
        material: "belt rubber",
        vendor: "VEX",
        bounding_box_x: 0.5,
        bounding_box_y: 0.02,
        bounding_box_z: 0.01
    },
    {
        name: "Standard Screw",
        part_number: "SCR-789",
        material: "steel",
        vendor: "McMaster",
        standard_content: true,
        bounding_box_x: 0.01,
        bounding_box_y: 0.01,
        bounding_box_z: 0.03
    },
    // Manufactured examples
    {
        name: "Custom Chassis Plate",
        part_number: "P001-CHASSIS",
        material: "aluminum 6061",
        vendor: "",
        bounding_box_x: 0.3,
        bounding_box_y: 0.2,
        bounding_box_z: 0.006 // 1/4 inch sheet
    },    {
        name: "3D Printed Housing",
        part_number: "P002-HOUSING",
        material: "nylon pa12",
        vendor: "",
        bounding_box_x: 0.08,
        bounding_box_y: 0.06,
        bounding_box_z: 0.04
    },
    {
        name: "Onyx Drone Frame",
        part_number: "P007-FRAME",
        material: "onyx composite",
        vendor: "",
        bounding_box_x: 0.12,
        bounding_box_y: 0.10,
        bounding_box_z: 0.02
    },
    {
        name: "Onyx 3D Print Part",
        part_number: "P006-ONYX",
        material: "onyx carbon fiber",
        vendor: "",
        bounding_box_x: 0.05,
        bounding_box_y: 0.04,
        bounding_box_z: 0.03
    },{
        name: "Custom Shaft",
        part_number: "P003-SHAFT",
        material: "steel 1045",
        vendor: "",
        bounding_box_x: 0.015,  // 0.6 inches
        bounding_box_y: 0.015,  // 0.6 inches  
        bounding_box_z: 0.1     // 4 inches - longer shaft
    },
    {
        name: "Hex Shaft",
        part_number: "P006-HEX-SHAFT",
        material: "aluminum 6061",
        vendor: "",
        bounding_box_x: 0.0127, // 0.5 inches
        bounding_box_y: 0.0127, // 0.5 inches
        bounding_box_z: 0.0762  // 3 inches
    },
    {
        name: "Acrylic Panel",
        part_number: "P004-PANEL",
        material: "acrylic",
        vendor: "",
        bounding_box_x: 0.2,
        bounding_box_y: 0.15,
        bounding_box_z: 0.003 // Thin sheet
    },
    {
        name: "Large Block",
        part_number: "P005-BLOCK",
        material: "aluminum 6061",
        vendor: "",
        bounding_box_x: 0.08,
        bounding_box_y: 0.06,
        bounding_box_z: 0.04 // All dimensions > 0.5"
    },
    // Edge case: part that doesn't start with P (should be COTS)
    {
        name: "Custom Looking Part",
        part_number: "CUSTOM-001",
        material: "aluminum",
        vendor: "",
        bounding_box_x: 0.05,
        bounding_box_y: 0.04,
        bounding_box_z: 0.03
    }
];

// Simple classification service for testing
class TestClassificationService {
    manualClassification(bomData) {
        return bomData.map(item => {
            const name = (item.name || item.part_name || '').toLowerCase();
            const description = (item.description || '').toLowerCase();  
            const partNumber = (item.part_number || item.partNumber || '');
            const material = (item.material || '').toLowerCase();
            const vendor = (item.vendor || '').toLowerCase();
            const standardContent = (item.standard_content || item.standardContent || false);

            // COTS Classification Rules
            let isCOTS = false;
            
            // Rule 1: Material contains Belt, Acetal, or Delrin
            if (material.includes('belt') || material.includes('acetal') || material.includes('delrin')) {
                isCOTS = true;
            }
            
            // Rule 2: Name contains WCP
            if (name.includes('wcp')) {
                isCOTS = true;
            }
            
            // Rule 3: Part has a vendor
            if (vendor && vendor.trim() !== '') {
                isCOTS = true;
            }
            
            // Rule 4: Marked as standard content in BOM response
            if (standardContent === true || standardContent === 'true') {
                isCOTS = true;
            }

            let manufacturingProcess = null;
            
            // Only classify as manufactured if part number begins with capital "P"
            if (!isCOTS && partNumber.startsWith('P')) {
                // Get dimensions for classification
                const boundingBoxX = item.bounding_box_x || 0;
                const boundingBoxY = item.bounding_box_y || 0;
                const boundingBoxZ = item.bounding_box_z || 0;
                
                // Convert dimensions to inches
                const dimX = boundingBoxX * 39.3701;
                const dimY = boundingBoxY * 39.3701;
                const dimZ = boundingBoxZ * 39.3701;
                
                const dimensions = [dimX, dimY, dimZ].sort((a, b) => a - b);
                  // Immediate assignment for 3D printing materials
                if (material.includes('nylon') || material.includes('pla') || 
                    material.includes('abs') || material.includes('petg') || material.includes('onyx')) {
                    manufacturingProcess = '3d-print';
                } else {
                    const isSheet = this.isSheetGeometry(dimensions, material);
                    const isShaft = this.isShaftGeometry(dimensions);
                    const isCubic = this.isCubicGeometry(dimensions);
                    
                    if (isSheet) {
                        if (material.includes('acrylic') || material.includes('poly') || 
                            material.includes('wood') || material.includes('birch')) {
                            manufacturingProcess = 'laser-cut';
                        } else {
                            manufacturingProcess = 'router';
                        }
                    } else if (isShaft) {
                        manufacturingProcess = 'lathe';
                    } else if (isCubic) {
                        manufacturingProcess = 'mill';
                    } else {
                        if (material.includes('acrylic') || material.includes('poly') || 
                            material.includes('wood') || material.includes('birch')) {
                            manufacturingProcess = 'laser-cut';
                        } else {
                            manufacturingProcess = 'mill';
                        }
                    }
                }
            } else if (!isCOTS) {
                isCOTS = true;
            }

            return {
                part_name: item.name || item.part_name || 'Unknown',
                classification: isCOTS ? 'COTS' : 'manufactured',
                manufacturing_process: manufacturingProcess
            };
        });
    }

    isSheetGeometry(dimensions, material) {
        const [minDim, midDim, maxDim] = dimensions;
        const aspectRatio = maxDim / minDim;
        const isThick = minDim > 0.25;
        
        if (material.includes('acrylic') || material.includes('poly')) {
            return true;
        }
        
        if (material.includes('wood') || material.includes('birch')) {
            return true;
        }
        
        return aspectRatio > 4 && !isThick;
    }    isShaftGeometry(dimensions) {
        const [minDim, midDim, maxDim] = dimensions;
        
        // More relaxed criteria for shaft detection
        const lengthRatio = maxDim / midDim;
        const crossSectionRatio = midDim / minDim;
        
        const isLongAndThin = lengthRatio >= 2;
        const hasReasonableCrossSection = crossSectionRatio <= 3;
        
        console.log(`Shaft check for dims [${minDim.toFixed(2)}, ${midDim.toFixed(2)}, ${maxDim.toFixed(2)}]: lengthRatio=${lengthRatio.toFixed(2)}, crossSectionRatio=${crossSectionRatio.toFixed(2)}, isShaft=${isLongAndThin && hasReasonableCrossSection}`);
        
        return isLongAndThin && hasReasonableCrossSection;
    }

    isCubicGeometry(dimensions) {
        const [minDim, midDim, maxDim] = dimensions;
        const allDimensionsLarge = minDim > 0.5 && midDim > 0.5 && maxDim > 0.5;
        const isSheet = this.isSheetGeometry(dimensions, '');
        
        return allDimensionsLarge && !isSheet;
    }
}

async function runTest() {
    console.log('=== Manual Part Classification Test ===\n');
    
    const classifier = new TestClassificationService();
    const results = classifier.manualClassification(testBOM);
    
    console.log('Classification Results:');
    console.log('======================');
    
    results.forEach((result, index) => {
        const original = testBOM[index];
        console.log(`${index + 1}. ${result.part_name}`);
        console.log(`   Part Number: ${original.part_number}`);
        console.log(`   Material: ${original.material}`);
        console.log(`   Vendor: ${original.vendor || '(none)'}`);
        console.log(`   Classification: ${result.classification}`);
        if (result.manufacturing_process) {
            console.log(`   Manufacturing Process: ${result.manufacturing_process}`);
        }
        console.log('');
    });
    
    // Summary
    const cots = results.filter(r => r.classification === 'COTS').length;
    const manufactured = results.filter(r => r.classification === 'manufactured').length;
    
    console.log('=== Summary ===');
    console.log(`COTS parts: ${cots}`);
    console.log(`Manufactured parts: ${manufactured}`);
    console.log(`Total parts: ${results.length}`);
    
    // Process breakdown
    const processes = {};
    results.forEach(r => {
        if (r.manufacturing_process) {
            processes[r.manufacturing_process] = (processes[r.manufacturing_process] || 0) + 1;
        }
    });
    
    console.log('\n=== Manufacturing Processes ===');
    Object.entries(processes).forEach(([process, count]) => {
        console.log(`${process}: ${count} parts`);
    });
}

runTest().catch(console.error);
