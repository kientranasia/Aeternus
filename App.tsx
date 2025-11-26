import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Plus, Trash2, Search, FileText, Download, Menu, ChevronLeft, ChevronRight, ChevronDown, 
  PenTool, Clock, Sparkles, MoreHorizontal, Eye, Edit3, Copy, CopyPlus, FolderPlus, 
  Calendar, BrainCircuit, MessageSquare, Maximize2, Minimize2, X, Zap, Layout, Network, 
  Heading1, Heading2, Heading3, List, CheckSquare, Quote, Code, Minus, Bold, Italic, 
  Strikethrough, FilePlus, SplitSquareHorizontal, Columns, HardDrive, AlertCircle, CheckCircle2, Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note, ViewMode, RightSidebarMode, FileSystemDirectoryHandle, FileSystemFileHandle } from './types';
import GraphView from './components/GraphView';
import AiSidebar from './components/AiSidebar';

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const getISODate = () => new Date().toISOString();

const formatDate = (isoString: string) => {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const getStats = (text: string) => {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;
  const readTime = Math.ceil(words / 200);
  return { words, chars, readTime };
};

const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
  const div = document.createElement('div');
  const style = getComputedStyle(element);
  const props = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
    'tabSize', 'MozTabSize'
  ];
  props.forEach((prop) => {
    div.style.setProperty(prop, style.getPropertyValue(prop), style.getPropertyPriority(prop));
  });
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.top = '0';
  div.style.left = '0';
  div.textContent = element.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const { offsetLeft: left, offsetTop: top } = span;
  document.body.removeChild(div);
  return { left, top };
};

const getFilename = (title: string) => {
    // Basic sanitization for filenames
    const safeTitle = title.replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]/gi, '_').toLowerCase() || 'untitled';
    return `${safeTitle}.md`;
};

// --- YAML Frontmatter Helpers ---
const stringifyFrontmatter = (note: Note): string => {
  return `---
id: ${note.id}
title: ${note.title}
created: ${note.createdAt}
updated: ${note.updatedAt}
parentId: ${note.parentId || 'null'}
---
${note.content}`;
};

const parseFrontmatter = (text: string): { meta: Partial<Note>, content: string } => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: text };

  const yaml = match[1];
  const content = match[2];
  const meta: any = {};
  
  yaml.split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest) {
      const val = rest.join(':').trim();
      if (val !== 'null') meta[key.trim()] = val;
      else meta[key.trim()] = null;
    }
  });

  return {
    meta: {
      id: meta.id,
      title: meta.title,
      createdAt: meta.created,
      updatedAt: meta.updated,
      parentId: meta.parentId
    },
    content: content
  };
};

