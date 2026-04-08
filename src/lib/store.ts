import fs from 'fs';
import path from 'path';
import { Table, StoreData, Column, TableRecord } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Mutex for write operations — serializes all writes to prevent corruption
let writeMutex: Promise<void> = Promise.resolve();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): StoreData {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) {
    const initial: StoreData = { tables: [], theme: 'light' };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  let retries = 3;
  while (retries > 0) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      if (!raw.trim()) { retries--; continue; }
      const data = JSON.parse(raw) as StoreData;
      if (!data.theme) data.theme = 'light';
      return data;
    } catch {
      retries--;
      if (retries === 0) throw new Error('Failed to read store');
    }
  }
  return { tables: [], theme: 'light' };
}

function writeStore(data: StoreData): void {
  ensureDataDir();
  const tmpFile = STORE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Table operations
export function getTables(): Table[] {
  return readStore().tables;
}

export function getTable(id: string): Table | null {
  const { tables } = readStore();
  return tables.find(t => t.id === id) || null;
}

export function createTable(name: string): Table {
  const store = readStore();
  const now = new Date().toISOString();
  const idColId = generateId();
  const table: Table = {
    id: generateId(),
    name,
    columns: [
      { id: idColId, name: 'id', required: false },
    ],
    records: [],
    createdAt: now,
    updatedAt: now,
  };
  store.tables.push(table);
  writeStore(store);
  return table;
}

export function updateTable(id: string, name: string): Table | null {
  const store = readStore();
  const table = store.tables.find(t => t.id === id);
  if (!table) return null;
  table.name = name;
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return table;
}

export function deleteTable(id: string): boolean {
  const store = readStore();
  const idx = store.tables.findIndex(t => t.id === id);
  if (idx === -1) return false;
  store.tables.splice(idx, 1);
  writeStore(store);
  return true;
}

// Column operations
export function addColumn(tableId: string, column: Omit<Column, 'id'>): Column | null {
  const store = readStore();
  const table = store.tables.find(t => t.id === tableId);
  if (!table) return null;
  const newColumn: Column = { ...column, id: generateId() };
  table.columns.push(newColumn);
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return newColumn;
}

export function updateColumn(tableId: string, columnId: string, updates: Partial<Omit<Column, 'id'>>): Column | null {
  const store = readStore();
  const table = store.tables.find(t => t.id === tableId);
  if (!table) return null;
  const column = table.columns.find(c => c.id === columnId);
  if (!column) return null;
  Object.assign(column, updates);
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return column;
}

export function deleteColumn(tableId: string, columnId: string): boolean {
  const store = readStore();
  const table = store.tables.find(t => t.id === tableId);
  if (!table) return false;
  const idx = table.columns.findIndex(c => c.id === columnId);
  if (idx === -1) return false;
  table.columns.splice(idx, 1);
  // Remove column data from all records
  table.records.forEach(record => {
    delete record[columnId];
  });
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return true;
}

// Record operations
export function addRecord(tableId: string, data: Record<string, string | null>): TableRecord | null {
  const store = readStore();
  const table = store.tables.find(t => t.id === tableId);
  if (!table) return null;

  const idColumn = table.columns.find(c => c.name === 'id');
  if (idColumn) {
    // Remove any client-provided value for the "id" column
    const { [idColumn.id]: _, ...rest } = data;
    const existingIds = table.records
      .map(r => r[idColumn.id])
      .filter((v): v is string => v !== null && v !== undefined && v !== '')
      .map(v => Number(v))
      .filter(v => !isNaN(v));
    const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    data = { [idColumn.id]: String(nextId), ...rest };
  } else {
    data = { ...data };
  }

  const record: TableRecord = { id: String(table.records.length + 1), ...data };
  table.records.push(record);
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return record;
}

export function updateRecord(tableId: string, recordId: string, data: Record<string, string | null>): TableRecord | null {
  const store = readStore();
  const table = store.tables.find(t => t.id === tableId);
  if (!table) return null;
  const record = table.records.find(r => r.id === recordId);
  if (!record) return null;
  Object.assign(record, data);
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return record;
}

export function deleteRecord(tableId: string, recordId: string): boolean {
  const store = readStore();
  const table = store.tables.find(t => t.id === tableId);
  if (!table) return false;
  const idx = table.records.findIndex(r => r.id === recordId);
  if (idx === -1) return false;
  table.records.splice(idx, 1);
  table.updatedAt = new Date().toISOString();
  writeStore(store);
  return true;
}

// Theme operations
export function getTheme(): 'light' | 'dark' {
  return readStore().theme;
}

export function setTheme(theme: 'light' | 'dark'): 'light' | 'dark' {
  const store = readStore();
  store.theme = theme;
  writeStore(store);
  return theme;
}
