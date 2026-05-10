/* =========================================
   ORIX — Custom Video Player JS
========================================= */

const API = '/api';

// DOM Elements
const videoEl        = document.getElementById('playerVideo');
const container      = document.getElementById('playerContainer');
const playPauseBtn   = document.getElementById('playPauseBtn');
const playIcon       = document.getElementById('playIcon');
const pauseIcon      = document.getElementById('pauseIcon');
const playCenterBtn  = document.getElementById('playCenterBtn');
const progressBar    = document.getElementById('playerProgress');
const progressFill   = document.getElementById('playerProgressFill');
const bufferedBar    = document.getElementById('playerBuffered');
const playerTime     = document.getElementById('playerTime');
const muteBtn        = document.getElementById('muteBtn');
const volumeSlider   = document.getElementById('volumeSlider');
const speedSelect    = document.getElementById('speedSelect');
const qualitySelect  = document.getElementById('qualitySelect');
const fullscreenBtn  = document.getElementById('fullscreenBtn');

// Social & Actions DOM
const likeBtn        = document.getElementById('likeBtn');
const dislikeBtn     = document.getElementById('dislikeBtn');
const subscribeBtn   = document.getElementById('subscribeBtn');
const commentInput   = document.getElementById('commentInput');
const postCommentBtn = document.getElementById('postCommentBtn');
const commentsList   = document.getElementById('commentsList');

// State
let videoData        = null;
let videoReady       = false; 
let viewCounted      = false;
let currentQuality   = 'original';
let watchTime        = 0;
let watchInterval    = null;
let isSeeking        = false;
let controlsTimeout  = null;

// ==========================================
// AUTH UTILS
// ==========================================
function getAuthToken() { return localStorage.getItem('orix_token'); }
function getCurrentUser() { 
    const u = localStorage.getItem('orix_user'); 
    return u ? JSON.parse(u) : null; 
}

// ==========================================
// GET VIDEO ID
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const videoId   = urlParams.get('id');
if (!videoId) window.location.href = '/';

// ==========================================
// UTILS
// ==========================================
function formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
}

function formatViews(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0','') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace('.0','') + 'K';
    return String(n);
}

function timeAgo(dateString) {
    const diff = Math.floor((Date.now() - new Date(dateString)) / 1000);
    if (diff < 60)      return 'Just now';
    if (diff < 3600)    return Math.floor(diff / 60)    + ' min ago';
    if (diff < 86400)   return Math.floor(diff / 3600)  + ' hours ago';
    if (diff < 604800)  return Math.floor(diff / 86400) + ' days ago';
    if (diff < 2592000) return Math.floor(diff / 604800)+ ' weeks ago';
    return Math.floor(diff / 2592000) + ' months ago';
}

function getAvatarLetter(name) {
    return (name || '?')[0].toUpperCase();
}

// ==========================================
// SHOW / HIDE PLAY STATE
// ==========================================
function setPlayingUI(playing) {
    if (playing) {
        playIcon.style.display  = 'none';
        pauseIcon.style.display = 'block';
        playCenterBtn.classList.add('hidden');
        container.classList.remove('paused');
    } else {
        playIcon.style.display  = 'block';
        pauseIcon.style.display = 'none';
        playCenterBtn.classList.remove('hidden');
        container.classList.add('paused');
    }
}

// ==========================================
// SAFE PLAY
// ==========================================
function safePlay() {
    if (!videoReady) {
        videoEl.addEventListener('canplay', () => {
            videoEl.play().catch(e => console.warn('Play blocked:', e.message));
        }, { once: true });
        return;
    }
    videoEl.play().catch(e => console.warn('Play blocked:', e.message));
}

function togglePlay() {
    if (!videoData) return;
    if (videoEl.paused) {
        safePlay();
    } else {
        videoEl.pause();
    }
}