// --- IndexedDB Helper for Persisting Directory Handle ---
const DB_NAME = 'AeternusDB';
const DB_STORE = 'handles';
const DB_KEY = 'vaultHandle';

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            db.createObjectStore(DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const storeHandle = async (handle: FileSystemDirectoryHandle) => {
    const db = await initDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, DB_KEY);
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const getStoredHandle = async (): Promise<FileSystemDirectoryHandle | undefined> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(DB_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

// --- Constants ---
const INITIAL_NOTE_ID = 'manifesto';
const INITIAL_NOTE: Note = {
  id: INITIAL_NOTE_ID,
  title: 'Aeternus Manifesto',
  content: "# Welcome to Aeternus.\n\nThis workspace is designed to outlive you. It is a symbiotic environment where your mind meets machine intelligence.\n\n## The Philosophy\n\n1. **Timelessness**: Plain text. No proprietary locks. \n2. **Symbiosis**: The AI in the right sidebar isn't just a chatbot; it's a second brain layer that analyzes your thoughts as you write.\n3. **Flow**: Toggle **Zen Mode** (top right) to disappear into the work.\n\nType `/` to see the magic commands.\n\n- [ ] Try the slash command\n- [ ] Select text to format",
  createdAt: getISODate(),
  updatedAt: getISODate(),
  parentId: null,
  expanded: true,
  lastSavedTitle: 'Aeternus Manifesto'
};

const SLASH_COMMANDS = [
    { id: 'h1', label: 'Heading 1', icon: Heading1, insert: '# ' },
    { id: 'h2', label: 'Heading 2', icon: Heading2, insert: '## ' },
    { id: 'h3', label: 'Heading 3', icon: Heading3, insert: '### ' },
    { id: 'bullet', label: 'Bullet List', icon: List, insert: '- ' },
    { id: 'todo', label: 'To-do List', icon: CheckSquare, insert: '- [ ] ' },
    { id: 'quote', label: 'Quote', icon: Quote, insert: '> ' },
    { id: 'code', label: 'Code Block', icon: Code, insert: '```\n\n```', offset: 4 },
    { id: 'divider', label: 'Divider', icon: Minus, insert: '---\n' },
    { id: 'new_subnote', label: 'New Sub-note', icon: SplitSquareHorizontal, insert: '' }, 
];

// --- Internal Editor Component ---
interface EditorProps {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>, updateTimestamp?: boolean) => void;
  onNavigate: (title: string) => void;
  onSlashCommand: (action: string) => Note | void;
  onCursorChange?: (pos: number) => void;
  isReadOnly?: boolean;
  notes: Note[];
  autoFocus?: boolean;
}

const Editor: React.FC<EditorProps> = ({ note, onUpdate, onNavigate, onSlashCommand, onCursorChange, isReadOnly = false, notes, autoFocus }) => {
  const [previewMode, setPreviewMode] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  
  // Suggestion State
  const [suggestion, setSuggestion] = useState<{
    isOpen: boolean; top: number; left: number; matchText: string; selectedIndex: number; startPos: number; type: 'wikilink' | 'slash';
  }>({ isOpen: false, top: 0, left: 0, matchText: '', selectedIndex: 0, startPos: 0, type: 'wikilink' });

  // Floating Toolbar State
  const [floatingToolbar, setFloatingToolbar] = useState<{ isOpen: boolean; top: number; left: number; start: number; end: number; }>({ isOpen: false, top: 0, left: 0, start: 0, end: 0 });

  useEffect(() => {
    if (!previewMode && autoFocus && textareaRef.current) {
        textareaRef.current.focus();
    }
  }, [previewMode, autoFocus]);

  // Report cursor changes
  const reportCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      if (onCursorChange) {
          onCursorChange(e.currentTarget.selectionStart);
      }
  };

  const filteredSuggestions = useMemo(() => {
    if (!suggestion.isOpen) return [];
    const term = suggestion.matchText.toLowerCase();
    if (suggestion.type === 'wikilink') {
        return notes
        .filter(n => n.title.toLowerCase().includes(term) && n.id !== note.id)
        .slice(0, 5)
        .map(n => ({ label: n.title, type: 'note', icon: FileText, id: n.id }));
    } else {
        return SLASH_COMMANDS
            .filter(cmd => cmd.label.toLowerCase().includes(term))
            .map(cmd => ({ ...cmd, type: 'command' }));
    }
  }, [notes, suggestion.isOpen, suggestion.matchText, suggestion.type, note.id]);

  const insertSuggestion = (item: any) => {
    const text = note.content;
    const before = text.substring(0, suggestion.startPos);
    let newContent = '';
    let newCursorPos = 0;

    if (item.id === 'new_subnote') {
        const createdNote = onSlashCommand('new_subnote');
        const linkText = createdNote ? `[[${createdNote.title}]]` : '';
        const afterSlash = text.substring(suggestion.startPos + 1 + suggestion.matchText.length);
        newContent = before + linkText + afterSlash; 
        
        onUpdate(note.id, { content: newContent }, true);
        setSuggestion(prev => ({ ...prev, isOpen: false }));
        return;
    }

    if (suggestion.type === 'wikilink') {
        const after = text.substring(suggestion.startPos + 2 + suggestion.matchText.length);
        const closing = after.startsWith(']]') ? after.substring(2) : after;
        newContent = `${before}[[${item.label}]]${closing}`;
        newCursorPos = before.length + 2 + item.label.length + 2;
    } else {
        const after = text.substring(suggestion.startPos + 1 + suggestion.matchText.length);
        const insertText = item.insert;
        newContent = `${before}${insertText}${after}`;
        newCursorPos = before.length + insertText.length - (item.offset || 0);
    }
    
    onUpdate(note.id, { content: newContent }, true);
    setSuggestion(prev => ({ ...prev, isOpen: false }));
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        if (onCursorChange) onCursorChange(newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    reportCursor(e);
    if (suggestion.isOpen && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestion(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % filteredSuggestions.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestion(prev => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + filteredSuggestions.length) % filteredSuggestions.length }));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertSuggestion(filteredSuggestions[suggestion.selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestion(prev => ({ ...prev, isOpen: false }));
        return;
      }
    }

    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter') {
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const val = textarea.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = val.indexOf('\n', start);
      const currentLine = val.substring(lineStart, lineEnd === -1 ? val.length : lineEnd);
      const listRegex = /^(\s*)(-|\*|\d+\.)\s+(\[ \]|\[x\])?(.*)$/;
      const match = currentLine.match(listRegex);
      
      if (match) {
        const indent = match[1];
        const symbol = match[2];
        const checklist = match[3] ? '[ ] ' : '';
        if (!match[4].trim()) {
          e.preventDefault();
          const newVal = val.substring(0, lineStart) + val.substring(lineEnd === -1 ? val.length : lineEnd);
          onUpdate(note.id, { content: newVal }, true);
          setTimeout(() => textarea.setSelectionRange(lineStart, lineStart), 0);
        } else {
          e.preventDefault();
          const prefix = `\n${indent}${symbol} ${checklist}`;
          const newVal = val.substring(0, start) + prefix + val.substring(textarea.selectionEnd);
          onUpdate(note.id, { content: newVal }, true);
          setTimeout(() => textarea.setSelectionRange(start + prefix.length, start + prefix.length), 0);
        }
      }
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onUpdate(note.id, { content: newVal }, false);
    reportCursor(e);

    if (isComposingRef.current) return;

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newVal.substring(0, cursorPos);

    const lastOpenBracket = textBeforeCursor.lastIndexOf('[[');
    if (lastOpenBracket !== -1) {
      const textSinceBracket = textBeforeCursor.substring(lastOpenBracket + 2);
      if (!textSinceBracket.includes(']]') && !textSinceBracket.includes('\n')) {
        const coords = getCaretCoordinates(e.target, lastOpenBracket);
        setSuggestion({
          isOpen: true, top: coords.top - e.target.scrollTop, left: coords.left,
          matchText: textSinceBracket, selectedIndex: 0, startPos: lastOpenBracket, type: 'wikilink'
        });
        return;
      }
    }

    const lastSlash = textBeforeCursor.lastIndexOf('/');
    if (lastSlash !== -1) {
        const charBeforeSlash = textBeforeCursor[lastSlash - 1];
        if (lastSlash === 0 || charBeforeSlash === ' ' || charBeforeSlash === '\n') {
            const textSinceSlash = textBeforeCursor.substring(lastSlash + 1);
            if (!textSinceSlash.includes(' ') && !textSinceSlash.includes('\n')) {
                 const coords = getCaretCoordinates(e.target, lastSlash);
                 setSuggestion({
                    isOpen: true, top: coords.top - e.target.scrollTop, left: coords.left,
                    matchText: textSinceSlash, selectedIndex: 0, startPos: lastSlash, type: 'slash'
                 });
                 return;
            }
        }
    }
    if (suggestion.isOpen) setSuggestion(prev => ({ ...prev, isOpen: false }));
  };

  const handleCheckboxClick = (index: number) => {
    const regex = /- \[([ x])\]/g;
    let match;
    let count = 0;
    let newContent = note.content;
    while ((match = regex.exec(newContent)) !== null) {
        if (count === index) {
            const newVal = match[1] === ' ' ? 'x' : ' ';
            const charIndex = match.index + 3;
            newContent = newContent.substring(0, charIndex) + newVal + newContent.substring(charIndex + 1);
            onUpdate(note.id, { content: newContent }, true);
            break;
        }
        count++;
    }
  };

  const stats = useMemo(() => getStats(note.content), [note.content]);

  return (
    <div className="flex flex-col h-full relative group">
        <div className="px-6 lg:px-12 pt-10 pb-4 shrink-0">
            <input
                type="text"
                value={note.title}
                onChange={(e) => onUpdate(note.id, { title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && setPreviewMode(false)}
                onBlur={() => onUpdate(note.id, {}, true)} // Trigger explicit save on blur of title
                placeholder="Untitled"
                className="w-full text-3xl font-bold font-sans text-zinc-100 placeholder-zinc-700 border-none outline-none bg-transparent mb-1 tracking-tight"
            />
            <div className="flex items-center gap-3 text-[10px] text-zinc-600 font-medium uppercase tracking-wide select-none">
                <span>Created {formatDate(note.createdAt)}</span>
                <span className="text-zinc-700">•</span>
                <span>Updated {formatDate(note.updatedAt)}</span>
            </div>
        </div>

        {floatingToolbar.isOpen && (
            <div 
                className="absolute z-50 bg-[#18181b] border border-[#27272a] shadow-lg rounded-md flex items-center p-1 -mt-12 animate-in fade-in zoom-in-95 duration-200"
                style={{ top: floatingToolbar.top, left: floatingToolbar.left }}
            >
                <span className="text-xs text-zinc-500 px-2">Formatting...</span>
            </div>
        )}

        {suggestion.isOpen && (
            <div 
                className="absolute z-50 bg-[#18181b] border border-[#27272a] shadow-xl rounded-lg overflow-hidden min-w-[200px] flex flex-col ring-1 ring-black/20"
                style={{ top: suggestion.top + 80, left: suggestion.left + 40 }}
            >
                {filteredSuggestions.map((item, idx) => (
                    <button
                        key={idx}
                        onMouseDown={(e) => { e.preventDefault(); insertSuggestion(item); }}
                        className={`px-3 py-2 text-left text-xs w-full transition-colors flex items-center gap-3 ${idx === suggestion.selectedIndex ? 'bg-[#27272a] text-white' : 'text-zinc-400 hover:bg-[#1f1f1f]'}`}
                    >
                        {item.icon && <item.icon size={12} className="text-zinc-500" />}
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar relative px-6 lg:px-12">
            <div className="absolute top-0 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                 <button 
                    onClick={() => setPreviewMode(!previewMode)} 
                    className="p-1.5 bg-[#18181b] border border-[#27272a] text-zinc-400 rounded hover:text-white"
                    title={previewMode ? "Edit (Cmd+Enter)" : "Preview (Cmd+Enter)"}
                >
                    {previewMode ? <Edit3 size={14} /> : <Eye size={14} />}
                </button>
            </div>
            
            {previewMode ? (
                <div 
                    className="prose prose-lg prose-invert max-w-none cursor-text pb-24 prose-headings:font-semibold prose-p:leading-7" 
                    onClick={() => { if(!isReadOnly) { setPreviewMode(false); setTimeout(() => textareaRef.current?.focus(), 10); }}}
                >
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        urlTransform={(url) => url} // Allow wikilink: protocol
                        components={{
                            input: (props) => {
                                if (props.type === 'checkbox') {
                                    return (
                                        <input 
                                            type="checkbox" 
                                            checked={props.checked} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const allChecks = document.querySelectorAll('.prose input[type="checkbox"]');
                                                const myIndex = Array.from(allChecks).indexOf(e.currentTarget);
                                                handleCheckboxClick(myIndex);
                                            }}
                                            className="mt-1 mr-2 cursor-pointer"
                                            readOnly
                                        />
                                    )
                                }
                                return <input {...props} />
                            },
                            a: ({href, children}) => {
                                if (href?.startsWith('wikilink:')) {
                                    const title = decodeURIComponent(href.replace('wikilink:', ''));
                                    return (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onNavigate(title); }}
                                            className="text-blue-400 hover:underline inline-block font-medium"
                                        >
                                            {children}
                                        </button>
                                    );
                                }
                                return <a href={href} className="text-blue-400 hover:underline">{children}</a>;
                            }
                        }}
                    >
                        {note.content.replace(/\[\[(.*?)\]\]/g, (_, p1) => `[${p1}](wikilink:${encodeURIComponent(p1)})`) || '*Click to start writing...*'}
                    </ReactMarkdown>
                </div>
            ) : (
                <textarea
                    ref={textareaRef}
                    value={note.content}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    onKeyUp={reportCursor}
                    onClick={reportCursor}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={(e) => {
                         isComposingRef.current = false;
                         onUpdate(note.id, { content: e.currentTarget.value }, false);
                    }}
                    onBlur={() => onUpdate(note.id, {}, true)} 
                    onSelect={(e) => {
                        reportCursor(e);
                        if (e.currentTarget.selectionStart !== e.currentTarget.selectionEnd) {
                            const coords = getCaretCoordinates(e.currentTarget, e.currentTarget.selectionStart);
                            setFloatingToolbar({ isOpen: true, top: coords.top - e.currentTarget.scrollTop - 40, left: coords.left, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd });
                        } else {
                            setFloatingToolbar(prev => ({ ...prev, isOpen: false }));
                        }
                    }}
                    className="w-full h-full min-h-[50vh] bg-transparent border-none outline-none text-lg text-zinc-300 resize-none font-sans leading-7"
                    placeholder="Type '/' for commands..."
                />
            )}
        </div>
        
        <div className="h-8 border-t border-[#27272a] flex items-center px-6 text-[10px] text-zinc-600 gap-4 shrink-0 uppercase tracking-widest">
            <span>{stats.words} words</span>
            <span>{stats.readTime} min read</span>
        </div>
    </div>
  );
};

export default function App() {
  // --- Global State ---
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('sb-notes');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((n: any) => ({ ...n, expanded: n.expanded ?? true }));
    }
    return [INITIAL_NOTE];
  });
  
  const [activeNoteId, setActiveNoteId] = useState<string | null>(INITIAL_NOTE_ID);
  const [secondaryNoteId, setSecondaryNoteId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  
  // Sidebar States
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarMode, setRightSidebarMode] = useState<RightSidebarMode>('ai');
  const [zenMode, setZenMode] = useState(false);
  
  // Vault / File System State
  const [vaultHandle, setVaultHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Cursor tracking for AI Insert
  const cursorPosRef = useRef<number>(0);
  
  // Persistence (LocalStorage)
  useEffect(() => { localStorage.setItem('sb-notes', JSON.stringify(notes)); }, [notes]);

  // Derived
  const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId]);
  const secondaryNote = useMemo(() => notes.find(n => n.id === secondaryNoteId) || null, [notes, secondaryNoteId]);

  // Reset cursor pos when active note changes
  useEffect(() => {
     cursorPosRef.current = 0;
  }, [activeNoteId]);

  // --- Vault Logic ---
  
  // Attempt to restore vault connection on mount
  useEffect(() => {
    const restoreHandle = async () => {
        try {
            const handle = await getStoredHandle();
            if (handle) {
                // Check for permissions. We can't request them here without user gesture usually,
                // but we can check if we have them.
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    setVaultHandle(handle);
                    loadFromVault(handle);
                } else {
                    // We have a handle but need permission. User needs to click "Connect Vault"
                    // We can set a flag or just let them click the button which will reuse logic
                    setVaultError("Permission needed for previous vault.");
                }
            }
        } catch (e) {
            console.log("No previous vault found or DB error");
        }
    };
    restoreHandle();
  }, []);

  const loadFromVault = async (handle: FileSystemDirectoryHandle) => {
      try {
          const newNotes: Note[] = [];
          // @ts-ignore
          for await (const entry of handle.values()) {
              if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                  const file = await (entry as FileSystemFileHandle).getFile();
                  const text = await file.text();
                  const { meta, content } = parseFrontmatter(text);
                  if (meta.id) {
                      newNotes.push({
                          id: meta.id as string,
                          title: meta.title || entry.name.replace('.md', ''),
                          content: content,
                          createdAt: meta.createdAt || getISODate(),
                          updatedAt: meta.updatedAt || getISODate(),
                          parentId: meta.parentId || null,
                          expanded: true,
                          lastSavedTitle: meta.title || entry.name.replace('.md', '')
                      });
                  }
              }
          }
          
          if (newNotes.length > 0) {
              setNotes(prev => {
                  const combined = [...prev];
                  newNotes.forEach(n => {
                      if (!combined.find(existing => existing.id === n.id)) {
                          combined.push(n);
                      }
                  });
                  return combined;
              });
          }
      } catch (err: any) {
          console.error(err);
          setVaultError(err.message || "Failed to read vault files.");
      }
  };

  const connectVault = async () => {
      try {
          let handle = vaultHandle;
          
          if (!handle) {
             // Try to get from store first in case of permission re-request
             handle = await getStoredHandle() || null;
          }
          
          if (!handle) {
              // @ts-ignore - File System Access API
              handle = await window.showDirectoryPicker();
          }

          if (handle) {
             // Verify permission
             const perm = await handle.requestPermission({ mode: 'readwrite' });
             if (perm !== 'granted') {
                 throw new Error("Permission denied");
             }
             
             await storeHandle(handle); // Persist
             setVaultHandle(handle);
             setVaultError(null);
             await loadFromVault(handle);
          }
      } catch (err: any) {
          console.error(err);
          setVaultError(err.message || "Failed to connect vault.");
      }
  };

  // Internal save function
  const writeFileToDisk = async (note: Note) => {
      if (!vaultHandle) return;
      setIsSaving(true);
      try {
          // Check for rename logic: if lastSavedTitle exists and is different from current title
          if (note.lastSavedTitle && note.lastSavedTitle !== note.title) {
              const oldFilename = getFilename(note.lastSavedTitle);
              try {
                  await vaultHandle.removeEntry(oldFilename);
              } catch (e) {
                  console.log("Old file not found or could not delete:", oldFilename);
              }
          }

          const filename = getFilename(note.title);
          const fileHandle = await vaultHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          const fileContent = stringifyFrontmatter(note);
          await writable.write(fileContent);
          await writable.close();

          // After successful write, update state to reflect that this title is now the saved one
          if (note.lastSavedTitle !== note.title) {
             setNotes(prev => prev.map(n => n.id === note.id ? { ...n, lastSavedTitle: note.title } : n));
          }

      } catch (err) {
          console.error("Failed to save to vault", err);
          setVaultError("Failed to save. Check permissions.");
      } finally {
          // Artificial delay to show the indicator for a moment
          setTimeout(() => setIsSaving(false), 500);
      }
  };

  // Debounced save for content changes
  const saveTimeoutRef = useRef<{[key: string]: NodeJS.Timeout}>({});

  const updateNote = useCallback((id: string, updates: Partial<Note>, forceSave = false) => {
    // 1. Clear any pending debounce immediately to avoid race conditions
    if (saveTimeoutRef.current[id]) clearTimeout(saveTimeoutRef.current[id]);

    setNotes(prev => {
        const noteToUpdate = prev.find(n => n.id === id);
        if (!noteToUpdate) return prev;

        const updatedNote = { 
            ...noteToUpdate, 
            ...updates, 
            updatedAt: getISODate() 
        };

        const titleChanged = updates.title !== undefined && updates.title !== noteToUpdate.title;
        const contentChanged = updates.content !== undefined && updates.content !== noteToUpdate.content;

        // 2. Handle Side Effects (Disk Save)
        if (vaultHandle) {
             // Logic:
             // - If forceSave (Blur/Enter): Write to disk immediately (handles final title change or content save).
             // - If titleChanged (typing): Do NOT write to disk. Wait for blur.
             // - If contentChanged (typing): Debounce write.
             
             if (forceSave) {
                 writeFileToDisk(updatedNote);
             } else if (titleChanged) {
                 // Do nothing. Wait for blur.
                 // The state (updatedNote) updates in UI, but we don't touch disk yet.
             } else if (contentChanged) {
                 saveTimeoutRef.current[id] = setTimeout(() => {
                     writeFileToDisk(updatedNote);
                 }, 1000); // 1 second debounce
             }
        }
        
        // 3. Link Refactoring Logic (only update other notes if we are sure the title is changing)
        // Note: For simplicity, we might update links in other notes immediately in UI, 
        // but typically we should wait for the rename to be "final". 
        // Current implementation updates links immediately in UI, which is fine.
        const shouldRefactorLinks = titleChanged;
        if (shouldRefactorLinks && noteToUpdate.title && updatedNote.title) {
             // ... (This logic updates other notes in `prev`. Returning map result below handles it)
        }

        return prev.map(n => {
            if (n.id === id) return updatedNote;
            
            // Refactor links in other notes
            if (shouldRefactorLinks && noteToUpdate.title && updatedNote.title) {
                const escapedOldTitle = noteToUpdate.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\[\\[${escapedOldTitle}\\]\\]`, 'g');
                
                if (n.content.match(regex)) {
                    const newContent = n.content.replace(regex, `[[${updatedNote.title}]]`);
                    const updatedOtherNote = { ...n, content: newContent, updatedAt: getISODate() };
                    
                    // Trigger save for the affected note too
                    if (vaultHandle) {
                        if (saveTimeoutRef.current[n.id]) clearTimeout(saveTimeoutRef.current[n.id]);
                        saveTimeoutRef.current[n.id] = setTimeout(() => {
                            writeFileToDisk(updatedOtherNote);
                        }, 1000);
                    }
                    return updatedOtherNote;
                }
            }
            return n;
        });
    });
  }, [vaultHandle]);

  const handleInsertAiContent = (text: string) => {
      if (!activeNoteId) return;
      const note = notes.find(n => n.id === activeNoteId);
      if (!note) return;

      const currentContent = note.content;
      const insertPos = cursorPosRef.current;
      
      // Ensure cursor is within bounds (if text shrunk for some reason, though rare)
      const safePos = Math.min(Math.max(0, insertPos), currentContent.length);
      
      const newContent = currentContent.substring(0, safePos) + text + currentContent.substring(safePos);
      
      updateNote(activeNoteId, { content: newContent }, true);
      
      // Advance cursor so next insertion happens after this one
      cursorPosRef.current = safePos + text.length;
  };

  const createNote = (title?: string, parentId: string | null = null, openInSplit = false) => {
    let targetParentId = parentId;
    if (targetParentId) {
        let depth = 0;
        let currentId: string | null | undefined = targetParentId;
        while (currentId) {
            const parent = notes.find(n => n.id === currentId);
            if (parent && parent.parentId) { depth++; currentId = parent.parentId; } else { break; }
        }
        if (depth >= 3) targetParentId = null;
    }

    const titleStr = title || 'Untitled Idea';
    const newNote: Note = {
      id: generateId(),
      title: titleStr,
      content: '',
      createdAt: getISODate(),
      updatedAt: getISODate(),
      parentId: targetParentId,
      expanded: true,
      lastSavedTitle: titleStr // Initialize tracking
    };

    setNotes(prev => {
        let updated = [newNote, ...prev];
        if (targetParentId) {
            updated = updated.map(n => n.id === targetParentId ? { ...n, expanded: true } : n);
        }
        return updated;
    });
    
    if (vaultHandle) writeFileToDisk(newNote); // Create file immediately

    if (openInSplit) {
        setSecondaryNoteId(newNote.id);
        setRightSidebarMode('note');
        setRightSidebarOpen(true);
    } else {
        setActiveNoteId(newNote.id);
    }
    return newNote;
  };

  const handleNavigate = (title: string) => {
      const target = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
      if (target) {
          setActiveNoteId(target.id);
          // Expand parents to ensure visibility in sidebar
          if (target.parentId) {
             setNotes(prev => {
                const parentsToExpand = new Set<string>();
                let currId = target.parentId;
                while (currId) {
                    parentsToExpand.add(currId);
                    const p = prev.find(n => n.id === currId);
                    currId = p ? p.parentId : null;
                }
                if (parentsToExpand.size === 0) return prev;
                return prev.map(n => parentsToExpand.has(n.id) && !n.expanded ? { ...n, expanded: true } : n);
             });
          }
      } else {
          createNote(title);
      }
  };

  const deleteNote = (id: string, e?: React.MouseEvent) => {
      if(e) e.stopPropagation();
      if(window.confirm('Delete this note?')) {
          const noteToDelete = notes.find(n => n.id === id);
          if (noteToDelete && vaultHandle) {
               const filename = getFilename(noteToDelete.title);
               vaultHandle.removeEntry(filename).catch(err => console.error("Failed to delete file", err));
          }

          setNotes(prev => prev.filter(n => n.id !== id && n.parentId !== id));
          if (activeNoteId === id) setActiveNoteId(notes[0]?.id || null);
          if (secondaryNoteId === id) setSecondaryNoteId(null);
      }
  };

  // Render Sidebar Tree
  const renderTree = (parentId: string | null, depth: number = 0) => {
      const items = notes.filter(n => n.parentId === parentId)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      if (!items.length) return null;

      return items.map(note => {
          const hasChildren = notes.some(n => n.parentId === note.id);
          const isActive = activeNoteId === note.id;
          return (
              <div key={note.id}>
                  <div 
                    className={`flex items-center gap-2 px-2 py-1.5 mx-2 rounded-md cursor-pointer group transition-colors ${isActive ? 'bg-[#27272a] text-white' : 'text-zinc-400 hover:bg-[#1f1f1f] hover:text-zinc-200'}`}
                    style={{ paddingLeft: `${depth * 16 + 12}px` }}
                    onClick={() => { setActiveNoteId(note.id); if(window.innerWidth < 768) setLeftSidebarOpen(false); }}
                  >
                      <button 
                        className={`w-4 h-4 flex items-center justify-center rounded hover:bg-zinc-700 ${hasChildren ? 'opacity-100' : 'opacity-0'}`}
                        onClick={(e) => { e.stopPropagation(); updateNote(note.id, { expanded: !note.expanded }); }}
                      >
                          {note.expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                      </button>
                      <span className="truncate text-[13px] flex-1">{note.title || 'Untitled'}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); createNote('', note.id); }} className="p-1 hover:bg-zinc-700 rounded"><Plus size={10}/></button>
                          <button onClick={(e) => deleteNote(note.id, e)} className="p-1 hover:bg-zinc-700 rounded text-red-400"><Trash2 size={10}/></button>
                      </div>
                  </div>
                  {hasChildren && note.expanded && renderTree(note.id, depth + 1)}
              </div>
          )
      });
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-300 font-sans overflow-hidden">
        {/* Left Sidebar */}
        <aside className={`${leftSidebarOpen ? 'w-[260px]' : 'w-0'} bg-[#0c0c0c] border-r border-[#27272a] flex flex-col transition-all duration-300 overflow-hidden`}>
            <div className="h-14 flex items-center px-4 border-b border-[#27272a] shrink-0 font-bold text-xs tracking-widest uppercase text-zinc-500">
                Aeternus
            </div>
            <div className="p-3 space-y-2">
                <button onClick={() => createNote()} className="w-full flex items-center gap-2 px-3 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-white rounded text-xs font-medium transition-colors">
                    <Plus size={14} /> New Note
                </button>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2 text-zinc-500" size={13} />
                    <input 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full bg-[#18181b] border border-[#27272a] rounded py-1.5 pl-8 pr-3 text-xs focus:border-zinc-500 outline-none"
                    />
                </div>
                {/* Vault Connection */}
                <button 
                  onClick={connectVault}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-xs font-medium transition-colors border ${vaultHandle ? 'border-zinc-800 bg-zinc-900 text-zinc-300' : 'border-[#27272a] hover:bg-[#1f1f1f] text-zinc-400'}`}
                >
                    <div className="flex items-center gap-2">
                        <HardDrive size={12} className={vaultHandle ? "text-green-500" : ""} />
                        {vaultHandle ? 'Vault Active' : 'Connect Local'}
                    </div>
                    {isSaving ? <Loader2 size={10} className="animate-spin text-zinc-500"/> : (vaultHandle && <div className="w-2 h-2 rounded-full bg-green-900 border border-green-500"></div>)}
                </button>
                {vaultError && (
                   <div className="flex gap-2 items-center text-[10px] text-red-400 px-1">
                      <AlertCircle size={10} /> <span>{vaultError}</span>
                   </div>
                )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
                {searchQuery ? notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())).map(n => (
                    <div key={n.id} onClick={() => setActiveNoteId(n.id)} className="px-4 py-2 text-xs hover:bg-[#1f1f1f] cursor-pointer text-zinc-400">{n.title}</div>
                )) : renderTree(null)}
            </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
            <header className={`h-14 flex items-center justify-between px-4 border-b border-[#27272a] shrink-0 transition-all ${zenMode ? '-translate-y-full opacity-0' : ''}`}>
                <div className="flex items-center gap-3">
                    <button onClick={() => setLeftSidebarOpen(!leftSidebarOpen)} className="text-zinc-500 hover:text-white"><Menu size={18}/></button>
                    <div className="flex bg-[#18181b] rounded border border-[#27272a] p-0.5">
                        <button onClick={() => setViewMode('editor')} className={`px-3 py-1 text-[11px] font-medium rounded ${viewMode === 'editor' ? 'bg-[#27272a] text-white' : 'text-zinc-500'}`}>Editor</button>
                        <button onClick={() => setViewMode('graph')} className={`px-3 py-1 text-[11px] font-medium rounded ${viewMode === 'graph' ? 'bg-[#27272a] text-white' : 'text-zinc-500'}`}>Graph</button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setZenMode(!zenMode)} className="text-zinc-500 hover:text-white"><Maximize2 size={18}/></button>
                    <div className="h-4 w-px bg-[#27272a]"></div>
                    <button onClick={() => { setRightSidebarMode('ai'); setRightSidebarOpen(true); }} className="text-zinc-500 hover:text-white flex items-center gap-1 text-[11px] font-medium uppercase"><Sparkles size={14}/> AI</button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden relative">
                {zenMode && <button onClick={() => setZenMode(false)} className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black rounded text-white"><Minimize2 size={16}/></button>}
                
                {viewMode === 'graph' ? (
                    <GraphView notes={notes} activeNoteId={activeNoteId} onNodeClick={(id) => { setActiveNoteId(id); setViewMode('editor'); }} />
                ) : (
                    activeNote ? (
                        <Editor 
                            key={activeNote.id} 
                            note={activeNote}
                            notes={notes}
                            onUpdate={updateNote}
                            onNavigate={handleNavigate}
                            onCursorChange={(pos) => cursorPosRef.current = pos}
                            onSlashCommand={(action) => {
                                if (action === 'new_subnote') {
                                    return createNote('', activeNote.id, true);
                                }
                            }}
                            autoFocus
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                            <FileText size={48} strokeWidth={1} className="mb-4 opacity-50" />
                            <p className="font-serif italic">Select or create a thought</p>
                        </div>
                    )
                )}
            </div>
        </main>

        {/* Right Sidebar (Split View or AI) */}
        <aside className={`${rightSidebarOpen ? (rightSidebarMode === 'note' ? 'w-[400px]' : 'w-[300px]') : 'w-0'} bg-[#0c0c0c] border-l border-[#27272a] flex flex-col transition-all duration-300 overflow-hidden`}>
             <div className="h-14 flex items-center justify-between px-4 border-b border-[#27272a] shrink-0">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setRightSidebarMode('ai')}
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${rightSidebarMode === 'ai' ? 'bg-[#27272a] text-white' : 'text-zinc-500'}`}
                    >AI</button>
                    <button 
                        onClick={() => setRightSidebarMode('note')}
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${rightSidebarMode === 'note' ? 'bg-[#27272a] text-white' : 'text-zinc-500'}`}
                    >Split View</button>
                </div>
                <button onClick={() => setRightSidebarOpen(false)} className="text-zinc-500 hover:text-white"><X size={16}/></button>
             </div>

             <div className="flex-1 overflow-y-auto bg-[#0c0c0c] custom-scrollbar h-full">
                {rightSidebarMode === 'ai' ? (
                   <AiSidebar activeNote={activeNote} onInsert={handleInsertAiContent} />
                ) : (
                    secondaryNote ? (
                        <div className="h-full bg-[#0c0c0c]">
                             <Editor 
                                key={secondaryNote.id}
                                note={secondaryNote}
                                notes={notes}
                                onUpdate={updateNote}
                                onNavigate={handleNavigate}
                                onSlashCommand={() => {}} 
                                autoFocus
                             />
                        </div>
                    ) : (
                        <div className="p-6 text-center text-zinc-500 text-sm italic">
                            No secondary note selected. Use "/New Sub-note" to open one here.
                        </div>
                    )
                )}
             </div>
        </aside>
    </div>
  );
}