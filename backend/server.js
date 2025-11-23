const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 2100;

// Middleware
app.use(cors());
app.use(express.json());

// Database File Path
const DB_FILE = path.join(__dirname, 'data', 'notes.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

// Helper: Read Notes
const readNotes = () => {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// Helper: Write Notes
const writeNotes = (notes) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(notes, null, 2));
};

// --- Routes ---

// Get all notes
app.get('/api/notes', (req, res) => {
    const notes = readNotes();
    res.json(notes);
});

// Create or Update a note
app.post('/api/notes', (req, res) => {
    const newNote = req.body;
    let notes = readNotes();
    
    // Check if updating
    const existingIndex = notes.findIndex(n => n.id === newNote.id);
    if (existingIndex >= 0) {
        notes[existingIndex] = { ...newNote, updatedAt: new Date().toISOString() };
    } else {
        notes.unshift({ ...newNote, updatedAt: new Date().toISOString() });
    }
    
    writeNotes(notes);
    res.json(newNote);
});

// Delete a note
app.delete('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    let notes = readNotes();
    notes = notes.filter(n => n.id !== id);
    writeNotes(notes);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});