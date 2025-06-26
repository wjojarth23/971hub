import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase.js';

export async function GET({ url, request }) {
  const action = url.searchParams.get('action');
  
  try {
    switch (action) {
      case 'stock-requests':
        return await getStockRequests();
      
      case 'sheets':
        const stockTypeId = url.searchParams.get('stockTypeId');
        return await getSheets(stockTypeId);
      
      case 'optimize-layout':
        const sheetId = url.searchParams.get('sheetId');
        const partIds = url.searchParams.get('partIds')?.split(',') || [];
        return await optimizeLayout(sheetId, partIds);
      
      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Laser API error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

export async function POST({ request, url }) {
  const action = url.searchParams.get('action');
  
  try {
    switch (action) {
      case 'create-sheet':
        const sheetData = await request.json();
        return await createSheet(sheetData);
      
      case 'cut-parts':
        const cutData = await request.json();
        return await processCut(cutData);
      
      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Laser API error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

async function getStockRequests() {
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('workflow', 'laser-cut')
    .in('status', ['pending', 'in-progress'])
    .is('sheet_id', null);
  
  if (error) throw error;
  
  // Group by material
  const requests = {};
  data.forEach(part => {
    const key = part.material || 'unknown';
    if (!requests[key]) {
      requests[key] = {
        material: key,
        parts: [],
        totalQuantity: 0,
        estimatedArea: 0
      };
    }
    requests[key].parts.push(part);
    requests[key].totalQuantity += part.quantity || 1;
    
    // Estimate area if dimensions available
    if (part.layout_x && part.layout_y) {
      requests[key].estimatedArea += (part.layout_x * part.layout_y * (part.quantity || 1));
    }
  });
  
  return json(Object.values(requests));
}

async function getSheets(stockTypeId) {
  const { data, error } = await supabase
    .from('sheet_utilization')
    .select('*')
    .eq('stock_type_id', stockTypeId)
    .eq('status', 'available')
    .order('remaining_area', { ascending: true });
  
  if (error) throw error;
  
  return json(data);
}

async function createSheet(sheetData) {
  const { data, error } = await supabase
    .from('sheets')
    .insert({
      stock_type_id: sheetData.stock_type_id,
      stock_description: sheetData.stock_description,
      material: sheetData.material,
      thickness: sheetData.thickness,
      width: sheetData.width,
      height: sheetData.height,
      remaining_area: sheetData.width * sheetData.height,
      location: sheetData.location
    })
    .select()
    .single();
  
  if (error) throw error;
  
  return json(data);
}

async function processCut(cutData) {
  const { sheetId, partIds, cutSvg, layoutData, userId, areaUsed } = cutData;
  
  // Create cut record
  const { data: cutRecord, error: cutError } = await supabase
    .from('sheet_cuts')
    .insert({
      sheet_id: sheetId,
      part_ids: partIds,
      cut_svg: cutSvg,
      layout_data: layoutData,
      cut_by: userId,
      area_used: areaUsed
    })
    .select()
    .single();
  
  if (cutError) throw cutError;
  
  // Update parts with sheet assignment
  const partUpdates = layoutData.positions.map(pos => ({
    id: pos.part.id,
    sheet_id: sheetId,
    layout_x: pos.x,
    layout_y: pos.y,
    layout_rotation: pos.rotation || 0,
    status: 'cammed',
    cut_date: new Date().toISOString()
  }));
  
  for (const update of partUpdates) {
    const { error: partError } = await supabase
      .from('parts')
      .update({
        sheet_id: update.sheet_id,
        layout_x: update.layout_x,
        layout_y: update.layout_y,
        layout_rotation: update.layout_rotation,
        status: update.status,
        cut_date: update.cut_date
      })
      .eq('id', update.id);
    
    if (partError) {
      console.error('Error updating part:', partError);
    }
  }
  
  // Update sheet remaining area
  const { data: sheet } = await supabase
    .from('sheets')
    .select('remaining_area, cut_svg')
    .eq('id', sheetId)
    .single();
  
  if (sheet) {
    const newRemainingArea = sheet.remaining_area - areaUsed;
    const updatedCutSvg = combineSVGs(sheet.cut_svg, cutSvg);
    
    const { error: sheetError } = await supabase
      .from('sheets')
      .update({
        remaining_area: newRemainingArea,
        cut_svg: updatedCutSvg,
        status: newRemainingArea < 10 ? 'exhausted' : 'in-use',
        updated_at: new Date().toISOString()
      })
      .eq('id', sheetId);
    
    if (sheetError) {
      console.error('Error updating sheet:', sheetError);
    }
  }
  
  return json({ 
    success: true, 
    cutId: cutRecord.id,
    partsUpdated: partUpdates.length 
  });
}

function combineSVGs(existingSvg, newSvg) {
  if (!existingSvg) return newSvg;
  
  // Simple SVG combination - extract paths from new SVG and append to existing
  const existingPaths = existingSvg.match(/<g.*?<\/g>/gs) || [];
  const newPaths = newSvg.match(/<g.*?<\/g>/gs) || [];
  
  // Create combined SVG with all paths
  const header = newSvg.match(/<svg[^>]*>.*?<\/defs>/s)?.[0] || '<svg>';
  const footer = '</svg>';
  
  return header + '\n' + existingPaths.join('\n') + '\n' + newPaths.join('\n') + '\n' + footer;
}
