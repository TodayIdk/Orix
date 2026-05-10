require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');
const fs        = require('fs'); // Добавили fs для проверок
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
// 2. СТАТИКА (PUBLIC)
// ==========================================
const publicPath = path.join(__dirname, 'public');
console.log('Static public path:', publicPath);

app.use('/public', express.static(publicPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    }
}));

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
console.log('HTML pages path:', pagesPath);

// Функция-хелпер для надежной отдачи HTML
const sendPage = (res, filename) => {
    const filePath = path.join(pagesPath, filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error(`[404 ERROR] File not found: ${filePath}`);
        res.status(404).send(`Error: Cannot find file ${filename} inside /pages directory.`);
    }
};

app.get('/',       (_, res) => sendPage(res, 'index.html'));
app.get('/video',  (_, res) => sendPage(res, 'video.html'));
app.get('/upload', (_, res) => sendPage(res, 'upload.html'));
app.get('/profile/:id?', (_, res) => sendPage(res, 'profile.html'));

// 404 Fallback для API
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.url}` });
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