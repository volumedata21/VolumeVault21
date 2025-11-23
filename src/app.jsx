import React, { useState, useEffect, useMemo } from 'react';
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
  Settings,
  CloudOff,
  Cloud
} from 'lucide-react';

// --- Configuration & Constants ---
const COLORS = {
  primaryDark: '#364B9A',
  primary: '#4A7BB7',
  primaryLight: '#6EA6CD',
  sky: '#98CAE1',
  pale: '#C2E4EF',
  beige: '#EAECCC',
  gold: '#FEDA8B',
  orange: '#FDB366',
  burn: '#F67E4B',
  red: '#DD3D2D',
  deepRed: '#A50026',
  black: '#000000',
  white: '#FFFFFF',
};

// Simple Markdown Parser for Preview
const parseMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-2 text-[#364B9A]">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mb-2 text-[#4A7BB7]">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mb-2 text-[#6EA6CD]">$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*)\*/gim, '<i>$1</i>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\[ \]/gim, '<input type="checkbox" disabled class="mr-2" />')
    .replace(/\[x\]/gim, '<input type="checkbox" checked disabled class="mr-2" />')
    .replace(/\n/gim, '<br />');
  return html;
};

// --- API Abstraction (Switch between LocalStorage and Server) ---
const API_URL = 'http://localhost:2100/api'; // UPDATED: Port 2100

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

