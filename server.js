import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// If we are in production (NODE_ENV=production), use 2100. 
// If dev, use 3000 (so Vite can own 2100).
const PORT = process.env.NODE_ENV === 'production' ? 2100 : 3000;

app.use(cors());
app.use(express.json());

// Storage Setup
const DATA_DIR = '/data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

// Create dirs if missing
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// --- API ROUTES ---
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/api/notes', (req, res) => {
    const note = req.body;
    // Save as JSON file for metadata preservation, or .md if you prefer raw text
    const filePath = path.join(NOTES_DIR, `${note.id}.json`); 
    fs.writeFileSync(filePath, JSON.stringify(note, null, 2));
    res.json({ success: true });
});

app.get('/api/notes', (req, res) => {
    try {
        const files = fs.readdirSync(NOTES_DIR);
        const notes = files
            .filter(f => f.endsWith('.json'))
            .map(file => JSON.parse(fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8')));
        res.json(notes);
    } catch (e) {
        res.json([]);
    }
});

// --- SERVING FILES ---
app.use('/uploads', express.static(UPLOADS_DIR));

if (process.env.NODE_ENV === 'production') {
    // In prod, serve the React build
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});