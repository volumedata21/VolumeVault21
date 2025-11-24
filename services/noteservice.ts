import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, setMany } from 'idb-keyval';

export const noteService = {
  // 1. READ: Filter out deleted notes so they don't show in the UI
  getAllNotes: async (): Promise<Note[]> => {
    try {
      const notes = (await values()) || [];
      
      // Background Sync (don't await)
      noteService.sync().catch(console.error);
      
      return (notes as Note[])
        .filter(n => !n.isDeleted) // <--- HIDES DELETED NOTES
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error("Failed to load notes", e);
      return [];
    }
  },

  // 2. WRITE
  saveNote: async (note: Note): Promise<Note> => {
    const updatedNote = { 
        ...note, 
        updatedAt: Date.now(),
        synced: false 
    };
    
    // Save to Local DB
    await set(note.id, updatedNote);

    // Attempt Cloud Sync
    noteService.pushNoteToServer(updatedNote).catch(() => {
        console.log("Offline: Change saved locally.");
    });

    return updatedNote;
  },

  // 3. CREATE
  createNote: async (): Promise<Note> => {
    const newNote: Note = {
      id: uuidv4(),
      title: 'Untitled Note',
      content: '# New Note\n\nStart writing here...',
      category: 'General',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      synced: false,
      isDeleted: false
    };
    await noteService.saveNote(newNote);
    return newNote;
  },

  // 4. DELETE (Soft Delete)
  deleteNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note) {
        // We DO NOT use del(id). We update it to be deleted.
        // This ensures the deletion syncs to other devices.
        await noteService.saveNote({ ...note, isDeleted: true });
    }
  },

  // --- SYNC ENGINE ---
  pushNoteToServer: async (note: Note): Promise<void> => {
      const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(note)
      });
      if (res.ok) {
          // Mark as synced locally
          await set(note.id, { ...note, synced: true });
      }
  },

  sync: async (): Promise<void> => {
      if (!navigator.onLine) return;

      try {
          // A. Push Local Changes
          const allLocal: Note[] = await values();
          const dirtyNotes = allLocal.filter(n => n.synced === false);
          if (dirtyNotes.length > 0) {
              await Promise.all(dirtyNotes.map(n => noteService.pushNoteToServer(n)));
          }

          // B. Pull Server Changes
          const res = await fetch('/api/notes');
          if (res.ok) {
              const serverNotes: Note[] = await res.json();
              for (const sNote of serverNotes) {
                  const localNote = allLocal.find(l => l.id === sNote.id);
                  if (!localNote || sNote.updatedAt > localNote.updatedAt) {
                      await set(sNote.id, { ...sNote, synced: true });
                  }
              }
          }
      } catch (e) {
          console.error("Sync failed", e);
      }
  }
};