// ==========================================
// LOAD VIDEO METADATA
// ==========================================
async function loadVideo() {
    try {
        const res = await fetch(`${API}/videos/${videoId}`);
        if (!res.ok) throw new Error('Video not found');
        videoData = await res.json();

        // Page info
        document.title = `${videoData.title} — Orix`;
        document.getElementById('videoTitle').textContent       = videoData.title;
        document.getElementById('videoViews').textContent       = `${formatViews(videoData.views)} views`;
        document.getElementById('videoDate').textContent        = timeAgo(videoData.createdAt);
        document.getElementById('videoDescription').textContent = videoData.description || '';

        // Uploader Info
        const creatorName = videoData.uploader?.username || videoData.uploaderName || 'Unknown';
        const creatorId   = videoData.uploader?._id || videoData.uploader;
        const avatarUrl   = videoData.uploader?.avatar;

        document.getElementById('creatorName').textContent = creatorName;
        const avatarContainer = document.getElementById('creatorAvatar');

        if (avatarUrl) {
            avatarContainer.innerHTML = `<img src="/api/avatar/${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarContainer.textContent = getAvatarLetter(creatorName);
        }

        // Make Creator click go to profile
        if (creatorId) {
            avatarContainer.style.cursor = 'pointer';
            document.getElementById('creatorName').style.cursor = 'pointer';
            
            const goProfile = () => window.location.href = `/profile/${creatorId}`;
            avatarContainer.onclick = goProfile;
            document.getElementById('creatorName').onclick = goProfile;
        }

        buildQualitySelector();
        setVideoSource('original', false);
        
        loadRecommendations(); 
        initSocial(videoData, creatorId); // INIT LIKES, SUBS & COMMENTS

    } catch (err) {
        console.error('Load video error:', err);
        document.getElementById('videoTitle').textContent = 'Video not found';
        playCenterBtn.classList.add('hidden');
    }
}

// ==========================================
// SOCIAL, LIKES, SUBS & COMMENTS
// ==========================================
async function initSocial(video, uploaderId) {
    const user = getCurrentUser();
    
    // Set Like Counts
    document.getElementById('likeCount').textContent = video.likeCount || video.likes?.length || 0;
    
    if (user) {
        if (video.likes?.includes(user.id)) likeBtn.classList.add('active');
        if (video.dislikes?.includes(user.id)) dislikeBtn.classList.add('active');
        
        // Show My Avatar in comment box
        const myAv = document.getElementById('myCommentAvatar');
        if (user.avatar) myAv.innerHTML = `<img src="/api/avatar/${user.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
        else myAv.textContent = user.username[0].toUpperCase();

        // Subscriptions
        if (user.id !== uploaderId) {
            subscribeBtn.style.display = 'block';
            
            // Get uploader info to check subscribers
            const uRes = await fetch(`/api/users/${uploaderId}`);
            if (uRes.ok) {
                const uData = await uRes.json();
                const subCount = uData.user.subscribers?.length || 0;
                document.getElementById('subscriberCount').textContent = `${subCount} subscribers`;
                
                if (uData.user.subscribers?.includes(user.id)) {
                    subscribeBtn.classList.add('subscribed');
                    subscribeBtn.textContent = 'Subscribed';
                }
            }
        } else {
            // My own video
            const uRes = await fetch(`/api/users/${user.id}`);
            if (uRes.ok) {
                const uData = await uRes.json();
                document.getElementById('subscriberCount').textContent = `${uData.user.subscribers?.length || 0} subscribers`;
            }
        }
    } else {
        // Not logged in
        document.getElementById('myCommentAvatar').textContent = '👤';
        commentInput.placeholder = 'Sign in to comment...';
        commentInput.disabled = true;
        postCommentBtn.disabled = true;
        
        const uRes = await fetch(`/api/users/${uploaderId}`);
        if (uRes.ok) {
            const uData = await uRes.json();
            document.getElementById('subscriberCount').textContent = `${uData.user.subscribers?.length || 0} subscribers`;
        }
    }

    loadComments();
}

// Like
likeBtn.addEventListener('click', async () => {
    if (!getAuthToken()) return alert('Please sign in to like this video');
    const res = await fetch(`/api/videos/${videoId}/like`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    if (res.ok) {
        const data = await res.json();
        document.getElementById('likeCount').textContent = data.likes;
        likeBtn.classList.toggle('active', data.hasLiked);
        dislikeBtn.classList.remove('active');
    }
});

// Dislike
dislikeBtn.addEventListener('click', async () => {
    if (!getAuthToken()) return alert('Please sign in to dislike this video');
    const res = await fetch(`/api/videos/${videoId}/dislike`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    if (res.ok) {
        const data = await res.json();
        document.getElementById('likeCount').textContent = data.likes;
        dislikeBtn.classList.toggle('active', data.hasDisliked);
        likeBtn.classList.remove('active');
    }
});

// Subscribe
subscribeBtn.addEventListener('click', async () => {
    if (!getAuthToken()) return alert('Please sign in to subscribe');
    const creatorId = videoData.uploader?._id || videoData.uploader;
    const res = await fetch(`/api/users/${creatorId}/subscribe`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    if (res.ok) {
        const data = await res.json();
        document.getElementById('subscriberCount').textContent = `${data.subscribersCount} subscribers`;
        subscribeBtn.classList.toggle('subscribed', data.subscribed);
        subscribeBtn.textContent = data.subscribed ? 'Subscribed' : 'Subscribe';
    }
});

// Comments
async function loadComments() {
    const res = await fetch(`/api/videos/${videoId}/comments`);
    if (!res.ok) return;
    const comments = await res.json();
    
    document.getElementById('commentsHeader').textContent = `${comments.length} Comments`;
    commentsList.innerHTML = '';
    comments.forEach(c => appendComment(c));
}

postCommentBtn.addEventListener('click', async () => {
    const text = commentInput.value.trim();
    if (!text) return;
    
    postCommentBtn.disabled = true;
    const res = await fetch(`/api/videos/${videoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ text })
    });
    
    if (res.ok) {
        const newComment = await res.json();
        commentInput.value = '';
        commentsList.insertAdjacentHTML('afterbegin', createCommentHTML(newComment));
        const header = document.getElementById('commentsHeader');
        header.textContent = `${parseInt(header.textContent) + 1} Comments`;
    }
    postCommentBtn.disabled = false;
});

function createCommentHTML(c) {
    const avatar = c.author.avatar 
        ? `<img src="/api/avatar/${c.author.avatar}" style="width:100%;height:100%;object-fit:cover;">` 
        : c.author.username[0].toUpperCase();
        
    return `
        <div class="comment-item">
            <div class="comment-avatar" style="cursor:pointer;" onclick="window.location.href='/profile/${c.author._id}'">${avatar}</div>
            <div class="comment-content">
                <div class="comment-author">
                    <span style="cursor:pointer;" onclick="window.location.href='/profile/${c.author._id}'">${c.author.username}</span>
                    <span class="comment-time">${timeAgo(c.createdAt)}</span>
                </div>
                <div class="comment-text">${c.text}</div>
            </div>
        </div>
    `;
}

function appendComment(c) {
    commentsList.insertAdjacentHTML('beforeend', createCommentHTML(c));
}


// ==========================================
// RECOMMENDATIONS SIDEBAR
// ==========================================
async function loadRecommendations() {
    try {
        const res = await fetch(`${API}/videos/${videoId}/recommendations`);
        if (!res.ok) return;
        const videos = await res.json();
        
        const container = document.getElementById('recsContainer');
        videos.forEach(v => container.appendChild(createSideVideoCard(v)));
    } catch (e) {
        console.error('Failed to load recommendations');
    }
}

function createSideVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    
    const thumbSrc = video.thumbnail ? `/api/thumb/${video.thumbnail}` : null;
    const duration = video.duration ? formatTime(video.duration) : null;
    const creatorName = video.uploader?.username || video.uploaderName || 'Unknown';
    const creatorId   = video.uploader?._id || video.uploader;
    const avatarUrl   = video.uploader?.avatar;

    const avatarHtml = avatarUrl 
        ? `<img src="/api/avatar/${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
        : getAvatarLetter(creatorName);

    card.innerHTML = `
        <div class="thumbnail" onclick="window.location.href='/video?id=${video._id}'">
            ${thumbSrc
                ? `<img src="${thumbSrc}" alt="${video.title}" loading="lazy">`
                : `<div class="thumbnail-placeholder" style="background:#171717;display:flex;align-items:center;justify-content:center;height:100%;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.2"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                   </div>`
            }
            ${duration ? `<div class="timecode">${duration}</div>` : ''}
        </div>
        <div class="video-info">
            <div class="creator-avatar" onclick="window.event.stopPropagation(); window.location.href='/profile/${creatorId}'" style="cursor:pointer;" title="View Profile">
                ${avatarHtml}
            </div>
            <div class="info-text">
                <div class="video-title" onclick="window.location.href='/video?id=${video._id}'">${video.title}</div>
                <div class="video-meta">
                    <span onclick="window.event.stopPropagation(); window.location.href='/profile/${creatorId}'" style="cursor:pointer;">${creatorName}</span> 
                    · ${formatViews(video.views)} views · ${timeAgo(video.createdAt)}
                </div>
            </div>
        </div>
    `;
    return card;
}

// ==========================================
// SET VIDEO SOURCE (quality switch)
// ==========================================
function setVideoSource(qualityKey, resumePlayback = true) {
    if (!videoData?.files) return;

    const fileId = videoData.files[qualityKey] || videoData.files['original'];
    if (!fileId) return;

    const wasPlaying  = !videoEl.paused;
    const currentTime = videoEl.currentTime || 0;

    videoReady = false;
    videoEl.src = `/api/stream/${fileId}`;
    videoEl.load(); 

    currentQuality = qualityKey;

    videoEl.addEventListener('loadedmetadata', () => {
        if (currentTime > 0 && isFinite(currentTime)) {
            videoEl.currentTime = currentTime;
        }
    }, { once: true });

    videoEl.addEventListener('canplay', () => {
        videoReady = true;
        if (resumePlayback && wasPlaying) {
            videoEl.play().catch(e => console.warn('Resume blocked:', e.message));
        }
    }, { once: true });
}

// ==========================================
// BUILD QUALITY SELECTOR
// ==========================================
function buildQualitySelector() {
    qualitySelect.innerHTML = '';
    const labels = {
        original : 'Auto',
        '1080p'  : '1080p HD',
        '720p'   : '720p',
        '480p'   : '480p',
        '360p'   : '360p'
    };
    const qualities = videoData.availableQualities || ['original'];
    qualities.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q;
        opt.textContent = labels[q] || q;
        qualitySelect.appendChild(opt);
    });
    qualitySelect.value = currentQuality;
}

// ==========================================
// ANTI-CHEAT VIEW COUNT
// ==========================================
async function countView() {
    if (viewCounted) return;
    viewCounted = true;
    try {
        const res  = await fetch(`${API}/videos/${videoId}/view`, { method: 'POST' });
        const data = await res.json();
        if (data.counted) {
            document.getElementById('videoViews').textContent = `${formatViews(data.views)} views`;
        }
    } catch (e) {
        viewCounted = false;
    }
}

function startWatchTimer() {
    if (watchInterval) return;
    watchInterval = setInterval(() => {
        watchTime++;
        if (watchTime >= 30) {
            countView();
            clearInterval(watchInterval);
            watchInterval = null;
        }
    }, 1000);
}

function stopWatchTimer() {
    clearInterval(watchInterval);
    watchInterval = null;
}

// ==========================================
// VIDEO ELEMENT EVENTS
// ==========================================
videoEl.addEventListener('canplay', () => { videoReady = true; });

videoEl.addEventListener('play', () => {
    setPlayingUI(true);
    startWatchTimer();
});

videoEl.addEventListener('pause', () => {
    setPlayingUI(false);
    stopWatchTimer();
});

videoEl.addEventListener('ended', () => {
    setPlayingUI(false);
    stopWatchTimer();
});

videoEl.addEventListener('error', () => {
    const codes = { 1: 'Aborted', 2: 'Network error', 3: 'Decode error', 4: 'Source not supported' };
    console.error('Video error:', codes[videoEl.error?.code] || 'Unknown', videoEl.error);
});

// ==========================================
// PROGRESS BAR
// ==========================================
videoEl.addEventListener('timeupdate', () => {
    if (!videoEl.duration || isNaN(videoEl.duration)) return;
    const pct = (videoEl.currentTime / videoEl.duration) * 100;
    progressFill.style.width = `${pct}%`;
    playerTime.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`;
});

videoEl.addEventListener('progress', () => {
    if (!videoEl.duration || !videoEl.buffered.length) return;
    const end = videoEl.buffered.end(videoEl.buffered.length - 1);
    bufferedBar.style.width = `${(end / videoEl.duration) * 100}%`;
});

function seekTo(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (videoEl.duration && isFinite(videoEl.duration)) {
        videoEl.currentTime = pct * videoEl.duration;
        progressFill.style.width = `${pct * 100}%`;
    }
}

progressBar.addEventListener('mousedown', (e) => { isSeeking = true; seekTo(e); });
document.addEventListener('mousemove',  (e) => { if (isSeeking) seekTo(e); });
document.addEventListener('mouseup',    ()  => { isSeeking = false; });

progressBar.addEventListener('touchstart', (e) => { isSeeking = true; seekTo(e.touches[0]); }, { passive: true });
document.addEventListener('touchmove', (e) => { if (isSeeking) seekTo(e.touches[0]); }, { passive: true });
document.addEventListener('touchend', () => { isSeeking = false; });

// ==========================================
// VOLUME
// ==========================================
volumeSlider.addEventListener('input', (e) => {
    videoEl.volume = parseFloat(e.target.value);
    videoEl.muted  = videoEl.volume === 0;
    updateVolumeIcon();
});

muteBtn.addEventListener('click', () => {
    videoEl.muted = !videoEl.muted;
    volumeSlider.value = videoEl.muted ? 0 : videoEl.volume;
    updateVolumeIcon();
});

function updateVolumeIcon() {
    const vol = videoEl.muted ? 0 : videoEl.volume;
    const icon = document.getElementById('volumeIcon');
    if (vol === 0) {
        icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    } else if (vol < 0.5) {
        icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    } else {
        icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    }
}

// ==========================================
// SPEED & QUALITY & FULLSCREEN
// ==========================================
speedSelect.addEventListener('change', (e) => { videoEl.playbackRate = parseFloat(e.target.value); });
qualitySelect.addEventListener('change', (e) => { setVideoSource(e.target.value, true); });

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) container.requestFullscreen().catch(()=>{});
    else document.exitFullscreen();
});

document.addEventListener('fullscreenchange', () => {
    const icon = fullscreenBtn.querySelector('svg');
    if (document.fullscreenElement) icon.innerHTML = `<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/>`;
    else icon.innerHTML = `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>`;
});

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
document.addEventListener('keydown', (e) => {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

    switch (e.key) {
        case ' ':
        case 'k':
            e.preventDefault(); togglePlay(); break;
        case 'ArrowRight':
            e.preventDefault(); if (videoEl.duration) videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 5); break;
        case 'ArrowLeft':
            e.preventDefault(); videoEl.currentTime = Math.max(0, videoEl.currentTime - 5); break;
        case 'ArrowUp':
            e.preventDefault(); videoEl.volume = Math.min(1, videoEl.volume + 0.1); volumeSlider.value = videoEl.volume; updateVolumeIcon(); break;
        case 'ArrowDown':
            e.preventDefault(); videoEl.volume = Math.max(0, videoEl.volume - 0.1); volumeSlider.value = videoEl.volume; updateVolumeIcon(); break;
        case 'm':
            muteBtn.click(); break;
        case 'f':
            fullscreenBtn.click(); break;
    }
});

// AUTO-HIDE CONTROLS
container.addEventListener('mousemove', () => {
    container.style.cursor = 'default';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!videoEl.paused) container.style.cursor = 'none';
    }, 3000);
});
container.addEventListener('mouseleave', () => clearTimeout(controlsTimeout));

// CLICK HANDLERS
playPauseBtn.addEventListener('click',  (e) => { e.stopPropagation(); togglePlay(); });
playCenterBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
videoEl.addEventListener('click', () => togglePlay());

// INIT
setPlayingUI(false);
playCenterBtn.classList.remove('hidden');
loadVideo();