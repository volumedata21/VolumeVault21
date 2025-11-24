import { Note } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const noteService = {
  getAllNotes: async (): Promise<Note[]> => {
    try {
      const res = await fetch('/api/notes');
      if (!res.ok) return [];
      const notes = await res.json();
      return notes.sort((a: Note, b: Note) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error("Failed to fetch notes", e);
      return [];
    }
  },

  saveNote: async (note: Note): Promise<Note> => {
    const updatedNote = { ...note, updatedAt: Date.now() };
    await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedNote)
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
      tags: []
    };
    await noteService.saveNote(newNote);
    return newNote;
  },

  deleteNote: async (id: string): Promise<void> => {
      // You can implement DELETE /api/notes/:id in server.js later
      console.warn("Delete not yet implemented on backend");
  }
};