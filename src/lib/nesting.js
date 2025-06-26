/**
 * Advanced 2D bin packing and nesting algorithms for laser cutting optimization
 * Supports rotation, complex shapes, and material utilization optimization
 */

/**
 * Bottom-Left Fill (BLF) algorithm with rotation support
 * This is a simplified version - production would use more advanced algorithms like No-Fit Polygon
 */
export class NestingEngine {
  constructor(options = {}) {
    this.allowRotation = options.allowRotation !== false;
    this.rotationAngles = options.rotationAngles || [0, 90, 180, 270];
    this.spacing = options.spacing || 0.1; // Minimum spacing between parts (inches)
    this.margin = options.margin || 0.2; // Margin from sheet edges (inches)
  }
  /**
   * Main nesting function
   * @param {Array} parts - Array of part objects with geometry
   * @param {Object} sheet - Sheet dimensions and constraints
   * @param {Array} existingCutAreas - Previously cut areas to avoid
   * @returns {Object} Layout result with positions and efficiency metrics
   */
  async nestParts(parts, sheet, existingCutAreas = []) {
    const { width, height } = sheet;
    const usableWidth = width - (2 * this.margin);
    const usableHeight = height - (2 * this.margin);
    
    // Convert parts to normalized format
    const normalizedParts = this.normalizeParts(parts);
    
    // Sort parts by area (largest first) for better packing
    const sortedParts = normalizedParts.sort((a, b) => b.area - a.area);
    
    // Initialize placement grid with existing cut areas
    const placements = [];
    const occupiedRegions = [...this.processExistingCutAreas(existingCutAreas)];
    
    let totalAreaUsed = 0;
    const failedParts = [];
    
    for (const part of sortedParts) {
      const placement = await this.findBestPlacement(
        part, 
        usableWidth, 
        usableHeight, 
        occupiedRegions
      );
      
      if (placement) {
        // Adjust for margin offset
        placement.x += this.margin;
        placement.y += this.margin;
        
        placements.push(placement);
        
        // Add to occupied regions for collision detection
        occupiedRegions.push({
          x: placement.x - this.margin,
          y: placement.y - this.margin,
          width: placement.width,
          height: placement.height,
          rotation: placement.rotation,
          type: 'new_part'
        });
        
        totalAreaUsed += placement.width * placement.height;
      } else {
        failedParts.push(part);
      }
    }
    
    return {
      placements,
      failedParts,
      efficiency: totalAreaUsed / (width * height),
      totalAreaUsed,
      remainingArea: (width * height) - totalAreaUsed - this.calculateExistingCutArea(existingCutAreas),
      utilizationPercent: (totalAreaUsed / (width * height)) * 100,
      newCutAreas: this.generateCutAreas(placements)
    };
  }

  /**
   * Normalize parts to consistent format
   */
  normalizeParts(parts) {
    return parts.map(part => {
      // Extract dimensions from various possible sources
      let width = part.width || part.layout_x || part.bounding_box_x || 2;
      let height = part.height || part.layout_y || part.bounding_box_y || 2;
      
      // Convert from meters to inches if needed (OnShape typically returns meters)
      if (width < 1 && height < 1) {
        width *= 39.3701; // meters to inches
        height *= 39.3701;
      }
      
      // Handle SVG path data if available
      if (part.svg_path && !part.width) {
        const bounds = this.calculateSVGBounds(part.svg_path);
        width = bounds.width;
        height = bounds.height;
      }
      
      return {
        ...part,
        originalWidth: width,
        originalHeight: height,
        area: width * height,
        aspectRatio: width / height,
        // Create simplified outline for collision detection
        outline: this.createSimplifiedOutline(part, width, height)
      };
    });
  }

  /**
   * Calculate bounding box from SVG path data
   */
  calculateSVGBounds(svgPath) {
    // Simplified SVG bounds calculation
    // In production, use a proper SVG parser
    const numbers = svgPath.match(/[\d.-]+/g)?.map(Number) || [];
    
    if (numbers.length < 4) {
      return { width: 2, height: 2 }; // fallback
    }
    
    const xCoords = numbers.filter((_, i) => i % 2 === 0);
    const yCoords = numbers.filter((_, i) => i % 2 === 1);
    
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);
    
