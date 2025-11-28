import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal';
import { Note, AppSettings } from './types';
import { noteService } from './services/noteService';
import { Menu, RefreshCw, Undo2, X } from 'lucide-react';
import { Dashboard } from './components/Dashboard'; 
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SETTINGS: AppSettings = {
  autoSave: true,
  saveInterval: 30000 // 30 seconds
};

const SETTINGS_KEY = 'volumevault_settings';
const LEGACY_SETTINGS_KEY = 'markmind_notes_v1';

const getNoteIdFromPath = (): string | null => {
    const path = window.location.pathname;
    const parts = path.split('/');
    if (parts.length === 3 && parts[1] === 'note') {
        return parts[2];
    }
    return null;
};

const registerServiceWorker = () => {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const swUrl = `/sw.js`; 
    navigator.serviceWorker.register(swUrl)
      .then((registration) => {
        console.log('PWA Service Worker registered:', registration);
      })
      .catch((error) => {
        console.error('PWA Service Worker registration failed:', error);
      });
  }
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(getNoteIdFromPath());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<'notes' | 'trash'>('notes');
  const [loading, setLoading] = useState(true); 
  
  // NEW: Centralized Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Touch state
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  // Undo State
  const [undoAction, setUndoAction] = useState<{ label: string, handler: () => void } | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      let saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) {
          saved = localStorage.getItem(LEGACY_SETTINGS_KEY);
          if (saved) {
             try {
                localStorage.setItem(SETTINGS_KEY, saved);
             } catch (e) { }
          }
      }
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  });

  const getCurrentNote = () => notes.find(n => n.id === activeNoteId);
  
  const saveCurrentNoteToDisk = async () => {
    if (activeNoteId) {
      const note = getCurrentNote(); 
      if (note && !note.deleted) { 
        await noteService.saveNote(note, settings.serverUrl); 
      }
    }
  };

  // --- UNDO SYSTEM HELPERS ---
  const triggerUndoToast = (label: string, undoHandler: () => void) => {
      setUndoAction({ label, handler: undoHandler });
      setShowUndoToast(true);
      setTimeout(() => setShowUndoToast(false), 5000);
  };

  const performUndo = () => {
      if (undoAction) {
          undoAction.handler();
          setShowUndoToast(false);
          setUndoAction(null);
      }
  };

  // --- BULK & SINGLE ACTIONS ---

  const handlePinNote = (id: string) => {
    setNotes(prev => prev.map(note => {
        if (note.id === id) {
            const newPinnedState = !note.isPinned;
            const updatedNote = { ...note, isPinned: newPinnedState };
            
            noteService.saveNote(updatedNote, settings.serverUrl).catch(e => console.error(e));
            return updatedNote;
        }
        return note;
    }));
  };

  const handleDuplicateNote = async (note: Note) => {
      const newNote: Note = {
          ...note,
          id: uuidv4(),
          title: `${note.title} (Copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: false 
      };
      await noteService.saveNote(newNote, settings.serverUrl);
      setNotes(prev => [newNote, ...prev]);
      
      triggerUndoToast("Note duplicated", () => {
          noteService.permanentlyDeleteNote(newNote.id);
          setNotes(prev => prev.filter(n => n.id !== newNote.id));
      });
  };

  const performBulkUpdate = async (ids: string[], updates: Partial<Note>, undoLabel: string) => {
      const timestamp = Date.now();
      const previousStates = notes.filter(n => ids.includes(n.id)).map(n => ({ ...n }));
      
      const updatedNotes = notes.map(note => {
          if (ids.includes(note.id)) return { ...note, ...updates, updatedAt: timestamp };
          return note;
      });
      setNotes(updatedNotes);
      
      const notesToSave = updatedNotes.filter(n => ids.includes(n.id));
      await Promise.all(notesToSave.map(n => noteService.saveNote(n, settings.serverUrl)));

      triggerUndoToast(undoLabel, async () => {
          setNotes(prev => prev.map(n => {
              const old = previousStates.find(p => p.id === n.id);
              return old ? old : n;
          }));
          await Promise.all(previousStates.map(n => noteService.saveNote(n, settings.serverUrl)));
      });
  };

  const handleBulkCategory = (ids: string[], category: string) => performBulkUpdate(ids, { category }, "Category updated");
  const handleBulkColor = (ids: string[], color: string) => performBulkUpdate(ids, { color }, "Color updated");

  const handleBulkDelete = async (ids: string[]) => {
      if (sidebarView === 'trash') {
          await Promise.all(ids.map(id => noteService.permanentlyDeleteNote(id)));
          setNotes(prev => prev.filter(n => !ids.includes(n.id)));
      } else {
          const previousStates = notes.filter(n => ids.includes(n.id)).map(n => ({ ...n }));
          
          await Promise.all(ids.map(id => noteService.trashNote(id, settings.serverUrl)));
          setNotes(prev => prev.map(n => ids.includes(n.id) ? { ...n, deleted: true, deletedAt: Date.now() } : n));

          triggerUndoToast("Notes moved to trash", async () => {
              setNotes(prev => prev.map(n => {
                  const old = previousStates.find(p => p.id === n.id);
                  return old ? old : n;
              }));
              await Promise.all(previousStates.map(n => noteService.saveNote(n, settings.serverUrl))); 
          });
      }
  };

  const handleBulkTags = async (ids: string[], tagsToAdd: string[], tagsToRemove: string[]) => {
      const timestamp = Date.now();
      const previousStates = notes.filter(n => ids.includes(n.id)).map(n => ({ ...n }));
      
      const updatedNotes = notes.map(note => {
          if (ids.includes(note.id)) {
              const currentTags = note.tags || [];
              const filteredTags = currentTags.filter(t => !tagsToRemove.includes(t));
              const finalTags = Array.from(new Set([...filteredTags, ...tagsToAdd]));
              return { ...note, tags: finalTags, updatedAt: timestamp };
          }
          return note;
      });
      
      setNotes(updatedNotes);
      const notesToSave = updatedNotes.filter(n => ids.includes(n.id));
      await Promise.all(notesToSave.map(n => noteService.saveNote(n, settings.serverUrl)));
      
      triggerUndoToast("Tags updated", async () => {
          setNotes(prev => prev.map(n => {
              const old = previousStates.find(p => p.id === n.id);
              return old ? old : n;
          }));
          await Promise.all(previousStates.map(n => noteService.saveNote(n, settings.serverUrl)));
      });
  };

  // --- NAVIGATION & ROUTING ---

  const navigateToDashboard = useCallback(async () => {
      await saveCurrentNoteToDisk();
      if (window.location.pathname !== '/') {
        window.history.pushState(null, 'Dashboard', '/');
      }
      setActiveNoteId(null); 
      if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, [activeNoteId, notes, settings.serverUrl]);
  
  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
        const loadedNotes = await noteService.getAllNotes(settings.serverUrl); 
        setNotes(loadedNotes);
    } catch (e) {
        console.error("[SYNC] Server load failed.", e);
        setActiveNoteId(null); 
        if (window.location.pathname !== '/') window.history.replaceState(null, 'Dashboard', '/');
    } finally {
        setLoading(false);
    }
  }, [settings.serverUrl]);

  useEffect(() => {
    let isMounted = true;
    if (isMounted) { loadNotes(); registerServiceWorker(); }
    return () => { isMounted = false; };
  }, [loadNotes]);

  useEffect(() => {
      if (loading === false && activeNoteId) {
          if (!notes.find(n => n.id === activeNoteId)) {
              setActiveNoteId(null);
              if (window.location.pathname !== '/') window.history.replaceState(null, 'Dashboard', '/');
          }
      }
  }, [loading, activeNoteId, notes]);

  useEffect(() => {
    const handlePopState = () => setActiveNoteId(getNoteIdFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []); 

  // --- COMPUTED STATE & FILTERING ---

  const visibleNotes = useMemo(() => {
      let filtered = notes;
      if (sidebarView === 'trash') {
          filtered = notes.filter(n => n.deleted);
      } else {
          filtered = notes.filter(n => !n.deleted);
      }
      
      // NEW: Filter by Search Term
      if (searchTerm.trim()) {
          const lowerTerm = searchTerm.toLowerCase();
          filtered = filtered.filter(note => 
             note.title.toLowerCase().includes(lowerTerm) ||
             note.content.toLowerCase().includes(lowerTerm) ||
             note.category.toLowerCase().includes(lowerTerm) ||
             (note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerTerm)))
          );
      }

      return filtered.sort((a, b) => {
          if (sidebarView === 'trash') return (b.deletedAt || 0) - (a.deletedAt || 0);
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.updatedAt - a.updatedAt;
      });
  }, [notes, sidebarView, searchTerm]);

  const trashCount = useMemo(() => notes.filter(n => n.deleted).length, [notes]);
  
  const availableCategories = useMemo(() => {
    const cats = new Set(notes.filter(n => !n.deleted).map(n => n.category || 'General'));
    return Array.from(cats).sort();
  }, [notes]);
  
  const allTags = useMemo(() => {
      const tags = new Set<string>();
      notes.forEach(n => n.tags?.forEach(t => tags.add(t)));
      return Array.from(tags).sort();
  }, [notes]);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings)); } catch (e) {}
  };

  const handleNoteSelect = async (id: string) => {
    await saveCurrentNoteToDisk(); 
    window.history.pushState({ noteId: id }, `Note ${id}`, `/note/${id}`);
    setActiveNoteId(id);
    setIsSidebarOpen(false); 
  };

  const handleCreateNote = async () => {
    await saveCurrentNoteToDisk(); 
    const newNote = await noteService.createNote(settings.serverUrl); 
    setNotes(prev => [newNote, ...prev]);
    handleNoteSelect(newNote.id); 
    setSidebarView('notes'); 
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };
  
  const handleDeleteNote = async (id: string) => handleBulkDelete([id]); 
  
  const handleRestoreNote = async (id: string) => {
      await noteService.restoreNote(id, settings.serverUrl); 
      setNotes(prev => prev.map(n => n.id === id ? { ...n, deleted: false } : n));
  };
  const handlePermanentDelete = async (id: string) => {
      await noteService.permanentlyDeleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      if (activeNoteId === id) { setActiveNoteId(null); navigateToDashboard(); }
  };
  const handleEmptyTrash = async () => {
      await noteService.emptyTrash(settings.serverUrl); 
      setNotes(prev => prev.filter(n => !n.deleted));
      if (activeNoteId && notes.find(n => n.id === activeNoteId)?.deleted) { setActiveNoteId(null); navigateToDashboard(); }
  };

  const handleUpdateNoteState = (updates: Partial<Note>, saveToDisk: boolean = false) => {
    if (!activeNoteId) return; 
    setNotes(prev => prev.map(note => {
      if (note.id === activeNoteId) {
        const updatedNote = { ...note, ...updates, updatedAt: Date.now() };
        if (saveToDisk) noteService.saveNote(updatedNote, settings.serverUrl).catch(e => console.error(e));
        return updatedNote;
      }
      return note;
    }));
  };

  const handleManualSaveCurrent = () => { };
  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notes));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "volumevault_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  const MIN_SWIPE_DISTANCE = 50; 
  const handleTouchStart = (e: React.TouchEvent) => { if (window.innerWidth < 768) { setTouchStartX(e.targetTouches[0].clientX); setTouchEndX(null); }};
  const handleTouchMove = (e: React.TouchEvent) => { if (window.innerWidth < 768 && touchStartX !== null) setTouchEndX(e.targetTouches[0].clientX); };
  const handleTouchEnd = () => {
    if (window.innerWidth < 768 && touchStartX !== null && touchEndX !== null) {
      const diff = touchStartX - touchEndX; 
      if (Math.abs(diff) > MIN_SWIPE_DISTANCE) {
        if (!isSidebarOpen && diff < 0 && touchStartX < 50) setIsSidebarOpen(true);
        else if (isSidebarOpen && diff > 0) setIsSidebarOpen(false);
      }
    }
    setTouchStartX(null); setTouchEndX(null);
  };

  const isDashboardView = !activeNoteId;
  const transitionClass = "transition-opacity duration-300";

  const contentToRender = () => {
      if (loading) { 
          return (
             <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 h-full">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Loading notes...
             </div>
          );
      }
      if (isDashboardView) {
          return (
              <div key="dashboard" className={transitionClass}>
                  <Dashboard
                      notes={visibleNotes} // Passed filtered notes
                      onSelectNote={handleNoteSelect}
                      onCreateNote={handleCreateNote}
                      onPinNote={handlePinNote}
                      onDuplicateNote={handleDuplicateNote}
                      onBulkDelete={handleBulkDelete}
                      onBulkCategory={handleBulkCategory}
                      onBulkColor={handleBulkColor}
                      availableCategories={availableCategories}
                      onBulkTags={handleBulkTags}
                      availableTags={allTags}
                  />
              </div>
          );
      }
      const currentNote = getCurrentNote();
      if (currentNote) {
          return (
             <div key="editor" className={transitionClass}>
                <Editor 
                  key={activeNoteId} 
                  note={currentNote} 
                  onChange={handleUpdateNoteState}
                  onSave={handleManualSaveCurrent}
                  settings={settings}
                  availableCategories={availableCategories}
                  onRestore={() => handleRestoreNote(activeNoteId!)}
                  onDeleteForever={() => handlePermanentDelete(activeNoteId!)}
                />
             </div>
          );
      }
      return (
         <div key="not-found" className={transitionClass + " flex-1 flex flex-col items-center justify-center"}>
            <h2 className="2xl font-bold text-gray-700 dark:text-gray-200 mb-4">Note Not Found</h2>
            <button onClick={navigateToDashboard} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">Go to Dashboard</button>
         </div>
      );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 relative">
      <Sidebar
        notes={visibleNotes}
        currentNoteId={activeNoteId} 
        onSelectNote={handleNoteSelect}
        onCreateNote={handleCreateNote}
        onDeleteNote={handleDeleteNote}
        onRestoreNote={handleRestoreNote}
        onPermanentDeleteNote={handlePermanentDelete}
        onEmptyTrash={handleEmptyTrash}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        view={sidebarView}
        onChangeView={setSidebarView}
        trashCount={trashCount}
        navigateToDashboard={navigateToDashboard}
        searchTerm={searchTerm} // Pass state down
        onSearch={setSearchTerm} // Pass setter down
      />
      
      <div className="flex-1 flex flex-col min-w-0" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}> 
        <div className="md:hidden sticky top-0 z-40 flex items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-md">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600 dark:text-gray-400"><Menu size={24} /></button>
          <span onClick={isDashboardView ? undefined : navigateToDashboard} className={`font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r cursor-pointer ${isDashboardView ? '' : 'hover:opacity-80 transition-opacity'}`} style={{backgroundImage: 'linear-gradient(to right, #DD3D2D, #F67E4B)'}}>
            {isDashboardView ? 'Dashboard' : (getCurrentNote()?.title || 'VolumeVault21')} 
          </span>
        </div>
        <div id="main-editor-content" className="flex-1 overflow-y-auto relative">
           {isSidebarOpen && <div className="fixed inset-0 z-20 md:hidden bg-black/50 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>}
           {contentToRender()} 
        </div>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onExport={handleExport}
        onRefreshNotes={loadNotes} 
      />

      {/* UNDO TOAST */}
      <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${showUndoToast ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
        <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-full shadow-xl flex items-center gap-4">
            <span className="text-sm font-medium">{undoAction?.label || 'Action completed'}</span>
            <button 
                onClick={performUndo}
                className="text-blue-400 dark:text-blue-600 font-bold text-sm uppercase hover:underline flex items-center gap-1"
            >
                <Undo2 size={16} /> Undo
            </button>
            <button onClick={() => setShowUndoToast(false)} className="ml-2 opacity-50 hover:opacity-100"><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}