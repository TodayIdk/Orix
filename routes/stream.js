const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const { GridFSBucket } = require('mongodb');

function getVideoBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'videos' });
}

// GET /api/stream/:fileId
router.get('/:fileId', async (req, res) => {
    const { fileId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
        return res.status(400).json({ error: 'Invalid file ID' });
    }

    try {
        const bucket  = getVideoBucket();
        const oid     = new mongoose.Types.ObjectId(fileId);
        const files   = await bucket.find({ _id: oid }).toArray();

        if (!files || files.length === 0) {
            console.error(`Stream: file not found in GridFS → ${fileId}`);
            return res.status(404).json({ error: 'File not found in storage' });
        }

        const file     = files[0];
        const fileSize = file.length;
        const mimeType = file.contentType || 'video/mp4';
        const range    = req.headers.range;

        console.log(`Streaming: ${file.filename} | size: ${fileSize} | range: ${range || 'none'}`);

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'no-cache');

        if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end   = endStr
                ? parseInt(endStr, 10)
                : Math.min(start + 5 * 1024 * 1024 - 1, fileSize - 1); // 5MB chunk

            if (start >= fileSize) {
                res.setHeader('Content-Range', `bytes */${fileSize}`);
                return res.status(416).send('Range Not Satisfiable');
            }

            const chunkSize = end - start + 1;

            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunkSize,
            });

            bucket
                .openDownloadStream(oid, { start, end: end + 1 })
                .on('error', (err) => {
                    console.error('GridFS stream error:', err.message);
                    if (!res.writableEnded) res.end();
                })
                .pipe(res);

        } else {
            res.setHeader('Content-Length', fileSize);
            bucket
                .openDownloadStream(oid)
                .on('error', (err) => {
                    console.error('GridFS stream error:', err.message);
                    if (!res.writableEnded) res.end();
                })
                .pipe(res);
        }

    } catch (err) {
        console.error('Stream route error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming failed' });
        }
    }
});

module.exports = router;