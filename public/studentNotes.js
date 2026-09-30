let currentStudentId = null;
let currentNotesCache = [];
let globalSupabaseClient = null;

// 初始化 Supabase Client 引用
export function initStudentNotes(supabaseClient) {
  globalSupabaseClient = supabaseClient;
}

// 1. 開啟 Modal
export async function openNotesModal(studentId, studentName, supabaseClient) {
  if (supabaseClient) globalSupabaseClient = supabaseClient;
  currentStudentId = studentId;
  document.getElementById('modal-student-name').innerText = `${studentName} - 歷史備註`;
  document.getElementById('notes-modal').classList.remove('hidden');
  hideNoteForm();
  await fetchNotes();
}

// 2. 關閉 Modal
export function closeNotesModal() {
  document.getElementById('notes-modal').classList.add('hidden');
}

// 3. 取得歷史備註
export async function fetchNotes() {
  if (!globalSupabaseClient) return;
  const { data: { session } } = await globalSupabaseClient.auth.getSession();
  const res = await fetch(`/api/students/${currentStudentId}/notes`, {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const data = await res.json();
  if (data.success) {
    currentNotesCache = data.notes;
    renderNotesList(data.notes);
  }
}

// 4. 渲染備註列表
function renderNotesList(notes) {
  const list = document.getElementById('notes-list');
  if (notes.length === 0) {
    list.innerHTML = '<p style="color: var(--text-sub); font-size: 13px; text-align:center;">尚無歷史備註紀錄。</p>';
    return;
  }
  list.innerHTML = notes.map(n => `
    <div class="note-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="font-size: 14px;">${n.record_date} (${n.week_number})</strong>
        <button class="btn-apple btn-outline" style="width:auto; padding:2px 8px; font-size:11px;" onclick="window.editNote('${n.id}')">編輯</button>
      </div>
      <p style="font-size: 13px; color: #3a3a3c; margin-top: 6px; white-space: pre-line;">${n.content || '（無文字內容）'}</p>
      ${n.photo_urls?.length ? `
        <div class="note-photos-grid">
          ${n.photo_urls.map(url => `<a href="${url}" target="_blank"><img src="${url}" /></a>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// 5. 顯示／隱藏表單
export function showNoteForm() {
  document.getElementById('note-form').reset();
  document.getElementById('note-id').value = '';
  document.getElementById('form-title').innerText = '新增紀錄';
  document.getElementById('note-record-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('note-form').classList.remove('hidden');
  document.getElementById('btn-show-add-form').classList.add('hidden');
}

export function hideNoteForm() {
  document.getElementById('note-form').classList.add('hidden');
  document.getElementById('btn-show-add-form').classList.remove('hidden');
}

// 6. 編輯單週紀錄 (回填資料)
export function editNote(noteId) {
  const note = currentNotesCache.find(n => n.id === noteId);
  if (!note) return;

  document.getElementById('note-id').value = note.id;
  document.getElementById('note-record-date').value = note.record_date;
  document.getElementById('note-week-number').value = note.week_number;
  document.getElementById('note-content').value = note.content || '';
  document.getElementById('form-title').innerText = '編輯單週紀錄';

  document.getElementById('note-form').classList.remove('hidden');
  document.getElementById('btn-show-add-form').classList.add('hidden');
}

// 7. 將 HTML 需要呼叫的函式統一掛載至 window 全域
window.openNotesModal = openNotesModal;
window.closeNotesModal = closeNotesModal;
window.showNoteForm = showNoteForm;
window.hideNoteForm = hideNoteForm;
window.editNote = editNote;

// 8. 監聽表單提交事件 (送出新增/編輯 + 照片)
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('note-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!globalSupabaseClient) return alert('系統初始化中，請稍後');

      const { data: { session } } = await globalSupabaseClient.auth.getSession();
      const formData = new FormData();
      
      formData.append('noteId', document.getElementById('note-id').value);
      formData.append('recordDate', document.getElementById('note-record-date').value);
      formData.append('weekNumber', document.getElementById('note-week-number').value);
      formData.append('content', document.getElementById('note-content').value);

      const fileInput = document.getElementById('note-photos');
      if (fileInput && fileInput.files) {
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append('photos', fileInput.files[i]);
        }
      }

      try {
        const res = await fetch(`/api/students/${currentStudentId}/notes`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
          body: formData
        });

        const data = await res.json();
        if (data.success) {
          hideNoteForm();
          await fetchNotes();
        } else {
          alert('儲存失敗：' + data.error);
        }
      } catch (err) {
        alert('發送請求失敗：' + err.message);
      }
    });
  }
});