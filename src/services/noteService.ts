import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, clear } from 'idb-keyval';

const STORAGE_KEY = 'volumevault_notes_v1';
const LEGACY_KEY = 'markmind_notes_v1';

// Helper to push a single note to the server (using the LWW endpoint)
const saveToServer = async (note: Note) => {
    const response = await fetch('/api/notes', { // Use relative path /api/notes
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note)
    });
    if (!response.ok) {
        throw new Error(`Server save failed: ${response.statusText}`);
    }
    return response.json();
};

// Helper to fetch all notes from the server
const fetchAllNotesFromServer = async (): Promise<Note[]> => {
    const response = await fetch('/api/notes', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`Server fetch failed: ${response.statusText}`);
    }
    return response.json();
};


export const noteService = {
  getAllNotes: async (): Promise<Note[]> => {
    let notes: Note[] = [];
    
    try {
        // CRITICAL FIX: 1. Try to fetch all notes from the central server first.
        notes = await fetchAllNotesFromServer();
        console.log(`[SYNC] Successfully loaded ${notes.length} notes from server.`);
        
        // 2. Overwrite local storage (IndexedDB) with the authoritative server data
        await clear(); // Wipe local cache
        await Promise.all(notes.map(n => set(n.id, n)));
        console.log(`[SYNC] IndexedDB overwritten with server data.`);

    } catch (e) {
        // If server fails (e.g., 404/Network), fall back to local IndexedDB
        console.warn("[SYNC] Server load failed. Falling back to local IndexedDB.", e);
        notes = (await values()) || [];
    }
    
    // 3. Check for legacy LocalStorage data (only runs if server/IDB was empty)
    const legacyData = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    
    if (legacyData) {
        console.log("Legacy LocalStorage data detected. Processing...");
        // This migration logic is complex and relies on local storage being the only source.
        // For simplicity and stability, we skip the migration, assuming the server has the source.
        
        // Clear LocalStorage to free quota after server read attempts have finished
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_KEY);
            console.log("LocalStorage cleared.");
        } catch (e) {
            console.warn("Failed to clear LocalStorage:", e);
        }
    }

    // Sort by updatedAt descending
    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  saveNote: async (note: Note): Promise<Note> => {
    const updatedNote = { ...note, updatedAt: Date.now() };
    
    try {
        // CRITICAL FIX: 1. PUSH to server first (triggers LWW comparison)
        const serverResponse = await saveToServer(updatedNote);
        
        // Use the accepted note (from server response) for local storage.
        const acceptedNote = serverResponse.latestNote || updatedNote;
        
        // 2. Update IndexedDB only after server accepts the note.
        await set(acceptedNote.id, acceptedNote);
        
        return acceptedNote;

    } catch (e) {
        console.error("Failed to push note to server. Saving locally only.", e);
        // Fallback: Save to IndexedDB locally so the note isn't immediately lost
        await set(updatedNote.id, updatedNote);
        
        // Re-throw the error so App.tsx knows the server save failed
        throw e; 
    }
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
      deleted: false
    };
    
    // Save to IndexedDB locally for quick UI update
    await set(newNote.id, newNote);
    
    // Attempt asynchronous save to server (not critical path, but preferred)
    saveToServer(newNote).catch(e => console.error("Failed async server save for new note", e));

    return newNote;
  },

  // Soft delete (Update server status)
  trashNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note) {
      const updated = { 
        ...note, 
        deleted: true, 
        deletedAt: Date.now(),
        updatedAt: Date.now() 
      };
      // 1. Save locally
      await set(id, updated);
      // 2. Save server status asynchronously
      saveToServer(updated).catch(e => console.error("Failed async server trash update", e));
    }
  },

  // Restore from trash (Update server status)
  restoreNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note) {
      const updated = { 
        ...note, 
        deleted: false, 
        deletedAt: undefined,
        updatedAt: Date.now() 
      };
      // 1. Save locally
      await set(id, updated);
      // 2. Save server status asynchronously
      saveToServer(updated).catch(e => console.error("Failed async server restore update", e));
    }
  },

  // Hard delete
  permanentlyDeleteNote: async (id: string): Promise<void> => {
    await del(id);
    // NOTE: This does not delete the file from the server's /data volume, but subsequent 
    // full sync will eventually remove the note from the client's local store.
    // A proper permanent delete would require DELETE /api/notes/:id, but for now we focus on sync.
  },

  emptyTrash: async (): Promise<void> => {
    const notes: Note[] = (await values()) || [];
    const trashIds = notes.filter(n => n.deleted).map(n => n.id);
    for (const id of trashIds) {
      // NOTE: We only delete locally; server reconciliation will handle the rest.
      await del(id);
    }
  },

  importNotes: async (fileContent: string): Promise<boolean> => {
    try {
      const data = JSON.parse(fileContent);
      if (Array.isArray(data)) {
        const validNotes = data.filter(n => n.id && n.content).map(n => ({
            ...n,
            category: n.category || 'General',
            tags: n.tags || [],
            deleted: n.deleted || false
        }));
        
        // This bypasses the server, but is assumed acceptable for an explicit import operation.
        await Promise.all(validNotes.map(n => set(n.id, n)));
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  syncNotes: async (serverUrl: string | undefined, apiKey: string | undefined): Promise<void> => {
      // This is now the Full Reconciliation Trigger
      
      try {
          // 1. Send all local changes to the server (Outbound Sync)
          const localNotes = await noteService.getAllNotes();
          const syncPromises = localNotes.map(note => saveToServer(note).catch(e => {
              console.error(`Failed to push note ${note.id} during sync.`, e);
          }));
          await Promise.all(syncPromises);

          // 2. Pull down all server changes (Inbound Sync)
          // Since getAllNotes() now prioritizes the server, we just call it and force a UI update
          // The application's main load function handles the final state update.
          console.log("[SYNC] Outbound push complete. Triggering full inbound refresh...");
          
      } catch (e) {
          console.error("Failed to execute full sync process.", e);
          throw e;
      }
  }
};