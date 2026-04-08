'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Table, Column, TableRecord } from '@/types';
import { TableCards } from '@/components/TableCards';
import { DataTable } from '@/components/DataTable';
import { CommandPalette } from '@/components/CommandPalette';
import { type Command } from '@/components/CommandPalette';
import { Search, Moon, Sun, Download, Upload, Plus, Filter, Copy, Trash2, RotateCcw, RotateCw, MoveHorizontal, ChevronUp, ChevronDown, Table2, Grid3X3, LayoutList, LayoutPanelLeft, Pencil, Check, X, ExternalLink } from 'lucide-react';

const PAGE_SIZE = 50;

export default function Home() {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableData, setTableData] = useState<{ columns: Column[]; records: TableRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [themeIcon, setThemeIcon] = useState<'light' | 'dark'>('light');
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ tableId: string; tableName: string; recordId: string; matchedColumns: string[] }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchSelectedIdx, setSearchSelectedIdx] = useState(-1);
  const [highlightRecordId, setHighlightRecordId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [tablesVisible, setTablesVisible] = useState(() => {
    try { const v = localStorage.getItem('tm-tablesVisible'); return v !== null ? v === 'true' : true; } catch { return true; }
  });
  const [dataVisible, setDataVisible] = useState(() => {
    try { const v = localStorage.getItem('tm-dataVisible'); return v !== null ? v === 'true' : true; } catch { return true; }
  });
  const [layoutMode, setLayoutMode] = useState<'top' | 'sidebar'>(() => {
    try { return localStorage.getItem('tm-layout') as 'top' | 'sidebar' || 'top'; } catch { return 'top'; }
  });
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [editTableName, setEditTableName] = useState('');
  const [confirmDelTableId, setConfirmDelTableId] = useState<string | null>(null);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  // DataTable callbacks for Command Palette — use refs to avoid re-renders
  const dtCallbacks = useRef({
    createRecord: null as (() => void) | null,
    export: null as ((fmt: string) => void) | null,
    toggleFilters: null as (() => void) | null,
    showDuplicates: null as (() => void) | null,
    undo: null as (() => void) | null,
    redo: null as (() => void) | null,
  });

  const handleGlobalSearch = (value: string) => {
    setGlobalSearch(value);
    setSearchSelectedIdx(-1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}&limit=50`);
        const data = await res.json();
        setSearchResults(data.results);
      } catch {}
      setSearching(false);
    }, 300);
  };

  // Sync theme from localStorage immediately (before server fetch)
  useEffect(() => {
    try {
      const t = localStorage.getItem('tm-theme');
      if (t) { setThemeIcon(t as 'light' | 'dark'); document.documentElement.setAttribute('data-theme', t); }
    } catch {}
  }, []);

  // Load theme from server (sync to localStorage if different)
  useEffect(() => {
    fetch('/api/theme')
      .then(r => r.json())
      .then(data => {
        const t = data.theme || 'light';
        document.documentElement.setAttribute('data-theme', t);
        setThemeIcon(t as 'light' | 'dark');
        try { localStorage.setItem('tm-theme', t); } catch {}
      })
      .catch(() => {
        // Server not ready yet — use localStorage values
        document.documentElement.setAttribute('data-theme', themeIcon);
      });
  }, []);

  const toggleTheme = () => {
    const next = themeIcon === 'light' ? 'dark' : 'light';
    setThemeIcon(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tm-theme', next); } catch {}
    fetch('/api/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  };

  // Table CRUD helpers for sidebar
  const handleCreateTable = async () => {
    const name = newTableName.trim() || `Таблица ${tables.length + 1}`;
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const table = await res.json();
      setTables(prev => [...prev, table]);
      setNewTableName('');
      setShowCreateTable(false);
      setSelectedTableId(table.id);
    } catch (err) { console.error('Create table failed:', err); }
  };

  const handleRenameTable = async (id: string) => {
    const name = editTableName.trim();
    if (!name) return;
    try {
      await fetch(`/api/tables/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setTables(prev => prev.map(t => t.id === id ? { ...t, name, updatedAt: new Date().toISOString() } : t));
      setEditTableId(null);
      setEditTableName('');
    } catch (err) { console.error('Rename table failed:', err); }
  };

  const handleDeleteTable = async (id: string) => {
    try {
      await fetch(`/api/tables/${id}`, { method: 'DELETE' });
      setTables(prev => prev.filter(t => t.id !== id));
      if (selectedTableId === id) setSelectedTableId(null);
      setConfirmDelTableId(null);
    } catch (err) { console.error('Delete table failed:', err); }
  };

  // Restore from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('table');
    const rid = params.get('record');
    if (tid) setSelectedTableId(tid);
    if (rid) setHighlightRecordId(rid);
  }, []);

  // Persist section visibility
  useEffect(() => {
    try {
      localStorage.setItem('tm-tablesVisible', String(tablesVisible));
      localStorage.setItem('tm-dataVisible', String(dataVisible));
      localStorage.setItem('tm-layout', layoutMode);
    } catch {}
  }, [tablesVisible, dataVisible, layoutMode]);

  // Сброс подсветки при смене таблицы
  useEffect(() => {
    if (highlightRecordId) {
      const timer = setTimeout(() => setHighlightRecordId(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [highlightRecordId]);

  // Persist to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedTableId) params.set('table', selectedTableId);
    else params.delete('table');
    const url = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [selectedTableId]);

  // Update document title
  useEffect(() => {
    const selected = tables.find(t => t.id === selectedTableId);
    document.title = selected ? `${selected.name} — Table Manager` : 'Table Manager';
  }, [selectedTableId, tables]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch('/api/tables');
      const data = await res.json();
      setTables(data);
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTableData = useCallback(async (tableId: string, signal?: { current: boolean }) => {
    setFetching(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/records`);
      if (signal?.current) return;
      const data = await res.json();
      if (signal?.current) return;
      setTableData(data);
    } catch (err) {
      console.error('Failed to fetch table data:', err);
    } finally {
      if (!signal?.current) setFetching(false);
    }
  }, []);

  // Cleanup search timer on unmount
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  // Закрытие поиска при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-search-container]')) {
        setSearchResults([]);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Keyboard shortcuts: T=toggle tables, D=toggle data, ←/→=navigate tables
  const prevTableRef = useRef<Table | null>(null);
  const nextTableRef = useRef<Table | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).contentEditable === 'true') return;
      if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') setTablesVisible(v => !v);
      if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') setDataVisible(v => !v);
      if (e.key === 'ArrowLeft' && prevTableRef.current) {
        e.preventDefault();
        setSelectedTableId(prevTableRef.current.id);
      }
      if (e.key === 'ArrowRight' && nextTableRef.current) {
        e.preventDefault();
        setSelectedTableId(nextTableRef.current.id);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Initial fetch
  useEffect(() => { fetchTables(); }, [fetchTables]);

  // Fetch data when table selection changes
  const prevTableId = useRef<string | null>(null);
  const abortedRef = useRef(false);
  useEffect(() => {
    abortedRef.current = false;
    if (selectedTableId && selectedTableId !== prevTableId.current) {
      prevTableId.current = selectedTableId;
      fetchTableData(selectedTableId, abortedRef);
    }
    if (!selectedTableId) {
      setTableData(null);
      prevTableId.current = null;
    }
    return () => { abortedRef.current = true; };
  }, [selectedTableId, fetchTableData]);

  const handleRecordsChange = useCallback((data: { columns: Column[]; records: TableRecord[] }) => {
    setTableData(data);
  }, []);

  const selectedTable = tables.find(t => t.id === selectedTableId) || null;
  const selectedIdx = selectedTable ? tables.findIndex(t => t.id === selectedTableId) : -1;
  const prevTable = selectedIdx > 0 ? tables[selectedIdx - 1] : null;
  const nextTable = selectedIdx >= 0 && selectedIdx < tables.length - 1 ? tables[selectedIdx + 1] : null;

  // Filtered tables for sidebar
  const filteredTables = useMemo(() => {
    if (!sidebarSearch.trim()) return tables;
    const q = sidebarSearch.toLowerCase();
    return tables.filter((t: Table) => t.name.toLowerCase().includes(q));
  }, [tables, sidebarSearch]);

  // Sync refs for keyboard navigation
  useEffect(() => { prevTableRef.current = prevTable; }, [prevTable]);
  useEffect(() => { nextTableRef.current = nextTable; }, [nextTable]);

  const records = tableData?.records || [];
  const columns = tableData?.columns || [];
  const totalPages = Math.ceil(records.length / PAGE_SIZE);

  // Command Palette commands
  const cb = dtCallbacks.current;
  const commands: Command[] = [
    { id: 'create-record', label: 'Создать запись', action: () => cb.createRecord?.(), section: 'Records' },
    { id: 'export-csv', label: 'Экспорт CSV', action: () => cb.export?.('csv'), section: 'Export' },
    { id: 'export-json', label: 'Экспорт JSON', action: () => cb.export?.('json'), section: 'Export' },
    { id: 'toggle-filters', label: 'Фильтры', action: () => cb.toggleFilters?.(), section: 'View' },
    { id: 'find-duplicates', label: 'Найти дубликаты', action: () => cb.showDuplicates?.(), section: 'Records' },
    { id: 'undo', label: 'Отменить', action: () => cb.undo?.(), section: 'Edit' },
    { id: 'redo', label: 'Повторить', action: () => cb.redo?.(), section: 'Edit' },
    { id: 'toggle-dark', label: 'Тёмная тема', action: toggleTheme, section: 'Settings' },
    { id: 'create-table', label: 'Создать таблицу', action: () => document.querySelector('[data-action="create-table"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })), section: 'Tables' },
    { id: 'import', label: 'Импорт CSV/JSON', action: () => document.querySelector('[data-action="import"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })), section: 'Tables' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-marketing)' }}>
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border-subtle)' }}
      >
        <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold"
              style={{ background: 'var(--color-brand)', color: '#fff' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <h1 className="text-base font-medium tracking-tight" style={{ color: 'var(--color-text-primary)' }} data-testid="page-title">
              Table Manager
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base" style={{ color: 'var(--color-text-quaternary)' }}>
              {tables.length} таблиц · {tables.reduce((a, t) => a + t.records.length, 0)} записей
            </span>

            {/* Global search */}
            <div ref={searchContainerRef} className="relative" data-search-container>
              <Search size={14} className="absolute left-2.5 top-2" style={{ color: 'var(--color-text-quaternary)', pointerEvents: 'none' }} />
              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onChange={e => handleGlobalSearch(e.target.value)}
                placeholder="Поиск... /"
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg outline-none"
                data-testid="global-search"
                style={{
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  width: 240,
                }}
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-96 rounded-xl border z-50 max-h-80 overflow-y-auto"
                  style={{ background: 'var(--color-bg-surface)', boxShadow: '0 8px 32px var(--color-overlay)' }}
                >
                  {/* Count header */}
                  <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-quaternary)' }}>
                      {searchResults.length}+ результатов
                    </span>
                    <button
                      className="text-xs font-medium transition-colors hover:underline"
                      style={{ color: 'var(--color-brand)' }}
                      onClick={() => window.location.href = `/search?q=${encodeURIComponent(globalSearch)}`}
                    >
                      Все результаты →
                    </button>
                  </div>
                  {searchResults.slice(0, 6).map((r, i) => (
                    <button key={`${r.tableId}-${r.recordId}-${i}`}
                      className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: i === searchSelectedIdx ? 'var(--color-bg-surface-hover)' : 'transparent',
                      }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setSelectedTableId(r.tableId);
                        setHighlightRecordId(r.recordId);
                        setGlobalSearch('');
                        setSearchResults([]);
                        // Update URL
                        const url = new URL(window.location.href);
                        url.searchParams.set('table', r.tableId);
                        url.searchParams.set('record', r.recordId);
                        window.history.replaceState({}, '', url.toString());
                      }}
                      onMouseEnter={() => setSearchSelectedIdx(i)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--color-brand)', color: '#fff' }}>
                          {r.tableName}
                        </span>
                        <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                          Запись #{r.recordId}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                        {r.matchedColumns.join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <div className="absolute top-full left-0 mt-1 w-96 rounded-xl border p-4 text-center"
                  style={{ background: 'var(--color-bg-surface)', boxShadow: '0 8px 32px var(--color-overlay)' }}
                >
                  <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Поиск...</span>
                </div>
              )}
            </div>

            {/* Section toggles */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTablesVisible(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer"
                style={{ background: tablesVisible ? 'var(--color-brand)' : 'transparent', color: tablesVisible ? '#fff' : 'var(--color-text-tertiary)', border: `1px solid ${tablesVisible ? 'var(--color-brand)' : 'var(--color-border)'}` }}
                title="Таблицы (T)"
                aria-expanded={tablesVisible}
                aria-label="Показать/скрыть список таблиц"
              >
                {tablesVisible ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <Table2 size={12} />
                <span className="font-mono hidden sm:inline">T</span>
              </button>
              <button
                onClick={() => setDataVisible(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer"
                style={{ background: dataVisible ? 'var(--color-brand)' : 'transparent', color: dataVisible ? '#fff' : 'var(--color-text-tertiary)', border: `1px solid ${dataVisible ? 'var(--color-brand)' : 'var(--color-border)'}` }}
                title="Данные (D)"
                aria-expanded={dataVisible}
                aria-label="Показать/скрыть таблицу данных"
              >
                {dataVisible ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <Grid3X3 size={12} />
                <span className="font-mono hidden sm:inline">D</span>
              </button>
            </div>

            {/* Layout toggle */}
            <button
              onClick={() => setLayoutMode(m => m === 'top' ? 'sidebar' : 'top')}
              className="p-2 rounded-lg cursor-pointer transition-colors"
              style={{ color: layoutMode === 'sidebar' ? 'var(--color-brand)' : 'var(--color-text-tertiary)', background: layoutMode === 'sidebar' ? 'rgba(91,117,83,0.1)' : 'transparent' }}
              title={layoutMode === 'top' ? 'Боковая панель' : 'Сверху'}
              aria-label={`Режим: ${layoutMode === 'top' ? 'таблицы сверху' : 'боковая панель'}`}
            >
              {layoutMode === 'top' ? <LayoutPanelLeft size={18} /> : <LayoutList size={18} />}
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg cursor-pointer transition-colors"
              style={{ color: 'var(--color-text-tertiary)', background: 'transparent' }}
              title={themeIcon === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-border)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {themeIcon === 'light' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-6 py-4">
        {layoutMode === 'sidebar' ? (
          /* Sidebar layout */
          <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* Sidebar — T toggle */}
            {tablesVisible && (
            <aside className="w-80 flex-shrink-0 flex flex-col rounded-xl border overflow-hidden" style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)', maxHeight: 'calc(100vh - 120px)' }}>
              {/* Sticky header */}
              <div className="flex-shrink-0 p-3 pb-0" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-panel)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium" style={{ color: 'var(--color-text-secondary)' }}>Таблицы</span>
                    <span className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>
                      {sidebarSearch ? `${filteredTables.length}/${tables.length}` : tables.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {/* Hide sidebar toggle (T) */}
                    <button onClick={() => setTablesVisible(false)} className="p-1.5 rounded transition-colors" style={{ color: 'var(--color-text-quaternary)' }} title="Скрыть таблицы (T)">
                      <ChevronUp size={16} />
                    </button>
                  </div>
                </div>
                {/* Search */}
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-2" style={{ color: 'var(--color-text-quaternary)', pointerEvents: 'none' }} />
                  <input type="text" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} placeholder="Поиск таблиц..." className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg outline-none" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                </div>
                {/* Actions */}
                <div className="flex gap-1">
                  <button onClick={() => setShowCreateTable(true)} className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-sm rounded-lg transition-colors cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }} title="Создать таблицу">
                    <Plus size={14} /> Создать
                  </button>
                </div>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto p-2 pt-1">
                {filteredTables.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-quaternary)' }}>
                    {sidebarSearch ? 'Ничего не найдено' : 'Нет таблиц'}
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredTables.map(t => {
                      const isEditing = editTableId === t.id;
                      const isConfirming = confirmDelTableId === t.id;
                      return (
                        <div key={t.id} className="group">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setSelectedTableId(t.id)}
                              className="flex-1 text-left px-2.5 py-2 rounded-lg text-base transition-colors cursor-pointer"
                              style={{
                                background: t.id === selectedTableId ? 'var(--color-brand)' : 'transparent',
                                color: t.id === selectedTableId ? '#fff' : 'var(--color-text-secondary)',
                                fontWeight: t.id === selectedTableId ? 500 : 400,
                              }}
                            >
                              <span className="block truncate">{t.name}</span>
                              <span className="block text-xs mt-0.5" style={{ color: t.id === selectedTableId ? 'rgba(255,255,255,0.6)' : 'var(--color-text-quaternary)' }}>
                                {t.records.length}
                              </span>
                            </button>
                            {/* Actions on hover */}
                            {!isConfirming && (
                              <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a
                                  href={`/?table=${t.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                                  style={{ color: 'var(--color-text-quaternary)' }}
                                  title="Открыть в новой вкладке"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <ExternalLink size={14} />
                                </a>
                                <button onClick={() => { setEditTableId(t.id); setEditTableName(t.name); }} className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ color: 'var(--color-text-quaternary)' }} title="Переименовать">
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => setConfirmDelTableId(t.id)} className="p-1 rounded transition-colors hover:bg-[var(--color-danger)] hover:text-white" style={{ color: 'var(--color-text-quaternary)' }} title="Удалить">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Inline rename */}
                          {isEditing && (
                            <div className="flex items-center gap-1 mt-1 px-1">
                              <input type="text" value={editTableName} onChange={e => setEditTableName(e.target.value)} autoFocus className="flex-1 px-2 py-1.5 text-sm rounded outline-none" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)' }} onKeyDown={e => { if (e.key === 'Enter') handleRenameTable(t.id); if (e.key === 'Escape') setEditTableId(null); }} />
                              <button onClick={() => handleRenameTable(t.id)} className="p-1 rounded" style={{ color: 'var(--color-brand)' }}><Check size={14} /></button>
                              <button onClick={() => setEditTableId(null)} className="p-1 rounded" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
                            </div>
                          )}
                          {/* Delete confirm */}
                          {isConfirming && (
                            <div className="px-2.5 py-2 mt-1 rounded text-sm" style={{ background: 'var(--color-danger)', color: '#fff' }}>
                              <p className="font-medium mb-1">Удалить &quot;{t.name}&quot;?</p>
                              <div className="flex gap-1">
                                <button onClick={() => handleDeleteTable(t.id)} className="px-2.5 py-1 rounded text-sm" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>Да</button>
                                <button onClick={() => setConfirmDelTableId(null)} className="px-2.5 py-1 rounded text-sm" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Нет</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
            )}

            {/* Main content — D toggle */}
            {dataVisible && (
            <div className={tablesVisible ? 'flex-1 min-w-0 flex flex-col' : 'w-full'}>
              {/* Show T/D toggle buttons when one section is hidden */}
              {!tablesVisible && (
                <div className="mb-3 flex items-center gap-2">
                  <button onClick={() => setTablesVisible(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }} title="Показать таблицы (T)">
                    <ChevronDown size={14} /> <Table2 size={14} /> Таблицы
                  </button>
                </div>
              )}
              {selectedTable && tableData ? (
                <div key={selectedTableId} className="rounded-xl border overflow-hidden flex flex-col" style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)', minHeight: 0 }}>
                  <DataTable
                    tableName={selectedTable.name}
                    columns={columns}
                    records={records}
                    tableId={selectedTable.id}
                    totalPages={totalPages}
                    onRefresh={() => fetchTableData(selectedTable.id)}
                    onTablesRefresh={() => { fetchTableData(selectedTable.id); fetchTables(); }}
                    onRecordsChange={handleRecordsChange}
                    fetching={fetching}
                    highlightRecordId={highlightRecordId}
                    prevTable={prevTable}
                    nextTable={nextTable}
                    onNavigate={(id) => setSelectedTableId(id)}
                    onApiReady={(api) => {
                      dtCallbacks.current.createRecord = api.handleCreateRecord;
                      dtCallbacks.current.export = api.handleExport;
                      dtCallbacks.current.toggleFilters = api.toggleFilters;
                      dtCallbacks.current.showDuplicates = api.showDuplicates;
                      dtCallbacks.current.undo = api.undo;
                      dtCallbacks.current.redo = api.redo;
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-xl border p-24 text-center flex-shrink-0" style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)' }}>
                  {fetching ? (
                    <p className="text-base" style={{ color: 'var(--color-text-tertiary)' }}>Загрузка данных...</p>
                  ) : tablesVisible ? (
                    <p className="text-base" style={{ color: 'var(--color-text-quaternary)' }}>Выберите таблицу из списка слева</p>
                  ) : (
                    <p className="text-base" style={{ color: 'var(--color-text-quaternary)' }}>Нажмите T чтобы показать таблицы, или выберите таблицу</p>
                  )}
                </div>
              )}
              {/* Show D toggle when hidden */}
              {!dataVisible && (
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => setDataVisible(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }} title="Показать данные (D)">
                    <ChevronDown size={14} /> <Grid3X3 size={14} /> Данные
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Both hidden — show message */}
            {!tablesVisible && !dataVisible && (
              <div className="w-full flex items-center justify-center py-24">
                <div className="text-center space-y-4">
                  <p className="text-base" style={{ color: 'var(--color-text-quaternary)' }}>Всё скрыто. Нажмите T или D чтобы показать</p>
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setTablesVisible(true)} className="px-3 py-2 text-sm rounded-lg cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }}>T — Таблицы</button>
                    <button onClick={() => setDataVisible(true)} className="px-3 py-2 text-sm rounded-lg cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }}>D — Данные</button>
                  </div>
                </div>
              </div>
            )}

            {/* Create table modal inline */}
            {showCreateTable && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowCreateTable(false)}>
                <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '2px solid var(--color-border-solid)', width: 'min(20rem, 90vw)' }} onClick={e => e.stopPropagation()}>
                  <h3 className="text-base font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>Создать таблицу</h3>
                  <input type="text" value={newTableName} onChange={e => setNewTableName(e.target.value)} placeholder="Название..." autoFocus className="w-full px-3 py-2 text-sm rounded-lg outline-none mb-3" style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} onKeyDown={e => { if (e.key === 'Enter') handleCreateTable(); }} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowCreateTable(false); setNewTableName(''); }} className="px-3 py-1.5 text-sm rounded-lg cursor-pointer" style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Отмена</button>
                    <button onClick={handleCreateTable} className="px-3 py-1.5 text-sm rounded-lg cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }}>Создать</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Top layout — collapsible sections */
          <div className="space-y-4">
            {/* Table Cards — collapsible */}
            <div className={tablesVisible ? 'section-collapsible' : 'section-collapsible section-collapsed'}>
              <div className="section-inner">
                <div
                  className="rounded-xl border p-4"
                  style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)' }}
                  data-testid="table-cards-container"
                >
                  <TableCards
                    tables={tables}
                    selectedId={selectedTableId}
                    onSelect={setSelectedTableId}
                    onRefresh={fetchTables}
                    onTablesRefresh={fetchTables}
                    loading={loading}
                  />
                </div>
              </div>
            </div>

            {/* Data Table — collapsible */}
            <div className={dataVisible ? 'section-collapsible' : 'section-collapsible section-collapsed'}>
              <div className="section-inner">
                {selectedTable && tableData ? (
                <div
                  key={selectedTableId}
                  className="rounded-xl border overflow-hidden"
                  style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)' }}
                >
                  <DataTable
                    tableName={selectedTable.name}
                    columns={columns}
                    records={records}
                    tableId={selectedTable.id}
                    totalPages={totalPages}
                    onRefresh={() => fetchTableData(selectedTable.id)}
                    onTablesRefresh={() => { fetchTableData(selectedTable.id); fetchTables(); }}
                    onRecordsChange={handleRecordsChange}
                    fetching={fetching}
                    highlightRecordId={highlightRecordId}
                    prevTable={prevTable}
                    nextTable={nextTable}
                    onNavigate={(id) => setSelectedTableId(id)}
                    onApiReady={(api) => {
                      dtCallbacks.current.createRecord = api.handleCreateRecord;
                      dtCallbacks.current.export = api.handleExport;
                      dtCallbacks.current.toggleFilters = api.toggleFilters;
                      dtCallbacks.current.showDuplicates = api.showDuplicates;
                      dtCallbacks.current.undo = api.undo;
                      dtCallbacks.current.redo = api.redo;
                    }}
                  />
                </div>
                ) : (
                <div
                  className="rounded-xl border p-24 text-center"
                  style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)' }}
                >
                  {fetching ? (
                    <p className="text-base" style={{ color: 'var(--color-text-tertiary)' }}>Загрузка данных...</p>
                  ) : (
                    <p className="text-base" style={{ color: 'var(--color-text-quaternary)' }}>Выберите таблицу для просмотра записей</p>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commands}
      />
    </div>
  );
}
