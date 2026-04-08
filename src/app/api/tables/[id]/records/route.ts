import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const record = store.addRecord(id, body);
  if (!record) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  return NextResponse.json(record, { status: 201 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const table = store.getTable(id);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  return NextResponse.json({ columns: table.columns, records: table.records });
}
