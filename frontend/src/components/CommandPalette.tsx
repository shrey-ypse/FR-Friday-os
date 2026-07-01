import React, { useState, useEffect, useRef } from 'react';

interface CommandItem {
  key: string;
  label: string;
  description: string;
  icon: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (commandKey: string) => void;
}

const COMMANDS: CommandItem[] = [
  { key: 'workspace', label: '/workspace', description: 'Switch to Google Workspace Node', icon: '🌐' },
  { key: 'generic', label: '/generic', description: 'Switch to Core Generic Chat Node', icon: '✨' },
  { key: 'clear', label: '/clear', description: 'Reset active conversation timeline', icon: '🗑️' },
  { key: 'talk', label: '/talk', description: 'Activate microphone voice input', icon: '🎙️' },
  { key: 'dashboard', label: '/dashboard', description: 'Go to Cockpit Dashboard', icon: '⌗' },
  { key: 'sheets', label: '/sheets', description: 'Go to Google Sheets Viewer', icon: '☷' },
  { key: 'settings', label: '/settings', description: 'Go to System Settings Panel', icon: '⚙' },
  { key: 'automations', label: '/automations', description: 'Go to Background Automations Panel', icon: '✨' },
  { key: 'calendar', label: '/calendar', description: 'Go to Google Calendar Agenda', icon: '🗓️' },
  { key: 'gmail', label: '/gmail', description: 'Go to Gmail Command Inbox', icon: '✉️' },
  { key: 'tasks', label: '/tasks', description: 'Go to Tasks Archive Panel', icon: '✓' },
  { key: 'disconnect', label: '/disconnect', description: 'De-authorize Google Access', icon: '🔒' }
];

export default function CommandPalette({ isOpen, onClose, onExecute }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Let layout settle before focusing
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = COMMANDS.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onExecute(filtered[selectedIndex].key);
        onClose();
      }
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div 
        style={modalStyle} 
        onClick={e => e.stopPropagation()}
        className="glass-panel"
      >
        <div style={headerStyle}>
          <span style={{ fontSize: '14px', marginRight: '8px' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or action (e.g. /workspace)..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={inputStyle}
          />
          <span style={hintStyle}>ESC to exit</span>
        </div>

        <div style={listStyle}>
          {filtered.length > 0 ? (
            filtered.map((cmd, i) => {
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={cmd.key}
                  onClick={() => {
                    onExecute(cmd.key);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    ...itemStyle,
                    backgroundColor: isSelected ? 'rgba(0, 153, 255, 0.08)' : 'transparent',
                    borderColor: isSelected ? 'rgba(0, 153, 255, 0.15)' : 'transparent'
                  }}
                >
                  <span style={iconStyle}>{cmd.icon}</span>
                  <div style={textContainerStyle}>
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: isSelected ? 'var(--color-blue)' : '#fff' 
                    }}>
                      {cmd.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      {cmd.description}
                    </span>
                  </div>
                  {isSelected && (
                    <span style={actionHintStyle}>ENTER</span>
                  )}
                </div>
              );
            })
          ) : (
            <div style={noResultsStyle}>
              No commands matching "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Glassmorphic overlay matching Linear/Raycast cockpit aesthetics
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(5, 5, 8, 0.65)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  zIndex: 9999,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: '100px'
};

const modalStyle: React.CSSProperties = {
  width: '540px',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '360px',
  overflow: 'hidden',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  backgroundColor: 'rgba(10, 12, 20, 0.85)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '16px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  backgroundColor: 'rgba(255, 255, 255, 0.01)'
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: '#fff',
  fontSize: '14px',
  fontFamily: 'var(--font-sans)',
};

const hintStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(255, 255, 255, 0.02)'
};

const listStyle: React.CSSProperties = {
  overflowY: 'auto',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  border: '1px solid transparent'
};

const iconStyle: React.CSSProperties = {
  fontSize: '16px',
  marginRight: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px'
};

const textContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  gap: '2px'
};

const actionHintStyle: React.CSSProperties = {
  fontSize: '8px',
  fontWeight: 700,
  color: 'var(--color-blue)',
  border: '1px solid rgba(0, 153, 255, 0.2)',
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(0, 153, 255, 0.05)',
  letterSpacing: '0.5px'
};

const noResultsStyle: React.CSSProperties = {
  padding: '20px',
  textAlign: 'center',
  fontSize: '13px',
  color: 'var(--color-text-secondary)'
};
