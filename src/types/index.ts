export interface Column {
  id: string;
  name: string;
  required: boolean;
}

export interface TableRecord {
  id: string;
  [columnId: string]: string | null;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  records: TableRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  tables: Table[];
  theme: 'light' | 'dark';
}
