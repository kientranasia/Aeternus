import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Eraser, Bot, User, Loader2, Copy, Check, ArrowLeftFromLine, AlertTriangle, Terminal, Settings, X, Server, Database, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { Note } from '../types';

interface AiSidebarProps {
  activeNote: Note | null;
  allNotes: Note[]; // RAG: Need access to all notes
  onInsert: (text: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  contextUsed?: string[]; // IDs of notes used for RAG
}

interface AiSettings {
    provider: 'gemini' | 'custom';
    customUrl: string;
    customKey: string;
    customModel: string;
}

const DEFAULT_SETTINGS: AiSettings = {
    provider: 'gemini',
    customUrl: 'http://localhost:11434/v1/chat/completions',
    customKey: '',
    customModel: 'llama3'
};

const PRESETS = {
    openai: {
        name: 'OpenAI (GPT-4)',
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o'
    },
    ollama: {
        name: 'Ollama (Local)',
        url: 'http://localhost:11434/v1/chat/completions',
        model: 'llama3'
    },
    lmstudio: {
        name: 'LM Studio',
        url: 'http://localhost:1234/v1/chat/completions',
        model: 'local-model'
    }
};

const AiSidebar: React.FC<AiSidebarProps> = ({ activeNote, allNotes, onInsert }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(() => {
      const saved = localStorage.getItem('aeternus-ai-settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    localStorage.setItem('aeternus-ai-settings', JSON.stringify(settings));
  }, [settings]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    // Only check for key if we are in Gemini mode
    const key = process.env.API_KEY;
    if (!key && settings.provider === 'gemini') {
        setMessages([{
            id: 'system-auth',
            role: 'model',
            text: "### 🔌 Setup Required\n\nTo connect Aeternus to Google AI locally:\n\n1.  Get an API Key from [Google AI Studio](https://aistudio.google.com/)\n2.  Create a `.env` file in your project root\n3.  Add: `API_KEY=your_key_here`\n4.  Restart your server."
        }]);
    }
  }, [settings.provider]);

  // --- RAG Logic (Simple Keyword Matching) ---
  const retrieveRelevantNotes = (query: string): Note[] => {
      if (!query) return [];
      
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3); // Filter short words
      if (keywords.length === 0) return [];

      const scores = allNotes
        .filter(n => n.id !== activeNote?.id) // Exclude active note (already in context)
        .map(note => {
          let score = 0;
          const title = note.title.toLowerCase();
          const content = note.content.toLowerCase();
          
          keywords.forEach(word => {
              if (title.includes(word)) score += 5; // Title match worth more
              if (content.includes(word)) score += 1;
          });
          
          return { note, score };
        });
      
      return scores
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3) // Top 3 relevant notes
          .map(s => s.note);
  };

  // --- Gemini Logic ---
  const callGemini = async (fullPrompt: string, onChunk: (text: string) => void) => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
      });
      for await (const chunk of response) {
        if (chunk.text) {
          onChunk(chunk.text);
        }
      }
  };

  // --- Custom / Local LLM Logic (OpenAI Compatible) ---
  const callCustomAI = async (messagesHistory: Message[], newPrompt: string, systemContext: string, onChunk: (text: string) => void) => {
      const apiMessages = [
          { role: 'system', content: systemContext },
          ...messagesHistory.filter(m => m.id !== 'system-auth').map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
          { role: 'user', content: newPrompt }
      ];

      try {
          const res = await fetch(settings.customUrl, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${settings.customKey || 'sk-dummy'}` // Some local servers need a dummy key
              },
              body: JSON.stringify({
                  model: settings.customModel,
                  messages: apiMessages,
                  stream: true
              })
          });

          if (!res.ok) throw new Error(`Server Error: ${res.status} ${res.statusText}`);
          if (!res.body) throw new Error("No response body");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  if (trimmed.startsWith('data: ')) {
                      try {
                          const json = JSON.parse(trimmed.slice(6));
                          const content = json.choices?.[0]?.delta?.content;
                          if (content) onChunk(content);
                      } catch (e) {
                          console.warn("Failed to parse SSE JSON", trimmed);
                      }
                  }
              }
          }
      } catch (e: any) {
          throw new Error(`Local AI connection failed. Ensure CORS is allowed (OLLAMA_ORIGINS="*"). \n\nDetails: ${e.message}`);
      }
  };

  const generateResponse = async (promptText: string) => {
    if (isLoading) return;

    // 1. RAG Step: Find relevant notes
    const relevantNotes = retrieveRelevantNotes(promptText);
    const relevantNoteIds = relevantNotes.map(n => n.id);
    const contextSnippet = relevantNotes.map(n => `Title: ${n.title}\nContent Snippet: ${n.content.slice(0, 300)}...`).join('\n---\n');

    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: promptText }]);
    setInput('');
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: '', contextUsed: relevantNoteIds.length > 0 ? relevantNotes.map(n => n.title) : undefined }]);

    let fullResponse = '';
    const updateResponse = (chunk: string) => {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullResponse } : m));
    };

    try {
      let systemContext = "You are Aeternus, an intelligent interface for the user's second brain. You are helpful, concise, and philosophical. You prefer using Markdown for formatting.";
      
      if (activeNote) {
        systemContext += `\n\n[CURRENT ACTIVE NOTE]\nTitle: ${activeNote.title}\nContent:\n${activeNote.content}\n[END ACTIVE NOTE]`;
      } else {
        systemContext += "\n\nThere is currently no active note selected.";
      }

      if (contextSnippet) {
          systemContext += `\n\n[RELEVANT NOTES FROM VAULT]\nThe following notes might be related to the user's query:\n${contextSnippet}\n[END RELEVANT NOTES]`;
      }
      
      systemContext += "\n\nAnswer based on the context above if relevant.";

      if (settings.provider === 'gemini') {
          const historyText = messages.slice(-6).filter(m => m.id !== 'system-auth').map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
          const fullPrompt = `${systemContext}\n\n[CONVERSATION HISTORY]\n${historyText}\n\nUSER: ${promptText}\nMODEL:`;
          await callGemini(fullPrompt, updateResponse);
      } else {
          await callCustomAI(messages.slice(-6), promptText, systemContext, updateResponse);
      }

    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMsg = "**Connection Error**: ";
      if (settings.provider === 'gemini' && (error.toString().includes('401') || error.toString().includes('403') || error.toString().includes('API_KEY'))) {
          errorMsg = "**Authentication Failed**:\n\nPlease check your API Key configuration in `.env`.";
      } else {
          errorMsg += error.message || "Could not reach the AI provider.";
      }
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: errorMsg } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
  };

  const applyPreset = (key: keyof typeof PRESETS) => {
      const p = PRESETS[key];
      setSettings(prev => ({
          ...prev,
          customUrl: p.url,
          customModel: p.model
      }));
  };
  
  const hasKey = !!process.env.API_KEY;
  const isConnected = settings.provider === 'gemini' ? hasKey : (!!settings.customUrl);

  return (
    <div className="flex flex-col h-full bg-[#0c0c0c] text-zinc-300 relative">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a] bg-[#0c0c0c] shrink-0">
         <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate max-w-[120px]">
                {settings.provider === 'gemini' ? 'Gemini 2.5' : (settings.customModel || 'Custom')}
            </span>
         </div>
         <button onClick={() => setShowSettings(!showSettings)} className="text-zinc-500 hover:text-white transition-colors">
             <Settings size={14} />
         </button>
      </div>

      {/* Settings Panel Overlay */}
      {showSettings && (
          <div className="absolute top-[37px] left-0 w-full z-20 bg-[#121215] border-b border-[#27272a] p-4 shadow-xl animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Configuration</span>
                  <button onClick={() => setShowSettings(false)}><X size={14} className="text-zinc-500 hover:text-white"/></button>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1.5">Provider Mode</label>
                      <div className="flex bg-[#09090b] rounded p-1 border border-[#27272a]">
                          <button 
                            onClick={() => setSettings(s => ({...s, provider: 'gemini'}))}
                            className={`flex-1 text-xs py-1.5 rounded flex items-center justify-center gap-2 ${settings.provider === 'gemini' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                              <Sparkles size={12}/> Cloud (Gemini)
                          </button>
                          <button 
                             onClick={() => setSettings(s => ({...s, provider: 'custom'}))}
                             className={`flex-1 text-xs py-1.5 rounded flex items-center justify-center gap-2 ${settings.provider === 'custom' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                              <Server size={12}/> Custom / OpenAI
                          </button>
                      </div>
                  </div>

                  {settings.provider === 'gemini' ? (
                      <div className="text-xs text-zinc-500 bg-[#18181b] p-3 rounded border border-[#27272a]">
                          <div className="flex items-center gap-2 mb-1">
                              {hasKey ? <Check size={12} className="text-emerald-500"/> : <AlertTriangle size={12} className="text-amber-500"/>}
                              <span className="font-medium text-zinc-300">{hasKey ? 'API Key Detected' : 'No API Key Found'}</span>
                          </div>
                          <p className="leading-relaxed opacity-80">
                             Using built-in Google GenAI SDK. 
                             {!hasKey && " Configure `API_KEY` in your environment variables."}
                          </p>
                      </div>
                  ) : (
                      <div className="space-y-3 animate-in fade-in duration-200">
                           {/* Presets */}
                           <div className="flex gap-2">
                               <button onClick={() => applyPreset('openai')} className="flex-1 text-[10px] bg-[#1f1f23] hover:bg-[#27272a] border border-[#27272a] py-1.5 rounded text-zinc-400">Load OpenAI</button>
                               <button onClick={() => applyPreset('ollama')} className="flex-1 text-[10px] bg-[#1f1f23] hover:bg-[#27272a] border border-[#27272a] py-1.5 rounded text-zinc-400">Load Ollama</button>
                           </div>

                           <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">API URL (Endpoint)</label>
                              <input 
                                value={settings.customUrl}
                                onChange={(e) => setSettings(s => ({...s, customUrl: e.target.value}))}
                                placeholder="https://api.openai.com/v1/chat/completions"
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-zinc-300 focus:border-zinc-500 outline-none placeholder-zinc-700"
                              />
                           </div>
                           <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Model Name</label>
                              <input 
                                value={settings.customModel}
                                onChange={(e) => setSettings(s => ({...s, customModel: e.target.value}))}
                                placeholder="gpt-4o"
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-zinc-300 focus:border-zinc-500 outline-none placeholder-zinc-700"
                              />
                           </div>
                           <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">API Key (sk-...)</label>
                              <input 
                                type="password"
                                value={settings.customKey}
                                onChange={(e) => setSettings(s => ({...s, customKey: e.target.value}))}
                                placeholder="Required for OpenAI"
                                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-zinc-300 focus:border-zinc-500 outline-none placeholder-zinc-700"
                              />
                           </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages.length === 0 && (
           <div className="flex flex-col items-center justify-center h-full text-zinc-600 opacity-60">
              <Sparkles size={32} className="mb-4 text-zinc-700" />
              <p className="text-sm italic font-serif text-center max-w-[200px] text-zinc-500">
                {activeNote ? `Ready to analyze "${activeNote.title}"` : "Select a note to activate the neural link."}
              </p>
              
              {/* Quick Actions */}
              {activeNote && activeNote.content.length > 0 && (
                  <div className="mt-8 flex flex-col gap-2 w-full px-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <button 
                        onClick={() => generateResponse("Summarize this note in 3 concise bullet points.")}
                        className="text-xs bg-[#121215] border border-[#27272a] py-3 rounded-lg hover:bg-[#27272a] hover:text-zinc-200 transition-colors text-left px-4 flex items-center gap-3 group"
                      >
                          <span className="opacity-50 group-hover:opacity-100 transition-opacity">✨</span> Summarize Note
                      </button>
                       <button 
                        onClick={() => generateResponse("What are some related ideas, concepts, or counter-arguments to this note?")}
                        className="text-xs bg-[#121215] border border-[#27272a] py-3 rounded-lg hover:bg-[#27272a] hover:text-zinc-200 transition-colors text-left px-4 flex items-center gap-3 group"
                      >
                          <span className="opacity-50 group-hover:opacity-100 transition-opacity">🔗</span> Find Connections
                      </button>
                      <button 
                        onClick={() => generateResponse("Critique this writing style and clarity. Suggest improvements.")}
                        className="text-xs bg-[#121215] border border-[#27272a] py-3 rounded-lg hover:bg-[#27272a] hover:text-zinc-200 transition-colors text-left px-4 flex items-center gap-3 group"
                      >
                          <span className="opacity-50 group-hover:opacity-100 transition-opacity">✒️</span> Critique Writing
                      </button>
                  </div>
              )}
           </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in zoom-in-95 duration-200 group`}>
            <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center mt-1 border ${msg.role === 'user' ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : (msg.id === 'system-auth' ? 'bg-red-900/20 border-red-800/50 text-red-400' : 'bg-indigo-950/30 border-indigo-900/50 text-indigo-400')}`}>
                {msg.role === 'user' ? <User size={12}/> : (msg.id === 'system-auth' ? <Terminal size={12}/> : <Bot size={12}/>)}
            </div>
            <div className="flex flex-col gap-2 max-w-[85%]">
                <div className={`text-sm leading-7 prose prose-invert prose-p:leading-6 prose-ul:my-1 prose-li:my-0 prose-pre:bg-[#18181b] prose-pre:border prose-pre:border-[#27272a] max-w-none ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                
                {/* RAG Context Indicator */}
                {msg.contextUsed && msg.contextUsed.length > 0 && (
                   <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[10px] text-zinc-600 font-medium">References:</span>
                      {msg.contextUsed.map((title, i) => (
                          <span key={i} className="text-[10px] text-indigo-400 bg-indigo-950/30 px-1.5 rounded border border-indigo-900/50 flex items-center gap-1">
                             <Database size={8} /> {title}
                          </span>
                      ))}
                   </div>
                )}

                {msg.role === 'model' && !isLoading && msg.id !== 'system-auth' && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="px-2 py-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 text-[10px] font-medium"
                            title="Copy to Clipboard"
                         >
                            {copiedId === msg.id ? <Check size={12} className="text-emerald-500"/> : <Copy size={12}/>}
                            <span>Copy</span>
                         </button>
                         <button 
                            onClick={() => onInsert(msg.text)}
                            className="px-2 py-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 text-[10px] font-medium"
                            title="Insert at Cursor Position"
                         >
                            <ArrowLeftFromLine size={12}/>
                            <span>Insert</span>
                         </button>
                    </div>
                )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[#27272a] bg-[#0c0c0c]">
         {messages.length > 0 && (
             <button 
                onClick={() => setMessages([])} 
                className="absolute top-[70px] right-5 p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-md z-10 transition-colors" 
                title="Clear Memory"
            >
                 <Eraser size={14} />
             </button>
         )}
        <div className="relative flex items-end gap-2 bg-[#18181b] border border-[#27272a] rounded-lg p-2 focus-within:ring-1 focus-within:ring-zinc-700 transition-all shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if(input.trim()) generateResponse(input);
                }
            }}
            placeholder={activeNote ? "Ask Aeternus..." : "Select a note to begin..."}
            className="w-full bg-transparent border-none outline-none text-sm resize-none max-h-32 custom-scrollbar placeholder-zinc-600 font-sans"
            rows={1}
            style={{ minHeight: '24px' }} 
            disabled={isLoading}
          />
          <button 
            onClick={() => generateResponse(input)}
            disabled={!input.trim() || isLoading}
            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin text-indigo-400"/> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiSidebar;