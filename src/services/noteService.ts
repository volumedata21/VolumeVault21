import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, clear } from 'idb-keyval';

const STORAGE_KEY = 'volumevault_notes_v1';
const LEGACY_KEY = 'markmind_notes_v1';

// Helper to construct the full URL, defaulting to local proxy
const getFullApiUrl = (endpoint: string, serverUrl?: string): string => {
    // CRITICAL FIX: If serverUrl is NOT set (local dev), use the absolute origin.
    // This resolves the /note/api/notes 404 error during history-based navigation.
    if (!serverUrl || serverUrl.trim() === '') {
        // We assume endpoint starts with /api/ or /uploads/
        // Use window.location.origin for an absolute path from the root.
        return window.location.origin + endpoint; 
    }
    // For configured remote URL, use the base and path logic
    const base = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
};


// Helper to push a single note to the server (using the LWW endpoint)
const saveToServer = async (note: Note, serverUrl?: string): Promise<any> => {
    const url = getFullApiUrl('/api/notes', serverUrl); 
    
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
    const url = getFullApiUrl('/api/notes', serverUrl); 

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`Server fetch failed: ${response.statusText}`);
    }
    return response.json();
};

// Helper for hard deleting a note on the server
const deleteFromServer = async (id: string, serverUrl?: string) => {
    const url = getFullApiUrl(`/api/notes/${id}`, serverUrl); 

    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`Server delete failed: ${response.statusText}`);
    }
};


export const noteService = {
  getAllNotes: async (serverUrl?: string): Promise<Note[]> => {
    let notes: Note[] = [];
    let serverLoadSuccessful = false;

    try {
        const serverNotes = await fetchAllNotesFromServer(serverUrl); 
        console.log(`[SYNC] Successfully loaded ${serverNotes.length} notes from server.`);
        
        notes = serverNotes; 
        serverLoadSuccessful = true;

    } catch (e) {
        console.warn("[SYNC] Server load failed. Falling back to local IndexedDB. Error:", e);
    }
    
    if (!serverLoadSuccessful) {
        notes = (await values()) || [];
    } else {
        await clear(); 
        await Promise.all(notes.map(n => set(n.id, n)));
        console.log(`[SYNC] IndexedDB overwritten with server data.`);
    }

    const legacyData = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    
    if (legacyData) {
        console.log("Legacy LocalStorage data detected. Processing...");
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_KEY);
            console.log("LocalStorage cleared.");
        } catch (e) {
            console.warn("Failed to clear LocalStorage:", e);
        }
    }

    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  saveNote: async (note: Note, serverUrl?: string): Promise<Note> => {
    const updatedNote = { ...note, updatedAt: Date.now() };
    
    try {
        const serverResponse = await saveToServer(updatedNote, serverUrl); 
        
        const acceptedNote = serverResponse.latestNote || updatedNote;
        
        await set(acceptedNote.id, acceptedNote);
        
        return acceptedNote;

    } catch (e) {
        console.error("Failed to push note to server. Saving locally only.", e);
        await set(updatedNote.id, updatedNote);
        throw e; 
    }
  },

  createNote: async (serverUrl?: string): Promise<Note> => {
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
    
    await set(newNote.id, newNote);
    
    saveToServer(newNote, serverUrl).catch(e => console.error("Failed async server save for new note", e)); 

    return newNote;
  },

  trashNote: async (id: string, serverUrl?: string): Promise<void> => {
    const note = await get(id);
    if (note) {
      const updated = { 
        ...note, 
        deleted: true, 
        deletedAt: Date.now(),
        updatedAt: Date.now() 
      };
      await set(id, updated);
      saveToServer(updated, serverUrl).catch(e => console.error("Failed async server trash update", e)); 
    }
  },

  restoreNote: async (id: string, serverUrl?: string): Promise<void> => {
    const note = await get(id);
    if (note) {
      const updated = { 
        ...note, 
        deleted: false, 
        deletedAt: undefined,
        updatedAt: Date.now() 
      };
      await set(id, updated);
      saveToServer(updated, serverUrl).catch(e => console.error("Failed async server restore update", e)); 
    }
  },

  permanentlyDeleteNote: async (id: string): Promise<void> => {
    await del(id);
  },

  emptyTrash: async (serverUrl?: string): Promise<void> => {
    const notes: Note[] = (await values()) || [];
    const trashIds = notes.filter(n => n.deleted).map(n => n.id);
    
    const deletePromises = trashIds.map(async (id) => {
      await del(id);
      
      try {
          await deleteFromServer(id, serverUrl);
          console.log(`[SYNC] Successfully hard-deleted note ID: ${id} from server.`);
      } catch (e) {
          console.error(`[SYNC] Failed to hard-delete note ID: ${id} from server.`, e);
      }
    });

    await Promise.all(deletePromises);
  },

  syncNotes: async (serverUrl: string | undefined): Promise<void> => {
      try {
          const localNotes = (await values()) || []; 
          const syncPromises = localNotes.map(note => 
            saveToServer(note, serverUrl).catch(e => {
                console.error(`Failed to push note ${note.id} during sync.`, e);
          }));
          await Promise.all(syncPromises);

          console.log("[SYNC] Outbound push complete. Triggering full inbound refresh...");
          await noteService.getAllNotes(serverUrl); 
          
      } catch (e) {
          console.error("Failed to execute full sync process.", e);
          throw e;
      }
  }
};