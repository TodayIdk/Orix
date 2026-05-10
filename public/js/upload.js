/* =========================================
   ORIX — Upload Page JS
========================================= */

const API = '/api';

const Auth = {
    getToken: () => localStorage.getItem('orix_token'),
    getUser: () => {
        const u = localStorage.getItem('orix_user');
        return u ? JSON.parse(u) : null;
    },
    isLoggedIn: () => !!localStorage.getItem('orix_token')
};

// ==========================================
// AUTH CHECK
// ==========================================
if (!Auth.isLoggedIn()) {
    document.getElementById('authWarning').style.display = 'block';
    document.getElementById('uploadBody').style.opacity = '0.4';
    document.getElementById('uploadBody').style.pointerEvents = 'none';
}

// ==========================================
// STATE
// ==========================================
let selectedFile = null;
let selectedThumb = null;
let uploadedVideoId = null;

// ==========================================
// DROP ZONE
// ==========================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const submitBtn = document.getElementById('submitBtn');

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
        handleFileSelect(file);
    }
});

dropZone.addEventListener('click', () => {
    if (!selectedFile) fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
    selectedFile = file;

    // Show progress section
    document.getElementById('uploadProgressSection').classList.add('show');
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('progressStatus').textContent = 'Ready to upload';
    document.getElementById('progressPercent').textContent = '0%';
    document.getElementById('progressBarFill').style.width = '0%';

    // Pre-fill title from filename
    const titleInput = document.getElementById('videoTitle');
    if (!titleInput.value) {
        titleInput.value = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    // Enable submit
    submitBtn.disabled = false;
    dropZone.style.opacity = '0.5';
    dropZone.style.pointerEvents = 'none';
}

function formatFileSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
}

// ==========================================
// THUMBNAIL PREVIEW
// ==========================================
const thumbInput = document.getElementById('thumbInput');
const thumbPreview = document.getElementById('thumbPreview');

thumbInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedThumb = file;

    const reader = new FileReader();
    reader.onload = (ev) => {
        thumbPreview.innerHTML = `<img src="${ev.target.result}" alt="Thumbnail">`;
    };
    reader.readAsDataURL(file);
});

// ==========================================
// UPLOAD
// ==========================================
submitBtn.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) {
        alert('You must be signed in to upload');
        return;
    }

    if (!selectedFile) {
        showError('Please select a video file');
        return;
    }

    const title = document.getElementById('videoTitle').value.trim();
    if (!title) {
        showError('Please enter a video title');
        return;
    }

    submitBtn.disabled = true;
    hideError();

    const description = document.getElementById('videoDescription').value.trim();

    // ---- Step 1: Upload Video ----
    try {
        setProgress(0, 'Uploading video...');

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('title', title);
        formData.append('description', description);

        // Get video duration
        const duration = await getVideoDuration(selectedFile);
        formData.append('duration', duration);

        const videoId = await uploadWithProgress(
            `/api/upload/video`,
            formData,
            Auth.getToken(),
            (pct) => setProgress(pct * 0.85, 'Uploading video...')
        );

        uploadedVideoId = videoId;
        setProgress(85, 'Video uploaded!');

        // ---- Step 2: Upload Thumbnail (if selected) ----
        if (selectedThumb) {
            setProgress(88, 'Uploading thumbnail...');
            const thumbFormData = new FormData();
            thumbFormData.append('thumbnail', selectedThumb);

            await fetch(`/api/upload/thumbnail/${videoId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${Auth.getToken()}` },
                body: thumbFormData
            });
        }

        setProgress(100, 'Published!');

        // Show success
        setTimeout(() => {
            document.getElementById('uploadFields').style.display = 'none';
            document.getElementById('uploadProgressSection').style.display = 'none';
            dropZone.style.display = 'none';
            document.querySelector('.upload-title').style.display = 'none';
            document.querySelector('.upload-subtitle').style.display = 'none';
            document.getElementById('uploadSuccess').classList.add('show');

            document.getElementById('watchNowBtn').onclick = () => {
                window.location.href = `/video?id=${videoId}`;
            };
        }, 800);

    } catch (err) {
        showError(err.message || 'Upload failed. Please try again.');
        submitBtn.disabled = false;
        setProgress(0, 'Upload failed');
    }
});

function uploadWithProgress(url, formData, token, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                onProgress(e.loaded / e.total);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                resolve(data.videoId);
            } else {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || 'Upload failed'));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    });
}

function getVideoDuration(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            resolve(video.duration || 0);
            URL.revokeObjectURL(video.src);
        };
        video.onerror = () => resolve(0);
        video.src = URL.createObjectURL(file);
    });
}

function setProgress(pct, status) {
    const fill = document.getElementById('progressBarFill');
    const label = document.getElementById('progressStatus');
    const percent = document.getElementById('progressPercent');
    fill.style.width = `${Math.round(pct)}%`;
    label.textContent = status;
    percent.textContent = `${Math.round(pct)}%`;
}

function showError(msg) {
    const el = document.getElementById('uploadError');
    el.textContent = msg;
    el.classList.add('show');
}

function hideError() {
    document.getElementById('uploadError').classList.remove('show');
}