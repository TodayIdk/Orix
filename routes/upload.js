const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const multer   = require('multer');
const { GridFSBucket } = require('mongodb');
const { Readable } = require('stream');
const crypto   = require('crypto');
const Video    = require('../models/Video');
const { auth } = require('../middleware/auth');

// Memory storage — no temp files
const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
    fileFilter: (_req, file, cb) => {
        const ok = [
            'video/mp4','video/webm','video/ogg',
            'video/quicktime','video/x-matroska','video/avi'
        ];
        ok.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Only video files are allowed'));
    }
});

const thumbUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg','image/png','image/webp'];
        ok.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Only image files are allowed'));
    }
});

function getVideoBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'videos' });
}

function getThumbBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'thumbnails' });
}

function uploadToGridFS(bucket, buffer, filename, contentType) {
    return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, {
            contentType,
            chunkSizeBytes: 1024 * 1024 // 1 MB
        });

        Readable.from(buffer)
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', () => resolve(uploadStream.id));
    });
}

// ==========================================
// POST /api/upload/video
// ==========================================
router.post('/video', auth, (req, res) => {
    videoUpload.single('video')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No video file' });

        const { title, description, duration } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

        try {
            const bucket   = getVideoBucket();
            const filename = crypto.randomBytes(16).toString('hex');

            console.log(`Saving video to GridFS: ${filename} (${req.file.size} bytes)`);

            const fileId = await uploadToGridFS(
                bucket,
                req.file.buffer,
                filename,
                req.file.mimetype
            );

            console.log(`✅ Video saved → GridFS id: ${fileId}`);

            const video = await Video.create({
                title:       title.trim(),
                description: (description || '').trim(),
                duration:    parseFloat(duration) || 0,
                uploader:    req.user._id,
                uploaderName: req.user.username,
                files:       { original: fileId },
                availableQualities: ['original']
            });

            res.status(201).json({
                message: 'Video uploaded successfully',
                videoId: video._id,
                video
            });
        } catch (e) {
            console.error('Upload error:', e);
            res.status(500).json({ error: 'Upload failed: ' + e.message });
        }
    });
});

// ==========================================
// POST /api/upload/thumbnail/:videoId
// ==========================================
router.post('/thumbnail/:videoId', auth, (req, res) => {
    thumbUpload.single('thumbnail')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No thumbnail file' });

        try {
            const video = await Video.findById(req.params.videoId);
            if (!video) return res.status(404).json({ error: 'Video not found' });
            if (video.uploader.toString() !== req.user._id.toString()) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            // Delete old thumbnail
            if (video.thumbnail) {
                try { await getThumbBucket().delete(video.thumbnail); } catch (_) {}
            }

            const bucket   = getThumbBucket();
            const filename = crypto.randomBytes(16).toString('hex') + '_thumb';

            const fileId = await uploadToGridFS(
                bucket,
                req.file.buffer,
                filename,
                req.file.mimetype
            );

            video.thumbnail = fileId;
            await video.save();

            res.json({ message: 'Thumbnail uploaded', thumbnailId: fileId });
        } catch (e) {
            console.error('Thumbnail error:', e);
            res.status(500).json({ error: 'Thumbnail upload failed' });
        }
    });
});

module.exports = router;