const NoteCard = ({ note, isActive, onClick, onPin }) => (
  <div 
    onClick={onClick}
    className={`p-4 mb-3 rounded-xl cursor-pointer transition-all shadow-sm border-l-4 group relative ${isActive ? 'bg-white translate-x-1 shadow-md' : 'bg-white hover:bg-[#EAECCC]'}`}
    style={{ borderColor: isActive ? COLORS.primary : 'transparent' }}
  >
    <div className="flex justify-between items-start">
      <h3 className={`font-bold text-lg truncate pr-6 ${isActive ? 'text-[#364B9A]' : 'text-gray-800'}`}>
        {note.title || 'Untitled Note'}
      </h3>
      {note.isPinned && <Pin size={16} fill={COLORS.gold} text={COLORS.gold} stroke={COLORS.gold} />}
    </div>
    <p className="text-gray-500 text-xs mt-1 mb-2 uppercase tracking-wider font-semibold">
      {note.category || 'Uncategorized'}
    </p>
    <p className="text-gray-600 text-sm line-clamp-2 h-10">
      {note.content?.replace(/[#*`]/g, '') || 'No content...'}
    </p>
    <button 
      onClick={(e) => { e.stopPropagation(); onPin(note); }}
      className={`absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-gray-100 ${note.isPinned ? 'opacity-100' : ''}`}
    >
      <Pin size={16} className={note.isPinned ? 'text-[#FEDA8B]' : 'text-gray-400'} />
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
      className={`fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 flex flex-col`}
      style={{ backgroundColor: COLORS.primaryDark }}
    >
      <div className="p-6 flex items-center justify-between text-white">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layout /> Notes
        </h1>
        {isMobile && <button onClick={() => setIsOpen(false)}><X /></button>}
      </div>

      <nav className="flex-1 px-4 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-400 mb-4 px-2 uppercase">Categories</div>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => { onSelectCategory(cat); if(isMobile) setIsOpen(false); }}
            className={`w-full text-left py-3 px-4 rounded-lg mb-1 transition-colors flex items-center justify-between group ${activeCategory === cat ? 'bg-[#4A7BB7] text-white' : 'text-gray-300 hover:bg-[#4A7BB7]/50'}`}
          >
            <span>{cat}</span>
            <span className="bg-[#000000]/20 text-xs py-1 px-2 rounded-full">
              {cat === 'All' ? notes.length : notes.filter(n => n.category === cat).length}
            </span>
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-white/10">
        <div className="text-white/50 text-xs text-center">
          Self-Hosted Markdown Notes v1.0
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

  // Render
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#EAECCC]">
      {/* Mobile Overlay */}
      {isSidebarOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black/50 z-20"
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
      <div className="flex-1 flex flex-col min-w-0 bg-[#F0F4F8] h-full relative">
        
        {/* Top Bar */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg md:hidden">
              <Menu size={20} color={COLORS.primaryDark} />
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search notes..." 
                className="pl-9 pr-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7BB7] w-40 md:w-64 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setUseServer(!useServer)}
              className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors ${useServer ? 'bg-[#98CAE1] text-[#364B9A]' : 'bg-gray-200 text-gray-500'}`}
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
            w-full md:w-80 lg:w-96 bg-[#F0F4F8] border-r flex flex-col
            ${selectedNoteId && isMobile ? 'hidden' : 'flex'}
          `}>
            <div className="p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#364B9A]">{activeCategory}</h2>
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
                <div className="text-center text-gray-400 mt-10">
                  <p>No notes found.</p>
                </div>
              )}
            </div>

            {/* FAB */}
            <button 
              onClick={handleCreateNote}
              className="absolute bottom-6 right-6 md:right-auto md:left-[280px] lg:left-[340px] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-20"
              style={{ backgroundColor: COLORS.primaryDark }}
            >
              <Plus color="white" size={28} />
            </button>
          </div>

          {/* Editor / Detail View */}
          <div className={`
            flex-1 bg-white flex flex-col h-full absolute inset-0 md:relative z-10 md:z-auto
            ${!selectedNoteId && isMobile ? 'translate-x-full' : 'translate-x-0'}
            transition-transform duration-300 md:transform-none
          `}>
            {activeNote ? (
              <>
                {/* Editor Toolbar */}
                <div className="h-16 border-b flex items-center justify-between px-4 shrink-0 bg-white">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setSelectedNoteId(null); if(isMobile) setIsEditing(false); }} 
                      className="md:hidden p-2 hover:bg-gray-100 rounded-full"
                    >
                      <ChevronLeft color={COLORS.primaryDark} />
                    </button>
                    {isEditing ? (
                       <input 
                         type="text" 
                         value={activeNote.category}
                         onChange={(e) => handleUpdateNote('category', e.target.value)}
                         className="bg-gray-100 text-xs px-2 py-1 rounded-md outline-none text-[#364B9A] font-bold w-32"
                         placeholder="Category"
                       />
                    ) : (
                      <span className="bg-[#EAECCC] text-[#364B9A] text-xs px-3 py-1 rounded-full font-bold">
                        {activeNote.category}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsEditing(!isEditing)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isEditing ? 'bg-gray-200 text-gray-700' : 'bg-[#EAECCC] text-[#364B9A]'}`}
                    >
                      {isEditing ? 'Preview' : 'Edit'}
                    </button>
                    {isEditing && (
                      <button 
                        onClick={handleSave}
                        className="p-2 rounded-lg bg-[#4A7BB7] text-white hover:bg-[#364B9A] transition-colors"
                      >
                        <Save size={18} />
                      </button>
                    )}
                    <button 
                      onClick={handleDelete}
                      className="p-2 rounded-lg hover:bg-[#FEE2E2] text-[#DD3D2D] transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto p-6 md:p-10 h-full flex flex-col">
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={activeNote.title}
                          onChange={(e) => handleUpdateNote('title', e.target.value)}
                          placeholder="Note Title"
                          className="text-3xl md:text-4xl font-bold text-[#364B9A] placeholder-gray-300 w-full outline-none bg-transparent mb-6"
                        />
                        <textarea
                          value={activeNote.content}
                          onChange={(e) => handleUpdateNote('content', e.target.value)}
                          placeholder="Type your markdown note here... Try # Heading, - list, **bold**"
                          className="flex-1 w-full resize-none outline-none text-lg text-gray-700 leading-relaxed font-mono placeholder-gray-200"
                        />
                      </>
                    ) : (
                      <>
                        <h1 className="text-3xl md:text-4xl font-bold text-[#364B9A] mb-6 border-b pb-4">
                          {activeNote.title}
                        </h1>
                        <div 
                          className="prose prose-blue max-w-none text-gray-700 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }} 
                        />
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-300 p-8 text-center bg-[#F0F4F8] md:bg-white">
                <div className="w-24 h-24 bg-[#EAECCC] rounded-full flex items-center justify-center mb-6">
                  <Layout size={40} className="text-[#364B9A]" />
                </div>
                <h2 className="text-2xl font-bold text-[#364B9A] mb-2">No Note Selected</h2>
                <p className="max-w-xs mx-auto">Select a note from the list or tap the + button to create a new one.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}