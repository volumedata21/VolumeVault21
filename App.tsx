import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal';
import { Note, AppSettings } from './types';
import { noteService } from './services/noteService';
import { Menu } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = { autoSave: true, saveInterval: 30000 };
const SETTINGS_KEY = 'volumevault_settings';

export default function App() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
        } catch (e) { return DEFAULT_SETTINGS; }
    });

    // --- LOAD & SYNC ---
    const refreshNotes = async (preserveSelection = true) => {
        const loadedNotes = await noteService.getAllNotes();
        setNotes(loadedNotes);
        
        // If current note was deleted or list was empty, select first available
        if (!preserveSelection || (currentNoteId && !loadedNotes.find(n => n.id === currentNoteId))) {
            setCurrentNoteId(loadedNotes.length > 0 ? loadedNotes[0].id : null);
        } else if (!currentNoteId && loadedNotes.length > 0) {
            setCurrentNoteId(loadedNotes[0].id);
        }
    };

    useEffect(() => {
        refreshNotes(false);

        const handleSync = () => refreshNotes(true);
        window.addEventListener('online', handleSync);
        window.addEventListener('focus', handleSync);
        return () => {
            window.removeEventListener('online', handleSync);
            window.removeEventListener('focus', handleSync);
        };
    }, []);

    // --- ACTIONS ---
    const handleCreateNote = async () => {
        const newNote = await noteService.createNote();
        setNotes(prev => [newNote, ...prev]);
        setCurrentNoteId(newNote.id);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    const handleNoteSelect = async (id: string) => {
        // Save previous note before switching
        if (currentNoteId) {
            const prevNote = notes.find(n => n.id === currentNoteId);
            if (prevNote) await noteService.saveNote(prevNote);
        }
        setCurrentNoteId(id);
        setIsSidebarOpen(false);
    };

    // THE CRITICAL FIX: Optimistic Delete
    const handleDeleteNote = async (id: string) => {
        // 1. Update UI IMMEDIATELY
        const remaining = notes.filter(n => n.id !== id);
        setNotes(remaining);
        
        // 2. Handle selection if we deleted the active note
        if (currentNoteId === id) {
            setCurrentNoteId(remaining.length > 0 ? remaining[0].id : null);
        }

        // 3. Perform actual delete in background
        await noteService.deleteNote(id);
    };

    const handleUpdateNoteState = (updates: Partial<Note>) => {
        if (!currentNoteId) return;
        setNotes(prev => prev.map(note => 
            note.id === currentNoteId ? { ...note, ...updates, updatedAt: Date.now() } : note
        ));
    };

    const handleManualSaveCurrent = () => {
        if (currentNoteId) {
            const note = notes.find(n => n.id === currentNoteId);
            if (note) noteService.saveNote(note);
        }
    };

    // --- RENDER HELPERS ---
    const getCurrentNote = () => notes.find(n => n.id === currentNoteId);
    const availableCategories = useMemo(() => {
        const cats = new Set(notes.map(n => n.category || 'General'));
        return Array.from(cats).sort();
    }, [notes]);

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
                onExport={() => {}}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />

            <div className="flex-1 flex flex-col min-w-0">
                <div className="md:hidden flex items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600">
                        <Menu size={24} />
                    </button>
                    <span className="font-bold text-lg text-blue-600">VolumeVault21</span>
                </div>

                {currentNoteId && getCurrentNote() ? (
                    <Editor
                        note={getCurrentNote()!}
                        onChange={handleUpdateNoteState}
                        onSave={handleManualSaveCurrent}
                        onDelete={() => handleDeleteNote(currentNoteId)}
                        settings={settings}
                        availableCategories={availableCategories}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                            <Menu size={32} />
                        </div>
                        <p>No Note Selected</p>
                        <button onClick={handleCreateNote} className="mt-4 text-blue-600 hover:underline">Create a note</button>
                    </div>
                )}
            </div>

            <SettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)} 
                settings={settings} 
                onUpdateSettings={s => {
                    setSettings(s);
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
                }} 
            />
        </div>
    );
}