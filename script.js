// 1. فتح قاعدة البيانات بالإصدار رقم 3
const request = indexedDB.open("FileStorage", 3);
let db;

request.onupgradeneeded = function(e) {
    db = e.target.result;
    if (db.objectStoreNames.contains("files")) {
        db.deleteObjectStore("files");
    }
    db.createObjectStore("files", { keyPath: "id", autoIncrement: true });
};

request.onsuccess = function(e) {
    db = e.target.result;
    displayFiles();
};

request.onerror = function(e) {
    console.error("حدث خطأ في فتح قاعدة البيانات", e);
};

// 2. عناصر الواجهة
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const bgInput = document.getElementById('bgInput');
const resetBgBtn = document.getElementById('resetBgBtn');

// --- 3. إدارة خلفية الصفحة وحفظها محلياً ---
window.addEventListener('DOMContentLoaded', () => {
    const savedBg = localStorage.getItem('customBackground');
    if (savedBg) {
        applyBackground(savedBg);
    }
});

if (bgInput) {
    bgInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const imageDataUrl = event.target.result;
            localStorage.setItem('customBackground', imageDataUrl);
            applyBackground(imageDataUrl);
        };
        reader.readAsDataURL(file);
    });
}

if (resetBgBtn) {
    resetBgBtn.addEventListener('click', () => {
        localStorage.removeItem('customBackground');
        document.body.style.backgroundImage = '';
    });
}

function applyBackground(url) {
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundAttachment = 'fixed';
}

// --- 4. رفع وحفظ الملف مع منع التكرار ---
uploadForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) return;

    const transaction = db.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");

    const checkRequest = store.getAll();

    checkRequest.onsuccess = function() {
        const existingFiles = checkRequest.result;
        
        const isDuplicate = existingFiles.some(item => 
            item.name === file.name && item.data.size === file.size
        );

        if (isDuplicate) {
            alert("هذا الملف موجود بالفعل في القائمة!");
            return;
        }

        const fileData = {
            name: file.name,
            type: file.type,
            data: file
        };

        const addRequest = store.add(fileData);

        addRequest.onsuccess = function() {
            alert("تم حفظ الملف بنجاح!");
            fileInput.value = ""; 
            displayFiles();
        };
    };
});

// --- 5. عرض الملفات المرفوعة ---
function displayFiles() {
    if (!db) return;
    fileList.innerHTML = "";
    
    const transaction = db.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const request = store.openCursor();

    request.onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
            const fileId = cursor.key;
            const fileVal = cursor.value;

            const li = document.createElement('li');

            const sizeInMB = (fileVal.data.size / (1024 * 1024)).toFixed(2);

            const fileInfo = document.createElement('div');
            fileInfo.className = "file-info";
            fileInfo.textContent = `${fileVal.name} (${sizeInMB} MB)`;

            const fileActions = document.createElement('div');
            fileActions.className = "file-actions";

            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(fileVal.data);
            downloadLink.download = fileVal.name;
            downloadLink.textContent = "تحميل";

            const deleteBtn = document.createElement('button');
            deleteBtn.className = "btn-delete-single";
            deleteBtn.textContent = "حذف";
            deleteBtn.onclick = function() {
                deleteSingleFile(fileId);
            };

            fileActions.appendChild(downloadLink);
            fileActions.appendChild(deleteBtn);

            li.appendChild(fileInfo);
            li.appendChild(fileActions);
            fileList.appendChild(li);

            cursor.continue();
        }
    };
}

// --- 6. حذف ملف واحد ---
function deleteSingleFile(id) {
    if (!confirm("هل أنت تأكد من حذف هذا الملف؟")) return;

    const transaction = db.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");
    const request = store.delete(id);

    request.onsuccess = function() {
        displayFiles();
    };
}

// --- 7. تحميل كل الملفات في ZIP ---
downloadAllBtn.addEventListener('click', function() {
    const transaction = db.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = function() {
        const files = getAllRequest.result;

        if (files.length === 0) {
            alert("لا توجد ملفات مرفوعة لتحميلها!");
            return;
        }

        const zip = new JSZip();
        files.forEach(fileItem => {
            zip.file(fileItem.name, fileItem.data);
        });

        downloadAllBtn.textContent = "⏳ جاري الضغط...";
        downloadAllBtn.disabled = true;

        zip.generateAsync({ type: "blob" }).then(function(content) {
            saveAs(content, "جميع_الملفات.zip");
            downloadAllBtn.textContent = "📦 تحميل كل الملفات (ZIP)";
            downloadAllBtn.disabled = false;
        });
    };
});

// --- 8. مسح كل الملفات ---
deleteAllBtn.addEventListener('click', function() {
    if (!confirm("هل أنت متأكد من مسح جميع الملفات المخزنة نهائياً؟")) return;

    const transaction = db.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");
    const clearRequest = store.clear();

    clearRequest.onsuccess = function() {
        alert("تم مسح كافة الملفات بنجاح.");
        displayFiles();
    };
});