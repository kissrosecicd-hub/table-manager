import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(request.url);
  const colId = searchParams.get('column');
  const { id } = await params;

  if (!colId) {
    return NextResponse.json({ error: 'Missing column parameter' }, { status: 400 });
  }

  const tables = store.getTables();
  const table = tables.find(t => t.id === id);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const col = table.columns.find(c => c.id === colId);
  if (!col) {
    return NextResponse.json({ error: 'Column not found' }, { status: 404 });
  }

  // Find duplicates by column value
  const valueMap = new Map<string | null, typeof table.records>();
  for (const record of table.records) {
    const val = record[colId];
    if (!val || String(val).trim() === '') continue; // Skip empty
    if (!valueMap.has(val)) valueMap.set(val, []);
    valueMap.get(val)!.push(record);
  }

  const duplicates = Array.from(valueMap.entries())
    .filter(([, records]) => records.length > 1)
    .map(([value, records]) => ({
      value,
      count: records.length,
      records: records.map(r => ({ id: r.id, data: r })),
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    column: col.name,
    columnId: col.id,
    total: duplicates.length,
    duplicateRecords: duplicates.flatMap(d => d.records.map(r => r.id)),
    duplicates,
  });
}
