/* =========================================
   ORIX — Main Feed JS
========================================= */

const API = '/api';
let currentPage = 1;
let totalPages = 1;
let currentSearch = '';
let isLoading = false;

// ==========================================
// AUTH STATE
// ==========================================
const Auth = {
    getToken: () => localStorage.getItem('orix_token'),
    getUser: () => {
        const u = localStorage.getItem('orix_user');
        return u ? JSON.parse(u) : null;
    },
    setSession: (token, user) => {
        localStorage.setItem('orix_token', token);
        localStorage.setItem('orix_user', JSON.stringify(user));
    },
    clear: () => {
        localStorage.removeItem('orix_token');
        localStorage.removeItem('orix_user');
    },
    isLoggedIn: () => !!localStorage.getItem('orix_token')
};

// ==========================================
// UTILS
// ==========================================
function formatViews(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return n.toString();
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
    if (diff < 604800) return Math.floor(diff / 86400) + ' days ago';
    if (diff < 2592000) return Math.floor(diff / 604800) + ' weeks ago';
    if (diff < 31536000) return Math.floor(diff / 2592000) + ' months ago';
    return Math.floor(diff / 31536000) + ' years ago';
}

function getAvatarLetter(name) {
    return (name || '?')[0].toUpperCase();
}

// Замените старую функцию renderVideoCard в main.js
function renderVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    
    const hasThumbnail = video.thumbnail;
    const thumbSrc = hasThumbnail ? `/api/thumb/${video.thumbnail}` : null;
    const duration = video.duration ? formatTime(video.duration) : null;

    // Решаем, что показывать: фото или букву
    const uploaderAvatar = video.uploader?.avatar;
    const avatarHtml = uploaderAvatar 
        ? `<img src="/api/avatar/${uploaderAvatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
        : getAvatarLetter(video.uploaderName);

    const uploaderId = video.uploader?._id || video.uploader;

    card.innerHTML = `
        <div class="thumbnail" onclick="window.location.href='/video?id=${video._id}'">
            ${thumbSrc
                ? `<img src="${thumbSrc}" alt="${video.title}" loading="lazy">`
                : `<div class="thumbnail-placeholder">...</div>`
            }
            ${duration ? `<div class="timecode">${duration}</div>` : ''}
        </div>
        <div class="video-info">
            <div class="creator-avatar" onclick="window.location.href='/profile/${uploaderId}'" style="cursor:pointer;" title="View Profile">
                ${avatarHtml}
            </div>
            <div class="info-text">
                <div class="video-title" onclick="window.location.href='/video?id=${video._id}'">${video.title}</div>
                <div class="video-meta">
                    <span onclick="window.location.href='/profile/${uploaderId}'" style="cursor:pointer;">${video.uploaderName}</span> 
                    · ${formatViews(video.views)} views · ${timeAgo(video.createdAt)}
                </div>
            </div>
        </div>
    `;
    return card;
}

// ==========================================
// FETCH VIDEOS
// ==========================================
async function fetchVideos(page = 1, search = '', append = false) {
    if (isLoading) return;
    isLoading = true;

    const grid = document.getElementById('videoGrid');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (!append) {
        grid.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
    }

    try {
        const params = new URLSearchParams({ page, limit: 12 });
        if (search) params.append('search', search);

        const res = await fetch(`${API}/videos?${params}`);
        const data = await res.json();

        if (!append) grid.innerHTML = '';

        if (data.videos.length === 0 && !append) {
            grid.innerHTML = `
                <div class="empty-state">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                        <rect x="2" y="2" width="20" height="20" rx="2"/>
                        <polygon points="10 8 16 12 10 16 10 8"/>
                    </svg>
                    <h3>${search ? 'No results found' : 'No videos yet'}</h3>
                    <p>${search ? `No videos match "${search}". Try a different search.` : 'Be the first to upload a video to Orix.'}</p>
                </div>
            `;
        } else {
            data.videos.forEach(v => grid.appendChild(renderVideoCard(v)));
        }

        currentPage = data.page;
        totalPages = data.pages;

        loadMoreBtn.style.display = currentPage < totalPages ? 'block' : 'none';
    } catch (err) {
        grid.innerHTML = `<div class="empty-state"><h3>Could not load videos</h3><p>Please check your connection.</p></div>`;
    } finally {
        isLoading = false;
    }
}

// ==========================================
// SEARCH
// ==========================================
const searchInput = document.getElementById('searchInput');
let searchTimeout;

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        const title = document.getElementById('feedTitle');
        title.textContent = currentSearch ? `Results for "${currentSearch}"` : 'Latest Videos';
        fetchVideos(1, currentSearch, false);
    }, 400);
});

// Pre-fill search from URL
const urlParams = new URLSearchParams(window.location.search);
const qParam = urlParams.get('q');
if (qParam) {
    searchInput.value = qParam;
    currentSearch = qParam;
}

// Load More
document.getElementById('loadMoreBtn').addEventListener('click', () => {
    fetchVideos(currentPage + 1, currentSearch, true);
});

// ==========================================
// AUTH UI
// ==========================================
function updateAuthUI() {
    const user = Auth.getUser();
    const guestMenu = document.getElementById('guestMenu');
    const userMenu = document.getElementById('userMenu');

    if (user) {
        guestMenu.style.display = 'none';
        userMenu.style.display = 'block';
        document.getElementById('dropdownUsername').textContent = user.username;
        document.getElementById('dropdownEmail').textContent = user.email;
    } else {
        guestMenu.style.display = 'block';
        userMenu.style.display = 'none';
    }
}

// Profile button toggle dropdown
const profileBtn = document.getElementById('profileBtn');
const authDropdown = document.getElementById('authDropdown');

profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    authDropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
    authDropdown.classList.remove('open');
});

// Modal
const authModal = document.getElementById('authModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function openModal(form = 'login') {
    authDropdown.classList.remove('open');
    authModal.classList.add('open');
    if (form === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

function closeModal() {
    authModal.classList.remove('open');
}

document.getElementById('loginBtn').addEventListener('click', () => openModal('login'));
document.getElementById('registerBtn').addEventListener('click', () => openModal('register'));
document.getElementById('switchToRegister').addEventListener('click', () => openModal('register'));
document.getElementById('switchToLogin').addEventListener('click', () => openModal('login'));
document.getElementById('closeModal').addEventListener('click', closeModal);
authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(); });

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    Auth.clear();
    updateAuthUI();
    authDropdown.classList.remove('open');
});

// Login Submit
document.getElementById('loginSubmit').addEventListener('click', async () => {
    const btn = document.getElementById('loginSubmit');
    const errEl = document.getElementById('loginError');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        errEl.textContent = 'Please fill in all fields';
        errEl.classList.add('show');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            errEl.textContent = data.error || 'Login failed';
            errEl.classList.add('show');
        } else {
            Auth.setSession(data.token, data.user);
            updateAuthUI();
            closeModal();
        }
    } catch (e) {
        errEl.textContent = 'Network error';
        errEl.classList.add('show');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});

// Register Submit
document.getElementById('registerSubmit').addEventListener('click', async () => {
    const btn = document.getElementById('registerSubmit');
    const errEl = document.getElementById('registerError');
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!username || !email || !password) {
        errEl.textContent = 'Please fill in all fields';
        errEl.classList.add('show');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            errEl.textContent = data.error || 'Registration failed';
            errEl.classList.add('show');
        } else {
            Auth.setSession(data.token, data.user);
            updateAuthUI();
            closeModal();
        }
    } catch (e) {
        errEl.textContent = 'Network error';
        errEl.classList.add('show');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
});

// ==========================================
// INIT
// ==========================================
updateAuthUI();
fetchVideos(1, currentSearch);