import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal';
import { Note, AppSettings } from './types';
import { noteService } from './services/noteService';
import { Menu } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
    autoSave: true,
    saveInterval: 30000 // 30 seconds
};

const SETTINGS_KEY = 'volumevault_settings';
const LEGACY_SETTINGS_KEY = 'markmind_settings';

export default function App() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            // Try new key
            let saved = localStorage.getItem(SETTINGS_KEY);
            // Fallback to old key
            if (!saved) {
                saved = localStorage.getItem(LEGACY_SETTINGS_KEY);
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

    // Load notes on mount (Async)
    useEffect(() => {
        const loadNotes = async () => {
            const loadedNotes = await noteService.getAllNotes();
            setNotes(loadedNotes);
            if (loadedNotes.length > 0 && !currentNoteId) {
                setCurrentNoteId(loadedNotes[0].id);
            }
        };
        loadNotes();
    }, []);

    // Compute available categories from all notes
    const availableCategories = useMemo(() => {
        const cats = new Set(notes.map(n => n.category || 'General'));
        return Array.from(cats).sort();
    }, [notes]);

    const handleUpdateSettings = (newSettings: AppSettings) => {
        setSettings(newSettings);
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error("Failed to save settings to LocalStorage (Quota Exceeded)", e);
            // UI still updates via state, so we don't block the user.
        }
    };

    const getCurrentNote = () => notes.find(n => n.id === currentNoteId);

    const handleCreateNote = async () => {
        // Safety save current note before switching/creating
        if (currentNoteId) await saveNoteToDisk(currentNoteId);

        const newNote = await noteService.createNote();
        setNotes(prev => [newNote, ...prev]);
        setCurrentNoteId(newNote.id);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    const handleNoteSelect = async (id: string) => {
        // Safety save current note before switching
        if (currentNoteId) await saveNoteToDisk(currentNoteId);

        setCurrentNoteId(id);
        setIsSidebarOpen(false);
    };

    const handleDeleteNote = async (id: string) => {
        if (confirm('Are you sure you want to delete this note?')) {
            await noteService.deleteNote(id);
            const remaining = notes.filter(n => n.id !== id);
            setNotes(remaining);
            if (currentNoteId === id) {
                setCurrentNoteId(remaining.length > 0 ? remaining[0].id : null);
            }
        }
    };

    // Updates React State ONLY (Fast, for UI Sync)
    const handleUpdateNoteState = (updates: Partial<Note>) => {
        if (!currentNoteId) return;

        setNotes(prev => prev.map(note => {
            if (note.id === currentNoteId) {
                // We update the 'updatedAt' timestamp in memory to reflect activity
                return { ...note, ...updates, updatedAt: Date.now() };
            }
            return note;
        }));
    };

    // Persists to Disk (Async, for AutoSave/Manual Save)
    const saveNoteToDisk = async (id: string) => {
        // Note: We use the functional update pattern's result or current state.
        // However, since this is async and decoupled from the immediate event loop of setNotes,
        // we rely on the state being reasonably up to date.
        // Ideally, for manual save, we should pass the content directly, but this works for 99% cases.
        const noteToSave = notes.find(n => n.id === id);
        if (noteToSave) {
            await noteService.saveNote(noteToSave);
            console.log(`Saved note ${id} to disk.`);
        }
    };

    const handleManualSaveCurrent = () => {
        if (currentNoteId) {
            // Small timeout to allow state to settle if needed, though usually React batches this well enough
            // for the subsequent async call.
            saveNoteToDisk(currentNoteId);
        }
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notes));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "volumevault_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <Sidebar
                notes={notes}
                currentNoteId={currentNoteId}
                onSelectNote={handleNoteSelect}
                onCreateNote={handleCreateNote}
                onDeleteNote={handleDeleteNote}
                isOpen={isSidebarOpen}
                onCloseMobile={() => setIsSidebarOpen(false)}
                onExport={handleExport}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <div className="md:hidden flex items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600 dark:text-gray-400">
                        <Menu size={24} />
                    </button>
                    <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">VolumeVault21</span>
                </div>

                {currentNoteId ? (
                    <Editor
                        note={getCurrentNote()!}
                        onChange={handleUpdateNoteState}
                        onSave={handleManualSaveCurrent}
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