    return {
      width: (maxX - minX) / 72, // Convert points to inches (72 points per inch)
      height: (maxY - minY) / 72
    };
  }

  /**
   * Create simplified collision outline
   */
  createSimplifiedOutline(part, width, height) {
    // For now, use rectangular outline
    // In production, this would create a simplified polygon from the actual part geometry
    return {
      type: 'rectangle',
      width,
      height,
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height }
      ]
    };
  }

  /**
   * Find the best placement for a part
   */
  async findBestPlacement(part, sheetWidth, sheetHeight, occupiedRegions) {
    let bestPlacement = null;
    let bestScore = -1;
    
    // Try different rotations if allowed
    const rotations = this.allowRotation ? this.rotationAngles : [0];
    
    for (const rotation of rotations) {
      const rotatedDims = this.getRotatedDimensions(part, rotation);
      
      if (rotatedDims.width > sheetWidth || rotatedDims.height > sheetHeight) {
        continue; // Part doesn't fit even with rotation
      }
      
      // Try different positions using bottom-left fill strategy
      const positions = this.generateCandidatePositions(
        rotatedDims,
        sheetWidth,
        sheetHeight,
        occupiedRegions
      );
      
      for (const position of positions) {
        if (this.isValidPlacement(position, rotatedDims, occupiedRegions)) {
          const score = this.calculatePlacementScore(position, rotatedDims, occupiedRegions);
          
          if (score > bestScore) {
            bestScore = score;
            bestPlacement = {
              ...position,
              width: rotatedDims.width,
              height: rotatedDims.height,
              rotation,
              part: part,
              score
            };
          }
        }
      }
    }
    
    return bestPlacement;
  }

  /**
   * Get dimensions after rotation
   */
  getRotatedDimensions(part, rotation) {
    if (rotation === 90 || rotation === 270) {
      return {
        width: part.originalHeight,
        height: part.originalWidth
      };
    }
    return {
      width: part.originalWidth,
      height: part.originalHeight
    };
  }

  /**
   * Generate candidate positions using bottom-left fill
   */
  generateCandidatePositions(partDims, sheetWidth, sheetHeight, occupiedRegions) {
    const candidates = [];
    
    // Always try bottom-left corner
    candidates.push({ x: 0, y: 0 });
    
    // Generate positions along edges of occupied regions
    for (const region of occupiedRegions) {
      // Right edge
      candidates.push({
        x: region.x + region.width + this.spacing,
        y: region.y
      });
      
      // Top edge
      candidates.push({
        x: region.x,
        y: region.y + region.height + this.spacing
      });
      
      // Top-right corner
      candidates.push({
        x: region.x + region.width + this.spacing,
        y: region.y + region.height + this.spacing
      });
    }
    
    // Filter out positions that would place part outside sheet
    return candidates.filter(pos => 
      pos.x + partDims.width <= sheetWidth &&
      pos.y + partDims.height <= sheetHeight &&
      pos.x >= 0 && pos.y >= 0
    );
  }

  /**
   * Check if placement is valid (no collisions)
   */
  isValidPlacement(position, partDims, occupiedRegions) {
    const partRect = {
      x: position.x,
      y: position.y,
      width: partDims.width,
      height: partDims.height
    };
    
    // Check collision with each occupied region
    for (const region of occupiedRegions) {
      if (this.rectanglesOverlap(partRect, region)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if two rectangles overlap (with spacing)
   */
  rectanglesOverlap(rect1, rect2) {
    return !(
      rect1.x + rect1.width + this.spacing <= rect2.x ||
      rect2.x + rect2.width + this.spacing <= rect1.x ||
      rect1.y + rect1.height + this.spacing <= rect2.y ||
      rect2.y + rect2.height + this.spacing <= rect1.y
    );
  }

  /**
   * Calculate placement quality score
   */
  calculatePlacementScore(position, partDims, occupiedRegions) {
    // Bottom-left preference (lower y and x is better)
    const positionScore = -(position.x + position.y * 2);
    
    // Prefer positions that create opportunities for future placements
    const adjacencyScore = this.calculateAdjacencyScore(position, partDims, occupiedRegions);
    
    // Penalty for wasted space
    const wasteScore = -this.calculateWastedSpace(position, partDims, occupiedRegions);
    
    return positionScore + adjacencyScore + wasteScore;
  }

  /**
   * Calculate how well this placement works with existing parts
   */
  calculateAdjacencyScore(position, partDims, occupiedRegions) {
    let score = 0;
    
    for (const region of occupiedRegions) {
      // Bonus for sharing edges (creates more compact layout)
      if (Math.abs((position.x + partDims.width) - region.x) < 0.01) {
        score += 10; // Right edge aligns with left edge of existing part
      }
      if (Math.abs(position.x - (region.x + region.width)) < 0.01) {
        score += 10; // Left edge aligns with right edge of existing part
      }
      if (Math.abs((position.y + partDims.height) - region.y) < 0.01) {
        score += 10; // Top edge aligns with bottom edge of existing part
      }
      if (Math.abs(position.y - (region.y + region.height)) < 0.01) {
        score += 10; // Bottom edge aligns with top edge of existing part
      }
    }
    
    return score;
  }

  /**
   * Calculate wasted space penalty
   */
  calculateWastedSpace(position, partDims, occupiedRegions) {
    // Simplified waste calculation
    // In production, this would be more sophisticated
    const rightWaste = this.getSpaceToRight(position, partDims, occupiedRegions);
    const topWaste = this.getSpaceAbove(position, partDims, occupiedRegions);
    
    return rightWaste + topWaste;
  }

  getSpaceToRight(position, partDims, occupiedRegions) {
    // Find the nearest obstacle to the right
    let minDistance = Infinity;
    
    for (const region of occupiedRegions) {
      if (region.y < position.y + partDims.height && 
          region.y + region.height > position.y &&
          region.x > position.x + partDims.width) {
        const distance = region.x - (position.x + partDims.width);
        minDistance = Math.min(minDistance, distance);
      }
    }
    
    return minDistance === Infinity ? 0 : minDistance;
  }

  getSpaceAbove(position, partDims, occupiedRegions) {
    // Find the nearest obstacle above
    let minDistance = Infinity;
    
    for (const region of occupiedRegions) {
      if (region.x < position.x + partDims.width && 
          region.x + region.width > position.x &&
          region.y > position.y + partDims.height) {
        const distance = region.y - (position.y + partDims.height);
        minDistance = Math.min(minDistance, distance);
      }
    }
    
    return minDistance === Infinity ? 0 : minDistance;
  }

  /**
   * Process existing cut areas from database format
   */
  processExistingCutAreas(existingCutAreas) {
    if (!existingCutAreas || !Array.isArray(existingCutAreas)) {
      return [];
    }
    
    return existingCutAreas.map(area => ({
      x: area.x || 0,
      y: area.y || 0,
      width: area.width || 0,
      height: area.height || 0,
      rotation: area.rotation || 0,
      type: 'existing_cut',
      polygon: area.polygon || []
    }));
  }

  /**
   * Calculate total area of existing cuts
   */
  calculateExistingCutArea(existingCutAreas) {
    if (!existingCutAreas || !Array.isArray(existingCutAreas)) {
      return 0;
    }
    
    return existingCutAreas.reduce((total, area) => {
      return total + ((area.width || 0) * (area.height || 0));
    }, 0);
  }

  /**
   * Generate cut area polygons for new placements
   */
  generateCutAreas(placements) {
    return placements.map(placement => ({
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: placement.rotation || 0,
      part_id: placement.part.id,
      part_name: placement.part.name,
      // Generate simplified rectangular polygon
      polygon: this.generateRectanglePolygon(
        placement.x, 
        placement.y, 
        placement.width, 
        placement.height, 
        placement.rotation || 0
      )
    }));
  }

  /**
   * Generate polygon points for a rotated rectangle
   */
  generateRectanglePolygon(x, y, width, height, rotation) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radians = (rotation * Math.PI) / 180;
    
    // Rectangle corners relative to center
    const corners = [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 }
    ];
    
    // Rotate and translate corners
    return corners.map(corner => {
      const rotatedX = corner.x * Math.cos(radians) - corner.y * Math.sin(radians);
      const rotatedY = corner.x * Math.sin(radians) + corner.y * Math.cos(radians);
      
      return {
        x: centerX + rotatedX,
        y: centerY + rotatedY
      };
    });
  }
}

