const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

router.get('/:fileId', async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
        return res.status(400).send('Invalid ID');
    }
    try {
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'avatars' });
        const oid = new mongoose.Types.ObjectId(req.params.fileId);
        const files = await bucket.find({ _id: oid }).toArray();

        if (!files.length) return res.status(404).send('Not found');

        res.setHeader('Content-Type', files[0].contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        bucket.openDownloadStream(oid).pipe(res);
    } catch (e) {
        res.status(500).send('Error');
    }
});

module.exports = router;