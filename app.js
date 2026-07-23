// ============================================================
// ИНИЦИАЛИЗАЦИЯ FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyA-s8N2SnDpB4iArm5yRUJfe9ym1p_Obm8",
  authDomain: "zerixxx-diary.firebaseapp.com",
  projectId: "zerixxx-diary",
  storageBucket: "zerixxx-diary.firebasestorage.app",
  messagingSenderId: "604711229526",
  appId: "1:604711229526:web:73025951df7112b91103f7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let currentUser = null;
let isAdmin = false;
let currentSection = 'articles';
let editingId = null;
let easyMDE = null;

// ============================================================
// ЗАГРУЗКА ДАННЫХ ИЗ FIRESTORE
// ============================================================
async function loadCollection(collectionName) {
  try {
    const snapshot = await db.collection(collectionName).orderBy('date', 'desc').get();
    const items = [];
    snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });
    return items;
  } catch (error) {
    console.error(`Ошибка загрузки ${collectionName}:`, error);
    return [];
  }
}

// ============================================================
// РЕНДЕРИНГ КАРТОЧЕК
// ============================================================
function renderArticles(containerId, articles, clickable = true) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!articles || articles.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim);">Пока нет записей.</p>`;
    return;
  }
  container.innerHTML = articles.map(item => `
    <div class="post-card" data-id="${item.id}" data-type="article">
      <h3>${item.icon || '📄'} ${item.title}</h3>
      <div class="meta">${item.date || ''} · ${(item.tags || []).join(', ')}</div>
      <p>${item.preview || ''}</p>
    </div>
  `).join('');
  if (!clickable) return;
  container.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (id) showDetail('articles', id);
    });
  });
}

function renderVideos(containerId, videos) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!videos || videos.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim);">Нет видео.</p>`;
    return;
  }
  container.innerHTML = videos.map(item => {
    let embedUrl = item.url || '';
    if (embedUrl.includes('watch?v=')) {
      embedUrl = embedUrl.replace('watch?v=', 'embed/');
    } else if (embedUrl.includes('youtu.be/')) {
      embedUrl = embedUrl.replace('youtu.be/', 'youtube.com/embed/');
    }
    return `
      <div class="video-item">
        <iframe src="${embedUrl}" allowfullscreen></iframe>
        <h4>${item.title}</h4>
        <div class="meta">${item.date || ''}</div>
      </div>
    `;
  }).join('');
}

function renderOther(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim);">Нет записей.</p>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="post-card" data-id="${item.id}" data-type="other">
      <h3>${item.icon || '📄'} ${item.title}</h3>
      <div class="meta">${item.date || ''}</div>
      <p>${item.preview || ''}</p>
    </div>
  `).join('');
  container.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (id) showDetail('other', id);
    });
  });
}

// ============================================================
// ДЕТАЛЬНЫЙ ПРОСМОТР (С ПАРСИНГОМ MARKDOWN)
// ============================================================
async function showDetail(collection, id) {
  try {
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) { alert('Запись не найдена.'); return; }
    const data = doc.data();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const detailPage = document.getElementById('post-detail');
    detailPage.classList.add('active');

    let content = data.content || '';
    // Преобразуем Markdown в HTML, если доступен marked
    if (typeof marked !== 'undefined' && content) {
      content = marked.parse(content);
    }

    detailPage.innerHTML = `
      <div class="back-link" id="backFromPost"><i class="fas fa-arrow-left"></i> Назад</div>
      <h1>${data.icon || '📄'} ${data.title}</h1>
      <div class="post-meta">${data.date || ''} · ${(data.tags || []).join(' • ')}</div>
      <div class="post-content">${content}</div>
    `;
    document.getElementById('backFromPost').addEventListener('click', () => history.back());
    if (history.pushState) {
      history.pushState({ detail: true }, '', `#detail/${collection}/${id}`);
    }
    document.querySelectorAll('#mainNav a').forEach(link => link.classList.remove('active'));
  } catch (error) {
    console.error('Ошибка загрузки детали:', error);
    alert('Не удалось загрузить запись.');
  }
}

// ============================================================
// ОБНОВЛЕНИЕ ВСЕХ РАЗДЕЛОВ
// ============================================================
async function refreshFrontend() {
  const articles = await loadCollection('articles');
  const videos = await loadCollection('videos');
  const other = await loadCollection('other');
  renderArticles('homePosts', articles.slice(0, 3), true);
  renderArticles('allPosts', articles, true);
  renderVideos('videoList', videos);
  renderOther('otherList', other);
}

