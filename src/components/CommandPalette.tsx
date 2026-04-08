'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  section?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter(cmd => {
    const q = search.toLowerCase();
    return cmd.label.toLowerCase().includes(q) ||
           cmd.shortcut?.toLowerCase().includes(q) ||
           cmd.section?.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault();
      filtered[selectedIdx].action();
      onClose();
    }
  }, [filtered, selectedIdx, onClose]);

  useEffect(() => {
    if (open) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const grouped = filtered.reduce((acc, cmd) => {
    const section = cmd.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="w-[560px] rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-bg-surface)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <input ref={inputRef} value={search} onChange={e => { setSearch(e.target.value); setSelectedIdx(0); }}
          placeholder="Type a command or search..."
          className="w-full px-4 py-3 text-base bg-transparent outline-none border-b"
          style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-border-subtle)' }}
        />
        <div className="max-h-[360px] overflow-y-auto py-2">
          {Object.entries(grouped).map(([section, cmds]) => (
            <div key={section} className="mb-2">
              <div className="px-4 py-1 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-quaternary)' }}>
                {section}
              </div>
              {cmds.map((cmd) => {
                const idx = globalIdx++;
                return (
                  <button key={cmd.id}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                    style={{ background: idx === selectedIdx ? 'var(--color-bg-surface-hover)' : 'transparent' }}
                    onClick={() => { cmd.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'var(--color-bg-surface-hover)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-quaternary)' }}>
              No commands found
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 text-xs border-t" style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-quaternary)' }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
