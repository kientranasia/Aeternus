import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Eraser, Bot, User, Loader2, Copy, Check, ArrowLeftFromLine, AlertTriangle, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { Note } from '../types';

interface AiSidebarProps {
  activeNote: Note | null;
  onInsert: (text: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const AiSidebar: React.FC<AiSidebarProps> = ({ activeNote, onInsert }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    // Basic check to guide users running locally
    // Note: process.env might be replaced by the bundler, so we check the value safely if possible, 
    // or rely on the fact that if it's undefined, the key variable will be falsy.
    const key = process.env.API_KEY;
    if (!key) {
        setMessages([{
            id: 'system-auth',
            role: 'model',
            text: "### 🔌 Setup Required\n\nTo connect Aeternus to Google AI locally:\n\n1.  Get an API Key from [Google AI Studio](https://aistudio.google.com/)\n2.  Create a `.env` file in your project root\n3.  Add: `API_KEY=your_key_here`\n4.  Restart your server."
        }]);
    }
  }, []);

  const generateResponse = async (promptText: string) => {
    if (isLoading) return;

    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: promptText }]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let systemContext = "You are Aeternus, an intelligent interface for the user's second brain. You are helpful, concise, and philosophical. You prefer using Markdown for formatting.";
      
      if (activeNote) {
        systemContext += `\n\n[CURRENT NOTE CONTEXT]\nTitle: ${activeNote.title}\nContent:\n${activeNote.content}\n[END CONTEXT]\n\nAnswer based on the context above if relevant.`;
      } else {
        systemContext += "\n\nThere is currently no active note selected.";
      }
      
      const historyText = messages.slice(-6).filter(m => m.id !== 'system-auth').map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
      const fullPrompt = `${systemContext}\n\n[CONVERSATION HISTORY]\n${historyText}\n\nUSER: ${promptText}\nMODEL:`;

      const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
      });

      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: '' }]);

      let fullResponse = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullResponse } : m));
        }
      }

    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMsg = "**Connection Error**: ";
       if (error.toString().includes('401') || error.toString().includes('403') || error.toString().includes('API_KEY')) {
          errorMsg = "**Authentication Failed**:\n\nPlease check your API Key configuration. If running locally, ensure your `.env` file is set up correctly.";
      } else {
          errorMsg += "Could not reach the neural network. Please check your internet connection.";
      }
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
  };
  
  // Safe check for key existence for UI indicator
  const hasKey = !!process.env.API_KEY;

  return (
    <div className="flex flex-col h-full bg-[#0c0c0c] text-zinc-300">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a] bg-[#0c0c0c] shrink-0">
         <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Gemini 2.5 Flash</span>
         </div>
         {!hasKey && (
             <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={10}/> No Key</span>
         )}
      </div>

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