/**
 * SVG geometry utilities
 */
export class SVGProcessor {
  /**
   * Create dilated outline from SVG path for nesting
   */  static createDilatedOutline(svgPath, dilationRadius = 0.05) {
    // Simplified implementation
    // In production, use proper computational geometry library
    
    const bounds = SVGProcessor.extractBounds(svgPath);
    
    // Expand bounds by dilation radius
    return {
      x: bounds.x - dilationRadius,
      y: bounds.y - dilationRadius,
      width: bounds.width + (2 * dilationRadius),
      height: bounds.height + (2 * dilationRadius),
      originalPath: svgPath
    };
  }
  /**
   * Extract bounding box from SVG path
   */
  static extractBounds(svgPath) {
    // Parse SVG path and find min/max coordinates
    const coords = SVGProcessor.parsePathCoordinates(svgPath);
    
    if (coords.length === 0) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    
    const xCoords = coords.map(c => c.x);
    const yCoords = coords.map(c => c.y);
    
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Parse coordinates from SVG path
   */
  static parsePathCoordinates(path) {
    // Simplified SVG path parser
    const coords = [];
    const regex = /[MLHVCSQTAZmlhvcsqtaz][\s,]*([^MLHVCSQTAZmlhvcsqtaz]*)/gi;
    let match;
    
    while ((match = regex.exec(path)) !== null) {
      const command = match[0][0];
      const params = match[1].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
      
      // Handle different path commands
      for (let i = 0; i < params.length; i += 2) {
        if (i + 1 < params.length) {
          coords.push({ x: params[i], y: params[i + 1] });
        }
      }
    }
    
    return coords;
  }
  /**
   * Generate SVG output for laser cutting (new parts only)
   */
  static generateCutSVG(layout, sheet) {
    const { placements } = layout;
    
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${sheet.width}in" height="${sheet.height}in" 
     viewBox="0 0 ${sheet.width} ${sheet.height}" 
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .cut-path { 
        fill: none; 
        stroke: black; 
        stroke-width: 0.01in; 
        vector-effect: non-scaling-stroke;
      }
      .part-label {
        font-family: Arial, sans-serif;
        font-size: 0.1in;
        fill: black;
        text-anchor: middle;
      }
    </style>
  </defs>
  <metadata>
    <title>Laser Cut Layout - New Parts Only</title>
    <description>Generated ${new Date().toISOString()}</description>
    <note>This SVG contains only NEW parts to be cut. Origin at top-right (0,0).</note>
  </metadata>
`;

    placements.forEach((placement, index) => {
      // Transform coordinates so 0,0 is at top-right as requested
      const x = sheet.width - placement.x - placement.width;
      const y = placement.y;
      
      // Add part outline (simplified as rectangle for now)
      svg += `  <g id="part-${placement.part.id}" transform="translate(${x},${y}) rotate(${placement.rotation || 0})">
    <rect width="${placement.width}" height="${placement.height}" 
          class="cut-path" 
          data-part-id="${placement.part.id}"
          data-part-name="${placement.part.name || 'Unnamed'}" />
    <text x="${placement.width/2}" y="${placement.height/2}" 
          class="part-label">${index + 1}</text>
  </g>
`;
    });
    
    svg += '</svg>';
    return svg;
  }

  /**
   * Generate master sheet SVG showing all cut areas (for visualization)
   */
  static generateMasterSheetSVG(sheet, allCutAreas) {
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${sheet.width}in" height="${sheet.height}in" 
     viewBox="0 0 ${sheet.width} ${sheet.height}" 
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .sheet-outline { 
        fill: none; 
        stroke: #666; 
        stroke-width: 0.02in; 
      }
      .cut-area { 
        fill: rgba(255, 0, 0, 0.3); 
        stroke: red; 
        stroke-width: 0.01in; 
      }
      .area-label {
        font-family: Arial, sans-serif;
        font-size: 0.08in;
        fill: red;
        text-anchor: middle;
      }
    </style>
  </defs>
  <metadata>
    <title>Master Sheet Layout - All Cut Areas</title>
    <description>Shows all areas that have been cut from this sheet</description>
  </metadata>
  
  <!-- Sheet outline -->
  <rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" class="sheet-outline" />
`;

    if (allCutAreas && Array.isArray(allCutAreas)) {
      allCutAreas.forEach((area, index) => {
        if (area.polygon && area.polygon.length > 0) {
          // Draw polygon path
          const pathData = area.polygon.map((point, i) => 
            `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
          ).join(' ') + ' Z';
          
          svg += `  <path d="${pathData}" class="cut-area" data-part-id="${area.part_id || ''}" />
`;
          
          // Add label at center
          if (area.x !== undefined && area.y !== undefined) {
            svg += `  <text x="${area.x + (area.width || 0)/2}" y="${area.y + (area.height || 0)/2}" 
                         class="area-label">${area.part_name?.substring(0, 5) || `#${index + 1}`}</text>
`;
          }
        } else {
          // Fallback to rectangle
          svg += `  <rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" 
                         class="cut-area" data-part-id="${area.part_id || ''}" />
          <text x="${area.x + area.width/2}" y="${area.y + area.height/2}" 
                class="area-label">${area.part_name?.substring(0, 5) || `#${index + 1}`}</text>
`;
        }
      });
    }
    
    svg += '</svg>';
    return svg;
  }
}

/**
 * Optimal sheet selection algorithm
 */
export class SheetSelector {
  /**
   * Find the best sheet for a set of parts
   */
  static async findOptimalSheet(parts, availableSheets, options = {}) {
    const buffer = options.areaBuffer || 0.5; // 50% area buffer
    const nestingEngine = new NestingEngine(options);
    
    // Calculate minimum area required
    const totalPartArea = parts.reduce((sum, part) => {
      const width = part.width || part.layout_x || part.bounding_box_x || 2;
      const height = part.height || part.layout_y || part.bounding_box_y || 2;
      return sum + (width * height * (part.quantity || 1));
    }, 0);
    
    const requiredArea = totalPartArea * (1 + buffer);
    
    // Filter sheets with sufficient area
    const viableSheets = availableSheets.filter(sheet => 
      sheet.remaining_area >= requiredArea
    );
    
    if (viableSheets.length === 0) {
      return {
        success: false,
        error: 'No sheets with sufficient area found',
        requiredArea,
        availableSheets: availableSheets.length
      };
    }
    
    // Test actual nesting on viable sheets
    const results = [];
    
    for (const sheet of viableSheets) {
      try {
        const nestingResult = await nestingEngine.nestParts(parts, sheet);
        
        if (nestingResult.failedParts.length === 0) {
          results.push({
            sheet,
            nestingResult,
            efficiency: nestingResult.efficiency,
            wastedArea: sheet.remaining_area - nestingResult.totalAreaUsed
          });
        }
      } catch (error) {
        console.warn(`Nesting failed for sheet ${sheet.id}:`, error);
      }
    }
    
    if (results.length === 0) {
      return {
        success: false,
        error: 'Parts do not fit on any available sheet',
        viableSheets: viableSheets.length
      };
    }
    
    // Sort by efficiency (highest first), then by smallest remaining area
    results.sort((a, b) => {
      if (Math.abs(a.efficiency - b.efficiency) > 0.05) {
        return b.efficiency - a.efficiency;
      }
      return a.wastedArea - b.wastedArea;
    });
    
    return {
      success: true,
      optimalSheet: results[0].sheet,
      layout: results[0].nestingResult,
      alternatives: results.slice(1)
    };
  }
}
