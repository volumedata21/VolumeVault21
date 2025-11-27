import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, clear } from 'idb-keyval';

const STORAGE_KEY = 'volumevault_notes_v1';
const LEGACY_KEY = 'markmind_notes_v1';

// Helper to construct the full URL, defaulting to local proxy
const getFullApiUrl = (endpoint: string, serverUrl?: string): string => {
    // Fallback to relative path if serverUrl is not set (e.g., local dev environment)
    if (!serverUrl || serverUrl.trim() === '') {
        return endpoint; 
    }
    // Ensure the URL is correctly joined
    const base = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
};


// Helper to push a single note to the server (using the LWW endpoint)
const saveToServer = async (note: Note, serverUrl?: string) => {
    const url = getFullApiUrl('api/notes', serverUrl);
    
    const response = await fetch(url, { 
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
const fetchAllNotesFromServer = async (serverUrl?: string): Promise<Note[]> => {
    const url = getFullApiUrl('api/notes', serverUrl);

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`Server fetch failed: ${response.statusText}`);
    }
    return response.json();
};


export const noteService = {
  getAllNotes: async (serverUrl?: string): Promise<Note[]> => {
    let notes: Note[] = [];
    let serverLoadSuccessful = false;

    try {
        // CRITICAL: Pass serverUrl to the network fetch helper
        const serverNotes = await fetchAllNotesFromServer(serverUrl);
        console.log(`[SYNC] Successfully loaded ${serverNotes.length} notes from server.`);
        
        // Use server notes as the base
        notes = serverNotes; 
        serverLoadSuccessful = true;

    } catch (e) {
        // If server fails (e.g., 404/Network), fall back to local IndexedDB
        console.warn("[SYNC] Server load failed. Falling back to local IndexedDB.", e);
    }
    
    // Fallback/Update Logic
    if (!serverLoadSuccessful) {
        // If server failed, load notes from the local IndexedDB
        notes = (await values()) || [];
    } else {
        // FIX: If server succeeded, wipe and overwrite IDB with server data.
        await clear(); // Clear old local data
        await Promise.all(notes.map(n => set(n.id, n)));
        console.log(`[SYNC] IndexedDB overwritten with server data.`);
    }

    // 3. Check for legacy LocalStorage data (cleanup remains)
    const legacyData = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    
    if (legacyData) {
        console.log("Legacy LocalStorage data detected. Processing...");
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
    
    // NOTE: saveToServer does not accept serverUrl here as it's meant for quick local saves
    // The App component must ensure the current note has the latest serverUrl saved to its state 
    // before calling this (or rely on sync to push the update). We leave this simple for local speed.
    try {
        // 1. PUSH to server first (triggers LWW comparison)
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
    // NOTE: This relies on the default relative path.
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
      // 2. Save server status asynchronously (relies on default relative path)
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
      // 2. Save server status asynchronously (relies on default relative path)
      saveToServer(updated).catch(e => console.error("Failed async server restore update", e));
    }
  },

  // Hard delete
  permanentlyDeleteNote: async (id: string): Promise<void> => {
    await del(id);
  },

  emptyTrash: async (): Promise<void> => {
    const notes: Note[] = (await values()) || [];
    const trashIds = notes.filter(n => n.deleted).map(n => n.id);
    for (const id of trashIds) {
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
        
        await Promise.all(validNotes.map(n => set(n.id, n)));
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  // CRITICAL: Use the configured serverUrl for the full sync operation
  syncNotes: async (serverUrl: string | undefined): Promise<void> => {
      // 1. Send all local notes to the server (Outbound Sync)
      try {
          const localNotes = (await values()) || []; 
          const syncPromises = localNotes.map(note => 
            // Pass the URL to saveToServer for explicit remote push
            saveToServer(note, serverUrl).catch(e => {
                console.error(`Failed to push note ${note.id} during sync.`, e);
          }));
          await Promise.all(syncPromises);

          // 2. Pull down all server changes (Inbound Sync)
          console.log("[SYNC] Outbound push complete. Triggering full inbound refresh...");
          // Pass the URL to getAllNotes to fetch from the remote source
          await noteService.getAllNotes(serverUrl); 
          
      } catch (e) {
          console.error("Failed to execute full sync process.", e);
          throw e;
      }
  }
};