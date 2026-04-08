'use client';

import { useState, useMemo, useEffect, useCallback, useRef, Fragment, createElement, memo } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Column, TableRecord } from '@/types';
import { useToast } from './Toast';
import {
  Search, Columns, Eye, ArrowUpDown, Plus, RefreshCw,
  Pencil, Trash2, X, Check, Copy, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Table2, Filter, Undo2, Redo2, Download, Scroll, ChevronsUpDown
} from 'lucide-react';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

interface DataTableProps {
  tableName: string;
  columns: Column[];
  records: TableRecord[];
  tableId: string;
  totalPages: number;
  onRefresh: () => void;
  onTablesRefresh: () => void;
  onRecordsChange?: (data: { columns: Column[]; records: TableRecord[] }) => void;
  fetching?: boolean;
  highlightRecordId?: string | null;
  prevTable?: { id: string; name: string } | null;
  nextTable?: { id: string; name: string } | null;
  onNavigate?: (tableId: string) => void;
  onApiReady?: (api: {
    handleCreateRecord: () => void;
    handleExport: (fmt: string) => void;
    toggleFilters: () => void;
    showDuplicates: () => void;
    undo: () => void;
    redo: () => void;
  }) => void;
}

export function DataTable({
  tableName, columns, records, tableId, totalPages, onRefresh, onTablesRefresh, onRecordsChange, fetching, highlightRecordId, prevTable, nextTable, onNavigate, onApiReady
}: DataTableProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newRecord, setNewRecord] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<Record<string, string | null>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(() => new Set(columns.map(c => c.id).slice(0, 10)));
  const [search, setSearch] = useState('');
  const [sortCols, setSortCols] = useState<Array<{ colId: string; asc: boolean }>>([]);
  const [showColPicker, setShowColPicker] = useState(false);
  const [editColId, setEditColId] = useState<string | null>(null);
  const [editColName, setEditColName] = useState('');
  const [showNewCol, setShowNewCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [pageInput, setPageInput] = useState('');
  const [confirmColDelete, setConfirmColDelete] = useState<string | null>(null);
  const [inlineEditCell, setInlineEditCell] = useState<{ recordId: string; colId: string; value: string } | null>(null);
  const [editRecordModal, setEditRecordModal] = useState<string | null>(null);
  const [editRecordData, setEditRecordData] = useState<Record<string, string | null>>({});
  const [copyRecordId, setCopyRecordId] = useState<string | null>(null);
  const [copyCount, setCopyCount] = useState('1');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number; recordId: string } | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{ records: TableRecord[]; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [showFilterPresets, setShowFilterPresets] = useState(false);
  const [filterPresets, setFilterPresets] = useState<Array<{ name: string; filters: Record<string, string> }>>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const shiftKeyRef = useRef(false);
  const rowHeight = 44;
  const [showExport, setShowExport] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState<Array<{ value: string; count: number; records: Array<{ id: string; data: TableRecord }> }>>([]);
  const [duplicatesCol, setDuplicatesCol] = useState<string | null>(null);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [useVirtual, setUseVirtual] = useState(() => {
    try {
      const saved = localStorage.getItem('tm-scrollMode');
      return saved === 'virtual';
    } catch { return false; }
  });
  const toast = useToast();

  // Modal widths — viewport-constrained (portaled to body)
  const modalWidth = {
    small: 'min(20rem, 90vw)',     // колонка, копирование, удаление (~320px)
    medium: 'min(32rem, 90vw)',    // создание/редактирование записи (~512px)
    large: 'min(42rem, 95vw)',     // редактирование записи с полями (~672px)
    xlarge: 'min(48rem, 95vw)',    // дубликаты (~768px)
    export: 'min(18rem, 85vw)',    // экспорт (~288px)
    dropdown: 'min(16rem, 85vw)',  // column picker (~256px)
    preset: 'min(20rem, 85vw)',    // filter presets (~320px)
  };
  const modalMaxHeight = 'min(80vh, 600px)';
  const dropdownMaxHeight = 'min(18rem, 60vh)';
  const presetMaxHeight = 'min(20rem, 60vh)';

  useEffect(() => {
    try {
      localStorage.setItem('tm-scrollMode', useVirtual ? 'virtual' : 'pages');
    } catch {}
  }, [useVirtual]);

  // Create portal container
  useEffect(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    setPortalContainer(container);
    loadFilterPresets();
    return () => { container.remove(); };
  }, [tableId]);

  // Block body scroll when any modal is open
  const isModalOpen = showCreate || editRecordModal || editColId || confirmColDelete || copyRecordId || confirmBatchDelete || showColPicker;
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isModalOpen]);

  // Track Shift key state
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftKeyRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftKeyRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Sync visible columns when columns change (new table, added columns, table switch)
  useEffect(() => {
    if (columns.length > 0) {
      setVisibleColumnIds(prev => {
        // Only update if there are new columns not in the current set
        const allIds = columns.map(c => c.id);
        const hasNew = allIds.some(id => !prev.has(id));
        if (hasNew) {
          return new Set(allIds);
        }
        return prev;
      });
    }
  }, [columns]);

  const visibleCols = useMemo(
    () => columns.filter(c => visibleColumnIds.has(c.id)),
    [columns, visibleColumnIds]
  );

  const filteredRecords = useMemo(() => {
    let result = records;
    // Global search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(rec =>
        columns.some(c => String(rec[c.id] ?? '').toLowerCase().includes(s))
      );
    }
    // Column filters
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v);
    if (activeFilters.length > 0) {
      result = result.filter(rec =>
        activeFilters.every(([colId, val]) =>
          String(rec[colId] ?? '').toLowerCase().includes(val.toLowerCase())
        )
      );
    }
    return result;
  }, [records, columns, search, columnFilters]);

  const sortedRecords = useMemo(() => {
    if (sortCols.length === 0) return filteredRecords;
    return [...filteredRecords].sort((a, b) => {
      for (const { colId, asc } of sortCols) {
        const av = a[colId] ?? '';
        const bv = b[colId] ?? '';
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        if (cmp !== 0) return asc ? cmp : -cmp;
      }
      return 0;
    });
  }, [filteredRecords, sortCols]);

  const paginatedRecords = useMemo(
    () => sortedRecords.slice(page * pageSize, (page + 1) * pageSize),
    [sortedRecords, page, pageSize]
  );
  const totalFiltered = filteredRecords.length;
  const totalPagesActual = Math.ceil(totalFiltered / pageSize);
  const currentPage = page;

  // Virtualizer — для больших наборов (>100 записей)
  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? sortedRecords.length : 0,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 2,
    enabled: useVirtual,
  });

  // Для малых наборов рендерим все строки без виртуализатора
  const shouldUseVirtual = useVirtual && sortedRecords.length > 100;

  const initRecord = (): Record<string, string | null> => {
    const r: Record<string, string | null> = {};
    columns.filter(col => col.name !== 'id').forEach(col => { r[col.id] = ''; });
    return r;
  };

  const handleCreate = async () => {
    // Оптимистичное обновление: генерируем ID и сразу показываем
    const idColumn = columns.find(c => c.name === 'id');
    const newId = idColumn
      ? String(records.reduce((max, r) => {
          const v = r[idColumn.id];
          const n = v ? Number(v) : 0;
          return n > max ? n : max;
        }, 0) + 1)
      : String(records.length + 1);

    const newRec: TableRecord = { id: newId, ...newRecord };
    const prevRecords = [...records];
    onRecordsChange?.({ columns, records: [...records, newRec] });
    setNewRecord(initRecord());
    setShowCreate(false);

    try {
      const res = await fetch(`/api/tables/${tableId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Откат при ошибке
      onRecordsChange?.({ columns, records: prevRecords });
      toast('Ошибка при создании записи', 'error');
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    const a = document.createElement('a');
    a.href = `/api/tables/${tableId}/export?format=${format}`;
    a.download = `${tableName}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const findDuplicates = async (colId: string) => {
    setDuplicatesLoading(true);
    setDuplicatesCol(colId);
    try {
      const res = await fetch(`/api/tables/${tableId}/duplicates?column=${colId}`);
      const data = await res.json();
      setDuplicates(data.duplicates || []);
    } catch {
      toast('Ошибка поиска дубликатов', 'error');
    }
    setDuplicatesLoading(false);
  };

  // Filter presets
  const loadFilterPresets = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(`tm-filters-${tableId}`) || '[]');
      setFilterPresets(saved);
    } catch {}
  };

  const saveFilterPreset = (name: string) => {
    const nonEmpty = Object.fromEntries(Object.entries(columnFilters).filter(([, v]) => v));
    if (Object.keys(nonEmpty).length === 0) return;
    const updated = [...filterPresets, { name, filters: nonEmpty }];
    setFilterPresets(updated);
    localStorage.setItem(`tm-filters-${tableId}`, JSON.stringify(updated));
  };

  const applyFilterPreset = (filters: Record<string, string>) => {
    setColumnFilters(filters);
    setShowFilterPresets(false);
    setPage(0);
  };

  const deleteFilterPreset = (index: number) => {
    const updated = filterPresets.filter((_, i) => i !== index);
    setFilterPresets(updated);
    localStorage.setItem(`tm-filters-${tableId}`, JSON.stringify(updated));
  };

  const handleCopyRecord = async (recordId: string) => {
    const count = parseInt(copyCount, 10);
    if (isNaN(count) || count < 1) return;
    const source = records.find(r => r.id === recordId);
    if (!source) return;
    const idColumn = columns.find(c => c.name === 'id');
    if (idColumn) delete (source as Record<string, unknown>)[idColumn.id];

    const { id, ...data } = source;
    const prevRecords = [...records];
    const newRecords: TableRecord[] = [];
    let baseId = prevRecords.reduce((max, r) => {
      const v = idColumn ? r[idColumn.id] : undefined;
      const n = v ? Number(v) : 0;
      return n > max ? n : max;
    }, 0);

    for (let i = 0; i < count; i++) {
      const newId = String(++baseId);
      const rec: TableRecord = { id: newId, ...(data as Record<string, string | null>) };
      newRecords.push(rec);
    }

    onRecordsChange?.({ columns, records: [...prevRecords, ...newRecords] });
    setCopyRecordId(null);
    setCopyCount('1');

    try {
      for (let i = 0; i < count; i++) {
        const { id: _id, ...d } = newRecords[i];
        const res = await fetch(`/api/tables/${tableId}/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        if (!res.ok) throw new Error();
      }
    } catch {
      onRecordsChange?.({ columns, records: prevRecords });
      toast('Ошибка при копировании', 'error');
    }
  };

  const handleBatchDelete = async () => {
    handleBatchDeleteWithUndo();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectRow = (id: string) => {
    if (shiftKeyRef.current) {
      const ids = useVirtual ? filteredRecords.map(r => r.id) : paginatedRecords.map(r => r.id);
      const allIds = Array.from(selectedIds);
      const lastSelected = allIds.length > 0 ? allIds[allIds.length - 1] : null;
      const from = lastSelected ? ids.indexOf(lastSelected) : 0;
      const to = ids.indexOf(id);
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(ids[i]);
        return next;
      });
    } else {
      toggleSelect(id);
    }
  };

  const copyCellToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast('Скопировано в буфер');
  };

  const selectableRecords = useVirtual ? filteredRecords : paginatedRecords;

  const toggleSelectAllOrNone = () => {
    if (selectedIds.size >= selectableRecords.length && selectableRecords.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRecords.map(r => r.id)));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableRecords.length && selectableRecords.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRecords.map(r => r.id)));
    }
  };

  const handleDeleteWithUndo = async (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;

    // Оптимистичное удаление
    const prevRecords = [...records];
    onRecordsChange?.({ columns, records: records.filter(r => r.id !== recordId) });
    setConfirmDeleteId(null);

    try {
      const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      onRecordsChange?.({ columns, records: prevRecords });
      toast('Ошибка при удалении', 'error');
      return;
    }

    if (lastDeleted?.timer) clearTimeout(lastDeleted.timer);
    const timer = setTimeout(() => {
      setShowSnackbar(false);
      setLastDeleted(null);
    }, 5000);
    setLastDeleted({ records: [record], timer });
    setShowSnackbar(true);
  };

  const handleBatchDeleteWithUndo = async () => {
    const toDelete = records.filter(r => selectedIds.has(r.id));
    const prevRecords = [...records];
    const deleteIds = toDelete.map(r => r.id);

    // Оптимистичное удаление
    onRecordsChange?.({ columns, records: records.filter(r => !deleteIds.includes(r.id)) });
    setSelectedIds(new Set());
    setConfirmBatchDelete(false);

    try {
      for (const r of toDelete) {
        const res = await fetch(`/api/tables/${tableId}/records/${r.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
      }
    } catch {
      onRecordsChange?.({ columns, records: prevRecords });
      toast('Ошибка при удалении записей', 'error');
      return;
    }

    if (lastDeleted?.timer) clearTimeout(lastDeleted.timer);
    const timer = setTimeout(() => {
      setShowSnackbar(false);
      setLastDeleted(null);
    }, 5000);
    setLastDeleted({ records: toDelete, timer });
    setShowSnackbar(true);
  };

  const handleUndoDelete = async () => {
    if (!lastDeleted) return;
    if (lastDeleted.timer) clearTimeout(lastDeleted.timer);

    // Оптимистичное восстановление
    const restoredRecords = lastDeleted.records.filter(r => !records.find(existing => existing.id === r.id));
    onRecordsChange?.({ columns, records: [...records, ...restoredRecords] });
    setLastDeleted(null);
    setShowSnackbar(false);

    try {
      for (const record of restoredRecords) {
        const res = await fetch(`/api/tables/${tableId}/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (!res.ok) throw new Error();
      }
    } catch {
      // При ошибке — откат обратно
      onRecordsChange?.({ columns, records: records.filter(r => !restoredRecords.find(nr => nr.id === r.id)) });
      toast('Ошибка при восстановлении', 'error');
    }
  };

  // Copy selected records — create duplicates with new IDs
  const handleCopySelected = async () => {
    const toCopy = records.filter(r => selectedIds.has(r.id));
    if (toCopy.length === 0) return;

    const idColumn = columns.find(c => c.name === 'id');
    const prevRecords = [...records];
    const newRecords: TableRecord[] = [];
    let baseId = prevRecords.reduce((max, r) => {
      const v = idColumn ? r[idColumn.id] : undefined;
      const n = v ? Number(v) : 0;
      return n > max ? n : max;
    }, 0);

    for (const record of toCopy) {
      const newId = String(++baseId);
      const { id: _id, ...data } = record as Record<string, unknown>;
      // Remove the old id column value so we can set the new one
      if (idColumn) {
        delete (data as Record<string, unknown>)[idColumn.id];
      }
      const newRec: TableRecord = { id: newId, ...(data as Record<string, string | null>) };
      if (idColumn) {
        (newRec as Record<string, unknown>)[idColumn.id] = newId;
      }
      newRecords.push(newRec);
    }

    // Optimistic update
    onRecordsChange?.({ columns, records: [...prevRecords, ...newRecords] });
    setSelectedIds(new Set());
    toast(`Скопировано ${newRecords.length} ${newRecords.length === 1 ? 'запись' : newRecords.length < 5 ? 'записи' : 'записей'}`);

    try {
      // Send all records in one bulk request to avoid race conditions
      const recordsData = newRecords.map(({ id: _id, ...d }) => d);
      const res = await fetch(`/api/tables/${tableId}/records/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: recordsData }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Bulk copy failed');
      }
    } catch (e: any) {
      onRecordsChange?.({ columns, records: prevRecords });
      toast('Ошибка при копировании', 'error');
    }
  };

  // Export API for Command Palette — stable ref to avoid infinite re-render
  const apiRef = useRef<ReturnType<typeof buildApi> | null>(null);

  const buildApi = () => ({
    handleCreateRecord: () => { setShowCreate(true); setNewRecord(initRecord()); },
    handleExport: (fmt: string) => handleExport(fmt as 'csv' | 'json'),
    toggleFilters: () => setShowFilters(p => !p),
    showDuplicates: () => setShowDuplicates(true),
    undo: handleUndoDelete,
    redo: () => {},
  });

  if (!apiRef.current) {
    apiRef.current = buildApi();
  }
  // Обновляем undo при каждом рендере (без setState)
  apiRef.current.undo = handleUndoDelete;

  useEffect(() => {
    if (onApiReady) {
      onApiReady(apiRef.current!);
    }
  }, [onApiReady]);

  // Close context menu on click
  useEffect(() => {
    const clickHandler = () => setRowContextMenu(null);
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  }, []);

  // Escape → close modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editRecordModal) { setEditRecordModal(null); return; }
        if (rowContextMenu) { setRowContextMenu(null); return; }
        if (showColPicker) { setShowColPicker(false); return; }
        if (editColId) { setEditColId(null); setEditColName(''); return; }
        if (confirmColDelete) { setConfirmColDelete(null); return; }
        if (showCreate) { setShowCreate(false); return; }
        if (confirmBatchDelete) { setConfirmBatchDelete(false); return; }
        if (copyRecordId) { setCopyRecordId(null); setCopyCount('1'); return; }
        if (showNewCol) { setShowNewCol(false); setNewColName(''); return; }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showColPicker, editColId, confirmColDelete, showCreate, confirmBatchDelete, copyRecordId, showNewCol, rowContextMenu, editRecordModal]);

  const handleUpdate = async (recordId: string) => {
    const prevRecords = [...records];
    // Оптимистичное обновление
    onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, ...editRecord } : r) });
    setEditingId(null);
    setEditRecord({});

    try {
      const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRecord),
      });
      if (!res.ok) throw new Error();
    } catch {
      onRecordsChange?.({ columns, records: prevRecords });
      toast('Ошибка при обновлении', 'error');
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    handleDeleteWithUndo(recordId);
  };

  const handleColUpdate = async (colId: string) => {
    if (!editColName.trim()) return;
    const newName = editColName.trim();
    const prevColumns = [...columns];

    // Оптимистичное обновление
    onRecordsChange?.({ columns: columns.map(c => c.id === colId ? { ...c, name: newName } : c), records });

    try {
      const res = await fetch(`/api/tables/${tableId}/columns/${colId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error();
      onTablesRefresh();
    } catch {
      onRecordsChange?.({ columns: prevColumns, records });
      toast('Ошибка при переименовании колонки', 'error');
    }
    setEditColId(null);
    setEditColName('');
  };

  const handleColDelete = async (colId: string) => {
    const prevColumns = [...columns];
    const col = columns.find(c => c.id === colId);
    if (!col) return;

    // Оптимистичное удаление
    onRecordsChange?.({
      columns: columns.filter(c => c.id !== colId),
      records: records.map(r => {
        const { [colId]: _, ...rest } = r;
        return rest as TableRecord;
      }),
    });

    try {
      const res = await fetch(`/api/tables/${tableId}/columns/${colId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onTablesRefresh();
    } catch {
      onRecordsChange?.({ columns: prevColumns, records });
      toast('Ошибка при удалении колонки', 'error');
    }
    setConfirmColDelete(null);
    setEditColId(null);
    setEditColName('');
  };

  const handleAddCol = async () => {
    if (!newColName.trim()) return;
    const name = newColName.trim();
    const prevColumns = [...columns];
    const newCol: Column = { id: `col-${Date.now()}`, name, required: false };

    // Оптимистичное добавление
    onRecordsChange?.({ columns: [...columns, newCol], records: records.map(r => ({ ...r, [newCol.id]: null })) });

    try {
      const res = await fetch(`/api/tables/${tableId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      onTablesRefresh();
    } catch {
      onRecordsChange?.({ columns: prevColumns, records });
      toast('Ошибка при создании колонки', 'error');
    }
    setNewColName('');
    setShowNewCol(false);
  };

  const toggleColumn = (colId: string) => {
    setVisibleColumnIds(prev => {
      const next = new Set(prev);
      if (next.has(colId)) { if (next.size > 1) next.delete(colId); }
      else next.add(colId);
      return next;
    });
  };

  const renderCell = useCallback((col: Column, value: string | null, isEdit: boolean, onChange: (val: string | null) => void) => {
    if (!isEdit) {
      const str = String(value ?? '');
      if (!str) return <span style={{ color: 'var(--color-text-quaternary)' }}>—</span>;
      if (str.length > 50) return str.substring(0, 50) + '…';
      return str;
    }
    const inputStyle: React.CSSProperties = {
      background: 'var(--color-bg-surface)',
      border: '2px solid var(--color-border)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 16,
      fontWeight: 500,
      color: 'var(--color-text-primary)',
      width: '100%',
      outline: 'none',
    };
    return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} style={inputStyle} />;
  }, []);

  const toolbarBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--color-bg-surface-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 8, padding: '6px 12px', fontSize: 13,
    color: 'var(--color-text-secondary)', cursor: 'pointer',
  };
  const toolbarBtnHoverStyle: React.CSSProperties = {
    ...toolbarBtnStyle,
    background: 'var(--color-border)',
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="p-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
        {/* Table navigation */}
        {(prevTable || nextTable) && onNavigate && (
          <div className="flex items-center gap-1 mr-2" style={{ color: 'var(--color-text-tertiary)' }}>
            <button
              onClick={() => prevTable && onNavigate(prevTable.id)}
              disabled={!prevTable}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'transparent' }}
              onMouseEnter={e => { if (prevTable) e.currentTarget.style.background = 'var(--color-border)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title={prevTable ? `← ${prevTable.name}` : 'Нет предыдущей'}
              aria-label={`Предыдущая таблица: ${prevTable?.name || 'нет'}`}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium px-2 py-1 rounded-md" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
              {tableName}
            </span>
            <button
              onClick={() => nextTable && onNavigate(nextTable.id)}
              disabled={!nextTable}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'transparent' }}
              onMouseEnter={e => { if (nextTable) e.currentTarget.style.background = 'var(--color-border)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title={nextTable ? `${nextTable.name} →` : 'Нет следующей'}
              aria-label={`Следующая таблица: ${nextTable?.name || 'нет'}`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mr-2">
          <Table2 size={16} style={{ color: 'var(--color-text-quaternary)' }} />
          <span className="text-base" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-quaternary)' }}>
            {totalFiltered} записей
          </span>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2" style={{ color: 'var(--color-text-quaternary)' }} />
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Поиск..."
            className="pl-8 pr-3 py-1.5 text-base rounded-lg outline-none"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', width: 220 }}
          />
        </div>

        <div className="relative">
          <button onClick={() => setShowColPicker(!showColPicker)} style={toolbarBtnStyle}
            onMouseEnter={e => Object.assign(e.currentTarget.style, toolbarBtnHoverStyle)}
            onMouseLeave={e => Object.assign(e.currentTarget.style, toolbarBtnStyle)}
          >
            <Eye size={14} /> Колонки
          </button>
          {showColPicker && (
            <div className="absolute top-full left-0 mt-1 rounded-xl border p-3 z-40 overflow-y-auto"
              style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-solid)', borderWidth: 2, boxShadow: '0 8px 24px var(--color-overlay)', width: modalWidth.dropdown, maxHeight: dropdownMaxHeight }}
            >
              <p className="text-base mb-2 font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Видимые колонки:</p>
              {columns.map(col => (
                <label key={col.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5" style={{ color: 'var(--color-text-secondary)' }}>
                  <input type="checkbox" checked={visibleColumnIds.has(col.id)} onChange={() => toggleColumn(col.id)} className="accent-[var(--color-brand)] w-3.5 h-3.5 rounded" />
                  <span className="text-base flex-1">{col.name}</span>
                  {col.name !== 'id' && (
                    <button onClick={e => { e.preventDefault(); e.stopPropagation(); setEditColId(col.id); setEditColName(col.name); }} className="p-0.5 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><Pencil size={12} /></button>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {sortCols.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {sortCols.map((s, i) => (
              <button key={s.colId} onClick={() => setSortCols(prev => prev.filter(x => x.colId !== s.colId))}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg"
                style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-brand)', border: '1px solid var(--color-border)' }}
              >
                <ArrowUpDown size={12} />
                {columns.find(c => c.id === s.colId)?.name} {s.asc ? '↑' : '↓'}{sortCols.length > 1 ? ` (${i + 1})` : ''}
              </button>
            ))}
            <button onClick={() => setSortCols([])} className="p-1" style={{ color: 'var(--color-text-quaternary)' }}><X size={12} /></button>
          </div>
        )}

        {selectedIds.size > 0 && (
          <button onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg"
            style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            Снять все ({selectedIds.size})
          </button>
        )}

        {selectedIds.size > 0 && selectedIds.size < selectableRecords.length && (
          <button onClick={() => setSelectedIds(new Set(selectableRecords.map(r => r.id)))}
            className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg"
            style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            Выбрать все ({selectableRecords.length})
          </button>
        )}

        {selectedIds.size > 0 && (
          <button onClick={() => setConfirmBatchDelete(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg-danger"
            style={{ background: 'var(--color-danger)', color: '#fff' }}
          >
            <Trash2 size={14} /> Удалить ({selectedIds.size})
          </button>
        )}

        {selectedIds.size > 0 && (
          <button onClick={handleCopySelected}
            className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg"
            style={{ background: 'var(--color-brand)', color: '#fff' }}
          >
            <Copy size={14} /> Скопировать ({selectedIds.size})
          </button>
        )}

        {/* Column filter toggle */}
        <button onClick={() => { setShowFilters(!showFilters); }}
          className="flex items-center gap-1.5 px-3 py-2 text-base rounded-lg"
          style={{ background: showFilters ? 'var(--color-brand)' : 'var(--color-bg-surface-hover)', color: showFilters ? '#fff' : 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          title="Фильтр по колонкам"
        >
          <Filter size={14} /> Фильтр
        </button>

        {/* Virtual / Pagination toggle */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-bg-surface-hover)', border: '1px solid var(--color-border)' }}>
          <Scroll size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <button
            onClick={() => { setUseVirtual(true); setPage(0); }}
            className="px-3 py-1 text-sm rounded-md font-medium transition-colors"
            style={{
              background: useVirtual ? 'var(--color-brand)' : 'transparent',
              color: useVirtual ? '#fff' : 'var(--color-text-tertiary)',
            }}
            title="Виртуальный скролл — рендер только видимых строк"
          >
            Виртуальный
          </button>
          <button
            onClick={() => { setUseVirtual(false); setPage(0); }}
            className="px-3 py-1 text-sm rounded-md font-medium transition-colors"
            style={{
              background: !useVirtual ? 'var(--color-brand)' : 'transparent',
              color: !useVirtual ? '#fff' : 'var(--color-text-tertiary)',
            }}
            title="Пагинация — разбиение на страницы"
          >
            Страницы
          </button>
        </div>

        <div className="flex-1" />

        {showNewCol ? (
          <div className="flex items-center gap-2">
            <input type="text" value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="Название колонки"
              className="px-3 py-1.5 text-base rounded-lg outline-none"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', width: 140 }} autoFocus />
            <button onClick={handleAddCol} className="p-1.5 rounded-lg transition-opacity hover:opacity-80" style={{ background: 'var(--color-brand)', color: '#fff' }}><Check size={14} /></button>
            <button onClick={() => { setShowNewCol(false); setNewColName(''); }} className="p-1.5 transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setShowNewCol(true)} style={toolbarBtnStyle}
            onMouseEnter={e => Object.assign(e.currentTarget.style, toolbarBtnHoverStyle)}
            onMouseLeave={e => Object.assign(e.currentTarget.style, toolbarBtnStyle)}
          ><Columns size={14} /> Колонка</button>
        )}

        <button onClick={() => { setShowCreate(true); setNewRecord(initRecord()); }}
          className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg transition-opacity hover:opacity-80"
          style={{ background: 'var(--color-brand)', color: '#fff' }}
        >
          <Plus size={14} /> Запись
        </button>

        <div className="relative">
          <button onClick={() => setShowExport(!showExport)} className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-tertiary)' }}>
            <Download size={14} /> Экспорт
          </button>
          {showExport && portalContainer && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => setShowExport(false)}>
              <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: modalWidth.export }} onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>Экспорт: {tableName}</h3>
                <button onClick={() => { handleExport('csv'); setShowExport(false); }}
                  className="w-full text-left px-4 py-2.5 rounded-lg mb-2 transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                  style={{ color: 'var(--color-text-primary)' }}>
                  📄 CSV ({records.length} строк)
                </button>
                <button onClick={() => { handleExport('json'); setShowExport(false); }}
                  className="w-full text-left px-4 py-2.5 rounded-lg transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                  style={{ color: 'var(--color-text-primary)' }}>
                  📋 JSON ({records.length} строк)
                </button>
              </div>
            </div>,
            portalContainer
          )}
        </div>

        <button onClick={() => setShowDuplicates(true)} className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-tertiary)' }}>
          <Copy size={14} /> Дубликаты
        </button>

        <button onClick={onRefresh} className="p-2 rounded-lg transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} title="Обновить">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Column filters row */}
      {showFilters && visibleCols.length > 0 && (
        <div className="p-3 border-b flex flex-wrap gap-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface-hover)' }}>
          {visibleCols.map(col => (
            <input
              key={col.id}
              ref={el => { filterInputRefs.current[col.id] = el; }}
              type="text"
              value={columnFilters[col.id] || ''}
              onChange={e => { setColumnFilters(prev => ({ ...prev, [col.id]: e.target.value })); setPage(0); }}
              placeholder={`Фильтр: ${col.name}`}
              className="px-3 py-1.5 text-sm rounded-lg outline-none"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', width: 140 }}
            />
          ))}
          {Object.values(columnFilters).some(v => v) && (
            <button onClick={() => { setColumnFilters({}); setPage(0); }}
              className="px-3 py-1.5 text-sm rounded-lg"
              style={{ background: 'var(--color-danger)', color: '#fff' }}
            >
              <X size={12} className="inline mr-1" /> Сбросить
            </button>
          )}
          {Object.values(columnFilters).some(v => v) && (
            <div className="relative">
              <button onClick={() => setShowFilterPresets(!showFilterPresets)}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                style={{ background: 'var(--color-brand)', color: '#fff' }}
              >
                💾 Сохранить
              </button>
              {showFilterPresets && portalContainer && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowFilterPresets(false)}>
                  <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: modalWidth.preset, maxHeight: presetMaxHeight }} onClick={e => e.stopPropagation()}>
                    <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Пресеты фильтров</h3>
                    <input
                      type="text"
                      placeholder="Название..."
                      className="w-full px-3 py-1.5 text-sm rounded-lg outline-none mb-2"
                      style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const name = (e.target as HTMLInputElement).value.trim();
                          if (name) { saveFilterPreset(name); (e.target as HTMLInputElement).value = ''; }
                        }
                      }}
                    />
                    {filterPresets.length > 0 ? (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {filterPresets.map((preset, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <button onClick={() => applyFilterPreset(preset.filters)}
                              className="flex-1 text-left px-2 py-1.5 text-sm rounded hover:bg-[var(--color-bg-surface-hover)]"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {preset.name} ({Object.keys(preset.filters).length})
                            </button>
                            <button onClick={() => deleteFilterPreset(i)}
                              className="p-1 rounded hover:bg-[var(--color-bg-surface-hover)]"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-quaternary)' }}>Нет сохранённых пресетов</p>
                    )}
                  </div>
                </div>,
                portalContainer
              )}
            </div>
          )}
        </div>
      )}

      {/* Create record modal — portal to body */}
      {showCreate && portalContainer && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="create-record-title" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => { setShowCreate(false); setNewRecord({}); }}>
          <div className="rounded-xl overflow-y-auto" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', maxWidth: modalWidth.medium, width: '100%', maxHeight: modalMaxHeight }} onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h3 id="create-record-title" className="text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>Новая запись</h3>
              <button onClick={() => { setShowCreate(false); setNewRecord({}); }} className="p-1 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {columns.filter(col => col.name !== 'id').map(col => (
                <div key={col.id}>
                  <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    {col.name}{col.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                  </label>
                  {renderCell(col, newRecord[col.id] ?? null, true, val => setNewRecord({ ...newRecord, [col.id]: val }))}
                </div>
              ))}
            </div>
            <div className="p-4 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button onClick={() => { setShowCreate(false); setNewRecord({}); }}
                className="px-4 py-2 text-base rounded-lg"
                style={{ color: 'var(--color-text-tertiary)' }}
              >Отмена</button>
              <button onClick={handleCreate}
                className="px-4 py-2 text-base rounded-lg"
                style={{ background: 'var(--color-brand)', color: '#fff' }}
              >Создать</button>
            </div>
          </div>
        </div>,
        portalContainer
      )}

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="table-scroll overflow-auto"
        style={{
          maxHeight: useVirtual ? '600px' : 'calc(100vh - 320px)',
          overflowX: 'auto',
        }}
      >
        <table className="w-full text-base" style={{ minWidth: 1400, borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10">
            <tr style={{ background: 'var(--color-bg-surface)', borderBottom: '2px solid var(--color-border-solid)' }}>
              <th className="w-16 py-3 px-4 text-center" style={{ color: 'var(--color-text-quaternary)', boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -2px 0 var(--color-border-solid)', background: 'var(--color-bg-surface)' }}>
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectableRecords.length > 0 && selectedIds.size === selectableRecords.length}
                    onChange={toggleSelectAll}
                    className="accent-[var(--color-brand)] w-4 h-4"
                  />
                  <span className="text-base font-medium" style={{ color: 'var(--color-text-tertiary)' }}>#</span>
                </div>
              </th>
              {visibleCols.map(col => (
                <th key={col.id}
                  className="py-3 px-4 text-left cursor-pointer select-none whitespace-nowrap font-medium"
                  style={{ color: 'var(--color-text-tertiary)', letterSpacing: '-0.13px', fontSize: 16, boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -2px 0 var(--color-border-solid)', background: 'var(--color-bg-surface)' }}
                  onClick={e => {
                    const isMulti = e.shiftKey;
                    if (isMulti) {
                      setSortCols(prev => {
                        const existing = prev.find(s => s.colId === col.id);
                        if (existing) {
                          if (existing.asc) return prev.map(s => s.colId === col.id ? { ...s, asc: false } : s);
                          return prev.filter(s => s.colId !== col.id);
                        }
                        return [...prev, { colId: col.id, asc: true }];
                      });
                    } else {
                      setSortCols(prev => {
                        const existing = prev.find(s => s.colId === col.id);
                        if (existing) {
                          if (existing.asc) return [{ colId: col.id, asc: false }];
                          return [];
                        }
                        return [{ colId: col.id, asc: true }];
                      });
                    }
                    setPage(0);
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {col.name}
                    {sortCols.map((s, i) => s.colId === col.id && (
                      <span key={col.id} style={{ color: 'var(--color-brand)', fontSize: 14 }}>
                        {s.asc ? '↑' : '↓'}{sortCols.length > 1 ? i + 1 : ''}
                      </span>
                    ))}
                    {col.name !== 'id' && (
                      <button onClick={e => { e.stopPropagation(); setEditColId(col.id); setEditColName(col.name); }}
                        className="ml-1 opacity-30" style={{ color: 'var(--color-text-tertiary)' }}><Pencil size={14} /></button>
                    )}
                  </div>
                </th>
              ))}
              <th className="sticky right-0 z-20 w-32 py-3 px-4 text-left"
                style={{ color: 'var(--color-text-quaternary)', fontSize: 16, background: 'var(--color-bg-surface)', borderLeft: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border-solid)' }}>Действия</th>
            </tr>
          </thead>
          {shouldUseVirtual ? (
            /* Virtual scroll body — proper <tr> elements with spacers */
            <tbody>
              {fetching ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`shimmer-${i}`} className="border-b" style={{ borderColor: 'var(--color-border-solid)' }}>
                    <td className="py-2.5 px-4" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="w-4 h-4 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" /></td>
                    {visibleCols.map(col => (
                      <td key={col.id} className="py-2.5 px-4" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                        <div className="h-5 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                    <td className="sticky right-0 z-20 py-2.5 px-4" style={{ background: 'inherit', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                      <div className="flex gap-0.5">
                        <div className="w-6 h-6 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" />
                        <div className="w-6 h-6 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" />
                        <div className="w-6 h-6 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : sortedRecords.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 2} className="py-16 text-center" style={{ color: 'var(--color-text-quaternary)' }}>Нет записей</td></tr>
              ) : (
                <>
                  {/* Top spacer */}
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }}><td style={{ padding: 0 }} colSpan={visibleCols.length + 2} /></tr>
                  )}
                  {/* Virtual rows as proper <tr> elements */}
                  {rowVirtualizer.getVirtualItems().map(virtualRow => {
                    const record = sortedRecords[virtualRow.index];
                    if (!record) return null;
                    const globalIdx = virtualRow.index;
                    const isSelected = selectedIds.has(record.id);
                    const isHighlighted = highlightRecordId === record.id;
                    return (
                      <tr key={record.id}
                        className="border-b"
                        style={{
                          height: `${rowHeight}px`,
                          borderColor: 'var(--color-border-solid)',
                          background: isHighlighted
                            ? '#FEF08A'
                            : isSelected
                              ? 'var(--color-bg-surface-hover)'
                              : editingId === record.id
                                ? 'var(--color-bg-surface-hover)'
                                : 'var(--color-bg-surface)',
                        }}
                        onContextMenu={e => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button')) return;
                          e.preventDefault();
                          setRowContextMenu({ x: e.clientX, y: e.clientY, recordId: record.id });
                        }}
                      >
                        <td className="py-2.5 px-4 text-center" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <input type="checkbox" checked={isSelected} onChange={e => { e.stopPropagation(); handleSelectRow(record.id); }} className="accent-[var(--color-brand)] w-4 h-4" />
                            <span className="text-base font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{globalIdx + 1}</span>
                          </div>
                        </td>
                        {editingId === record.id ? (
                          <>
                            {visibleCols.map(col => (<td key={col.id} className="py-2 px-4" style={{ borderRight: '1px solid var(--color-border-solid)' }}>{renderCell(col, editRecord[col.id] ?? record[col.id] ?? '', true, val => setEditRecord({ ...editRecord, [col.id]: val }))}</td>))}
                            <td className="sticky right-0 z-20 py-2 px-4" style={{ background: 'inherit', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-1">
                              <button onClick={e => { e.stopPropagation(); handleUpdate(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-success)' }}><Check size={14} /></button>
                              <button onClick={e => { e.stopPropagation(); setEditingId(null); setEditRecord({}); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
                            </div></td>
                          </>
                        ) : confirmDeleteId === record.id ? (
                          <>
                            {visibleCols.map(col => (<td key={col.id} className="py-2 px-4" style={{ color: 'var(--color-danger)', opacity: 0.6, borderRight: '1px solid var(--color-border-solid)' }}>{String(record[col.id] ?? '—')}</td>))}
                            <td className="sticky right-0 z-20 py-2 px-4" style={{ background: 'inherit', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-1">
                              <button onClick={e => { e.stopPropagation(); handleDeleteRecord(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-danger)' }}><Check size={14} /></button>
                              <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
                            </div></td>
                          </>
                        ) : (
                          <>
                            {visibleCols.map(col => {
                              const cellKey = `${record.id}-${col.id}`;
                              const isEditing = inlineEditCell?.recordId === record.id && inlineEditCell?.colId === col.id;
                              const cellValue = String(record[col.id] ?? '');
                              return (
                                <td key={col.id}
                                  className="py-2.5 px-4 max-w-[250px] truncate relative"
                                  style={{ color: 'var(--color-text-secondary)', fontSize: 16, boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}
                                >
                                  {isEditing ? (
                                    <input type="text" autoFocus
                                      value={inlineEditCell.value}
                                      onChange={e => setInlineEditCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                      onBlur={async () => {
                                        if (inlineEditCell) {
                                          const { recordId, colId, value } = inlineEditCell;
                                          const prevRecords = [...records];
                                          onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, [colId]: value } : r) });
                                          setInlineEditCell(null);

                                          try {
                                            const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ [colId]: value }),
                                            });
                                            if (!res.ok) throw new Error();
                                          } catch {
                                            onRecordsChange?.({ columns, records: prevRecords });
                                          }
                                        }
                                      }}
                                      onKeyDown={async e => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (inlineEditCell) {
                                            const { recordId, colId, value } = inlineEditCell;
                                            const prevRecords = [...records];
                                            onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, [colId]: value } : r) });
                                            setInlineEditCell(null);

                                            try {
                                              const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ [colId]: value }),
                                              });
                                              if (!res.ok) throw new Error();
                                            } catch {
                                              onRecordsChange?.({ columns, records: prevRecords });
                                            }
                                          }
                                        }
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          setInlineEditCell(null);
                                        }
                                      }}
                                      className="w-full px-2 py-1.5 text-base rounded-lg outline-none"
                                      style={{ background: 'transparent', border: '2px solid var(--color-brand)', color: 'var(--color-text-primary)', boxShadow: '0 0 0 3px rgba(91,117,83,0.15)' }}
                                      onClick={e => e.stopPropagation()}
                                    />
                                  ) : (
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate">{renderCell(col, record[col.id] ?? null, false, () => {})}</span>
                                      <div className="flex gap-0.5 flex-shrink-0">
                                        <button onClick={e => { e.stopPropagation(); copyCellToClipboard(cellValue); }}
                                          className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
                                          title="Копировать"
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); setInlineEditCell({ recordId: record.id, colId: col.id, value: cellValue }); }}
                                          className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
                                          title="Редактировать"
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="sticky right-0 z-20 py-2.5 px-4" style={{ background: isSelected ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-0.5">
                              <button onClick={e => { e.stopPropagation(); setEditRecordModal(record.id); setEditRecordData({ ...record }); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}
                                title="Редактировать запись"
                              ><Pencil size={14} /></button>
                              <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(record, null, 2)); toast('Запись скопирована'); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}
                              ><Copy size={14} /></button>
                              <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}
                              ><Trash2 size={14} /></button>
                            </div></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {/* Bottom spacer */}
                  {(() => {
                    const items = rowVirtualizer.getVirtualItems();
                    if (items.length === 0) return null;
                    const lastItem = items[items.length - 1];
                    const totalSize = rowVirtualizer.getTotalSize();
                    const bottomSize = totalSize - (lastItem.start + rowHeight);
                    if (bottomSize > 0) {
                      return <tr style={{ height: `${bottomSize}px` }}><td style={{ padding: 0 }} colSpan={visibleCols.length + 2} /></tr>;
                    }
                    return null;
                  })()}
                </>
              )}
            </tbody>
          ) : useVirtual ? (
            /* Small dataset — all records, no pagination */
            <tbody>
              {sortedRecords.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 2} className="py-16 text-center" style={{ color: 'var(--color-text-quaternary)' }}>Нет записей</td></tr>
              ) : sortedRecords.map((record, idx) => {
                const isSelected = selectedIds.has(record.id);
                const isHighlighted = highlightRecordId === record.id;
                return (
                  <tr key={record.id}
                    className="border-b"
                    style={{
                      borderColor: 'var(--color-border-solid)',
                      background: isHighlighted ? '#FEF08A' : isSelected ? 'var(--color-bg-surface-hover)' : editingId === record.id ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)',
                    }}
                  >
                    <td className="py-2.5 px-4 text-center" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <input type="checkbox" checked={isSelected} onChange={e => { e.stopPropagation(); handleSelectRow(record.id); }} className="accent-[var(--color-brand)] w-4 h-4" />
                        <span className="text-base font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{idx + 1}</span>
                      </div>
                    </td>
                    {visibleCols.map(col => {
                      const isEditing = inlineEditCell?.recordId === record.id && inlineEditCell?.colId === col.id;
                      const cellValue = String(record[col.id] ?? '');
                      return (
                        <td key={col.id} className="py-2.5 px-4 max-w-[250px] truncate relative" style={{ color: 'var(--color-text-secondary)', fontSize: 16, boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                          {isEditing ? (
                            <input type="text" autoFocus value={inlineEditCell.value} onChange={e => setInlineEditCell(prev => prev ? { ...prev, value: e.target.value } : null)} onBlur={async () => { if (inlineEditCell) { const { recordId, colId, value } = inlineEditCell; const prevRecords = [...records]; onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, [colId]: value } : r) }); setInlineEditCell(null); try { const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [colId]: value }) }); if (!res.ok) throw new Error(); } catch { onRecordsChange?.({ columns, records: prevRecords }); } }}} onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); if (inlineEditCell) { const { recordId, colId, value } = inlineEditCell; const prevRecords = [...records]; onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, [colId]: value } : r) }); setInlineEditCell(null); try { const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [colId]: value }) }); if (!res.ok) throw new Error(); } catch { onRecordsChange?.({ columns, records: prevRecords }); } } } if (e.key === 'Escape') { e.preventDefault(); setInlineEditCell(null); } }} className="w-full px-2 py-1.5 text-base rounded-lg outline-none" style={{ background: 'transparent', border: '2px solid var(--color-brand)', color: 'var(--color-text-primary)', boxShadow: '0 0 0 3px rgba(91,117,83,0.15)' }} onClick={e => e.stopPropagation()} />
                          ) : (
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{renderCell(col, record[col.id] ?? null, false, () => {})}</span>
                              <div className="flex gap-0.5 flex-shrink-0">
                                <button onClick={e => { e.stopPropagation(); copyCellToClipboard(cellValue); }} className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }} title="Копировать"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                                <button onClick={e => { e.stopPropagation(); setInlineEditCell({ recordId: record.id, colId: col.id, value: cellValue }); }} className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }} title="Редактировать"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-20 py-2.5 px-4" style={{ background: isSelected ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-0.5">
                      <button onClick={e => { e.stopPropagation(); setEditRecordModal(record.id); setEditRecordData({ ...record }); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} title="Редактировать запись"><Pencil size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(record, null, 2)); toast('Запись скопирована'); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><Copy size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          ) : (
            /* Pagination body */
            <tbody>
              {fetching ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`shimmer-${i}`} className="border-b" style={{ borderColor: 'var(--color-border-solid)' }}>
                    <td className="py-2.5 px-4" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="w-4 h-4 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" /></td>
                    {visibleCols.map(col => (
                      <td key={col.id} className="py-2.5 px-4" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                        <div className="h-5 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                    <td className="sticky right-0 z-20 py-2.5 px-4" style={{ background: 'inherit', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                      <div className="flex gap-0.5">
                        <div className="w-6 h-6 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" />
                        <div className="w-6 h-6 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" />
                        <div className="w-6 h-6 rounded bg-[var(--color-bg-surface-hover)] animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : paginatedRecords.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 2} className="py-16 text-center" style={{ color: 'var(--color-text-quaternary)' }}>Нет записей</td></tr>
              ) : paginatedRecords.map((record, idx) => {
                const globalIdx = currentPage * pageSize + idx;
                const isSelected = selectedIds.has(record.id);
                const isHighlighted = highlightRecordId === record.id;
                return (
                  <tr key={record.id}
                    className="border-b"
                    style={{
                      borderColor: 'var(--color-border-solid)',
                      background: isHighlighted ? '#FEF08A' : isSelected ? 'var(--color-bg-surface-hover)' : editingId === record.id ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)',
                    }}
                    onContextMenu={e => { const target = e.target as HTMLElement; if (target.closest('button')) return; e.preventDefault(); setRowContextMenu({ x: e.clientX, y: e.clientY, recordId: record.id }); }}
                  >
                    <td className="py-2.5 px-4 text-center" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <input type="checkbox" checked={isSelected} onChange={e => { e.stopPropagation(); handleSelectRow(record.id); }} className="accent-[var(--color-brand)] w-4 h-4" />
                        <span className="text-base font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{globalIdx + 1}</span>
                      </div>
                    </td>
                    {editingId === record.id ? (
                      <>
                        {visibleCols.map(col => (<td key={col.id} className="py-2 px-4" style={{ boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>{renderCell(col, editRecord[col.id] ?? record[col.id] ?? '', true, val => setEditRecord({ ...editRecord, [col.id]: val }))}</td>))}
                        <td className="sticky right-0 z-20 py-2 px-4" style={{ background: 'inherit', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); handleUpdate(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-success)' }}><Check size={14} /></button>
                          <button onClick={e => { e.stopPropagation(); setEditingId(null); setEditRecord({}); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
                        </div></td>
                      </>
                    ) : confirmDeleteId === record.id ? (
                      <>
                        {visibleCols.map(col => (<td key={col.id} className="py-2 px-4" style={{ color: 'var(--color-danger)', opacity: 0.6, boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>{String(record[col.id] ?? '—')}</td>))}
                        <td className="sticky right-0 z-20 py-2 px-4" style={{ background: 'inherit', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); handleDeleteRecord(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-danger)' }}><Check size={14} /></button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
                        </div></td>
                      </>
                    ) : (
                      <>
                        {visibleCols.map(col => {
                          const isEditing = inlineEditCell?.recordId === record.id && inlineEditCell?.colId === col.id;
                          const cellValue = String(record[col.id] ?? '');
                          return (
                            <td key={col.id} className="py-2.5 px-4 max-w-[250px] truncate relative" style={{ color: 'var(--color-text-secondary)', fontSize: 16, boxShadow: 'inset -1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}>
                              {isEditing ? (
                                <input type="text" autoFocus value={inlineEditCell.value} onChange={e => setInlineEditCell(prev => prev ? { ...prev, value: e.target.value } : null)} onBlur={async () => { if (inlineEditCell) { const { recordId, colId, value } = inlineEditCell; const prevRecords = [...records]; onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, [colId]: value } : r) }); setInlineEditCell(null); try { const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [colId]: value }) }); if (!res.ok) throw new Error(); } catch { onRecordsChange?.({ columns, records: prevRecords }); } }}} onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); if (inlineEditCell) { const { recordId, colId, value } = inlineEditCell; const prevRecords = [...records]; onRecordsChange?.({ columns, records: records.map(r => r.id === recordId ? { ...r, [colId]: value } : r) }); setInlineEditCell(null); try { const res = await fetch(`/api/tables/${tableId}/records/${recordId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [colId]: value }) }); if (!res.ok) throw new Error(); } catch { onRecordsChange?.({ columns, records: prevRecords }); } } } if (e.key === 'Escape') { e.preventDefault(); setInlineEditCell(null); } }} className="w-full px-2 py-1.5 text-base rounded-lg outline-none" style={{ background: 'transparent', border: '2px solid var(--color-brand)', color: 'var(--color-text-primary)', boxShadow: '0 0 0 3px rgba(91,117,83,0.15)' }} onClick={e => e.stopPropagation()} />
                              ) : (
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{renderCell(col, record[col.id] ?? null, false, () => {})}</span>
                                  <div className="flex gap-0.5 flex-shrink-0">
                                    <button onClick={e => { e.stopPropagation(); copyCellToClipboard(cellValue); }} className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }} title="Копировать"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                                    <button onClick={e => { e.stopPropagation(); setInlineEditCell({ recordId: record.id, colId: col.id, value: cellValue }); }} className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }} title="Редактировать"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-20 py-2.5 px-4" style={{ background: isSelected ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)', boxShadow: 'inset 1px 0 0 var(--color-border-solid), inset 0 -1px 0 var(--color-border-subtle)' }}><div className="flex gap-0.5">
                          <button onClick={e => { e.stopPropagation(); setEditRecordModal(record.id); setEditRecordData({ ...record }); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} title="Редактировать запись"><Pencil size={14} /></button>
                          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(record, null, 2)); toast('Запись скопирована'); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><Copy size={14} /></button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(record.id); }} className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }}><Trash2 size={14} /></button>
                        </div></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {/* Pagination — только в режиме страниц */}
      {!useVirtual && (
      <div className="p-3 border-t flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--color-border)' }}>
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>Показать:</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="px-2 py-1 text-sm rounded-lg outline-none cursor-pointer"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalFiltered)} из {totalFiltered}
          </span>
        </div>

        {/* Page navigation */}
        {totalPagesActual > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(0)} disabled={currentPage === 0}
              className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-[var(--color-bg-surface-hover)]"
              style={{ color: 'var(--color-text-tertiary)' }}
            ><ChevronsLeft size={16} /></button>
            <button onClick={() => setPage(p => p - 1)} disabled={currentPage === 0}
              className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-[var(--color-bg-surface-hover)]"
              style={{ color: 'var(--color-text-tertiary)' }}
            ><ChevronLeft size={16} /></button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(7, totalPagesActual) }, (_, i) => {
              let p: number;
              if (totalPagesActual <= 7) p = i;
              else if (currentPage < 4) p = i;
              else if (currentPage > totalPagesActual - 4) p = totalPagesActual - 7 + i;
              else p = currentPage - 3 + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className="w-8 h-8 text-sm rounded-md flex items-center justify-center font-medium transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                  style={{ background: currentPage === p ? 'var(--color-brand)' : 'transparent', color: currentPage === p ? '#fff' : 'var(--color-text-tertiary)' }}
                >{p + 1}</button>
              );
            })}

            <button onClick={() => setPage(p => p + 1)} disabled={currentPage >= totalPagesActual - 1}
              className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-[var(--color-bg-surface-hover)]"
              style={{ color: 'var(--color-text-tertiary)' }}
            ><ChevronRight size={16} /></button>
            <button onClick={() => setPage(totalPagesActual - 1)} disabled={currentPage >= totalPagesActual - 1}
              className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-[var(--color-bg-surface-hover)]"
              style={{ color: 'var(--color-text-tertiary)' }}
            ><ChevronsRight size={16} /></button>

            {/* Page input */}
            <div className="flex items-center gap-1 ml-2">
              <input type="number" value={pageInput} onChange={e => setPageInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const p = parseInt(pageInput, 10) - 1;
                    if (p >= 0 && p < totalPagesActual) { setPage(p); setPageInput(''); }
                  }
                }}
                placeholder="Стр."
                className="w-14 px-2 py-1 text-xs rounded-md outline-none"
                min={1} max={totalPagesActual}
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>
        )}
      </div>
      )}

      {/* Virtual scroll info — показываем общее количество */}
      {useVirtual && (
      <div className="p-3 border-t flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>
          Показано все: {totalFiltered} записей (виртуальный скролл)
        </span>
        <span className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>
          Размер страницы:
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="ml-2 px-2 py-1 text-sm rounded-lg outline-none cursor-pointer"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
      </div>
      )}

      {/* Edit column modal */}
      {editColId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center modal-backdrop" style={{ background: 'var(--color-overlay)' }} onClick={() => setEditColId(null)}>
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: modalWidth.small }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>Колонка</h3>
            <p className="text-base mb-3" style={{ color: 'var(--color-text-tertiary)' }}>{columns.find(c => c.id === editColId)?.name}</p>
            <input type="text" value={editColName} onChange={e => setEditColName(e.target.value)}
              className="w-full px-4 py-2.5 text-base rounded-lg outline-none mb-4"
              style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-primary)', borderRadius: '8px' }}
              readOnly={columns.find(c => c.id === editColId)?.name === 'id'}
              autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditColId(null); setEditColName(''); }} className="px-4 py-2 text-base rounded-lg" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              {columns.find(c => c.id === editColId)?.name !== 'id' && (
                <>
                  <button onClick={() => handleColUpdate(editColId)} className="px-4 py-2 text-base rounded-lg" style={{ background: 'var(--color-brand)', color: '#fff' }}>Сохранить</button>
                  <button onClick={() => setConfirmColDelete(editColId)} className="px-4 py-2 text-base rounded-lg" style={{ background: 'var(--color-danger)', color: '#fff' }}>Удалить</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete column confirmation */}
      {confirmColDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center modal-backdrop" style={{ background: 'var(--color-overlay)' }} onClick={() => setConfirmColDelete(null)}>
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: modalWidth.small }} onClick={e => e.stopPropagation()}>
            <p className="text-base font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Удалить колонку?</p>
            <p className="text-base mb-4" style={{ color: 'var(--color-text-quaternary)' }}>Все данные в этой колонке будут удалены</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmColDelete(null)} className="px-4 py-2 text-base rounded-lg" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              <button onClick={() => handleColDelete(confirmColDelete)} className="px-4 py-2 text-base rounded-lg" style={{ background: 'var(--color-danger)', color: '#fff' }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Copy record modal */}
      {copyRecordId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center modal-backdrop" style={{ background: 'var(--color-overlay)' }} onClick={() => { setCopyRecordId(null); setCopyCount('1'); }}>
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: modalWidth.small }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Скопировать запись</h3>
            <p className="text-base mb-4" style={{ color: 'var(--color-text-quaternary)' }}>Скопировать данные этой записи (кроме ID) в новые записи</p>
            <label className="text-base block mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>Количество копий:</label>
            <input type="number" value={copyCount} onChange={e => setCopyCount(e.target.value)} min="1" max="1000"
              className="w-full px-4 py-2.5 text-base rounded-lg outline-none mb-4"
              style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-primary)', borderRadius: '8px' }}
              autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCopyRecord(copyRecordId); }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setCopyRecordId(null); setCopyCount('1'); }} className="px-4 py-2 text-base rounded-lg" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              <button onClick={() => handleCopyRecord(copyRecordId)} className="px-4 py-2 text-base rounded-lg" style={{ background: 'var(--color-success)', color: '#fff' }}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch delete confirmation */}
      {confirmBatchDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center modal-backdrop" style={{ background: 'var(--color-overlay)' }} onClick={() => setConfirmBatchDelete(false)}>
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: modalWidth.small }} onClick={e => e.stopPropagation()}>
            <p className="text-base font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Удалить {selectedIds.size} {selectedIds.size === 1 ? 'запись' : selectedIds.size < 5 ? 'записи' : 'записей'}?</p>
            <p className="text-base mb-4" style={{ color: 'var(--color-text-quaternary)' }}>Это действие нельзя отменить</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmBatchDelete(false)} className="px-4 py-2 text-base rounded-lg" style={{ color: 'var(--color-text-tertiary)' }}>Нет</button>
              <button onClick={handleBatchDelete} className="px-4 py-2 text-base rounded-lg" style={{ background: 'var(--color-danger)', color: '#fff' }}>Да, удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Row context menu */}
      {rowContextMenu && (
        <div className="fixed z-50 rounded-xl border py-2"
          style={{ left: rowContextMenu.x, top: rowContextMenu.y, background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-solid)', borderWidth: 2, boxShadow: '0 8px 24px var(--color-overlay)', width: modalWidth.dropdown, maxHeight: dropdownMaxHeight }}
          onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        >
          <button onClick={() => { const r = records.find(x => x.id === rowContextMenu.recordId); if (r) { setEditRecordModal(r.id); setEditRecordData({ ...r }); } setRowContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <Pencil size={14} style={{ color: 'var(--color-text-tertiary)' }} /> Редактировать
          </button>
          <button onClick={() => { setCopyRecordId(rowContextMenu.recordId); setCopyCount('1'); setRowContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <Copy size={14} style={{ color: 'var(--color-text-tertiary)' }} /> Копировать
          </button>
          <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '4px 0' }} />
          <button onClick={() => { setConfirmDeleteId(rowContextMenu.recordId); setRowContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={14} /> Удалить
          </button>
        </div>
      )}

      {/* Edit record modal — portal to body to escape transform containing block */}
      {editRecordModal && portalContainer && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="edit-record-title" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => setEditRecordModal(null)}>
          <div className="rounded-xl overflow-y-auto" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', maxWidth: modalWidth.large, width: '100%', maxHeight: modalMaxHeight }} onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h3 id="edit-record-title" className="text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>Редактировать запись #{editRecordModal}</h3>
              <button onClick={() => setEditRecordModal(null)} className="p-1 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {columns.filter(c => c.name !== 'id').map(col => (
                <div key={col.id}>
                  <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>{col.name}</label>
                  <input type="text"
                    value={editRecordData[col.id] ?? ''}
                    onChange={e => setEditRecordData(prev => ({ ...prev, [col.id]: e.target.value }))}
                    className="w-full px-4 py-2.5 text-base rounded-lg outline-none"
                    style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-primary)' }}
                  />
                </div>
              ))}
            </div>
            <div className="p-4 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button onClick={() => setEditRecordModal(null)} className="px-4 py-2 text-base rounded-lg" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              <button onClick={async () => {
                const prevRecords = [...records];
                // Оптимистичное обновление
                onRecordsChange?.({ columns, records: records.map(r => r.id === editRecordModal ? { ...r, ...editRecordData } : r) });
                setEditRecordModal(null);

                try {
                  const res = await fetch(`/api/tables/${tableId}/records/${editRecordModal}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editRecordData),
                  });
                  if (!res.ok) throw new Error();
                } catch {
                  onRecordsChange?.({ columns, records: prevRecords });
                  toast('Ошибка при обновлении', 'error');
                }
              }} className="px-4 py-2 text-base rounded-lg" style={{ background: 'var(--color-brand)', color: '#fff' }}>Сохранить</button>
            </div>
          </div>
        </div>,
        portalContainer
      )}

      {/* Duplicates modal */}
      {showDuplicates && portalContainer && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="duplicates-title" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => setShowDuplicates(false)}>
          <div className="rounded-xl overflow-y-auto" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', maxWidth: modalWidth.xlarge, width: '100%', maxHeight: modalMaxHeight }} onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h3 id="duplicates-title" className="text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>Найти дубликаты</h3>
              <button onClick={() => { setShowDuplicates(false); setDuplicates([]); setDuplicatesCol(null); }} className="p-1 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Column selector */}
              <div>
                <label className="text-sm block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Колонка для проверки:</label>
                <div className="flex flex-wrap gap-1.5">
                  {columns.filter(c => c.name !== 'id').map(col => (
                    <button key={col.id} onClick={() => findDuplicates(col.id)}
                      className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                      style={{
                        background: duplicatesCol === col.id ? 'var(--color-brand)' : 'var(--color-bg-surface-hover)',
                        color: duplicatesCol === col.id ? '#fff' : 'var(--color-text-secondary)',
                      }}
                    >
                      {col.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              {duplicatesLoading ? (
                <div className="text-center py-8"><span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Поиск...</span></div>
              ) : duplicates.length > 0 ? (
                <>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Найдено {duplicates.length} групп дубликатов
                  </p>
                  <div className="space-y-2">
                    {duplicates.map((d, i) => (
                      <div key={i} className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{d.value}</span>
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#FEF08A', color: '#1A1A1A' }}>{d.count}×</span>
                        </div>
                        <div className="text-xs font-mono" style={{ color: 'var(--color-text-quaternary)' }}>
                          {d.records.map(r => r.id).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : duplicatesCol ? (
                <div className="text-center py-8"><span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Дубликатов не найдено ✓</span></div>
              ) : (
                <div className="text-center py-8"><span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Выберите колонку</span></div>
              )}
            </div>
          </div>
        </div>,
        portalContainer
      )}

      {/* Undo snackbar */}
      {showSnackbar && lastDeleted && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg"
          style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', boxShadow: '0 8px 32px var(--color-overlay)' }}
        >
          <span className="text-base" style={{ color: 'var(--color-text-primary)' }}>
            Удалено записей: {lastDeleted.records.length}
          </span>
          <button onClick={handleUndoDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium"
            style={{ background: 'var(--color-brand)', color: '#fff' }}
          >
            <Undo2 size={14} /> Отменить
          </button>
          <button onClick={() => { setShowSnackbar(false); if (lastDeleted.timer) clearTimeout(lastDeleted.timer); setLastDeleted(null); }}
            className="p-1 rounded-md"
            style={{ color: 'var(--color-text-quaternary)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
