import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Pin, 
  Menu, 
  Search, 
  Save, 
  Layout, 
  X, 
  ChevronLeft,
  CloudOff,
  Cloud,
  FileText,
  Bold,
  Italic,
  List,
  CheckSquare,
  Type,
  ListOrdered
} from 'lucide-react';

// --- Configuration & Constants ---
const COLORS = {
  // Dark Backgrounds (Generated to match "Blue/Green" realm)
  bgDarkest: '#0f172a', // Main app background (Deep Slate)
  bgDark: '#1e293b',    // Sidebar / Editor background (Slate)
  bgCard: '#334155',    // Card background
  bgInput: '#020617',   // Ultra dark for inputs

  // Your Palette
  primary: '#4A7BB7',   // Strong Blue
  secondary: '#6EA6CD', // Medium Blue
  sky: '#98CAE1',       // Light Blue
  pale: '#C2E4EF',      // Very Light Blue
  textMain: '#EAECCC',  // Beige/Sage (Used for main text for that "Green" hint)
  gold: '#FEDA8B',      // Pins
  orange: '#FDB366',    // Accents
  burn: '#F67E4B',
  red: '#DD3D2D',       // Delete/Warning
};

// Simple Markdown Parser for Preview (Updated for Dark Mode Colors)
const parseMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/^# (.*$)/gim, `<h1 class="text-3xl font-bold mb-4 text-[${COLORS.primary}] border-b border-gray-700 pb-2">$1</h1>`)
    .replace(/^## (.*$)/gim, `<h2 class="text-2xl font-bold mb-3 text-[${COLORS.secondary}]">$1</h2>`)
    .replace(/^### (.*$)/gim, `<h3 class="text-xl font-bold mb-2 text-[${COLORS.sky}]">$1</h3>`)
    .replace(/\*\*(.*)\*\*/gim, `<b class="text-[${COLORS.gold}]">$1</b>`)
    .replace(/\*(.*)\*/gim, '<i class="text-gray-400">$1</i>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc text-gray-300">$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal text-gray-300">$1</li>')
    .replace(/\[ \]/gim, '<input type="checkbox" disabled class="mr-2 accent-[#4A7BB7]" />')
    .replace(/\[x\]/gim, '<input type="checkbox" checked disabled class="mr-2 accent-[#4A7BB7]" />')
    .replace(/\n/gim, '<br />');
  return html;
};

// --- API Abstraction (Switch between LocalStorage and Server) ---
const API_URL = 'http://localhost:2100/api'; // Port 2100

const api = {
  fetchNotes: async (useServer) => {
    if (useServer) {
      const res = await fetch(`${API_URL}/notes`);
      return res.json();
    }
    const local = localStorage.getItem('notes_app_data');
    return local ? JSON.parse(local) : [];
  },
  saveNote: async (note, useServer) => {
    if (useServer) {
      const res = await fetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      return res.json();
    }
    const local = localStorage.getItem('notes_app_data');
    const notes = local ? JSON.parse(local) : [];
    const existingIndex = notes.findIndex(n => n.id === note.id);
    let updatedNotes;
    if (existingIndex >= 0) {
      updatedNotes = [...notes];
      updatedNotes[existingIndex] = { ...note, updatedAt: new Date().toISOString() };
    } else {
      updatedNotes = [...notes, { ...note, updatedAt: new Date().toISOString() }];
    }
    localStorage.setItem('notes_app_data', JSON.stringify(updatedNotes));
    return note;
  },
  deleteNote: async (id, useServer) => {
    if (useServer) {
      await fetch(`${API_URL}/notes/${id}`, { method: 'DELETE' });
      return;
    }
    const local = localStorage.getItem('notes_app_data');
    const notes = local ? JSON.parse(local) : [];
    const updatedNotes = notes.filter(n => n.id !== id);
    localStorage.setItem('notes_app_data', JSON.stringify(updatedNotes));
  }
};

// --- Components ---

const FormatToolbar = ({ onFormat }) => {
  const tools = [
    { icon: Bold, label: 'Bold', format: '**', wrap: true },
    { icon: Italic, label: 'Italic', format: '*', wrap: true },
    { icon: Type, label: 'Heading', format: '# ', wrap: false },
    { icon: List, label: 'List', format: '- ', wrap: false },
    { icon: ListOrdered, label: 'Numbered', format: '1. ', wrap: false },
    { icon: CheckSquare, label: 'Checklist', format: '[ ] ', wrap: false },
  ];

  return (
    <div className="flex items-center gap-1 p-2 border-b border-gray-800 overflow-x-auto no-scrollbar" style={{ backgroundColor: COLORS.bgDark }}>
      {tools.map((tool, idx) => (
        <button
          key={idx}
          onClick={() => onFormat(tool.format, tool.wrap)}
          className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          title={tool.label}
          type="button"
        >
          <tool.icon size={18} />
        </button>
      ))}
    </div>
  );
};

const NoteCard = ({ note, isActive, onClick, onPin }) => (
  <div 
    onClick={onClick}
    className={`p-4 mb-3 rounded-xl cursor-pointer transition-all border-l-4 group relative shadow-md
      ${isActive 
        ? 'bg-[#334155] translate-x-1' 
        : 'bg-[#1e293b] hover:bg-[#334155]'
      }
    `}
    style={{ borderColor: isActive ? COLORS.primary : 'transparent' }}
  >
    <div className="flex justify-between items-start">
      <h3 className={`font-bold text-lg truncate pr-6 ${isActive ? 'text-[#4A7BB7]' : 'text-[#EAECCC]'}`}>
        {note.title || 'Untitled Note'}
      </h3>
      {note.isPinned && <Pin size={16} fill={COLORS.gold} text={COLORS.gold} stroke={COLORS.gold} />}
    </div>
    <p className="text-xs mt-1 mb-2 uppercase tracking-wider font-semibold opacity-70" style={{ color: COLORS.sky }}>
      {note.category || 'Uncategorized'}
    </p>
    <p className="text-sm line-clamp-2 h-10 text-gray-400">
      {note.content?.replace(/[#*`]/g, '') || 'No content...'}
    </p>
    <button 
      onClick={(e) => { e.stopPropagation(); onPin(note); }}
      className={`absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-black/20 ${note.isPinned ? 'opacity-100' : ''}`}
    >
      <Pin size={16} className={note.isPinned ? 'text-[#FEDA8B]' : 'text-gray-500'} />
    </button>
  </div>
);

const Sidebar = ({ 
  notes, 
  activeCategory, 
  onSelectCategory, 
  isOpen, 
  setIsOpen,
  isMobile 
}) => {
  const categories = ['All', ...new Set(notes.map(n => n.category).filter(Boolean))];

  return (
    <div 
      className={`fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 flex flex-col border-r border-gray-800`}
      style={{ backgroundColor: COLORS.bgDark }}
    >
      <div className="p-6 flex items-center justify-between text-[#EAECCC]">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layout className="text-[#4A7BB7]" /> Notes
        </h1>
        {isMobile && <button onClick={() => setIsOpen(false)}><X /></button>}
      </div>

      <nav className="flex-1 px-4 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-500 mb-4 px-2 uppercase tracking-widest">Categories</div>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => { onSelectCategory(cat); if(isMobile) setIsOpen(false); }}
            className={`w-full text-left py-3 px-4 rounded-lg mb-1 transition-colors flex items-center justify-between group 
              ${activeCategory === cat 
                ? 'bg-[#4A7BB7] text-white shadow-lg shadow-blue-900/20' 
                : 'text-gray-400 hover:bg-[#334155] hover:text-[#EAECCC]'
              }`}
          >
            <span>{cat}</span>
            <span className={`text-xs py-1 px-2 rounded-full ${activeCategory === cat ? 'bg-black/20' : 'bg-[#0f172a] text-gray-500'}`}>
              {cat === 'All' ? notes.length : notes.filter(n => n.category === cat).length}
            </span>
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-gray-800">
        <div className="text-gray-600 text-xs text-center">
          Self-Hosted Markdown Notes v1.1
        </div>
      </div>
    </div>
  );
};

export default function App() {
  // State
  const [notes, setNotes] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [useServer, setUseServer] = useState(false); // Toggle for backend vs local
  const [loading, setLoading] = useState(false);

  // Refs
  const textareaRef = useRef(null);

  // Derived State
  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => {
        const matchesCat = activeCategory === 'All' || n.category === activeCategory;
        const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              n.content.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCat && matchesSearch;
      })
      .sort((a, b) => (b.isPinned === a.isPinned ? 0 : b.isPinned ? 1 : -1)); // Pins first
  }, [notes, activeCategory, searchQuery]);

  const activeNote = notes.find(n => n.id === selectedNoteId);
  const isMobile = window.innerWidth < 768;

  // Effects
  useEffect(() => {
    loadNotes();
  }, [useServer]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const data = await api.fetchNotes(useServer);
      setNotes(data);
    } catch (err) {
      console.error("Failed to load notes", err);
    }
    setLoading(false);
  };

  // Handlers
  const handleCreateNote = () => {
    const newNote = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      category: 'Personal',
      isPinned: false,
      updatedAt: new Date().toISOString()
    };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);
    setIsEditing(true);
  };

  const handleUpdateNote = (field, value) => {
    setNotes(notes.map(n => n.id === selectedNoteId ? { ...n, [field]: value } : n));
  };

  const handleSave = async () => {
    if (!activeNote) return;
    try {
      await api.saveNote(activeNote, useServer);
      setIsEditing(false);
    } catch (e) {
      alert("Failed to save. If using server mode, ensure backend is running.");
    }
  };

  const handleDelete = async () => {
    if (!activeNote || !confirm('Delete this note?')) return;
    await api.deleteNote(activeNote.id, useServer);
    setNotes(notes.filter(n => n.id !== activeNote.id));
    setSelectedNoteId(null);
    setIsEditing(false);
  };

  const handlePin = async (note) => {
    const updated = { ...note, isPinned: !note.isPinned };
    // Optimistic update
    setNotes(notes.map(n => n.id === note.id ? updated : n));
    await api.saveNote(updated, useServer);
  };

  const insertFormat = (format, wrap = false) => {
    const textarea = textareaRef.current;
    if (!textarea || !activeNote) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activeNote.content || '';
    
    let newText = '';
    let newCursorPos = end;

    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);

    if (wrap) {
      // For things like Bold (**text**)
      newText = before + format + selected + format + after;
      newCursorPos = end + format.length;
    } else {
      // For things like Lists (- text)
      newText = before + format + selected + after;
      newCursorPos = end + format.length;
    }

    handleUpdateNote('content', newText);

    // Restore focus and update cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Render
  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: COLORS.bgDarkest }}>
      {/* Mobile Overlay */}
      {isSidebarOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black/80 z-20 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        notes={notes}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        isOpen={isSidebarOpen}
        setIsOpen={setSidebarOpen}
        isMobile={isMobile}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative" style={{ backgroundColor: COLORS.bgDarkest }}>
        
        {/* Top Bar */}
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-4 shrink-0 shadow-sm z-10" style={{ backgroundColor: COLORS.bgDark }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-700 rounded-lg md:hidden text-white">
              <Menu size={20} />
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input 
                type="text" 
                placeholder="Search notes..." 
                className="pl-9 pr-4 py-2 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7BB7] w-40 md:w-64 transition-all text-white placeholder-gray-500"
                style={{ backgroundColor: COLORS.bgInput }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setUseServer(!useServer)}
              className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors ${useServer ? 'bg-[#4A7BB7] text-white' : 'bg-gray-700 text-gray-400'}`}
              title="Toggle Server/Local Mode"
            >
              {useServer ? <Cloud size={16}/> : <CloudOff size={16}/>}
              <span className="hidden md:inline">{useServer ? 'Server' : 'Local'}</span>
            </button>
          </div>
        </header>

        {/* Two Column Layout (Desktop) or View Switch (Mobile) */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {/* Note List */}
          <div className={`
            w-full md:w-80 lg:w-96 border-r border-gray-800 flex flex-col
            ${selectedNoteId && isMobile ? 'hidden' : 'flex'}
          `} style={{ backgroundColor: COLORS.bgDarkest }}>
            <div className="p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold" style={{ color: COLORS.textMain }}>{activeCategory}</h2>
              <span className="text-xs text-gray-500 font-mono">{filteredNotes.length} notes</span>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 pb-20">
              {filteredNotes.map(note => (
                <NoteCard 
                  key={note.id} 
                  note={note} 
                  isActive={selectedNoteId === note.id}
                  onClick={() => { setSelectedNoteId(note.id); setIsEditing(false); }}
                  onPin={handlePin}
                />
              ))}
              {filteredNotes.length === 0 && (
                <div className="text-center text-gray-500 mt-10">
                  <FileText className="mx-auto mb-4 opacity-50" size={48} />
                  <p>No notes found.</p>
                </div>
              )}
            </div>

            {/* FAB */}
            <button 
              onClick={handleCreateNote}
              className="absolute bottom-6 right-6 md:right-auto md:left-[280px] lg:left-[340px] w-14 h-14 rounded-full shadow-lg shadow-black/40 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-20 text-white"
              style={{ backgroundColor: COLORS.primary }}
            >
              <Plus size={28} />
            </button>
          </div>

          {/* Editor / Detail View */}
          <div className={`
            flex-1 flex flex-col h-full absolute inset-0 md:relative z-10 md:z-auto
            ${!selectedNoteId && isMobile ? 'translate-x-full' : 'translate-x-0'}
            transition-transform duration-300 md:transform-none
          `} style={{ backgroundColor: COLORS.bgDark }}>
            {activeNote ? (
              <>
                {/* Editor Toolbar */}
                <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 shrink-0" style={{ backgroundColor: COLORS.bgDark }}>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setSelectedNoteId(null); if(isMobile) setIsEditing(false); }} 
                      className="md:hidden p-2 hover:bg-gray-700 rounded-full text-white"
                    >
                      <ChevronLeft />
                    </button>
                    {isEditing ? (
                       <input 
                         type="text" 
                         value={activeNote.category}
                         onChange={(e) => handleUpdateNote('category', e.target.value)}
                         className="text-xs px-2 py-1 rounded-md outline-none font-bold w-32 border border-gray-600 focus:border-[#4A7BB7] transition-colors"
                         style={{ backgroundColor: COLORS.bgInput, color: COLORS.sky }}
                         placeholder="Category"
                       />
                    ) : (
                      <span className="text-xs px-3 py-1 rounded-full font-bold bg-[#0f172a]" style={{ color: COLORS.sky }}>
                        {activeNote.category}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsEditing(!isEditing)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isEditing ? 'bg-gray-700 text-gray-200' : 'bg-[#0f172a] text-[#4A7BB7] hover:bg-black/40'}`}
                    >
                      {isEditing ? 'Preview' : 'Edit'}
                    </button>
                    {isEditing && (
                      <button 
                        onClick={handleSave}
                        className="p-2 rounded-lg text-white hover:brightness-110 transition-colors"
                        style={{ backgroundColor: COLORS.primary }}
                      >
                        <Save size={18} />
                      </button>
                    )}
                    <button 
                      onClick={handleDelete}
                      className="p-2 rounded-lg hover:bg-red-900/30 text-[#DD3D2D] transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-y-auto flex flex-col">
                  {/* Format Toolbar (Visible only in Edit Mode) */}
                  {isEditing && (
                    <FormatToolbar onFormat={insertFormat} />
                  )}

                  <div className="max-w-3xl mx-auto w-full p-6 md:p-10 flex-1 flex flex-col">
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={activeNote.title}
                          onChange={(e) => handleUpdateNote('title', e.target.value)}
                          placeholder="Note Title"
                          className="text-3xl md:text-4xl font-bold placeholder-gray-600 w-full outline-none bg-transparent mb-6"
                          style={{ color: COLORS.textMain }}
                        />
                        <textarea
                          ref={textareaRef}
                          value={activeNote.content}
                          onChange={(e) => handleUpdateNote('content', e.target.value)}
                          placeholder="Type here..."
                          className="flex-1 w-full resize-none outline-none text-lg leading-relaxed font-mono placeholder-gray-700 bg-transparent"
                          style={{ color: COLORS.pale }}
                        />
                      </>
                    ) : (
                      <>
                        <h1 className="text-3xl md:text-4xl font-bold mb-6 border-b border-gray-700 pb-4" style={{ color: COLORS.textMain }}>
                          {activeNote.title}
                        </h1>
                        <div 
                          className="prose prose-invert max-w-none leading-relaxed"
                          style={{ color: COLORS.pale }}
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }} 
                        />
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center" style={{ backgroundColor: COLORS.bgDark }}>
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-[#0f172a]">
                  <Layout size={40} style={{ color: COLORS.primary }} />
                </div>
                <h2 className="text-2xl font-bold mb-2" style={{ color: COLORS.textMain }}>No Note Selected</h2>
                <p className="max-w-xs mx-auto">Select a note from the list or tap the + button to create a new one.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}