// ============================================================
// АДМИНКА – РЕНДЕРИНГ СПИСКА
// ============================================================
async function renderAdminList() {
  const list = document.getElementById('adminList');
  const items = await loadCollection(currentSection);
  if (!items || items.length === 0) {
    list.innerHTML = `<p style="color:var(--text-dim);">Нет записей в этом разделе.</p>`;
    return;
  }
  list.innerHTML = items.map(item => `
    <div class="admin-item" data-id="${item.id}">
      <span><span class="title">${item.icon || '📄'} ${item.title}</span> <span style="color:var(--text-dim); font-size:0.8rem;">${item.date || ''}</span></span>
      <div class="actions">
        <button onclick="editItem('${item.id}')" title="Редактировать"><i class="fas fa-edit"></i></button>
        <button onclick="deleteItem('${item.id}')" class="del" title="Удалить"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

// ============================================================
// ОПЕРАЦИИ CRUD
// ============================================================
window.deleteItem = async function(id) {
  if (!confirm('Удалить запись навсегда?')) return;
  try {
    await db.collection(currentSection).doc(id).delete();
    alert('Запись удалена.');
    renderAdminList();
    refreshFrontend();
  } catch (error) {
    console.error('Ошибка удаления:', error);
    alert('Не удалось удалить запись.');
  }
};

window.editItem = async function(id) {
  try {
    const doc = await db.collection(currentSection).doc(id).get();
    if (!doc.exists) { alert('Запись не найдена.'); return; }
    editingId = id;
    showForm(doc.data());
  } catch (error) {
    console.error('Ошибка загрузки для редактирования:', error);
    alert('Не удалось загрузить запись.');
  }
};

// ============================================================
// СОХРАНЕНИЕ (ИСПРАВЛЕННОЕ)
// ============================================================
async function saveItem() {
  // Принудительно синхронизируем EasyMDE с textarea
  if (easyMDE) {
    try {
      easyMDE.codemirror.save();
    } catch (e) {
      console.warn('Ошибка синхронизации EasyMDE:', e);
    }
  }

  const title = document.getElementById('editTitle')?.value?.trim() || '';
  const date = document.getElementById('editDate')?.value?.trim() || '';
  const icon = document.getElementById('editIcon')?.value?.trim() || '';

  if (!title || !date) {
    alert('Заголовок и Дата обязательны.');
    return;
  }

  let data = { title, date, icon: icon || '📄' };

  if (currentSection === 'articles') {
    const preview = document.getElementById('editPreview')?.value?.trim() || '';
    // Читаем из textarea (уже синхронизировано)
    let content = document.getElementById('editContent')?.value?.trim() || '';
    // Запасные варианты
    if (easyMDE && !content) {
      content = easyMDE.value().trim() || '';
    }
    if (easyMDE && !content) {
      content = easyMDE.codemirror.getValue().trim() || '';
    }
    const tagsRaw = document.getElementById('editTags')?.value?.trim() || '';

    if (!preview || !content) {
      alert(`Превью и полный текст обязательны для статей.\nПревью: "${preview}"\nТекст: "${content}"`);
      return;
    }
    data.preview = preview;
    data.content = content;
    data.tags = tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (currentSection === 'videos') {
    const url = document.getElementById('editUrl')?.value?.trim() || '';
    if (!url) {
      alert('Ссылка на видео обязательна.');
      return;
    }
    data.url = url;
    data.preview = '';
    data.content = '';
    data.tags = [];
  } else if (currentSection === 'other') {
    const preview = document.getElementById('editPreview')?.value?.trim() || '';
    let content = '';
    if (easyMDE) {
      easyMDE.codemirror.save();
      content = document.getElementById('editContent')?.value?.trim() || '';
      if (!content) content = easyMDE.value().trim() || '';
      if (!content) content = easyMDE.codemirror.getValue().trim() || '';
    } else {
      content = document.getElementById('editContent')?.value?.trim() || '';
    }
    if (!preview) {
      alert('Краткое описание обязательно.');
      return;
    }
    data.preview = preview;
    data.content = content || '';
    data.tags = [];
  }

  try {
    if (editingId) {
      await db.collection(currentSection).doc(editingId).update(data);
      alert('Запись обновлена!');
    } else {
      await db.collection(currentSection).add(data);
      alert('Запись добавлена!');
    }
    editingId = null;
    resetForm();
    renderAdminList();
    refreshFrontend();
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    alert('Не удалось сохранить запись. Проверьте права доступа.');
  }
}

// ============================================================
// ФОРМА (С ИНИЦИАЛИЗАЦИЕЙ EASYMDE)
// ============================================================
function showForm(data = null) {
  const formContainer = document.getElementById('formFields');
  const hint = document.getElementById('formHint');
  const titleEl = document.getElementById('formTitle');
  titleEl.textContent = data ? 'Редактирование записи' : 'Новая запись';

  let html = `
    <div class="row">
      <div>
        <label>Заголовок *</label>
        <input type="text" id="editTitle" value="${data?.title || ''}" placeholder="Заголовок" />
      </div>
      <div>
        <label>Дата *</label>
        <input type="text" id="editDate" value="${data?.date || ''}" placeholder="дд месяц гггг" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Иконка (эмодзи)</label>
        <input type="text" id="editIcon" value="${data?.icon || ''}" placeholder="🚴" maxlength="2" />
      </div>
  `;

  if (currentSection === 'articles') {
    html += `
      <div>
        <label>Теги (через запятую)</label>
        <input type="text" id="editTags" value="${(data?.tags || []).join(', ')}" placeholder="тег1, тег2" />
      </div>
    </div>
    <label>Краткое описание (превью) *</label>
    <textarea id="editPreview" rows="2" placeholder="Краткий анонс">${data?.preview || ''}</textarea>
    <label>Полный текст (Markdown / HTML) *</label>
    <textarea id="editContent" rows="8" placeholder="Содержание">${data?.content || ''}</textarea>
    `;
    hint.textContent = 'В полном тексте можно использовать Markdown (заголовки, списки, ссылки, изображения, код).';
  } else if (currentSection === 'videos') {
    html += `
      <div>
        <label>Ссылка на видео (YouTube, Vimeo и т.д.)</label>
        <input type="url" id="editUrl" value="${data?.url || ''}" placeholder="https://www.youtube.com/watch?v=..." />
      </div>
    </div>
    <div class="video-url-hint">Вставьте ссылку на страницу видео (не embed-код).</div>
    `;
    hint.textContent = 'Поле "Ссылка" обязательно. Видео будет встроено на сайт.';
    html += `<input type="hidden" id="editPreview" value="" /><input type="hidden" id="editContent" value="" />`;
  } else if (currentSection === 'other') {
    html += `
      </div>
      <label>Краткое описание (превью) *</label>
      <textarea id="editPreview" rows="2" placeholder="Краткое описание">${data?.preview || ''}</textarea>
      <label>Полный текст (Markdown / HTML)</label>
      <textarea id="editContent" rows="8" placeholder="Содержание">${data?.content || ''}</textarea>
    `;
    hint.textContent = 'Полный текст может содержать Markdown или HTML.';
  }

  formContainer.innerHTML = html;
  document.getElementById('adminForm').classList.remove('hidden');
  document.getElementById('adminForm').scrollIntoView({ behavior: 'smooth' });

  // Инициализация EasyMDE с увеличенной задержкой
  setTimeout(() => {
    const contentTextarea = document.getElementById('editContent');
    if (contentTextarea && contentTextarea.tagName === 'TEXTAREA' && contentTextarea.type !== 'hidden') {
      if (easyMDE) {
        try { easyMDE.toTextArea(); } catch (e) {}
        easyMDE = null;
      }
      try {
        easyMDE = new EasyMDE({
          element: contentTextarea,
          spellChecker: false,
          toolbar: ['bold', 'italic', 'heading', 'quote', 'unordered-list', 'ordered-list', 'link', 'image', 'code', 'preview', 'side-by-side', 'fullscreen']
        });
        if (data?.content) {
          easyMDE.value(data.content);
        }
        easyMDE.codemirror.save();
      } catch (error) {
        console.error('Ошибка инициализации EasyMDE:', error);
        easyMDE = null;
      }
    }
  }, 500);
}

function resetForm() {
  editingId = null;
  document.getElementById('adminForm').classList.add('hidden');
  ['editTitle', 'editDate', 'editIcon', 'editTags', 'editPreview', 'editUrl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (easyMDE) {
    try {
      easyMDE.value('');
      easyMDE.codemirror.save();
    } catch (e) {}
  }
  const contentEl = document.getElementById('editContent');
  if (contentEl) contentEl.value = '';
}

// ============================================================
// ПЕРЕКЛЮЧЕНИЕ РАЗДЕЛОВ В АДМИНКЕ
// ============================================================
function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('#adminTabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });
  resetForm();
  renderAdminList();
}

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================
async function checkAdmin(email) {
  try {
    const snapshot = await db.collection('admin').where('email', '==', email).get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Ошибка проверки админа:', error);
    return false;
  }
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.error('Ошибка входа:', error);
    errorEl.textContent = 'Неверный email или пароль.';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginPassword').focus();
  }
});

auth.onAuthStateChanged(async function(user) {
  if (user) {
    currentUser = user;
    isAdmin = await checkAdmin(user.email);
    if (isAdmin) {
      switchPage('admin');
      renderAdminList();
      resetForm();
      alert('Добро пожаловать в админ-панель, zerixxx!');
    } else {
      alert('У вас нет прав администратора.');
      await auth.signOut();
      switchPage('home');
    }
  } else {
    currentUser = null;
    isAdmin = false;
    const activePage = document.querySelector('.page.active');
    if (activePage && (activePage.id === 'page-admin' || activePage.id === 'page-login')) {
      switchPage('home');
    }
    resetForm();
    refreshFrontend();
  }
});

document.getElementById('logoutBtn').addEventListener('click', async function() {
  try {
    await auth.signOut();
    alert('Вы вышли из аккаунта.');
    switchPage('home');
  } catch (error) {
    console.error('Ошибка выхода:', error);
  }
});

// ============================================================
// СЕКРЕТНЫЙ ТРИГГЕР: 5 КЛИКОВ ПО ЛОГОТИПУ
// ============================================================
let clickCount = 0;
let clickTimer = null;
document.getElementById('logoHome').addEventListener('click', function(e) {
  clickCount++;
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { clickCount = 0; }, 1500);
  if (clickCount >= 5) {
    clickCount = 0;
    clearTimeout(clickTimer);
    if (isAdmin && currentUser) {
      switchPage('admin');
    } else {
      switchPage('login');
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginError').textContent = '';
      document.getElementById('loginEmail').focus();
    }
  }
});

// ============================================================
// НАВИГАЦИЯ
// ============================================================
function switchPage(pageId) {
  const currentHash = window.location.hash;
  if ((pageId === 'admin' || pageId === 'login') && (currentHash === '#admin' || currentHash === '#login')) {
    pageId = 'home';
  }
  if (pageId === 'admin' && !isAdmin) {
    pageId = 'login';
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  document.querySelectorAll('#mainNav a').forEach(link => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });

  if (pageId !== 'login' && pageId !== 'admin' && history.pushState) {
    history.pushState({ page: pageId }, '', '#' + pageId);
  } else if (pageId === 'login' || pageId === 'admin') {
    if (history.replaceState) {
      history.replaceState({ page: 'home' }, '', '#home');
    }
  }
  if (pageId === 'admin') {
    renderAdminList();
    resetForm();
  }
  if (pageId === 'home' || pageId === 'articles' || pageId === 'video' || pageId === 'other') {
    refreshFrontend();
  }
}

// ============================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  refreshFrontend();

  document.querySelectorAll('#mainNav a').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const page = this.dataset.page;
      if (page) switchPage(page);
    });
  });

  document.querySelectorAll('#adminTabs button').forEach(btn => {
    btn.addEventListener('click', function() {
      const section = this.dataset.section;
      if (section) switchSection(section);
    });
  });

  document.getElementById('newItemBtn').addEventListener('click', function() {
    resetForm();
    showForm(null);
  });

  document.getElementById('refreshBtn').addEventListener('click', function() {
    renderAdminList();
    refreshFrontend();
  });

  document.getElementById('saveItemBtn').addEventListener('click', saveItem);
  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);

  function handleHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#detail/')) {
      const parts = hash.split('/');
      if (parts.length === 3) {
        const collection = parts[1];
        const id = parts[2];
        if (collection && id) {
          showDetail(collection, id);
          return;
        }
      }
    }
    if (hash.startsWith('#') && hash.length > 1) {
      const page = hash.replace('#', '');
      if (['home', 'articles', 'video', 'other', 'contacts'].includes(page)) {
        switchPage(page);
      } else {
        switchPage('home');
      }
    } else {
      switchPage('home');
    }
  }

  window.addEventListener('popstate', handleHash);
  handleHash();
});ы
