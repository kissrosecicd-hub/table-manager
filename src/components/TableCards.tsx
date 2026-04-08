'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Table } from '@/types';
import { Pencil, Trash2, Plus, X, Check, Search, ExternalLink, Upload, Star } from 'lucide-react';

interface TableCardsProps {
  tables: Table[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onTablesRefresh: () => void;
  loading: boolean;
}

export function TableCards({ tables, selectedId, onSelect, onRefresh, onTablesRefresh, loading }: TableCardsProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tableId: string } | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditName, setInlineEditName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState<'new' | 'append'>('new');
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Load favorites
  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem('tm-favorites') || '[]'));
    } catch {}
  }, []);

  const toggleFavorite = (id: string) => {
    const updated = favorites.includes(id)
      ? favorites.filter(f => f !== id)
      : [...favorites, id];
    setFavorites(updated);
    localStorage.setItem('tm-favorites', JSON.stringify(updated));
  };

  // Block body scroll when import modal is open
  useEffect(() => {
    if (showImport) {
      document.body.classList.add('modal-open');
      return () => document.body.classList.remove('modal-open');
    }
    return undefined;
  }, [showImport]);

  // Portal container for modals (escape transform:scale)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const openFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          processFile(ev.target?.result as string, file.name);
        };
        reader.readAsText(file);
      }
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  };

  useEffect(() => {
    const handler = () => { setContextMenu(null); setInlineEditId(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Block body scroll when any modal is open
  const isModalOpen = editingId || confirmDelete || showCreate;
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isModalOpen]);

  const handleInlineEdit = async (id: string) => {
    if (!inlineEditName.trim() || inlineEditName.trim() === tables.find(t => t.id === id)?.name) {
      setInlineEditId(null);
      return;
    }
    await fetch(`/api/tables/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inlineEditName.trim() }),
    });
    setInlineEditId(null);
    onRefresh();
  };

  const openInNewTab = (id: string) => {
    const url = `${window.location.pathname}?table=${id}`;
    window.open(url, '_blank');
  };

  const openInNewWindow = (id: string) => {
    const url = `${window.location.pathname}?table=${id}`;
    window.open(url, '_blank', 'width=1280,height=800,toolbar=no,location=no');
  };

  // Close context menu on outside click
  const handleContextMenuAction = (tableId: string, mode: 'tab' | 'window') => {
    if (mode === 'tab') openInNewTab(tableId);
    else openInNewWindow(tableId);
    setContextMenu(null);
  };

  const filteredTables = useMemo(() => {
    let result = search
      ? tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
      : tables;
    // Favorites first
    return [...result].sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 0 : 1;
      const bFav = favorites.includes(b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }, [tables, search, favorites]);

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const isCsv = importFile.startsWith('data:text/csv') || importFile.includes('.csv');
      const isJson = importFile.startsWith('data:application/json') || importFile.includes('.json');
      const base64 = importFile.split(',')[1];
      const text = decodeURIComponent(escape(atob(base64)));

      const body: Record<string, string> = {};
      if (isCsv || !isJson) body.csv = text;
      else body.json = text;

      const url = importMode === 'append' && selectedId
        ? `/api/import?tableId=${selectedId}&mode=append`
        : '/api/import?mode=new';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setShowImport(false);
      setImportFile(null);
      onTablesRefresh();
    } catch (err) {
      alert('Ошибка импорта');
    }
    setImporting(false);
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1, 6).map(line => {
      const values = line.split(',');
      const row: Record<string, string> = {};
      headers.forEach((h, j) => { row[h] = (values[j] || '').trim(); });
      return row;
    });
    return { headers, totalRows: lines.length - 1, previewRows: rows };
  };

  const processFile = (text: string, fileName: string) => {
    const isJson = fileName.endsWith('.json');
    if (isJson) {
      try {
        const data = JSON.parse(text);
        const rows = Array.isArray(data) ? data : [data];
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        setImportPreview({ headers, rows: rows.slice(0, 5) });
        setImportFile(`data:application/json;base64,${btoa(unescape(encodeURIComponent(text)))}`);
        setImportFileName(fileName);
      } catch {
        alert('Невалидный JSON');
      }
    } else {
      const parsed = parseCSV(text);
      setImportPreview({ headers: parsed.headers, rows: parsed.previewRows || [] });
      setImportFile(`data:text/csv;base64,${btoa(unescape(encodeURIComponent(text)))}`);
      setImportFileName(`${fileName} (${parsed.totalRows} строк)`);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      processFile(ev.target?.result as string, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      processFile(ev.target?.result as string, file.name);
    };
    reader.readAsText(file);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const table = await res.json();
    setNewName('');
    setShowCreate(false);
    onRefresh();
    onSelect(table.id);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await fetch(`/api/tables/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    setEditName('');
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tables/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (selectedId === id) onSelect('');
    onRefresh();
  };

  return (
    <div>
      {loading ? (
        <p className="text-center py-8 text-base" style={{ color: 'var(--color-text-quaternary)' }}>Загрузка...</p>
      ) : (
        <div className="space-y-3">
          <div className="relative" style={{ maxWidth: 320 }}>
            <Search size={16} className="absolute left-3 top-2.5" style={{ color: 'var(--color-text-quaternary)' }} />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск таблиц..."
              className="pl-9 pr-3 py-2.5 text-base rounded-lg outline-none"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredTables.length === 0 && search ? (
              <p className="text-base py-2" style={{ color: 'var(--color-text-quaternary)' }}>Ничего не найдено</p>
            ) : (
              filteredTables.map(table => (
                <div
                  key={table.id}
                  data-testid="table-card"
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                  style={{
                    background: selectedId === table.id ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)',
                    border: selectedId === table.id ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
                  }}
                  onClick={() => onSelect(table.id)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-surface-hover)'; }}
                  onMouseLeave={e => { if (selectedId !== table.id) e.currentTarget.style.background = 'var(--color-bg-surface)'; }}
                  onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, tableId: table.id }); }}
                >
                  {inlineEditId === table.id ? (
                    <input
                      autoFocus
                      value={inlineEditName}
                      onChange={e => setInlineEditName(e.target.value)}
                      onBlur={() => handleInlineEdit(table.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(table.id); if (e.key === 'Escape') setInlineEditId(null); }}
                      onClick={e => e.stopPropagation()}
                      className="text-base font-medium truncate max-w-[160px] bg-transparent outline-none"
                      style={{ color: 'var(--color-text-primary)', width: 140 }}
                    />
                  ) : (
                    <span
                      className="text-base font-medium cursor-pointer truncate max-w-[160px]"
                      style={{ color: selectedId === table.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                      onClick={() => onSelect(table.id)}
                      onDoubleClick={e => { e.stopPropagation(); setInlineEditId(table.id); setInlineEditName(table.name); }}
                      title="Двойной клик чтобы переименовать"
                    >
                      {table.name}
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavorite(table.id); }}
                    className="p-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                    style={{ color: favorites.includes(table.id) ? '#FBBF24' : 'var(--color-text-quaternary)', background: 'transparent' }}
                    title="В избранное"
                  >
                    <Star size={12} fill={favorites.includes(table.id) ? '#FBBF24' : 'none'} />
                  </button>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#62666d' }}>
                    {table.records.length}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`/?table=${table.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                      style={{ color: 'var(--color-text-tertiary)', background: 'transparent' }}
                      title="Открыть в новой вкладке"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      onClick={() => { setEditingId(table.id); setEditName(table.name); }}
                      className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                      style={{ color: 'var(--color-text-quaternary)', background: 'transparent' }}
                      title="Переименовать"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(table.id)}
                      className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-bg-surface-hover)]"
                      style={{ color: 'var(--color-text-quaternary)', background: 'transparent' }}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}

            {showCreate ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
              >
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Название таблицы" className="text-base bg-transparent outline-none w-36"
                  style={{ color: 'var(--color-text-primary)' }} onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus />
                <button onClick={handleCreate} className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-bg-surface-hover)]" style={{ background: 'var(--color-brand)', color: '#fff' }}><Check size={14} /></button>
                <button onClick={() => { setShowCreate(false); setNewName(''); }} className="p-1.5 cursor-pointer" style={{ color: 'var(--color-text-quaternary)' }}><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-dashed rounded-lg text-base cursor-pointer"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-quaternary)' }}
              >
                <Plus size={14} /> Таблица
              </button>
            )}
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-dashed rounded-lg text-base cursor-pointer transition-colors hover:bg-[var(--color-bg-surface-hover)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-quaternary)' }}
            >
              <Upload size={14} /> Импорт
            </button>
          </div>
        </div>
      )}

      {/* Import modal — portal to body to escape transform:scale containing block */}
      {showImport && portalTarget && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => { setShowImport(false); setImportFile(null); setImportPreview(null); }}>
          <style>{`
            body.modal-open { overflow: hidden; }
            [data-import-modal-container] *, [data-import-modal-container] *:focus, [data-import-modal-container] *:focus-visible {
              outline: none !important;
              outline-width: 0 !important;
              outline-style: none !important;
              box-shadow: none !important;
            }
          `}</style>
          <div data-import-modal-container style={{ borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto', background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }} onClick={e => e.stopPropagation()}>
            <div data-import-modal className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h3 className="text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>Импорт CSV/JSON</h3>
              <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setShowImport(false); setImportFile(null); setImportPreview(null); }} className="p-1 rounded-md transition-colors hover:bg-[var(--color-bg-surface-hover)] outline-none" style={{ color: 'var(--color-text-quaternary)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Drag-drop zone */}
              <div
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={openFilePicker}
                className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer outline-none"
                style={{
                  outline: 'none',
                  borderColor: dragOver ? 'var(--color-brand)' : 'var(--color-border)',
                  background: dragOver ? 'var(--color-bg-surface-hover)' : 'transparent',
                }}
              >
                <Upload size={20} className="mx-auto mb-2" style={{ color: 'var(--color-text-tertiary)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  Перетащите файл или кликните
                </p>
                {importFileName && (
                  <p className="text-xs mt-2 font-medium" style={{ color: 'var(--color-success)' }}>✓ {importFileName}</p>
                )}
              </div>

              {/* Format hints */}
              <div className="p-3 rounded-lg" style={{ background: 'var(--color-bg-surface-hover)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>CSV — первая строка заголовки, разделитель запятая:</p>
                <pre className="text-xs font-mono" style={{ color: 'var(--color-text-quaternary)' }}>
{`email,password,phone
user@mail.com,pass123,+1234567890`}
                </pre>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'var(--color-bg-surface-hover)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>JSON — массив объектов:</p>
                <pre className="text-xs font-mono" style={{ color: 'var(--color-text-quaternary)' }}>
{`[{"email":"user@mail.com","phone":"+1234567890"}]`}
                </pre>
              </div>

              {/* Preview table */}
              {importPreview && importPreview.headers.length > 0 && (
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--color-bg-surface-hover)', borderBottom: '1px solid var(--color-border)' }}>
                          {importPreview.headers.map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.slice(0, 3).map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                            {importPreview.headers.map(h => (
                              <td key={h} className="px-2 py-1.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>{row[h] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Режим:</label>
                <div className="flex gap-2">
                  <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => setImportMode('new')}
                    className="px-3 py-1.5 text-sm rounded-lg transition-colors outline-none"
                    style={{ background: importMode === 'new' ? 'var(--color-brand)' : 'var(--color-bg-surface-hover)', color: importMode === 'new' ? '#fff' : 'var(--color-text-secondary)' }}
                  >Новая таблица</button>
                  <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => setImportMode('append')}
                    className="px-3 py-1.5 text-sm rounded-lg transition-colors outline-none"
                    style={{ background: importMode === 'append' ? 'var(--color-brand)' : 'var(--color-bg-surface-hover)', color: importMode === 'append' ? '#fff' : 'var(--color-text-secondary)' }}
                  >Добавить в {selectedId ? 'выбранную' : 'текущую'}</button>
                </div>
              </div>
            </div>
            <div className="p-4 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setShowImport(false); setImportFile(null); setImportPreview(null); }} className="px-4 py-2 text-base rounded-lg outline-none" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); handleImport(); }} disabled={!importFile || importing}
                className="px-4 py-2 text-base rounded-lg disabled:opacity-30 outline-none"
                style={{ background: 'var(--color-brand)', color: '#fff' }}>
                {importing ? 'Импорт...' : 'Импортировать'}
              </button>
            </div>
          </div>
        </div>
      , portalTarget)}

      {/* Edit modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ background: 'var(--color-overlay)' }} onClick={() => { setEditingId(null); setEditName(''); }}>
          <div className="rounded-xl p-5 w-96 mx-auto" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>Редактировать таблицу</h3>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full px-4 py-2.5 text-base rounded-lg outline-none mb-4"
              style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-primary)', borderRadius: '8px' }}
              autoFocus onKeyDown={e => e.key === 'Enter' && handleUpdate(editingId)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditingId(null); setEditName(''); }} className="px-4 py-2 text-base rounded-lg cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              <button onClick={() => handleUpdate(editingId)} className="px-4 py-2 text-base rounded-lg cursor-pointer" style={{ background: 'var(--color-brand)', color: '#fff' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ background: 'var(--color-overlay)' }} onClick={() => setConfirmDelete(null)}>
          <div className="rounded-xl p-5 w-96 mx-auto" style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }} onClick={e => e.stopPropagation()}>
            <p className="text-base font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Удалить таблицу?</p>
            <p className="text-base mb-4" style={{ color: 'var(--color-text-quaternary)' }}>
              {tables.find(t => t.id === confirmDelete)?.records.length ?? 0} записей будет удалено
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-base rounded-lg cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>Отмена</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-base rounded-lg cursor-pointer" style={{ background: 'var(--color-danger)', color: '#fff' }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu for open in new tab */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-xl border py-2 w-60"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 8px 24px var(--color-overlay)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => handleContextMenuAction(contextMenu.tableId, 'tab')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ExternalLink size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            Открыть в новой вкладке
          </button>
          <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '4px 0' }} />
          <button
            onClick={() => handleContextMenuAction(contextMenu.tableId, 'window')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            Открыть в новом окне
          </button>
        </div>
      )}
    </div>
  );
}
