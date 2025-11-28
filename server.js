import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// CRITICAL: Enables Express to correctly read proxy headers for custom domains (e.g., notes.mysite.com)
app.set('trust proxy', true); 

// The Dockerfile EXPOSEs 2100. In prod, Express should listen on 2100 internally.
const PORT = process.env.NODE_ENV === 'production' ? 2100 : 3000;

// Increase limits for heavy notes/images
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Storage Setup
const DATA_DIR = '/data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

// Ensure directories exist. Since running as root, this should not fail.
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

// Helper function to fetch note metadata (used by sync GET/POST handlers)
const fetchNoteMetadata = () => {
    const files = fs.readdirSync(NOTES_DIR);
    return files
        .filter(f => f.endsWith('.json'))
        .map(file => {
            try {
                const noteData = JSON.parse(fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8'));
                return {
                    id: noteData.id,
                    updatedAt: noteData.updatedAt,
                    deleted: noteData.deleted || false
                };
            } catch (e) {
                console.error(`[SERVER] Corrupt file during sync metadata retrieval: ${file}`);
                return null;
            }
        })
        .filter(n => n !== null);
};

// --- API ROUTES ---

// 1. Upload Image
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    console.log(`[SERVER] Image uploaded: ${req.file.filename}`);
    res.json({ url: `/uploads/${req.file.filename}` });
});

// 2. Save/Update/Soft-Delete Note (WITH TIMESTAMP CONFLICT RESOLUTION)
app.post('/api/notes', (req, res) => {
    const incomingNote = req.body;
    const filePath = path.join(NOTES_DIR, `${incomingNote.id}.json`);
    
    if (fs.existsSync(filePath)) {
        try {
            const serverNote = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            
            // CONFLICT RESOLUTION: Last Write Wins (LWW)
            if (incomingNote.updatedAt <= serverNote.updatedAt) {
                console.log(`[SERVER] 🚫 Rejected older note: ${incomingNote.id}. Client timestamp (${incomingNote.updatedAt}) is older than server's (${serverNote.updatedAt}).`);
                return res.status(200).json({ 
                    success: true,
                    status: 'rejected',
                    message: 'Server has a newer version.',
                    latestNote: serverNote
                });
            }
        } catch (e) {
            console.error(`[SERVER] Error reading existing file ${incomingNote.id}:`, e);
        }
    }

    if (incomingNote.deleted) {
        console.log(`[SERVER] 🗑️ Saving deleted status for note: ${incomingNote.title || incomingNote.id}`);
    } else {
        console.log(`[SERVER] 💾 Saving newest version of note: ${incomingNote.title || incomingNote.id}`);
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(incomingNote, null, 2));
        res.json({ success: true, status: 'accepted', latestNote: incomingNote });
    } catch (e) {
        console.error("[SERVER] Error writing file:", e);
        res.status(500).json({ error: "Write failed" });
    }
});

// 3. Get All Notes (Used for initial app load)
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

// 5. Synchronization Endpoint (Required for client reconciliation)
// NOTE: We define both GET and POST to handle client logic variations gracefully.
app.route('/api/sync')
    .get((req, res) => {
        try {
            const metadata = fetchNoteMetadata();
            console.log(`[SERVER] GET /api/sync. Serving metadata for ${metadata.length} notes.`);
            res.json({ success: true, metadata: metadata, message: "Sync metadata retrieved." });
        } catch (e) {
            console.error("[SERVER] Failed GET sync request:", e);
            res.status(500).json({ success: false, error: "Sync failed to retrieve data" });
        }
    })
    .post((req, res) => {
        try {
            // Client sends a POST to initiate sync, so we respond with metadata.
            const metadata = fetchNoteMetadata();
            console.log(`[SERVER] POST /api/sync received. Serving metadata for ${metadata.length} notes.`);
            res.json({ success: true, metadata: metadata, message: "Sync metadata retrieved." });
        } catch (e) {
            console.error("[SERVER] Failed POST sync request:", e);
            res.status(500).json({ success: false, error: "Sync failed to retrieve data" });
        }
    });


// --- SERVE FRONTEND (Production/Development Fallback) ---

// Serve files from the uploads directory (used by the new image links)
app.use('/uploads', express.static(UPLOADS_DIR));

if (process.env.NODE_ENV === 'production') {
    // 1. Serve the built client files (like JS, CSS, PWA assets)
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // 2. SPA Fallback: Use a regex path to bypass path-to-regexp parsing bug.
    // This catches all remaining GET routes and serves index.html.
    app.get(/^(?!\/api|\/uploads).+/, (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
    
    // Fallback for all other methods (POST, PUT, DELETE, etc.) that didn't match an API route
    app.use((req, res) => {
        res.status(404).end();
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n--- SERVER STARTED ON PORT ${PORT} ---`);
    console.log(`--- DATA DIRECTORY: ${DATA_DIR} ---\n`);
});