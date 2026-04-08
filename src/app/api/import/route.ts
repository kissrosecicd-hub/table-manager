import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Simple CSV parse (handles quoted fields)
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (values[j] || '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tableId = searchParams.get('tableId');
  const mode = searchParams.get('mode') || 'new'; // 'new' or 'append'

  const body = await request.json();
  const { csv, json } = body;
  const text = csv || json;

  if (!text) {
    return NextResponse.json({ error: 'No data provided' }, { status: 400 });
  }

  try {
    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    if (csv) {
      const parsed = parseCSV(csv);
      headers = parsed.headers;
      rows = parsed.rows;
    } else if (json) {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      rows = Array.isArray(data) ? data : [data];
      headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows found' }, { status: 400 });
    }

    if (mode === 'new') {
      // Создаём новую таблицу
      const tableName = `Imported ${new Date().toLocaleString('ru')}`;
      const table = store.createTable(tableName);
      // Добавляем колонки
      const idCol = table.columns[0]; // id колонка уже есть
      for (const h of headers) {
        store.addColumn(table.id, { name: h, required: false });
      }
      // Перечитываем таблицу с новыми колонками
      const freshTable = store.getTable(table.id)!;
      const nonIdCols = freshTable.columns.filter(c => c.id !== idCol.id);
      // Добавляем записи
      for (const row of rows) {
        const recordData: Record<string, string | null> = {};
        for (const col of nonIdCols) {
          recordData[col.id] = row[col.name] ?? null;
        }
        store.addRecord(table.id, recordData);
      }
      return NextResponse.json({ tableId: table.id, imported: rows.length, tableName });
    } else {
      // Добавляем в существующую таблицу
      const table = store.getTable(tableId!);
      if (!table) {
        return NextResponse.json({ error: 'Table not found' }, { status: 404 });
      }

      // Маппим заголовки CSV на колонки таблицы по имени
      const colMap = new Map<string, string>(); // csvHeader -> colId
      for (const h of headers) {
        const col = table.columns.find(c => c.name.toLowerCase() === h.toLowerCase());
        if (col) {
          colMap.set(h, col.id);
        }
      }

      let imported = 0;
      for (const row of rows) {
        const recordData: Record<string, string | null> = {};
        for (const [header, colId] of colMap) {
          recordData[colId] = row[header] ?? null;
        }
        // Заполняем отсутствующие колонки null
        for (const col of table.columns) {
          if (!(col.id in recordData)) {
            recordData[col.id] = null;
          }
        }
        store.addRecord(tableId!, recordData);
        imported++;
      }

      return NextResponse.json({ imported, matched: colMap.size, tableName: table.name });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 });
  }
}
