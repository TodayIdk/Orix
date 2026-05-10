require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth',    apiLimiter,    require('./routes/auth'));
app.use('/api/users',   apiLimiter,    require('./routes/users'));  // НОВОЕ: Профили
app.use('/api/videos',  apiLimiter,    require('./routes/videos'));
app.use('/api/upload',  uploadLimiter, require('./routes/upload'));
app.use('/api/stream',  require('./routes/stream'));
app.use('/api/thumb',   require('./routes/thumb'));
app.use('/api/avatar',  require('./routes/avatar')); // НОВОЕ: Аватарки

// ==========================================
// PAGES
// ==========================================
app.get('/',       (_,res) => res.sendFile(path.join(__dirname,'pages','index.html')));
app.get('/video',  (_,res) => res.sendFile(path.join(__dirname,'pages','video.html')));
app.get('/upload', (_,res) => res.sendFile(path.join(__dirname,'pages','upload.html')));

// НОВОЕ: Страница профиля (если нет ID, JS сам перекинет на свой профиль)
app.get('/profile/:id?', (_,res) => res.sendFile(path.join(__dirname,'pages','profile.html')));

app.use((req,res) => res.status(404).json({ error: 'Not found' }));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
        const PORT = process.env.PORT || 8080;
        app.listen(PORT, () => console.log(`🚀 Orix → http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('❌ MongoDB:', err.message);
        process.exit(1);
    });