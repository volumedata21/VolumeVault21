import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal';
import { Note, AppSettings } from './types';
import { noteService } from './services/noteService';
import { Menu, RefreshCw } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
  autoSave: true,
  saveInterval: 30000 // 30 seconds
};

const SETTINGS_KEY = 'volumevault_settings';
const LEGACY_SETTINGS_KEY = 'markmind_notes_v1';

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<'notes' | 'trash'>('notes');
  const [loading, setLoading] = useState(true); 

  // SWIPE/PULL STATE
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const MIN_SWIPE_DISTANCE = 60; 
  const MIN_PULL_DISTANCE = 80; 

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      let saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) {
          saved = localStorage.getItem(LEGACY_KEY);
          if (saved) {
             try {
                localStorage.setItem(SETTINGS_KEY, saved);
             } catch (e) { /* Ignore quota errors during initial migration */ }
          }
      }
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch (e) {
      console.warn("Failed to load settings from LocalStorage", e);
      return DEFAULT_SETTINGS;
    }
  });
  
  // CRITICAL FIX: The loading state is managed outside this callback to prevent loops.
  const loadNotes = useCallback(async () => {
    // Only show spinner if not already pulling/loading
    if (!loading) setLoading(true); 
    
    try {
        const loadedNotes = await noteService.getAllNotes();
        setNotes(loadedNotes);
        const activeNotes = loadedNotes.filter(n => !n.deleted);
        
        // Only set currentNoteId if it's null AND we have notes to select
        if (!currentNoteId && activeNotes.length > 0) {
          setCurrentNoteId(activeNotes[0].id);
        } else if (currentNoteId && !activeNotes.find(n => n.id === currentNoteId)) {
          // If the current note was deleted/trashed on another device, select a new active one
          setCurrentNoteId(activeNotes[0]?.id || null);
        }

    } catch (e) {
        console.error("Failed to load notes from server/IDB.", e);
    } finally {
        setLoading(false);
        setIsPulling(false);
    }
  }, [currentNoteId]); // Only depends on currentNoteId for selection logic

  // CRITICAL FIX: Ensure loadNotes runs only on mount.
  useEffect(() => {
    let isMounted = true;
    
    if (isMounted) {
      loadNotes();
    }
    
    return () => {
      isMounted = false; // Cleanup function to prevent calling setNotes on unmounted component
    };
  }, [loadNotes]); // The dependency array uses loadNotes, which now only changes when currentNoteId changes.


  // Touch event handlers for swipe-to-open and pull-to-refresh
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
        setTouchStartX(e.touches[0].clientX);
        setTouchStartY(e.touches[0].clientY);
    };

    const handleTouchEnd = (e: TouchEvent) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const swipeDistanceX = touchEndX - touchStartX;
        const swipeDistanceY = touchEndY - touchStartY;
        
        // 1. Swipe-to-Open (Horizontal)
        if (touchStartX < 50 && swipeDistanceX > MIN_SWIPE_DISTANCE && !isSidebarOpen && window.innerWidth < 768) {
            setIsSidebarOpen(true);
        }

        // 2. Pull-to-Refresh (Vertical)
        const editorContent = document.getElementById('main-editor-content');
        if (editorContent && editorContent.scrollTop === 0 && swipeDistanceY > MIN_PULL_DISTANCE) {
            if (Math.abs(swipeDistanceX) < 30) { 
                setIsPulling(true);
                loadNotes(); 
            }
        }
        
        setTouchStartX(0);
        setTouchStartY(0);
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isSidebarOpen, touchStartX, touchStartY, loadNotes]);


  // Filter notes based on current view
  const visibleNotes = useMemo(() => {
      if (sidebarView === 'trash') {
          return notes.filter(n => n.deleted);
      }
      return notes.filter(n => !n.deleted);
  }, [notes, sidebarView]);

  const trashCount = useMemo(() => {
      return notes.filter(n => n.deleted).length;
  }, [notes]);

  // Compute available categories from active notes only
  const availableCategories = useMemo(() => {
    const cats = new Set(notes.filter(n => !n.deleted).map(n => n.category || 'General'));
    return Array.from(cats).sort();
  }, [notes]);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.error("Failed to save settings to LocalStorage (Quota Exceeded)", e);
    }
  };

  const getCurrentNote = () => notes.find(n => n.id === currentNoteId);

  // Save current note to disk before switching to prevent data loss of in-memory edits
  const saveCurrentNoteToDisk = async () => {
    if (currentNoteId) {
      const note = notes.find(n => n.id === currentNoteId);
      if (note && !note.deleted) { 
        await noteService.saveNote(note);
      }
    }
  };

  const handleCreateNote = async () => {
    await saveCurrentNoteToDisk();
    const newNote = await noteService.createNote();
    setNotes(prev => [newNote, ...prev]);
    setCurrentNoteId(newNote.id);
    setSidebarView('notes'); 
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleNoteSelect = async (id: string) => {
    await saveCurrentNoteToDisk();
    setCurrentNoteId(id);
    setIsSidebarOpen(false);
  };

  const handleDeleteNote = async (id: string) => {
    await noteService.trashNote(id);
    
    setNotes(prev => prev.map(n => 
        n.id === id ? { ...n, deleted: true, updatedAt: Date.now(), deletedAt: Date.now() } : n
    ));

    if (currentNoteId === id) {
        const remaining = notes.filter(n => n.id !== id && !n.deleted);
        setCurrentNoteId(remaining[0]?.id || null);
    }
  };

  const handleRestoreNote = async (id: string) => {
      await noteService.restoreNote(id);
      setNotes(prev => prev.map(n => 
        n.id === id ? { ...n, deleted: false, updatedAt: Date.now(), deletedAt: undefined } : n
      ));
      
      if (sidebarView === 'trash') {
          setSidebarView('notes');
      }
  };

  const handlePermanentDelete = async (id: string) => {
      await noteService.permanentlyDeleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      if (currentNoteId === id) {
          setCurrentNoteId(null);
      }
  };

  const handleEmptyTrash = async () => {
      await noteService.emptyTrash();
      setNotes(prev => prev.filter(n => !n.deleted));
      const current = getCurrentNote();
      if (current && current.deleted) {
          setCurrentNoteId(null);
      }
  };

  // Updates React State and optionally persists to disk immediately
  const handleUpdateNoteState = (updates: Partial<Note>, saveToDisk: boolean = false) => {
    if (!currentNoteId) return;
    
    setNotes(prev => prev.map(note => {
      if (note.id === currentNoteId) {
        const updatedNote = { ...note, ...updates, updatedAt: Date.now() };
        
        if (saveToDisk) {
             noteService.saveNote(updatedNote).catch(e => console.error("Failed to save to server/disk", e));
        }
        
        return updatedNote;
      }
      return note;
    }));
  };

  const handleManualSaveCurrent = () => {
    // Retained for Editor compatibility
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notes));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "volumevault_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar
        notes={visibleNotes}
        currentNoteId={currentNoteId}
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
      />
      
      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0"> 
        
        {/* Mobile Header (Locked and Sticky) */}
        <div className="md:hidden sticky top-0 z-40 flex items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-md">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600 dark:text-gray-400">
            <Menu size={24} />
          </button>
          {/* Updated gradient colors */}
          <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r"
                style={{backgroundImage: 'linear-gradient(to right, #DD3D2D, #F67E4B)'}}>
            VolumeVault21
          </span>
        </div>
        
        {/* Main Editor/Loading Area - Scrollable Content Container */}
        <div id="main-editor-content" className="flex-1 overflow-y-auto relative">
           
           {/* Pull-to-Refresh Indicator (Visible when pulling or syncing) */}
           <div className={`absolute top-0 left-0 right-0 h-10 flex items-center justify-center transition-opacity ${isPulling || loading ? 'opacity-100' : 'opacity-0'}`}>
                <RefreshCw size={20} className="animate-spin text-blue-500" />
           </div>

           {loading && !isPulling ? ( 
             <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 h-full">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading notes from server...
             </div>
           ) : currentNoteId ? (
             <Editor 
               key={currentNoteId} 
               note={getCurrentNote()!} 
               onChange={handleUpdateNoteState}
               onSave={handleManualSaveCurrent}
               settings={settings}
               availableCategories={availableCategories}
               onRestore={() => handleRestoreNote(currentNoteId)}
               onDeleteForever={() => handlePermanentDelete(currentNoteId)}
             />
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center h-full">
                <div className="max-w-md">
                   <h2 className="2xl font-bold text-gray-700 dark:text-gray-200 mb-4">
                       {sidebarView === 'trash' ? 'Trash Bin' : 'Welcome to VolumeVault21'}
                   </h2>
                   <p className="mb-8">
                       {sidebarView === 'trash' 
                           ? 'Select a note to restore or delete it permanently.' 
                           : 'Select a note from the sidebar or create a new one to get started.'}
                   </p>
                   {sidebarView === 'notes' && (
                       <button 
                       onClick={handleCreateNote}
                       className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transition-colors"
                       >
                       Create First Note
                       </button>
                   )}
                </div>
             </div>
           )}
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
    </div>
  );
}