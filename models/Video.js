const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ''
    },
    // GridFS file IDs
    files: {
        original: { type: mongoose.Schema.Types.ObjectId, default: null },
        '1080p':   { type: mongoose.Schema.Types.ObjectId, default: null },
        '720p':    { type: mongoose.Schema.Types.ObjectId, default: null },
        '480p':    { type: mongoose.Schema.Types.ObjectId, default: null },
        '360p':    { type: mongoose.Schema.Types.ObjectId, default: null }
    },
    thumbnail: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    duration: {
        type: Number,
        default: 0
    },
    uploader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploaderName: {
        type: String,
        required: true
    },
    views: {
        type: Number,
        default: 0
    },
    
    // =====================================
    // SOCIAL FEATURES (Likes & Dislikes)
    // =====================================
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likeCount: { type: Number, default: 0 }, // Используется для сортировки и рекомендаций

    // Anti-cheat view log
    viewLog: [{
        fingerprint: String,
        ip: String,
        watchedAt: { type: Date, default: Date.now }
    }],
    availableQualities: {
        type: [String],
        default: ['original']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Text index for search
videoSchema.index({ title: 'text', description: 'text', uploaderName: 'text' });

module.exports = mongoose.model('Video', videoSchema);