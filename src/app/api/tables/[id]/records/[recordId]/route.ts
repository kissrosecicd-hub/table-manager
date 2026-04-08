import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  const { id, recordId } = await params;
  const body = await request.json();
  const record = store.updateRecord(id, recordId, body);
  if (!record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  const { id, recordId } = await params;
  const success = store.deleteRecord(id, recordId);
  if (!success) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
