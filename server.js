import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// FIX: This enables Express to correctly read the protocol (http/https) 
// and host (notes.mysite.com) set by any reverse proxy.
app.set('trust proxy', true); 

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
    // Respond with a public URL that can be used in the Markdown content
    res.json({ url: `/uploads/${req.file.filename}` });
});

// 2. Save/Update/Soft-Delete Note
app.post('/api/notes', (req, res) => {
    const note = req.body;
    const filePath = path.join(NOTES_DIR, `${note.id}.json`);
    
    if (note.isDeleted) {
        console.log(`[SERVER] 🗑️ Soft Deleting note: ${note.title || note.id}`);
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

// 4. Hard Delete (Optional)
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

app.post('/api/sync', (req, res) => {
    // NOTE: For a simple file-based system, a true sync involves complex 
    // reconciliation logic (comparing timestamps, sending/receiving changes).
    // For now, we simply return a success response to prevent the 404 error
    // and let the client know the call succeeded.
    console.log(`[SERVER] Sync request received from client.`);
    
    // Placeholder logic for future two-way sync:
    // 1. Check client-side timestamps against server files.
    // 2. Read all files (GET /api/notes essentially).
    // 3. Compare and send back any missing/newer files.
    
    res.json({ success: true, message: "Sync successful (Placeholder)" });
});

// --- SERVE FRONTEND (Production) ---

// Serve files from the uploads directory (used by the new image links)
app.use('/uploads', express.static(UPLOADS_DIR));

if (process.env.NODE_ENV === 'production') {
    // Serve the built client files
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // FIX: Use app.use() to avoid PathError and ensure SPA fallback.
    app.use((req, res) => {
        // Only serve index.html if the request is a GET and not for an API path
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            res.sendFile(path.join(__dirname, 'dist', 'index.html'));
        } else {
            // For unmatched API paths (POST/PUT/DELETE) return 404
            res.status(404).end();
        }
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n--- SERVER STARTED ON PORT ${PORT} ---`);
    console.log(`--- DATA DIRECTORY: ${DATA_DIR} ---\n`);
});