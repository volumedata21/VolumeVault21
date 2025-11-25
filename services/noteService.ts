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
                              category: n.category || 'General',
                              tags: n.tags || [],
                              deleted: n.deleted || false
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
          }

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
      tags: [],
      deleted: false
    };
    await set(newNote.id, newNote);
    return newNote;
  },

  // Soft delete
  trashNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note) {
      const updated = { 
        ...note, 
        deleted: true, 
        deletedAt: Date.now(),
        updatedAt: Date.now() 
      };
      await set(id, updated);
    }
  },

  // Restore from trash
  restoreNote: async (id: string): Promise<void> => {
    const note = await get(id);
    if (note) {
      const updated = { 
        ...note, 
        deleted: false, 
        deletedAt: undefined,
        updatedAt: Date.now() 
      };
      await set(id, updated);
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

  syncNotes: async (serverUrl: string | undefined, apiKey: string | undefined): Promise<void> => {
      const notes = await noteService.getAllNotes();
      const targetUrl = serverUrl ? serverUrl.replace(/\/$/, '') : '/api';

      try {
          const response = await fetch(`${targetUrl}/sync`, {
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