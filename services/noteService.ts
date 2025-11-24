import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, setMany, keys } from 'idb-keyval'; // Import keys

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
        // Removed the filter here so App.tsx can handle it, but ensured isDeleted is present
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
        synced: false,
        // Ensure isDeleted defaults to false if not set
        isDeleted: note.isDeleted ?? false 
    };
    
    await set(note.id, updatedNote);
    SYNC_CHANNEL.postMessage({ type: 'LOCAL_UPDATE', id: note.id });
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
  
  // 4. RESTORE (Soft Delete reversal)
  restoreNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note && note.isDeleted) {
        await noteService.saveNote({ ...note, isDeleted: false });
    }
  },

  // 5. DELETE (Soft Delete - moves to trash)
  deleteNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note) {
        await noteService.saveNote({ ...note, isDeleted: true });
        SYNC_CHANNEL.postMessage({ type: 'NOTE_DELETED', id: note.id });
    }
  },

  // 6. HARD DELETE (Empty Trash)
  emptyTrash: async (): Promise<void> => {
      const allNotes: Note[] = await values();
      const deletedNotes = allNotes.filter(n => n.isDeleted);
      const deletedIds = deletedNotes.map(n => n.id);
      
      if (deletedIds.length === 0) return;

      // 6a. Delete from server (Hard Delete route)
      await Promise.all(deletedIds.map(id => 
        fetch(`/api/notes/${id}`, { method: 'DELETE' }).catch(console.error)
      ));
      
      // 6b. Delete from local storage (IDB)
      await Promise.all(deletedIds.map(id => del(id)));

      SYNC_CHANNEL.postMessage({ type: 'PULL_SUCCESS' });
  },


  // --- SYNC ENGINE ---
  pushNoteToServer: async (note: Note): Promise<void> => {
      // If the note is marked as deleted, we send a soft-delete (tombstone) POST request.
      // If it's a hard delete, it gets handled by emptyTrash, which calls the DELETE route.
      const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(note)
      });
      if (res.ok) {
          await set(note.id, { ...note, synced: true });
          SYNC_CHANNEL.postMessage({ type: 'SYNC_SUCCESS' }); 
      }
  },

  sync: async (): Promise<void> => {
      if (!navigator.onLine) return;

      try {
          const allLocal: Note[] = await values();
          const dirtyNotes = allLocal.filter(n => n.synced === false);
          if (dirtyNotes.length > 0) {
              await Promise.all(dirtyNotes.map(n => noteService.pushNoteToServer(n)));
          }

          const res = await fetch('/api/notes');
          if (!res.ok) return;
          const serverNotes: Note[] = await res.json();
          
          let updated = false;
          let notesToUpdate = [];

          const allLocalMap = new Map(allLocal.map(n => [n.id, n]));

          for (const sNote of serverNotes) {
              const localNote = allLocalMap.get(sNote.id);
              if (!localNote || sNote.updatedAt > localNote.updatedAt) {
                  notesToUpdate.push([sNote.id, { ...sNote, synced: true }]);
                  updated = true;
              }
          }
          
          if (notesToUpdate.length > 0) {
              await setMany(notesToUpdate);
          }
          
          if (updated) {
              SYNC_CHANNEL.postMessage({ type: 'PULL_SUCCESS' }); 
          }
      } catch (e) {
          console.error("Sync failed", e);
      }
  }
};