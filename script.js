let db;

// فتح أو إنشاء قاعدة بيانات IndexedDB
const request = indexedDB.open("CloudStorageDB", 1);

request.onerror = function(event) {
    console.error("فشل فتح قاعدة البيانات:", event.target.error);
};

request.onsuccess = function(event) {
    db = event.target.result;
    loadFiles();
};

request.onupgradeneeded = function(event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id", autoIncrement: true });
    }
};

// إدارة خلفية الشاشة المحفوظة مسبقاً
const defaultBg = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop"; // خلفية افتراضية رائعة
window.addEventListener('DOMContentLoaded', () => {
    const savedBg = localStorage.getItem('customBg') || defaultBg;
    document.body.style.backgroundImage = `url('${savedBg}')`;
});

// تغيير الخلفية برفع صورة جديدة
document.getElementById('bgInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const imageUrl = event.target.result;
            document.body.style.backgroundImage = `url('${imageUrl}')`;
            localStorage.setItem('customBg', imageUrl);
        };
        reader.readAsDataURL(file);
    }
});

// إرجاع الخلفية للافتراضي
document.getElementById('resetBgBtn').addEventListener('click', function() {
    localStorage.removeItem('customBg');
    document.body.style.backgroundImage = `url('${defaultBg}')`;
});

// رفع الملفات وحفظها في الذاكرة المحلية
document.getElementById('uploadForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;

    if (files.length === 0) return;

    const transaction = db.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        store.add({
            name: file.name,
            size: file.size,
            type: file.type,
            data: file
        });
    }

    transaction.oncomplete = function() {
        fileInput.value = "";
        loadFiles();
    };

    transaction.onerror = function(event) {
        console.error("خطأ أثناء رفع الملفات:", event.target.error);
    };
});

// عرض الملفات المخزنة في واجهة المستخدم
function loadFiles() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = "";

    const transaction = db.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const request = store.openCursor();

    request.onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            const fileItem = cursor.value;
            const li = document.createElement('li');

            const fileUrl = URL.createObjectURL(fileItem.data);
            const fileSizeMB = (fileItem.size / (1024 * 1024)).toFixed(2);

            li.innerHTML = `
                <div class="file-info">
                    📁 <strong>${fileItem.name}</strong> (${fileSizeMB} MB)
                </div>
                <div class="file-actions">
                    <a href="${fileUrl}" download="${fileItem.name}">تحميل</a>
                    <button class="btn-delete-single" onclick="deleteFile(${fileItem.id})">حذف</button>
                </div>
            `;

            fileList.appendChild(li);
            cursor.continue();
        }
    };
}

// حذف ملف فردي
function deleteFile(id) {
    const transaction = db.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");
    store.delete(id);

    transaction.oncomplete = function() {
        loadFiles();
    };
}

// تحميل جميع الملفات بملف ضغط واحد (ZIP)
document.getElementById('downloadAllBtn').addEventListener('click', function() {
    const transaction = db.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = function() {
        const files = getAllRequest.result;
        if (files.length === 0) {
            alert("لا توجد ملفات لتحميلها!");
            return;
        }

        const zip = new JSZip();
        files.forEach(fileItem => {
            zip.file(fileItem.name, fileItem.data);
        });

        zip.generateAsync({ type: "blob" }).then(function(content) {
            saveAs(content, "my_files_backup.zip");
        });
    };
});

// حذف كافة الملفات
document.getElementById('deleteAllBtn').addEventListener('click', function() {
    if (confirm("هل أنت متأكد من حذف جميع الملفات نهائياً؟")) {
        const transaction = db.transaction(["files"], "readwrite");
        const store = transaction.objectStore("files");
        store.clear();

        transaction.oncomplete = function() {
            loadFiles();
        };
    }
});


// ==========================================
// --- إعدادات الربط مع Google Drive ---
// ==========================================
const CLIENT_ID = 'ضع_الـ_Client_ID_هنا.apps.googleusercontent.com'; // <--- ضع الـ Client ID الخاص بك هنا بين علامتي التنصيص
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;

window.addEventListener('load', function() {
    if (window.google) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (response) => {
                if (response.access_token) {
                    accessToken = response.access_token;
                    await uploadFilesToDrive();
                }
            },
        });
    }
});

const driveSyncBtn = document.getElementById('driveSyncBtn');
if (driveSyncBtn) {
    driveSyncBtn.addEventListener('click', () => {
        if (!accessToken) {
            tokenClient.requestAccessToken();
        } else {
            uploadFilesToDrive();
        }
    });
}

// دالة رفع الملفات إلى Google Drive
async function uploadFilesToDrive() {
    const transaction = db.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = async function() {
        const files = getAllRequest.result;
        if (files.length === 0) {
            alert("لا توجد ملفات مرفوعة لرفعها إلى Drive!");
            return;
        }

        driveSyncBtn.textContent = "⏳ جاري الرفع إلى Drive...";
        driveSyncBtn.disabled = true;

        for (const fileItem of files) {
            const metadata = {
                name: fileItem.name,
                mimeType: fileItem.type || 'application/octet-stream'
            };

            const formData = new FormData();
            formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            formData.append('file', fileItem.data);

            try {
                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                    body: formData
                });
            } catch (err) {
                console.error("خطأ في رفع الملف:", fileItem.name, err);
            }
        }

        alert("تم رفع جميع الملفات بنجاح إلى Google Drive!");
        driveSyncBtn.textContent = "☁️ حفظ نسخة على Google Drive";
        driveSyncBtn.disabled = false;
    };
}
