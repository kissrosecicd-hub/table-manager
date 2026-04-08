import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, required } = body;
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }
  const column = store.addColumn(id, { name: name.trim(), required: !!required });
  if (!column) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  return NextResponse.json(column, { status: 201 });
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
  return NextResponse.json(table.columns);
}
