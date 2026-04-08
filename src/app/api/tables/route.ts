import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function GET() {
  const tables = store.getTables();
  return NextResponse.json(tables);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }
  const table = store.createTable(name.trim());
  return NextResponse.json(table, { status: 201 });
}
