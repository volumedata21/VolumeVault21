import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, setMany } from 'idb-keyval';

export const noteService = {
  // 1. READ: Always read from Local DB (Fast & Offline-ready)
  getAllNotes: async (): Promise<Note[]> => {
    try {
      const notes = (await values()) || [];
      // Trigger a sync in the background without blocking the UI
      noteService.sync().catch(console.error);
      return (notes as Note[]).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error("Failed to load local notes", e);
      return [];
    }
  },

  // 2. WRITE: Save to Local DB immediately, then try to Sync
  saveNote: async (note: Note): Promise<Note> => {
    const updatedNote = { 
        ...note, 
        updatedAt: Date.now(),
        synced: false // Mark as "dirty" so we know it needs uploading
    };
    
    // Save locally first (guarantees offline support)
    await set(note.id, updatedNote);

    // Try to sync immediately (fire and forget)
    // If we are offline, this will fail silently, which is fine.
    // The next time the app loads or goes online, it will retry.
    noteService.pushNoteToServer(updatedNote).catch(() => {
        console.log("Offline: Note saved locally, will sync later.");
    });

    return updatedNote;
  },

  createNote: async (): Promise<Note> => {
    const newNote: Note = {
      id: uuidv4(),
      title: 'Untitled Note',
      content: '# New Note\n\nStart writing here...',
      category: 'General',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      synced: false
    };
    await set(newNote.id, newNote);
    return newNote;
  },

  deleteNote: async (id: string): Promise<void> => {
    await del(id);
    // Ideally, you'd add a "deleted" flag and sync that to the server too
    // For now, this is a local-only delete
  },

  // --- SYNC ENGINE ---

  // Helper: Push a single note to the server
  pushNoteToServer: async (note: Note): Promise<void> => {
      const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(note)
      });
      if (res.ok) {
          // If successful, mark as synced locally
          await set(note.id, { ...note, synced: true });
      }
  },

  // Main Sync Function: Pushes dirty notes, Pulls new server notes
  sync: async (): Promise<void> => {
      if (!navigator.onLine) return; // Don't bother if offline

      try {
          // A. PUSH: Find all local notes that aren't synced
          const allLocal: Note[] = await values();
          const dirtyNotes = allLocal.filter(n => n.synced === false);
          
          if (dirtyNotes.length > 0) {
              console.log(`Pushing ${dirtyNotes.length} notes to server...`);
              await Promise.all(dirtyNotes.map(n => noteService.pushNoteToServer(n)));
          }

          // B. PULL: Get all notes from server
          const res = await fetch('/api/notes');
          if (!res.ok) return;
          const serverNotes: Note[] = await res.json();

          // C. MERGE: "Last Write Wins" strategy
          // If server has a newer version, update local IDB
          let updatesCount = 0;
          for (const sNote of serverNotes) {
              const localNote = allLocal.find(l => l.id === sNote.id);
              
              // If we don't have it, or server is newer, take server version
              if (!localNote || sNote.updatedAt > localNote.updatedAt) {
                  await set(sNote.id, { ...sNote, synced: true });
                  updatesCount++;
              }
          }
          
          if (updatesCount > 0) {
              console.log(`Pulled ${updatesCount} updates from server.`);
              // Note: You might need to trigger a UI refresh here
              // usually by reloading the page or using a React Context
          }

      } catch (e) {
          console.error("Sync failed:", e);
      }
  }
};