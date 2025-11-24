import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal';
import { Note, AppSettings, ViewMode } from './types'; // Import ViewMode
import { noteService } from './services/noteService';
import { Menu } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = { autoSave: true, saveInterval: 30000 };
const SETTINGS_KEY = 'volumevault_settings';
const LEGACY_SETTINGS_KEY = 'markmind_settings';

// Must define the BroadcastChannel outside the component so it persists.
const SYNC_CHANNEL = new BroadcastChannel('volumevault-sync');

export default function App() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('all'); // <--- NEW STATE

    // Load Settings
    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            let saved = localStorage.getItem(SETTINGS_KEY);
            if (!saved) {
                saved = localStorage.getItem(LEGACY_SETTINGS_KEY);
                if (saved) {
                    try {
                        localStorage.setItem(SETTINGS_KEY, saved);
                    } catch (e) { /* Ignore quota errors */ }
                }
            }
            return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
        } catch (e) {
            console.warn("Failed to load settings", e);
            return DEFAULT_SETTINGS;
        }
    });

    // Function to fetch notes from IDB and update state
    const refreshNotes = async (preserveSelection = true) => {
        const loadedNotes = await noteService.getAllNotes();
        setNotes(loadedNotes);
        
        // Logic to keep the current note selected, or select the first non-deleted note
        if (!currentNoteId || !loadedNotes.find(n => n.id === currentNoteId)) {
            const firstAvailable = loadedNotes.find(n => !n.isDeleted);
            setCurrentNoteId(firstAvailable ? firstAvailable.id : null);
        }
    };


    useEffect(() => {
        refreshNotes(false);

        const handleSync = () => {
            noteService.sync().then(() => refreshNotes(true));
        };
        
        const handleBroadcast = (event: MessageEvent) => {
            if (event.data.type === 'LOCAL_UPDATE' || event.data.type === 'PULL_SUCCESS' || event.data.type === 'SYNC_SUCCESS') {
                refreshNotes(true);
            }
        };

        window.addEventListener('online', handleSync);
        window.addEventListener('focus', handleSync);
        SYNC_CHANNEL.addEventListener('message', handleBroadcast);

        return () => {
            window.removeEventListener('online', handleSync);
            window.removeEventListener('focus', handleSync);
            SYNC_CHANNEL.removeEventListener('message', handleBroadcast);
            SYNC_CHANNEL.close();
        };
    }, []);

    // Effect to auto-switch from 'trash' if trash becomes empty
    useEffect(() => {
        if (viewMode === 'trash' && notes.filter(n => n.isDeleted).length === 0) {
            setViewMode('all');
        }
    }, [notes, viewMode]);


    const availableCategories = useMemo(() => {
        const cats = new Set(notes.map(n => n.category || 'General'));
        return Array.from(cats).sort();
    }, [notes]);

    const handleUpdateSettings = (newSettings: AppSettings) => {
        setSettings(newSettings);
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    };

    const getCurrentNote = () => notes.find(n => n.id === currentNoteId);

    const handleCreateNote = async () => {
        if (currentNoteId) {
             const prevNote = notes.find(n => n.id === currentNoteId);
             if (prevNote) await noteService.saveNote(prevNote);
        }

        const newNote = await noteService.createNote();
        setNotes(prev => [newNote, ...prev]);
        setCurrentNoteId(newNote.id);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
        setViewMode('all'); // Ensure we are looking at the new note
    };

    const handleNoteSelect = async (id: string) => {
        if (currentNoteId) {
             const prevNote = notes.find(n => n.id === currentNoteId);
             if (prevNote) await noteService.saveNote(prevNote);
        }
        setCurrentNoteId(id);
        // FIX 2: Ensure sidebar closes immediately to prevent mobile screen lock
        setIsSidebarOpen(false); 
    };

    const handleDeleteNote = async (id: string) => {
        if (confirm(`Are you sure you want to move "${notes.find(n => n.id === id)?.title || 'this note'}" to the Trash?`)) {
            await noteService.deleteNote(id);
            // Re-fetch will hide the note and auto-select the next one.
            refreshNotes();
        }
    };
    
    // NEW FUNCTION: Restore note from trash
    const handleRestoreNote = async (id: string) => {
        await noteService.restoreNote(id);
        refreshNotes(true);
        setViewMode('all');
    };
    
    // NEW FUNCTION: Permanently delete notes
    const handleEmptyTrash = async () => {
        const trashCount = notes.filter(n => n.isDeleted).length;
        if (trashCount === 0) return;
        
        if (confirm(`Are you sure you want to permanently delete all ${trashCount} items in the trash? This cannot be undone.`)) {
            await noteService.emptyTrash();
            refreshNotes(false);
        }
    };


    // Updates React State ONLY (Fast, for UI Sync)
    const handleUpdateNoteState = (updates: Partial<Note>) => {
        if (!currentNoteId) return;

        setNotes(prev => prev.map(note => {
            if (note.id === currentNoteId) {
                return { ...note, ...updates, updatedAt: Date.now() };
            }
            return note;
        }));
    };

    const saveNoteToDisk = async (id: string) => {
        const noteToSave = notes.find(n => n.id === currentNoteId);
        if (noteToSave) {
            await noteService.saveNote(noteToSave);
            console.log(`Saved note ${id} to disk.`);
        }
    };

    const handleManualSaveCurrent = () => {
        if (currentNoteId) {
            saveNoteToDisk(currentNoteId);
        }
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notes.filter(n => !n.isDeleted)));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "volumevault_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const displayedNote = getCurrentNote();
    
    const isNoteInTrash = displayedNote?.isDeleted && viewMode === 'all';


    return (
        <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <Sidebar
                notes={notes}
                currentNoteId={currentNoteId}
                onSelectNote={handleNoteSelect}
                onCreateNote={handleCreateNote}
                onDeleteNote={handleDeleteNote}
                onRestoreNote={handleRestoreNote}
                onEmptyTrash={handleEmptyTrash}
                isOpen={isSidebarOpen}
                onCloseMobile={() => setIsSidebarOpen(false)}
                onExport={handleExport}
                onOpenSettings={() => setIsSettingsOpen(true)}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
            />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header - FIX 1: Added z-20 class to keep it on top of the editor */}
                <div className="md:hidden flex items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 relative z-20">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600 dark:text-gray-400">
                        <Menu size={24} />
                    </button>
                    <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">VolumeVault21</span>
                </div>

                {currentNoteId && displayedNote ? (
                    <Editor
                        note={displayedNote}
                        onChange={handleUpdateNoteState}
                        onSave={handleManualSaveCurrent}
                        onDelete={() => handleDeleteNote(currentNoteId)} 
                        settings={settings}
                        availableCategories={availableCategories}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8 text-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 text-gray-400 dark:text-gray-500">
                            <Menu size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">No Note Selected</h2>
                        <p className="max-w-xs text-sm">Select a note from the sidebar or create a new one to start writing.</p>
                        <button onClick={handleCreateNote} className="mt-6 text-blue-700 dark:text-blue-400 font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1">Create a note</button>
                    </div>
                )}
            </div>

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
            />
        </div>
    );
}