import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { records } = body as { records: Record<string, string | null>[] };

  if (!Array.isArray(records)) {
    return NextResponse.json({ error: 'Records array required' }, { status: 400 });
  }

  const table = store.getTable(id);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const created = [];
  for (const record of records) {
    const createdRecord = store.addRecord(id, record);
    if (!createdRecord) {
      return NextResponse.json({ error: 'Failed to add record', created }, { status: 500 });
    }
    created.push(createdRecord);
  }

  return NextResponse.json({ created }, { status: 201 });
}
