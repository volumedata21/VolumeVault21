import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.NODE_ENV === 'production' ? 2100 : 3000;

// Increase limits for heavy notes/images
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Storage Setup
const DATA_DIR = '/data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

// Ensure directories exist
[UPLOADS_DIR, NOTES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
    console.log(`[SERVER] ${req.method} ${req.url}`);
    next();
});

// --- API ROUTES ---

// 1. Upload Image
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    console.log(`[SERVER] Image uploaded: ${req.file.filename}`);
    res.json({ url: `/uploads/${req.file.filename}` });
});

// 2. Save/Update/Soft-Delete Note
app.post('/api/notes', (req, res) => {
    const note = req.body;
    const filePath = path.join(NOTES_DIR, `${note.id}.json`);
    
    // Log specific actions
    if (note.isDeleted) {
        console.log(`[SERVER] 🗑️ Soft Deleting (Trashing) note: ${note.title || note.id}`);
    } else {
        console.log(`[SERVER] 💾 Saving note: ${note.title || note.id}`);
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(note, null, 2));
        res.json({ success: true });
    } catch (e) {
        console.error("[SERVER] Error writing file:", e);
        res.status(500).json({ error: "Write failed" });
    }
});

// 3. Get All Notes
app.get('/api/notes', (req, res) => {
    try {
        const files = fs.readdirSync(NOTES_DIR);
        const notes = files
            .filter(f => f.endsWith('.json'))
            .map(file => {
                try {
                    return JSON.parse(fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8'));
                } catch (e) {
                    console.error(`[SERVER] Corrupt file: ${file}`);
                    return null;
                }
            })
            .filter(n => n !== null);
            
        console.log(`[SERVER] Serving ${notes.length} notes to client.`);
        res.json(notes);
    } catch (e) {
        console.error("[SERVER] Failed to read notes directory", e);
        res.json([]);
    }
});

// 4. Hard Delete (Optional, for emptying trash later)
app.delete('/api/notes/:id', (req, res) => {
    const id = req.params.id.replace(/[^a-z0-9-]/gi, ''); 
    const filePath = path.join(NOTES_DIR, `${id}.json`);
    console.log(`[SERVER] ❌ HARD Deleting note file: ${id}`);
    
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e) {
        console.error("[SERVER] Delete failed:", e);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// --- SERVE FRONTEND ---
app.use('/uploads', express.static(UPLOADS_DIR));

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n--- SERVER STARTED ON PORT ${PORT} ---`);
    console.log(`--- DATA DIRECTORY: ${DATA_DIR} ---\n`);
});