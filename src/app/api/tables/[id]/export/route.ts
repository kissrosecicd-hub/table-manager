import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'csv';
  const { id } = await params;

  const tables = store.getTables();
  const table = tables.find(t => t.id === id);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const columns = table.columns.filter(c => c.name !== 'id');
  const records = table.records;

  if (format === 'json') {
    const data = records.map(r => {
      const obj: Record<string, string | null> = {};
      columns.forEach(c => obj[c.name] = r[c.id] ?? null);
      return obj;
    });
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${table.name}.json"`,
      },
    });
  }

  // CSV
  const header = columns.map(c => c.name).join(',');
  const rows = records.map(r =>
    columns.map(c => {
      const val = r[c.id] ?? '';
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${table.name}.csv"`,
    },
  });
}
