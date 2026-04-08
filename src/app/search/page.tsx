'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ArrowUpRight, Clock, ExternalLink, ChevronDown } from 'lucide-react';

interface SearchResult {
  tableId: string;
  tableName: string;
  recordId: string;
  recordData: Record<string, string | null>;
  matchedColumns: string[];
  snippets: Record<string, string | null>;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Load recent searches
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tm-recent-searches') || '[]');
      setRecentSearches(saved.slice(0, 8));
    } catch {}
  }, []);

  // Get query from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    const tf = params.get('table') || '';
    setQuery(q);
    if (tf) setTableFilter(tf);
    if (q) doSearch(q);
  }, []);

  const saveRecent = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 8);
    setRecentSearches(updated);
    localStorage.setItem('tm-recent-searches', JSON.stringify(updated));
  };

  const doSearch = (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }
    setSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const url = `/api/search?q=${encodeURIComponent(q)}&limit=100${tableFilter ? `&tableId=${tableFilter}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        setResults(data.results);
        setTotal(data.total);
        saveRecent(q);
      } catch {}
      setSearching(false);
    }, 250);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelectedIndex(-1);
    doSearch(val);
    // Update URL
    const url = new URL(window.location.href);
    if (val) url.searchParams.set('q', val);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  };

  // Keyboard navigation (arrow keys, Enter)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const r = results[selectedIndex];
      openResult(r, false);
    }
  }, [results, selectedIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const openResult = (r: SearchResult, newTab: boolean) => {
    const url = `/?table=${r.tableId}&record=${r.recordId}`;
    if (newTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  const highlightText = (text: string | null, q: string) => {
    if (!text) return <span style={{ color: 'var(--color-text-quaternary)' }}>—</span>;
    const parts = text.split(/\*\*(.+?)\*\*/);
    return (
      <span>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <mark key={i} style={{ background: '#FEF08A', color: '#1A1A1A', padding: '0 2px', borderRadius: '2px' }}>
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  const tableCount = useMemo(() => {
    const ids = new Set(results.map(r => r.tableId));
    return ids.size;
  }, [results]);

  // Таблицы с результатами — только те, где есть совпадения
  const matchingTables = useMemo(() => {
    const seen = new Map<string, string>();
    results.forEach(r => seen.set(r.tableId, r.tableName));
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [results]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => window.location.href = '/'}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--color-bg-surface-hover)]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          ← Назад
        </button>
        <h1 className="text-xl font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Поиск по всем таблицам
        </h1>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-3" style={{ color: 'var(--color-text-quaternary)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onFocus={() => recentSearches.length > 0 && setShowRecent(true)}
          onBlur={() => setTimeout(() => setShowRecent(false), 200)}
          placeholder="Введите запрос..."
          className="w-full pl-9 pr-12 py-2.5 text-base rounded-xl outline-none"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
          autoFocus
        />
        {query && (
          <button onClick={() => handleQueryChange('')}
            className="absolute right-3 top-2.5 p-0.5 rounded hover:bg-[var(--color-bg-surface-hover)]"
            style={{ color: 'var(--color-text-quaternary)' }}
          >
            <X size={16} />
          </button>
        )}
        {/* Recent searches dropdown */}
        {showRecent && recentSearches.length > 0 && portalTarget && createPortal(
          <div className="absolute top-full left-0 mt-1 w-full rounded-xl border z-50 overflow-hidden"
            style={{ background: 'var(--color-bg-surface)', boxShadow: '0 8px 32px var(--color-overlay)' }}
          >
            <div className="p-2" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="text-xs font-medium px-2 py-1" style={{ color: 'var(--color-text-quaternary)' }}>Недавние</span>
            </div>
            {recentSearches.map((s, i) => (
              <button key={i}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--color-bg-surface-hover)]"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { handleQueryChange(s); setShowRecent(false); }}
              >
                <Clock size={14} style={{ color: 'var(--color-text-quaternary)' }} />
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s}</span>
              </button>
            ))}
          </div>,
          portalTarget
        )}
      </div>

      {/* Table filter — только таблицы с результатами */}
      {matchingTables.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Таблица:</span>
          <div className="relative">
            <select value={tableFilter} onChange={e => { setTableFilter(e.target.value); doSearch(query); }}
              className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg outline-none cursor-pointer"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                color: tableFilter ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              }}
            >
              <option value="">Все ({matchingTables.length})</option>
              {matchingTables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-2 pointer-events-none" style={{ color: 'var(--color-text-quaternary)' }} />
          </div>
        </div>
      )}

      {/* Results */}
      {searching ? (
        <div className="text-center py-16">
          <span className="text-base" style={{ color: 'var(--color-text-tertiary)' }}>Поиск...</span>
        </div>
      ) : query && results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-base mb-1" style={{ color: 'var(--color-text-secondary)' }}>Ничего не найдено</p>
          <p className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>Попробуйте другой запрос</p>
        </div>
      ) : results.length > 0 ? (
        <>
          {/* Count */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Найдено {total} {total === 1 ? 'результат' : total < 5 ? 'результата' : 'результатов'}
              {tableCount > 1 ? ` в ${tableCount} ${tableCount === 1 ? 'таблице' : tableCount < 5 ? 'таблицах' : 'таблицах'}` : ''}
            </span>
          </div>

          {/* Results list */}
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={`${r.tableId}-${r.recordId}-${i}`}
                className={`rounded-xl border p-4 transition-colors cursor-pointer ${i === selectedIndex ? 'ring-2 ring-[var(--color-brand)]' : ''}`}
                style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
                onClick={() => openResult(r, false)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: 'var(--color-brand)', color: '#fff' }}>
                      {r.tableName}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-quaternary)' }}>
                      Запись #{r.recordId}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); openResult(r, true); }}
                      className="p-1 rounded hover:bg-[var(--color-bg-surface-hover)]"
                      style={{ color: 'var(--color-text-quaternary)' }}
                      title="Открыть в новой вкладке"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <ArrowUpRight size={14} style={{ color: 'var(--color-text-quaternary)' }} />
                  </div>
                </div>

                {/* Snippets */}
                {r.matchedColumns.length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(r.snippets).slice(0, 3).map(([colName, snippet]) => (
                      <div key={colName} className="text-sm flex gap-2">
                        <span className="font-medium shrink-0" style={{ color: 'var(--color-text-tertiary)', minWidth: 100 }}>
                          {colName}:
                        </span>
                        <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono), monospace', fontSize: 13 }}>
                          {highlightText(snippet, query)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Matched columns */}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {r.matchedColumns.slice(0, 5).map(col => (
                    <span key={col} className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-quaternary)' }}>
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {total > 100 && (
            <div className="text-center mt-4 py-3">
              <span className="text-sm" style={{ color: 'var(--color-text-quaternary)' }}>
                Показано 100 из {total} результатов. Уточните запрос.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16">
          <Search size={48} className="mx-auto mb-4" style={{ color: 'var(--color-border)' }} />
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>Введите запрос для поиска</p>
        </div>
      )}
    </div>
  );
}
