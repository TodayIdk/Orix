require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');
const fs        = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();

// ==========================================
// 1. TRUST PROXY (ДЛЯ RENDER)
// ==========================================
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Too many requests' }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Upload limit reached' }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// 2. ПУЛЕНЕПРОБИВАЕМАЯ СТАТИКА (PUBLIC)
// Этот код вручную находит файлы и ставит MIME-типы
// ==========================================
const publicPath = path.join(__dirname, 'public');

app.use('/public', (req, res) => {
    // req.path здесь это то, что идет после /public (например: /css/main.css)
    const filePath = path.join(publicPath, req.path);

    if (fs.existsSync(filePath)) {
        // Жестко задаем MIME-типы, чтобы браузер не ругался
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
        else if (filePath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
        else if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
        else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');

        res.sendFile(filePath);
    } else {
        // Если файла реально нет, отдаем простой текст, а не JSON
        res.status(404).type('text/plain').send(`[STATIC ERROR] File not found exactly here: ${filePath}`);
    }
});

// ==========================================
// ROUTES (API)
// ==========================================
app.use('/api/auth',    apiLimiter,    require('./routes/auth'));
app.use('/api/users',   apiLimiter,    require('./routes/users'));
app.use('/api/videos',  apiLimiter,    require('./routes/videos'));
app.use('/api/upload',  uploadLimiter, require('./routes/upload'));
app.use('/api/stream',  require('./routes/stream'));
app.use('/api/thumb',   require('./routes/thumb'));
app.use('/api/avatar',  require('./routes/avatar'));

// ==========================================
// PAGES (HTML)
// ==========================================
const pagesPath = path.join(__dirname, 'pages');

const sendPage = (res, filename) => {
    const filePath = path.join(pagesPath, filename);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/html');
        res.sendFile(filePath);
    } else {
        res.status(404).type('text/plain').send(`[PAGE ERROR] HTML file not found exactly here: ${filePath}`);
    }
};

app.get('/',       (_, res) => sendPage(res, 'index.html'));
app.get('/video',  (_, res) => sendPage(res, 'video.html'));
app.get('/upload', (_, res) => sendPage(res, 'upload.html'));
app.get('/profile/:id?', (_, res) => sendPage(res, 'profile.html'));

// 404 Fallback для API-запросов
app.use((req, res) => {
    res.status(404).json({ error: `API Route not found: ${req.url}` });
});

// ==========================================
// START SERVER
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
        const PORT = process.env.PORT || 8080;
        app.listen(PORT, '0.0.0.0', () =>
            console.log(`🚀 Orix → http://localhost:${PORT}`)
        );
    })
    .catch(err => {
        console.error('❌ MongoDB:', err.message);
        process.exit(1);
    });