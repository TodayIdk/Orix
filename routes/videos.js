const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const crypto   = require('crypto');
const Video    = require('../models/Video');
const Comment  = require('../models/Comment');
const { auth, optionalAuth } = require('../middleware/auth');

function getVideoBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'videos' });
}

function getThumbBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'thumbnails' });
}

const getIP = (req) =>
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress || 'unknown';

const getFingerprint = (req) =>
    crypto.createHash('sha256')
        .update((req.headers['user-agent'] || '') + (req.headers['accept-language'] || ''))
        .digest('hex');

// ==========================================
// GET /api/videos — FEED (Ранжирование по лайкам)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 12 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = search?.trim()
            ? { $text: { $search: search.trim() } }
            : {};

        const [videos, total] = await Promise.all([
            Video.find(query)
                .populate('uploader', 'username avatar') // Чтобы сразу отдавать аватарки в ленту
                .sort({ likeCount: -1, createdAt: -1 }) // Сортируем: самые залайканные выше
                .skip(skip)
                .limit(parseInt(limit))
                .select('-viewLog')
                .lean(),
            Video.countDocuments(query)
        ]);

        res.json({
            videos,
            total,
            page:  parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('Feed error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// GET /api/videos/:id — Single video
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid video ID' });
        }

        const video = await Video.findById(req.params.id)
            .populate('uploader', 'username avatar subscribers')
            .select('-viewLog');

        if (!video) return res.status(404).json({ error: 'Video not found' });
        res.json(video);
    } catch (err) {
        console.error('Get video error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// GET /api/videos/:id/recommendations
// ==========================================
router.get('/:id/recommendations', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        // Сначала берем другие видео того же автора
        let recs = await Video.find({ uploader: video.uploader, _id: { $ne: video._id } })
            .populate('uploader', 'username avatar')
            .limit(4)
            .lean();

        // Добиваем до 10 самыми популярными видео на платформе
        if (recs.length < 10) {
            const excludeIds = recs.map(r => r._id).concat(video._id);
            const more = await Video.find({ _id: { $nin: excludeIds } })
                .populate('uploader', 'username avatar')
                .sort({ likeCount: -1, views: -1 })
                .limit(10 - recs.length)
                .lean();
            recs = recs.concat(more);
        }

        res.json(recs);
    } catch (e) {
        console.error('Recs error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// POST /api/videos/:id/view — Anti-cheat
// ==========================================
router.post('/:id/view', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Not found' });

        const ip          = getIP(req);
        const fingerprint = getFingerprint(req);
        const now         = new Date();
        const COOLDOWN    = 24 * 60 * 60 * 1000; // 24 часа

        const alreadyViewed = video.viewLog.some(log =>
            log.fingerprint === fingerprint &&
            log.ip === ip &&
            (now - new Date(log.watchedAt)) < COOLDOWN
        );

        if (alreadyViewed) return res.json({ views: video.views, counted: false });

        video.viewLog.push({ fingerprint, ip, watchedAt: now });
        if (video.viewLog.length > 5000) video.viewLog = video.viewLog.slice(-5000);
        
        video.views += 1;
        await video.save();

        res.json({ views: video.views, counted: true });
    } catch (err) {
        console.error('View error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// POST /api/videos/:id/like
// ==========================================
router.post('/:id/like', auth, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const userId = req.user._id;
        const hasLiked = video.likes.includes(userId);

        // Убираем из дизлайков, если был там
        video.dislikes.pull(userId);

        if (hasLiked) {
            video.likes.pull(userId);
            video.likeCount -= 1;
        } else {
            video.likes.push(userId);
            video.likeCount += 1;
        }

        await video.save();
        res.json({ likes: video.likes.length, dislikes: video.dislikes.length, hasLiked: !hasLiked });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// POST /api/videos/:id/dislike
// ==========================================
router.post('/:id/dislike', auth, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const userId = req.user._id;
        const hasDisliked = video.dislikes.includes(userId);

        // Убираем лайк, если он был
        if (video.likes.includes(userId)) {
            video.likes.pull(userId);
            video.likeCount -= 1;
        }

        if (hasDisliked) {
            video.dislikes.pull(userId);
        } else {
            video.dislikes.push(userId);
        }

        await video.save();
        res.json({ likes: video.likes.length, dislikes: video.dislikes.length, hasDisliked: !hasDisliked });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// GET /api/videos/:id/comments
// ==========================================
router.get('/:id/comments', async (req, res) => {
    try {
        const comments = await Comment.find({ video: req.params.id })
            .populate('author', 'username avatar')
            .sort({ createdAt: -1 });
        res.json(comments);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// POST /api/videos/:id/comments
// ==========================================
router.post('/:id/comments', auth, async (req, res) => {
    try {
        if (!req.body.text?.trim()) return res.status(400).json({ error: 'Comment text is required' });
        
        const comment = await Comment.create({
            video: req.params.id,
            author: req.user._id,
            text: req.body.text.trim()
        });

        const populatedComment = await Comment.findById(comment._id).populate('author', 'username avatar');
        res.status(201).json(populatedComment);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// DELETE /api/videos/:id
// ==========================================
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });

        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Not found' });
        if (video.uploader.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });

        const vBucket = getVideoBucket();
        const tBucket = getThumbBucket();

        for (const [, fid] of Object.entries(video.files)) {
            if (fid) try { await vBucket.delete(fid); } catch (_) {}
        }
        if (video.thumbnail) {
            try { await tBucket.delete(video.thumbnail); } catch (_) {}
        }

        // Также удаляем все комментарии к этому видео
        await Comment.deleteMany({ video: video._id });
        await video.deleteOne();
        
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

module.exports = router;