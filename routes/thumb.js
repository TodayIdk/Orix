const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

function getThumbBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'thumbnails' });
}

// GET /api/thumb/:fileId
router.get('/:fileId', async (req, res) => {
    const { fileId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
        return res.status(400).json({ error: 'Invalid thumbnail ID' });
    }

    try {
        const bucket = getThumbBucket();
        const oid    = new mongoose.Types.ObjectId(fileId);
        const files  = await bucket.find({ _id: oid }).toArray();

        if (!files || files.length === 0) {
            return res.status(404).json({ error: 'Thumbnail not found' });
        }

        res.setHeader('Content-Type',  files[0].contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        bucket
            .openDownloadStream(oid)
            .on('error', (err) => {
                console.error('Thumb stream error:', err.message);
                if (!res.writableEnded) res.end();
            })
            .pipe(res);

    } catch (err) {
        console.error('Thumb route error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Thumbnail error' });
        }
    }
});

module.exports = router;