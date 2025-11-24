import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore
import { get, set, values, del, clear } from 'idb-keyval';

const STORAGE_KEY = 'volumevault_notes_v1';
const LEGACY_KEY = 'markmind_notes_v1';

export const noteService = {
  getAllNotes: async (): Promise<Note[]> => {
    try {
      // 1. Try to get notes from IndexedDB
      let notes: Note[] = (await values()) || [];
      
      // 2. check for legacy LocalStorage data
      // We check both keys to be thorough
      const legacyData = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      
      if (legacyData) {
          console.log("Legacy LocalStorage data detected. Processing...");
          try {
              const parsedNotes = JSON.parse(legacyData);
              if (Array.isArray(parsedNotes)) {
                  const existingIds = new Set(notes.map(n => n.id));
                  let migratedCount = 0;

                  // Migrate notes that don't exist in IDB yet
                  for (const n of parsedNotes) {
                      if (n && n.id && !existingIds.has(n.id)) {
                          const noteToSave = {
                              ...n,
                              category: n.category || 'General'
                          };
                          await set(n.id, noteToSave);
                          notes.push(noteToSave); // Add to current list so UI updates immediately
                          migratedCount++;
                      }
                  }
                  
                  if (migratedCount > 0) {
                      console.log(`Successfully migrated ${migratedCount} notes from LocalStorage to IndexedDB.`);
                  }
              }
          } catch (e) {
              console.error("Error parsing legacy LocalStorage data:", e);
              // We continue to clear storage even if parse fails to ensure the app becomes usable again
          }

          // 3. CRITICAL: Clear LocalStorage to fix QuotaExceededError
          // If we are using IDB (which we are), we must free up the LocalStorage
          // otherwise setting simple flags or settings will crash the app.
          try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(LEGACY_KEY);
              console.log("LocalStorage cleared to free quota.");
          } catch (e) {
              console.warn("Failed to clear LocalStorage:", e);
          }
      }

      // Sort by updatedAt descending
      return (notes as Note[]).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error("Failed to load notes", e);
      return [];
    }
  },

  saveNote: async (note: Note): Promise<Note> => {
    const updatedNote = { ...note, updatedAt: Date.now() };
    await set(note.id, updatedNote);
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
      tags: []
    };
    await set(newNote.id, newNote);
    return newNote;
  },

  deleteNote: async (id: string): Promise<void> => {
    await del(id);
  },

  importNotes: async (fileContent: string): Promise<boolean> => {
    try {
      const data = JSON.parse(fileContent);
      if (Array.isArray(data)) {
        const validNotes = data.filter(n => n.id && n.content).map(n => ({
            ...n,
            category: n.category || 'General'
        }));
        
        await Promise.all(validNotes.map(n => set(n.id, n)));
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  syncNotes: async (serverUrl: string, apiKey: string | undefined): Promise<void> => {
      const notes = await noteService.getAllNotes();
      if (!serverUrl) return;

      try {
          // Normalize URL
          const url = serverUrl.replace(/\/$/, '');
          const response = await fetch(`${url}/api/sync`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': apiKey ? `Bearer ${apiKey}` : ''
              },
              body: JSON.stringify({ notes })
          });

          if (!response.ok) {
              throw new Error(`Sync failed: ${response.statusText}`);
          }
          
          console.log('Sync successful');
      } catch (e) {
          console.error("Failed to sync notes", e);
          throw e;
      }
  }
};