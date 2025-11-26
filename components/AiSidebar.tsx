import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Eraser, Bot, User, Loader2, Copy, Check, ArrowLeftFromLine } from 'lucide-react';
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

  const generateResponse = async (promptText: string) => {
    if (isLoading) return;

    const userMsgId = Date.now().toString();
    // Optimistically add user message
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: promptText }]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Construct system context based on the active note
      let systemContext = "You are Aeternus, an intelligent interface for the user's second brain. You are helpful, concise, and philosophical. You prefer using Markdown for formatting (lists, bolding, etc).";
      
      if (activeNote) {
        systemContext += `\n\n[CURRENT NOTE CONTEXT]\nTitle: ${activeNote.title}\nContent:\n${activeNote.content}\n[END CONTEXT]\n\nAnswer the user's query based on the context above if relevant, or general knowledge otherwise.`;
      } else {
        systemContext += "\n\nThere is currently no active note selected.";
      }
      
      // Build a simple history string to give the model conversation continuity
      // We grab the last few messages to keep tokens low but context high
      const historyText = messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
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

    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "**Error**: Connection to the ether disrupted. Please check your API key or internet connection." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0c] text-zinc-300">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages.length === 0 && (
           <div className="flex flex-col items-center justify-center h-full text-zinc-600 opacity-60">
              <Sparkles size={32} className="mb-4" />
              <p className="text-sm italic font-serif text-center max-w-[200px]">
                {activeNote ? `Ready to analyze "${activeNote.title}"` : "Select a note to activate the neural link."}
              </p>
              {activeNote && activeNote.content.length > 0 && (
                  <div className="mt-6 flex flex-col gap-2 w-full px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <button 
                        onClick={() => generateResponse("Summarize this note in 3 concise bullet points.")}
                        className="text-xs bg-[#18181b] border border-[#27272a] py-2.5 rounded hover:bg-[#27272a] hover:text-zinc-200 transition-colors text-left px-3 flex items-center gap-2"
                      >
                          <span className="opacity-50">✨</span> Summarize Note
                      </button>
                       <button 
                        onClick={() => generateResponse("What are some related ideas, concepts, or counter-arguments to this note?")}
                        className="text-xs bg-[#18181b] border border-[#27272a] py-2.5 rounded hover:bg-[#27272a] hover:text-zinc-200 transition-colors text-left px-3 flex items-center gap-2"
                      >
                          <span className="opacity-50">🔗</span> Find Connections
                      </button>
                      <button 
                        onClick={() => generateResponse("Critique this writing style and clarity. Suggest improvements.")}
                        className="text-xs bg-[#18181b] border border-[#27272a] py-2.5 rounded hover:bg-[#27272a] hover:text-zinc-200 transition-colors text-left px-3 flex items-center gap-2"
                      >
                          <span className="opacity-50">✒️</span> Critique Writing
                      </button>
                  </div>
              )}
           </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in zoom-in-95 duration-200 group`}>
            <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center mt-1 border ${msg.role === 'user' ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-indigo-950/30 border-indigo-900/50 text-indigo-400'}`}>
                {msg.role === 'user' ? <User size={12}/> : <Bot size={12}/>}
            </div>
            <div className="flex flex-col gap-2 max-w-[85%]">
                <div className={`text-sm leading-7 prose prose-invert prose-p:leading-6 prose-ul:my-1 prose-li:my-0 max-w-none ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                {msg.role === 'model' && !isLoading && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 text-[10px]"
                            title="Copy to Clipboard"
                         >
                            {copiedId === msg.id ? <Check size={12} className="text-green-500"/> : <Copy size={12}/>}
                            <span>Copy</span>
                         </button>
                         <button 
                            onClick={() => onInsert(msg.text)}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 text-[10px]"
                            title="Insert at Cursor Position in Editor"
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
                className="absolute top-16 right-5 p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-900/50 rounded-md z-10 transition-colors" 
                title="Clear Memory"
            >
                 <Eraser size={14} />
             </button>
         )}
        <div className="relative flex items-end gap-2 bg-[#18181b] border border-[#27272a] rounded-lg p-2 focus-within:ring-1 focus-within:ring-zinc-600 transition-all shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if(input.trim()) generateResponse(input);
                }
            }}
            placeholder={activeNote ? "Ask Aeternus..." : "Select a note first..."}
            className="w-full bg-transparent border-none outline-none text-sm resize-none max-h-32 custom-scrollbar placeholder-zinc-600"
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