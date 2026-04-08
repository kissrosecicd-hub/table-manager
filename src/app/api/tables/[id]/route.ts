import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }
  const table = store.updateTable(id, name.trim());
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  return NextResponse.json(table);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const success = store.deleteTable(id);
  if (!success) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
