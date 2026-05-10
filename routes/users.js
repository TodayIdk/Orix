const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const { Readable } = require('stream');
const crypto = require('crypto');
const User = require('../models/User');
const Video = require('../models/Video');
const { auth } = require('../middleware/auth');

// Настройка Multer для загрузки аватарок в оперативную память
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images (JPEG, PNG, WebP) are allowed'));
    }
});

// ==========================================
// GET /api/users/:id — Получить инфо профиля
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const videos = await Video.find({ uploader: user._id })
            .sort({ createdAt: -1 })
            .select('-viewLog')
            .lean();

        const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);

        res.json({
            user: {
                id: user._id,
                username: user.username,
                avatar: user.avatar,
                subscribers: user.subscribers || [],
                createdAt: user.createdAt
            },
            stats: { 
                totalVideos: videos.length, 
                totalViews 
            },
            videos
        });
    } catch (e) {
        console.error('Profile fetch error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// POST /api/users/:id/subscribe — Подписаться / Отписаться
// ==========================================
router.post('/:id/subscribe', auth, async (req, res) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ error: 'You cannot subscribe to yourself' });
        }

        const targetUser = await User.findById(req.params.id);
        const currentUser = await User.findById(req.user._id);

        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        const isSubscribed = currentUser.subscriptions.includes(targetUser._id);

        if (isSubscribed) {
            // Отписка
            currentUser.subscriptions.pull(targetUser._id);
            targetUser.subscribers.pull(currentUser._id);
        } else {
            // Подписка
            currentUser.subscriptions.push(targetUser._id);
            targetUser.subscribers.push(currentUser._id);
        }

        await currentUser.save();
        await targetUser.save();

        res.json({ 
            subscribed: !isSubscribed, 
            subscribersCount: targetUser.subscribers.length 
        });
    } catch (e) {
        console.error('Subscribe error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// POST /api/users/avatar — Обновить аватарку
// ==========================================
router.post('/avatar', auth, (req, res) => {
    avatarUpload.single('avatar')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        try {
            const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'avatars' });
            
            // Если у пользователя уже была аватарка — удаляем её из GridFS
            if (req.user.avatar) {
                try { 
                    await bucket.delete(new mongoose.Types.ObjectId(req.user.avatar)); 
                } catch (e) {
                    console.warn('Could not delete old avatar:', e.message);
                }
            }

            const filename = crypto.randomBytes(16).toString('hex');
            const uploadStream = bucket.openUploadStream(filename, { 
                contentType: req.file.mimetype 
            });

            Readable.from(req.file.buffer)
                .pipe(uploadStream)
                .on('error', (e) => {
                    console.error('Avatar stream error:', e);
                    res.status(500).json({ error: 'File stream failed' });
                })
                .on('finish', async () => {
                    // Сохраняем ID новой аватарки в профиль юзера
                    req.user.avatar = uploadStream.id;
                    await req.user.save();
                    
                    res.json({ 
                        message: 'Avatar updated successfully', 
                        avatarId: uploadStream.id 
                    });
                });
        } catch (e) {
            console.error('Avatar upload error:', e);
            res.status(500).json({ error: 'Upload failed' });
        }
    });
});

module.exports = router;