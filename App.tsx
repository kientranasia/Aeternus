import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Plus, Trash2, Search, FileText, ChevronRight, ChevronDown, 
  Eye, Edit3, Check, Star, Pin, 
  X, Heading1, Heading2, Heading3, List, CheckSquare, Quote, Code, Minus, 
  SplitSquareHorizontal, HardDrive, AlertCircle, Loader2, RefreshCw, Settings, Github, UploadCloud, Palette, Sparkles, FolderOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note, ViewMode, RightSidebarMode, FileSystemDirectoryHandle, FileSystemFileHandle, GitHubConfig, AppTheme } from './types';
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
isFavorite: ${note.isFavorite || false}
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
      if (val === 'true') meta[key.trim()] = true;
      else if (val === 'false') meta[key.trim()] = false;
      else if (val !== 'null') meta[key.trim()] = val;
      else meta[key.trim()] = null;
    }
  });

  return {
    meta: {
      id: meta.id,
      title: meta.title,
      createdAt: meta.created,
      updatedAt: meta.updated,
      parentId: meta.parentId,
      isFavorite: meta.isFavorite
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
  content: `# Aeternus: The Symbiotic Workspace

**Aeternus** is a local-first, AI-native workspace designed for the long term. It blends the longevity of plain text with the capabilities of modern artificial intelligence. It is not just a place to store thoughts, but a place to think *with* a machine partner.

## 🏛 The Philosophy: Built to Last
Unlike cloud-only apps that lock your data away, Aeternus is built on three timeless pillars:

1. **Local & Sovereign**: Your data lives on your device in plain text (Markdown). If Aeternus disappears tomorrow, your ideas remain readable in any text editor.
2. **Symbiotic Intelligence**: AI is not a gimmick here; it is a second brain. It lives in the sidebar, reads what you write in real-time, and helps you connect, summarize, and critique your work.
3. **Minimalist Focus**: The interface recedes so you can enter the flow state.

## ⚡ Current Features
* **Neural Link**: Context-aware AI (Gemini or Local LLMs) that understands your active note.
* **Knowledge Graph**: Visualize the connections between your ideas.
* **Wiki-Links**: Connect thoughts naturally using \`[[Double Brackets]]\`.
* **Split View**: Work on two notes simultaneously.
* **Zen Mode**: Distraction-free writing environment.

---
### 👨‍💻 Contributing
Aeternus is Open Source. We believe tools for thought should belong to the thinkers, not corporations.
`,
  createdAt: getISODate(),
  updatedAt: getISODate(),
  parentId: null,
  expanded: true,
  lastSavedTitle: 'Aeternus Manifesto',
  isFavorite: false
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
  previewMode: boolean;
  onModeChange: (mode: boolean) => void;
}

interface ClickableElementProps {
  children?: React.ReactNode;
  text?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const Editor: React.FC<EditorProps> = ({ note, onUpdate, onNavigate, onSlashCommand, onCursorChange, isReadOnly = false, notes, autoFocus, previewMode, onModeChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  
  // Suggestion State
  const [suggestion, setSuggestion] = useState<{
    isOpen: boolean; top: number; left: number; matchText: string; selectedIndex: number; startPos: number; type: 'wikilink' | 'slash';
  }>({ isOpen: false, top: 0, left: 0, matchText: '', selectedIndex: 0, startPos: 0, type: 'wikilink' });

  // Floating Toolbar State
  const [floatingToolbar, setFloatingToolbar] = useState<{ isOpen: boolean; top: number; left: number; start: number; end: number; }>({ isOpen: false, top: 0, left: 0, start: 0, end: 0 });

  // Cursor Restoration State
  const [restoreCursorPos, setRestoreCursorPos] = useState<number | null>(null);

  useEffect(() => {
    // Handle Cursor Restoration after switching from Preview to Edit
    if (!previewMode && textareaRef.current && restoreCursorPos !== null) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(restoreCursorPos, restoreCursorPos);
        // Try to center the cursor vertically
        const lineHeight = 32; 
        const lines = note.content.substring(0, restoreCursorPos).split('\n').length;
        textareaRef.current.scrollTop = (lines * lineHeight) - (textareaRef.current.clientHeight / 2);
        setRestoreCursorPos(null);
    } else if (!previewMode && autoFocus && textareaRef.current && restoreCursorPos === null) {
        textareaRef.current.focus();
    }
  }, [previewMode, autoFocus, restoreCursorPos, note.content]);

  // Handle click on preview elements to jump to edit position
  const handlePreviewClick = (e: React.MouseEvent, textSegment: string) => {
      if (isReadOnly) return;
      e.stopPropagation();
      
      // Clean up textSegment (remove markdown symbols if simple search fails, but simple search is usually best)
      const cleanSegment = textSegment.trim();
      
      if (cleanSegment.length > 0) {
          const index = note.content.indexOf(cleanSegment);
          if (index !== -1) {
              setRestoreCursorPos(index);
              onModeChange(false);
              return;
          }
      }
      // Fallback
      onModeChange(false);
  };

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

  // Wrapper component to make Markdown elements clickable for edit jump
  const ClickableElement = ({ children, text, className }: ClickableElementProps) => (
      <div 
        onClick={(e) => handlePreviewClick(e, text || '')} 
        className={`${className || ''} cursor-text hover:bg-zinc-800/20 rounded -mx-2 px-2 transition-colors duration-150`}
      >
        {children}
      </div>
  );

  return (
    <div className="flex flex-col h-full relative group font-sans">
        <div className="max-w-3xl mx-auto w-full px-6 lg:px-0 pt-10 pb-4 shrink-0">
            <input
                type="text"
                value={note.title}
                onChange={(e) => onUpdate(note.id, { title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && onModeChange(false)}
                onBlur={() => onUpdate(note.id, {}, true)} 
                placeholder="Untitled"
                className="w-full text-4xl font-bold text-zinc-100 placeholder-zinc-700 border-none outline-none bg-transparent mb-2 tracking-tight leading-tight"
            />
            <div className="flex items-center gap-3 text-[11px] text-zinc-600 font-medium uppercase tracking-wider select-none">
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

        <div className="flex-1 overflow-y-auto custom-scrollbar relative px-6 lg:px-0" onClick={() => { if(!previewMode) textareaRef.current?.focus(); }}>
            <div className="max-w-3xl mx-auto w-full h-full relative">
                {previewMode ? (
                    <div 
                        className="prose prose-lg prose-invert max-w-none pb-48 prose-headings:font-bold prose-p:leading-8 prose-li:leading-7 font-sans" 
                    >
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            urlTransform={(url) => url} 
                            components={{
                                p: ({children}) => {
                                    let text = '';
                                    React.Children.forEach(children, child => {
                                        if (typeof child === 'string') text += child;
                                    });
                                    return <ClickableElement text={text} className="mb-4">{children}</ClickableElement>
                                },
                                h1: ({children}) => <ClickableElement text={children?.toString() || ''} className="text-3xl font-bold mb-4 mt-8">{children}</ClickableElement>,
                                h2: ({children}) => <ClickableElement text={children?.toString() || ''} className="text-2xl font-bold mb-3 mt-8 pb-2 border-b border-zinc-800">{children}</ClickableElement>,
                                h3: ({children}) => <ClickableElement text={children?.toString() || ''} className="text-xl font-bold mb-3 mt-6">{children}</ClickableElement>,
                                li: ({children}) => <li onClick={(e) => handlePreviewClick(e, children?.toString() || '')} className="cursor-text hover:bg-zinc-800/20 rounded px-1 transition-colors">{children}</li>,
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
                                                className="mt-1 mr-2 cursor-pointer appearance-none w-4 h-4 border border-zinc-600 rounded bg-zinc-900 checked:bg-blue-500 checked:border-blue-500 relative"
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
                                                className="text-blue-400 hover:text-blue-300 hover:underline inline-block font-medium transition-colors bg-blue-500/10 px-1 rounded mx-0.5"
                                            >
                                                {children}
                                            </button>
                                        );
                                    }
                                    return <a href={href} className="text-blue-400 hover:underline">{children}</a>;
                                }
                            }}
                        >
                            {note.content.replace(/\[\[(.*?)\]\]/g, (_, p1) => `[${p1}](wikilink:${encodeURIComponent(p1)})`) || '*Click here to start writing...*'}
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
                        className="w-full h-full min-h-[50vh] bg-transparent border-none outline-none text-lg text-zinc-300 resize-none font-sans leading-8 pb-48"
                        placeholder="Type '/' for commands..."
                    />
                )}
            </div>
        </div>
        
        <div className="h-8 flex items-center justify-center text-[10px] text-zinc-600 gap-4 shrink-0 uppercase tracking-widest font-medium opacity-50 hover:opacity-100 transition-opacity mb-2">
            <span>{stats.words} words</span>
            <span className="text-zinc-700">•</span>
            <span>{stats.readTime} min read</span>
            <span className="text-zinc-700">•</span>
            <span className="flex items-center gap-1">Copyright © Kien Tran</span>
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
  
  // Editor Modes
  const [mainPreviewMode, setMainPreviewMode] = useState(true);
  const [secondaryPreviewMode, setSecondaryPreviewMode] = useState(true);

  // Sidebar States
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarMode, setRightSidebarMode] = useState<RightSidebarMode>('ai');
  
  // Sidebar Sections
  const [favSectionOpen, setFavSectionOpen] = useState(true);
  const [docSectionOpen, setDocSectionOpen] = useState(true);
  
  // Vault / File System State
  const [vaultHandle, setVaultHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // App Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'sync' | 'appearance'>('sync');
  const [githubConfig, setGithubConfig] = useState<GitHubConfig>(() => {
      const saved = localStorage.getItem('aeternus-github');
      return saved ? JSON.parse(saved) : { token: '', owner: '', repo: '', branch: 'main', autoSync: false };
  });
  const [appTheme, setAppTheme] = useState<AppTheme>('zinc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Cursor tracking for AI Insert
  const cursorPosRef = useRef<number>(0);
  
  // Persistence (LocalStorage)
  useEffect(() => { localStorage.setItem('sb-notes', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('aeternus-github', JSON.stringify(githubConfig)); }, [githubConfig]);

  // Derived
  const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId]);
  const secondaryNote = useMemo(() => notes.find(n => n.id === secondaryNoteId) || null, [notes, secondaryNoteId]);

  // Reset cursor pos when active note changes
  useEffect(() => {
     cursorPosRef.current = 0;
  }, [activeNoteId]);

  // --- GitHub Logic ---
  const pushToGitHub = async () => {
      if (!githubConfig.token || !githubConfig.owner || !githubConfig.repo || !activeNote) return;
      
      setIsSyncing(true);
      setSyncStatus('idle');
      
      try {
          const path = `${getFilename(activeNote.title)}`;
          const contentEncoded = btoa(unescape(encodeURIComponent(stringifyFrontmatter(activeNote))));
          const url = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${path}`;
          
          let sha = null;
          try {
              const getRes = await fetch(url, {
                  headers: { 'Authorization': `token ${githubConfig.token}` }
              });
              if (getRes.ok) {
                  const data = await getRes.json();
                  sha = data.sha;
              }
          } catch(e) { console.log("File not found, creating new."); }

          const body: any = {
              message: `Update ${activeNote.title} via Aeternus`,
              content: contentEncoded,
              branch: githubConfig.branch || 'main'
          };
          if (sha) body.sha = sha;

          const res = await fetch(url, {
              method: 'PUT',
              headers: {
                  'Authorization': `token ${githubConfig.token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(body)
          });

          if (!res.ok) throw new Error("Failed to push to GitHub");
          setSyncStatus('success');
          setTimeout(() => setSyncStatus('idle'), 3000);
      } catch (e) {
          console.error(e);
          setSyncStatus('error');
      } finally {
          setIsSyncing(false);
      }
  };

  // --- Vault Logic ---
  useEffect(() => {
    const restoreHandle = async () => {
        try {
            const handle = await getStoredHandle();
            if (handle) {
                setVaultHandle(handle); // Set immediately so it's available for user interaction
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    loadFromVault(handle);
                } else {
                    setVaultError("Permission needed.");
                }
            }
        } catch (e) {
            console.log("No previous vault found or DB error");
        }
    };
    restoreHandle();
  }, []);

  const loadFromVault = async (handle: FileSystemDirectoryHandle, replace: boolean = false) => {
      try {
          const newNotes: Note[] = [];
          
          // Recursively read all files
          const getAllFiles = async (dirHandle: FileSystemDirectoryHandle): Promise<FileSystemFileHandle[]> => {
            const files: FileSystemFileHandle[] = [];
            // @ts-ignore
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) {
                    files.push(entry as FileSystemFileHandle);
                } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                    // Recurse into subdirectories
                    try {
                        const subFiles = await getAllFiles(entry as FileSystemDirectoryHandle);
                        files.push(...subFiles);
                    } catch (e) { console.warn("Could not read subdir", entry.name); }
                }
            }
            return files;
          };

          const entries = await getAllFiles(handle);

          // Read files in parallel for better performance
          await Promise.all(entries.map(async (entry) => {
              try {
                  const file = await entry.getFile();
                  const text = await file.text();
                  const { meta, content } = parseFrontmatter(text);
                  
                  // Use ID from frontmatter if available, otherwise fallback to filename
                  const noteId = meta.id || entry.name;
                  const noteTitle = meta.title || entry.name.replace(/\.md$/i, '');

                  newNotes.push({
                      id: noteId as string,
                      title: noteTitle,
                      content: content,
                      createdAt: meta.createdAt || new Date(file.lastModified).toISOString(),
                      updatedAt: meta.updatedAt || new Date(file.lastModified).toISOString(),
                      parentId: meta.parentId || null,
                      expanded: true,
                      lastSavedTitle: noteTitle,
                      isFavorite: meta.isFavorite || false
                  });
              } catch (readErr) {
                  console.warn("Skipping file", entry.name, readErr);
              }
          }));
          
          // Sort by updated time (newest first)
          newNotes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          
          if (replace) {
               // Clear any pending saves from old vault
               Object.values(saveTimeoutRef.current).forEach(clearTimeout);
               saveTimeoutRef.current = {};
               
               if (newNotes.length > 0) {
                  setNotes(newNotes);
                  setActiveNoteId(newNotes[0].id);
              } else {
                  setNotes([INITIAL_NOTE]);
                  setActiveNoteId(INITIAL_NOTE.id);
              }
          } else if (newNotes.length > 0) {
              setNotes(prev => {
                  const combined = [...prev];
                  
                  newNotes.forEach(n => {
                      const existingIndex = combined.findIndex(e => e.id === n.id);
                      if (existingIndex === -1) {
                          // Prevent duplicate visual matches if matched by ID or filename
                          const existingByTitle = combined.findIndex(e => e.title === n.title && !e.parentId);
                          if(existingByTitle !== -1 && !combined[existingByTitle].lastSavedTitle) {
                              // If we have an unsaved in-memory note with same title, merge them roughly
                              // This is a heuristic to prevent duplicates on first connect
                              combined[existingByTitle] = { ...n, id: combined[existingByTitle].id };
                          } else {
                              combined.push(n);
                          }
                      }
                  });
                  
                  return combined.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
              });
          }
      } catch (err: any) {
          console.error(err);
          setVaultError(err.message || "Failed to read vault files.");
      }
  };

  const connectVault = async (forceNew = false) => {
      setIsRefreshing(true);
      try {
          let handle = forceNew ? null : vaultHandle;
          if (!handle && !forceNew) handle = await getStoredHandle() || null;
          
          if (!handle) {
             try {
                // @ts-ignore
                handle = await window.showDirectoryPicker();
             } catch (e: any) {
                 if (e.name === 'AbortError') return; // User cancelled
                 throw e;
             }
          }

          if (handle) {
             const perm = await handle.queryPermission({ mode: 'readwrite' });
             if (perm !== 'granted') {
                 // Trigger permission prompt
                 const request = await handle.requestPermission({ mode: 'readwrite' });
                 if (request !== 'granted') throw new Error("Permission denied");
             }
             
             await storeHandle(handle);
             setVaultHandle(handle);
             setVaultError(null);
             await loadFromVault(handle, forceNew);
          }
      } catch (err: any) {
          console.error(err);
          setVaultError(err.message || "Failed to connect vault.");
      } finally {
          setIsRefreshing(false);
      }
  };

  const handleRefreshVault = async () => {
      if (!vaultHandle) return;
      setIsRefreshing(true);
      await loadFromVault(vaultHandle, false);
      setTimeout(() => setIsRefreshing(false), 500);
  };

  const writeFileToDisk = async (note: Note) => {
      if (!vaultHandle) return;
      setIsSaving(true);
      try {
          if (note.lastSavedTitle && note.lastSavedTitle !== note.title) {
              const oldFilename = getFilename(note.lastSavedTitle);
              try { await vaultHandle.removeEntry(oldFilename); } catch (e) { console.log("Old file not found"); }
          }

          const filename = getFilename(note.title);
          const fileHandle = await vaultHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          const fileContent = stringifyFrontmatter(note);
          await writable.write(fileContent);
          await writable.close();

          if (note.lastSavedTitle !== note.title) {
             setNotes(prev => prev.map(n => n.id === note.id ? { ...n, lastSavedTitle: note.title } : n));
          }

      } catch (err) {
          console.error("Failed to save to vault", err);
          setVaultError("Failed to save. Check permissions.");
      } finally {
          setTimeout(() => setIsSaving(false), 500);
      }
  };

  const saveTimeoutRef = useRef<{[key: string]: ReturnType<typeof setTimeout>}>({});

  const updateNote = useCallback((id: string, updates: Partial<Note>, forceSave = false) => {
    if (saveTimeoutRef.current[id]) clearTimeout(saveTimeoutRef.current[id]);

    setNotes(prev => {
        const noteToUpdate = prev.find(n => n.id === id);
        if (!noteToUpdate) return prev;

        const updatedNote = { ...noteToUpdate, ...updates, updatedAt: getISODate() };
        const titleChanged = updates.title !== undefined && updates.title !== noteToUpdate.title;
        const contentChanged = updates.content !== undefined && updates.content !== noteToUpdate.content;
        const metaChanged = updates.isFavorite !== undefined && updates.isFavorite !== noteToUpdate.isFavorite;

        if (vaultHandle) {
             if (forceSave || metaChanged) {
                 writeFileToDisk(updatedNote);
             } else if (titleChanged) {
                 // Wait for blur
             } else if (contentChanged) {
                 saveTimeoutRef.current[id] = setTimeout(() => writeFileToDisk(updatedNote), 1000);
             }
        }
        
        // Basic link refactoring
        const shouldRefactorLinks = titleChanged;
        return prev.map(n => {
            if (n.id === id) return updatedNote;
            if (shouldRefactorLinks && noteToUpdate.title && updatedNote.title) {
                const escapedOldTitle = noteToUpdate.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\[\\[${escapedOldTitle}\\]\\]`, 'g');
                if (n.content.match(regex)) {
                    const newContent = n.content.replace(regex, `[[${updatedNote.title}]]`);
                    const updatedOtherNote = { ...n, content: newContent, updatedAt: getISODate() };
                    if (vaultHandle) {
                        if (saveTimeoutRef.current[n.id]) clearTimeout(saveTimeoutRef.current[n.id]);
                        saveTimeoutRef.current[n.id] = setTimeout(() => writeFileToDisk(updatedOtherNote), 1000);
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
      
      const newContent = note.content.substring(0, cursorPosRef.current) + text + note.content.substring(cursorPosRef.current);
      updateNote(activeNoteId, { content: newContent }, true);
      cursorPosRef.current += text.length;
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

    // Ensure unique title to prevent file overwrite/duplicate issues
    const baseTitle = title || 'Untitled Idea';
    let uniqueTitle = baseTitle;
    let counter = 1;
    while (notes.some(n => n.title.toLowerCase() === uniqueTitle.toLowerCase())) {
        uniqueTitle = `${baseTitle} ${counter}`;
        counter++;
    }

    const newNote: Note = {
      id: generateId(),
      title: uniqueTitle,
      content: '',
      createdAt: getISODate(),
      updatedAt: getISODate(),
      parentId: targetParentId,
      expanded: true,
      lastSavedTitle: uniqueTitle,
      isFavorite: false
    };

    setNotes(prev => {
        let updated = [newNote, ...prev];
        if (targetParentId) {
            updated = updated.map(n => n.id === targetParentId ? { ...n, expanded: true } : n);
        }
        return updated;
    });
    
    if (vaultHandle) writeFileToDisk(newNote);

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
          // Auto-expand
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
      }
  };

  // Render Sidebar Tree
  const renderTree = (items: Note[], depth: number = 0) => {
      if (!items.length) return null;

      return items.map(note => {
          const children = notes.filter(n => n.parentId === note.id);
          const hasChildren = children.length > 0;
          const isActive = activeNoteId === note.id;
          return (
              <div key={note.id}>
                  <div 
                    className={`flex items-center gap-2 pr-3 py-1.5 cursor-pointer group transition-all duration-200 select-none relative ${isActive ? 'bg-[#18181b] text-zinc-100' : 'text-zinc-500 hover:bg-[#18181b] hover:text-zinc-300'}`}
                    style={{ paddingLeft: `${depth * 12 + 20}px` }}
                    onClick={() => { setActiveNoteId(note.id); if(window.innerWidth < 768) setLeftSidebarOpen(false); }}
                  >
                      {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500"></div>}
                      <button 
                        className={`w-4 h-4 flex items-center justify-center rounded hover:bg-zinc-700/50 ${hasChildren ? 'opacity-100' : 'opacity-0'}`}
                        onClick={(e) => { e.stopPropagation(); updateNote(note.id, { expanded: !note.expanded }); }}
                      >
                          {note.expanded ? <ChevronDown size={12} className="opacity-80"/> : <ChevronRight size={12} className="opacity-80"/>}
                      </button>
                      <span className="truncate text-sm flex-1 font-medium">{note.title || 'Untitled'}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                           <button onClick={(e) => { e.stopPropagation(); updateNote(note.id, { isFavorite: !note.isFavorite }); }} className={`p-1 hover:bg-zinc-700 rounded transition-colors ${note.isFavorite ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}`} title={note.isFavorite ? "Unpin" : "Pin"}>
                              <Pin size={11} className={note.isFavorite ? "fill-amber-400" : ""}/>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); createNote('', note.id); }} className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white transition-colors" title="Add Sub-note"><Plus size={11}/></button>
                          <button onClick={(e) => deleteNote(note.id, e)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={11}/></button>
                      </div>
                  </div>
                  {hasChildren && note.expanded && renderTree(children, depth + 1)}
              </div>
          )
      });
  };

  const isPermissionError = vaultError && vaultError.toLowerCase().includes('permission');
  
  const favNotes = notes.filter(n => n.isFavorite);
  
  // Robust Root Calculation: Includes standard roots AND orphans (notes pointing to missing parents)
  const rootNotes = useMemo(() => {
      const allIds = new Set(notes.map(n => n.id));
      return notes.filter(n => !n.parentId || !allIds.has(n.parentId));
  }, [notes]);

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-300 font-sans overflow-hidden">
        
        {/* Settings Modal */}
        {showSettings && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#121215] border border-[#27272a] rounded-xl w-full max-w-2xl h-[500px] flex shadow-2xl overflow-hidden ring-1 ring-white/10">
                    <div className="w-48 border-r border-[#27272a] bg-[#0c0c0c] flex flex-col p-2 gap-1">
                         <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 p-3 mb-2">Settings</div>
                         <button onClick={() => setActiveSettingsTab('sync')} className={`px-3 py-2 rounded text-xs text-left font-medium transition-all ${activeSettingsTab === 'sync' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]'}`}>Sync & Backup</button>
                         <button onClick={() => setActiveSettingsTab('appearance')} className={`px-3 py-2 rounded text-xs text-left font-medium transition-all ${activeSettingsTab === 'appearance' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]'}`}>Appearance</button>
                         <button onClick={() => setActiveSettingsTab('general')} className={`px-3 py-2 rounded text-xs text-left font-medium transition-all ${activeSettingsTab === 'general' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]'}`}>Community</button>
                    </div>
                    <div className="flex-1 p-8 relative overflow-y-auto custom-scrollbar">
                         <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 p-1 hover:bg-[#27272a] rounded text-zinc-500 hover:text-white transition-colors"><X size={16}/></button>
                         
                         {activeSettingsTab === 'sync' && (
                             <div className="space-y-6">
                                 <div>
                                     <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2"><Github size={18}/> GitHub Sync</h2>
                                     <p className="text-xs text-zinc-500">Backup your current active note.</p>
                                 </div>
                                 <div className="space-y-4">
                                     <div>
                                         <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1.5">Personal Access Token</label>
                                         <input type="password" value={githubConfig.token} onChange={e => setGithubConfig(c => ({...c, token: e.target.value}))} className="w-full bg-[#18181b] border border-[#27272a] rounded px-3 py-2 text-sm focus:border-zinc-500 outline-none transition-colors" placeholder="ghp_..." />
                                     </div>
                                     <div className="flex gap-4">
                                         <div className="flex-1">
                                             <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1.5">Owner</label>
                                             <input value={githubConfig.owner} onChange={e => setGithubConfig(c => ({...c, owner: e.target.value}))} className="w-full bg-[#18181b] border border-[#27272a] rounded px-3 py-2 text-sm focus:border-zinc-500 outline-none transition-colors" placeholder="username" />
                                         </div>
                                         <div className="flex-1">
                                             <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1.5">Repository</label>
                                             <input value={githubConfig.repo} onChange={e => setGithubConfig(c => ({...c, repo: e.target.value}))} className="w-full bg-[#18181b] border border-[#27272a] rounded px-3 py-2 text-sm focus:border-zinc-500 outline-none transition-colors" placeholder="my-notes" />
                                         </div>
                                     </div>
                                 </div>
                                 <div className="pt-6 border-t border-[#27272a] flex items-center justify-between">
                                     <div className="flex items-center gap-2">
                                         {syncStatus === 'success' && <span className="text-emerald-500 text-xs font-medium flex items-center gap-1"><Check size={12}/> Pushed Successfully</span>}
                                         {syncStatus === 'error' && <span className="text-red-500 text-xs font-medium flex items-center gap-1"><AlertCircle size={12}/> Sync Failed</span>}
                                     </div>
                                     <button onClick={pushToGitHub} disabled={isSyncing || !activeNote} className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-900 rounded-md text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-white/5">
                                         {isSyncing ? <Loader2 size={14} className="animate-spin"/> : <UploadCloud size={14}/>} Push Active Note
                                     </button>
                                 </div>
                             </div>
                         )}
                    </div>
                </div>
            </div>
        )}

        {/* Left Sidebar */}
        <aside className={`${leftSidebarOpen ? 'w-[260px]' : 'w-0'} bg-[#0c0c0c] border-r border-[#27272a] flex flex-col transition-all duration-300 overflow-hidden`}>
            <div className="h-14 flex items-center px-5 border-b border-[#27272a] shrink-0 font-bold text-xs tracking-widest uppercase text-zinc-500 select-none">
                Aeternus
            </div>
            <div className="p-4 space-y-3">
                <button onClick={() => createNote()} className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-white text-zinc-900 rounded text-xs font-bold transition-all shadow hover:shadow-md group">
                    <Sparkles size={14} className="text-amber-500 fill-amber-500 group-hover:scale-110 transition-transform"/> Capture Idea
                </button>
                <div className="relative group">
                    <Search className="absolute left-2.5 top-2 text-zinc-500 group-focus-within:text-zinc-300 transition-colors" size={13} />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-[#18181b] border border-[#27272a] rounded py-1.5 pl-8 pr-3 text-xs focus:border-zinc-500 outline-none transition-colors placeholder-zinc-600 text-zinc-300" />
                </div>
                <div className="flex items-center gap-2">
                    <button 
                      onClick={() => connectVault(false)}
                      className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded text-xs font-medium transition-colors border ${isPermissionError ? 'border-amber-700/50 bg-amber-900/20 text-amber-500 hover:bg-amber-900/30' : (vaultHandle ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400' : 'border-[#27272a] hover:bg-[#1f1f1f] text-zinc-400')}`}
                    >
                        <div className="flex items-center gap-2">
                            {isPermissionError ? <RefreshCw size={12}/> : <HardDrive size={12} className={vaultHandle ? "text-green-500" : ""} />}
                            {isPermissionError ? 'Verify Access' : (vaultHandle ? 'Vault Active' : 'Connect Local')}
                        </div>
                        {(isSaving || isRefreshing) ? <Loader2 size={10} className="animate-spin text-zinc-500"/> : (vaultHandle && !isPermissionError && <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]"></div>)}
                    </button>
                    {vaultHandle && (
                        <>
                            <button 
                                onClick={handleRefreshVault}
                                className="px-2 py-2 rounded text-zinc-500 hover:text-white hover:bg-[#1f1f1f] border border-transparent hover:border-[#27272a] transition-all"
                                title="Refresh Files"
                            >
                                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""}/>
                            </button>
                            <button 
                                onClick={() => connectVault(true)} 
                                className="px-2 py-2 rounded text-zinc-500 hover:text-white hover:bg-[#1f1f1f] border border-transparent hover:border-[#27272a] transition-all"
                                title="Change Folder Location"
                            >
                                <FolderOpen size={14}/>
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-0 space-y-4">
                {searchQuery ? notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())).map(n => (
                    <div key={n.id} onClick={() => setActiveNoteId(n.id)} className="px-5 py-2 text-xs hover:bg-[#1f1f1f] cursor-pointer text-zinc-400">{n.title}</div>
                )) : (
                   <>
                       {/* Favorites Section */}
                       {favNotes.length > 0 && (
                           <div className="mb-2">
                               <div onClick={() => setFavSectionOpen(!favSectionOpen)} className="flex items-center gap-2 px-5 py-1 text-[10px] font-bold uppercase text-zinc-500 cursor-pointer hover:text-zinc-300 select-none">
                                   <Star size={10} className={favNotes.length > 0 ? "text-amber-500 fill-amber-500" : ""} />
                                   <span>Favorites</span>
                                   {favSectionOpen ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                               </div>
                               {favSectionOpen && (
                                   <div className="mt-1 space-y-0.5">
                                       {favNotes.map(n => (
                                           <div key={`fav-${n.id}`} onClick={() => setActiveNoteId(n.id)} className={`flex items-center gap-2 px-5 py-1.5 cursor-pointer text-xs ${activeNoteId === n.id ? 'bg-[#18181b] text-zinc-100' : 'text-zinc-500 hover:bg-[#18181b] hover:text-zinc-300'}`}>
                                                <Pin size={10} className="text-amber-500 fill-amber-500 shrink-0"/>
                                                <span className="truncate">{n.title}</span>
                                           </div>
                                       ))}
                                   </div>
                               )}
                           </div>
                       )}

                       {/* Documents Section */}
                       <div>
                           <div onClick={() => setDocSectionOpen(!docSectionOpen)} className="flex items-center gap-2 px-5 py-1 text-[10px] font-bold uppercase text-zinc-500 cursor-pointer hover:text-zinc-300 select-none">
                               <FileText size={10} />
                               <span>Documents</span>
                               {!docSectionOpen ? <ChevronRight size={10}/> : <ChevronDown size={10}/>}
                           </div>
                           {docSectionOpen && (
                               <div className="mt-1">
                                   {renderTree(rootNotes)}
                                   {rootNotes.length === 0 && (
                                       <div className="px-6 py-2 text-[10px] text-zinc-600 italic">No documents found.</div>
                                   )}
                               </div>
                           )}
                       </div>
                   </>
                )}
            </div>
            
            <div className="p-3 border-t border-[#27272a] bg-[#0c0c0c] flex items-center justify-between">
                <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-500 hover:text-white hover:bg-[#18181b] rounded transition-colors"><Settings size={16}/></button>
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col relative h-full bg-[#09090b] transition-all duration-300">
             <header className="h-14 border-b border-[#27272a] flex items-center justify-between px-4 shrink-0 bg-[#09090b]/80 backdrop-blur-sm z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => setLeftSidebarOpen(!leftSidebarOpen)} className="p-2 hover:bg-[#18181b] rounded text-zinc-500 hover:text-white transition-colors">
                        {leftSidebarOpen ? <ChevronRight size={18}/> : <ChevronRight size={18} className="rotate-180"/>}
                    </button>
                    <div className="h-4 w-px bg-[#27272a]"></div>
                    <div className="flex items-center gap-1 bg-[#18181b] p-0.5 rounded-md border border-[#27272a]">
                        <button onClick={() => setViewMode('editor')} className={`px-3 py-1 rounded text-xs font-medium transition-all ${viewMode === 'editor' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>Editor</button>
                        <button onClick={() => setViewMode('graph')} className={`px-3 py-1 rounded text-xs font-medium transition-all ${viewMode === 'graph' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>Graph</button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {viewMode === 'editor' && (
                        <button 
                            onClick={() => setMainPreviewMode(!mainPreviewMode)}
                            className={`p-2 rounded transition-colors ${!mainPreviewMode ? 'bg-[#18181b] text-white border border-[#27272a]' : 'text-zinc-500 hover:text-white hover:bg-[#18181b]'}`}
                            title={mainPreviewMode ? "Switch to Edit Mode" : "Switch to Reading Mode"}
                        >
                            {mainPreviewMode ? <Eye size={18} /> : <Edit3 size={18} />}
                        </button>
                    )}
                    <button onClick={() => { setRightSidebarOpen(!rightSidebarOpen); setRightSidebarMode('ai'); }} className={`p-2 rounded transition-colors ${rightSidebarOpen && rightSidebarMode === 'ai' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-500 hover:text-white hover:bg-[#18181b]'}`}>
                        <Sparkles size={18} />
                    </button>
                </div>
            </header>

            <div className="flex-1 relative overflow-hidden flex">
                {/* Primary Editor/Graph */}
                <div className="flex-1 h-full overflow-hidden relative">
                    {viewMode === 'graph' ? (
                        <GraphView notes={notes} activeNoteId={activeNoteId} onNodeClick={setActiveNoteId} />
                    ) : (
                        activeNote ? (
                             <Editor 
                                note={activeNote} 
                                onUpdate={updateNote} 
                                onNavigate={handleNavigate} 
                                onSlashCommand={(action) => action === 'new_subnote' ? createNote(undefined, activeNoteId) : undefined}
                                onCursorChange={(pos) => cursorPosRef.current = pos}
                                notes={notes}
                                autoFocus={true}
                                previewMode={mainPreviewMode}
                                onModeChange={setMainPreviewMode}
                             />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                                <p className="text-sm">Select a note to start writing</p>
                            </div>
                        )
                    )}
                </div>

                {/* Split View Secondary Note */}
                {secondaryNoteId && rightSidebarMode === 'note' && (
                    <div className="w-1/2 border-l border-[#27272a] bg-[#0c0c0c] flex flex-col h-full relative z-10 shadow-2xl">
                        <div className="h-10 border-b border-[#27272a] flex items-center justify-between px-4 bg-[#121215]">
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider truncate">{secondaryNote?.title}</span>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setSecondaryPreviewMode(!secondaryPreviewMode)}
                                    className="text-zinc-500 hover:text-white"
                                    title={secondaryPreviewMode ? "Edit" : "Read"}
                                >
                                    {secondaryPreviewMode ? <Eye size={14}/> : <Edit3 size={14}/>}
                                </button>
                                <button onClick={() => setSecondaryNoteId(null)} className="text-zinc-500 hover:text-white"><X size={14}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {secondaryNote ? (
                                <Editor 
                                    note={secondaryNote} 
                                    onUpdate={updateNote} 
                                    onNavigate={handleNavigate} 
                                    onSlashCommand={() => {}}
                                    notes={notes}
                                    previewMode={secondaryPreviewMode}
                                    onModeChange={setSecondaryPreviewMode}
                                />
                            ) : <div className="p-10 text-zinc-500 text-center text-sm">Note not found</div>}
                        </div>
                    </div>
                )}
            </div>
        </main>

        {/* Right Sidebar (AI) */}
        <aside className={`${rightSidebarOpen && rightSidebarMode === 'ai' ? 'w-[350px]' : 'w-0'} bg-[#0c0c0c] border-l border-[#27272a] transition-all duration-300 overflow-hidden flex flex-col`}>
             <AiSidebar activeNote={activeNote} allNotes={notes} onInsert={handleInsertAiContent} />
        </aside>

    </div>
  );
}