require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// ==========================================
// 1. ИСПРАВЛЕНИЕ ДЛЯ RENDER.COM (TRUST PROXY)
// Указываем Express доверять прокси-серверу Render
// ==========================================
app.set('trust proxy', 1);

// ==========================================
// RATE LIMITERS
// ==========================================
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

// Увеличил лимиты для загрузки, чтобы точно хватало
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// 2. ИСПРАВЛЕНИЕ ДЛЯ CSS И СТАТИКИ
// ==========================================
app.use('/public', express.static(path.join(__dirname, 'public'), {
    // Явно указываем, что отдаем файлы с правильными типами
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth',    apiLimiter,    require('./routes/auth'));
app.use('/api/users',   apiLimiter,    require('./routes/users'));
app.use('/api/videos',  apiLimiter,    require('./routes/videos'));
app.use('/api/upload',  uploadLimiter, require('./routes/upload'));
app.use('/api/stream',  require('./routes/stream'));
app.use('/api/thumb',   require('./routes/thumb'));
app.use('/api/avatar',  require('./routes/avatar'));

// ==========================================
// PAGES
// ==========================================
app.get('/',       (_, res) => res.sendFile(path.join(__dirname, 'pages', 'index.html')));
app.get('/video',  (_, res) => res.sendFile(path.join(__dirname, 'pages', 'video.html')));
app.get('/upload', (_, res) => res.sendFile(path.join(__dirname, 'pages', 'upload.html')));
app.get('/profile/:id?', (_, res) => res.sendFile(path.join(__dirname, 'pages', 'profile.html')));

// 404 Fallback
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ==========================================
// START
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