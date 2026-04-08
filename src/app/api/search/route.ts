import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

// Wrap matched text with ** markers for highlighting
function highlightSnippet(text: string | null, query: string): string | null {
  if (!text || !query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + q.length + 30);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  const matched = text.slice(idx, idx + q.length);
  return `${prefix}${text.slice(start, idx)}**${matched}**${text.slice(idx + q.length, end)}${suffix}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const tableFilter = searchParams.get('tableId') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  if (!q) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const tables = store.getTables();
  const results: Array<{
    tableId: string;
    tableName: string;
    recordId: string;
    recordData: Record<string, string | null>;
    matchedColumns: string[];
    snippets: Record<string, string | null>;
  }> = [];
  let total = 0;

  for (const table of tables) {
    if (tableFilter && table.id !== tableFilter) continue;
    for (const record of table.records) {
      const matchedColumns: string[] = [];
      const snippets: Record<string, string | null> = {};
      let hasMatch = false;

      for (const col of table.columns) {
        const value = record[col.id];
        if (value && String(value).toLowerCase().includes(q)) {
          matchedColumns.push(col.name);
          snippets[col.name] = highlightSnippet(String(value), q);
          hasMatch = true;
        }
      }

      if (hasMatch) {
        total++;
        if (results.length < limit) {
          results.push({
            tableId: table.id,
            tableName: table.name,
            recordId: record.id,
            recordData: record,
            matchedColumns,
            snippets,
          });
        }
      }
    }
  }

  return NextResponse.json({ results, total });
}
