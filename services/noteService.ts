import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, setMany } from 'idb-keyval';

// Initialize a Broadcast Channel for cross-tab communication
const SYNC_CHANNEL = new BroadcastChannel('volumevault-sync');

export const noteService = {
  // 1. READ: Filter out deleted notes so they don't show in the UI
  getAllNotes: async (): Promise<Note[]> => {
    try {
      const notes = (await values()) || [];
      
      // Background Sync (don't await)
      noteService.sync().catch(console.error);
      
      return (notes as Note[])
        .filter(n => !n.isDeleted) 
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

    // FIX: Send a local update signal right after saving locally
    SYNC_CHANNEL.postMessage({ type: 'LOCAL_UPDATE', id: note.id });

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
        await noteService.saveNote({ ...note, isDeleted: true });
        SYNC_CHANNEL.postMessage({ type: 'NOTE_DELETED', id: note.id });
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
          // If successful, tell all tabs to check for updates
          SYNC_CHANNEL.postMessage({ type: 'SYNC_SUCCESS' }); 
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
          if (!res.ok) return;
          const serverNotes: Note[] = await res.json();
          
          let updated = false;
          let notesToUpdate = [];

          // C. MERGE
          const allLocalMap = new Map(allLocal.map(n => [n.id, n]));

          for (const sNote of serverNotes) {
              const localNote = allLocalMap.get(sNote.id);
              // Only pull if server version is newer or the note is new locally
              if (!localNote || sNote.updatedAt > localNote.updatedAt) {
                  notesToUpdate.push([sNote.id, { ...sNote, synced: true }]);
                  updated = true;
              }
          }
          
          if (notesToUpdate.length > 0) {
              // Atomically update all pulled notes
              await setMany(notesToUpdate);
              console.log(`Pulled ${notesToUpdate.length} updates from server.`);
          }
          
          if (updated) {
              // If we pulled anything new, tell all tabs to refresh their UI
              SYNC_CHANNEL.postMessage({ type: 'PULL_SUCCESS' }); 
          }
      } catch (e) {
          console.error("Sync failed", e);
      }
  }
};