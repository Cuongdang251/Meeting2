// =====================================================================
// COMMON.JS - Xác thực phiên đăng nhập + điều hướng giữa 3 module
// (Nhân viên / Quản lý phòng họp / Admin)
// =====================================================================
const API = window.API || '/api';
let currentUser = null;

const ROLE_LABEL = { NHAN_VIEN: 'Nhân viên', QUAN_LY_PHONG: 'Quản lý phòng họp', ADMIN: 'Admin' };

// Mỗi module có 1 view mặc định + hàm khởi tạo tương ứng cho từng sub-tab
const MODULE_DEFAULT_VIEW = { employee: 'emp-calendar', rooms: 'room-list', admin: 'admin-users' };
const VIEW_INIT = {
  'emp-calendar': () => window.initEmpCalendar && window.initEmpCalendar(),
  'emp-create': () => window.initEmpCreate && window.initEmpCreate(),
  'emp-created': () => window.initEmpCreated && window.initEmpCreated(),
  'emp-invitations': () => window.initEmpInvitations && window.initEmpInvitations(),
  'emp-profile': () => window.initEmpProfile && window.initEmpProfile(),
  'room-list': () => window.initRoomsModule && window.initRoomsModule(),
  'usage-history': () => window.loadUsageHistory && window.loadUsageHistory(),
  'booking-history': () => window.loadBookingHistory && window.loadBookingHistory(),
  'availability': () => window.loadAvailability && window.loadAvailability(),
  'admin-users': () => window.initAdminUsers && window.initAdminUsers(),
  'admin-dashboard': () => window.initAdminDashboard && window.initAdminDashboard(),
};

function switchModule(moduleName) {
  document.querySelectorAll('.module-section').forEach(el => el.style.display = 'none');
  const target = document.getElementById('module-' + moduleName);
  if (!target) return;
  target.style.display = 'block';

  document.querySelectorAll('.main-tab').forEach(el => el.classList.toggle('active', el.dataset.module === moduleName));

  switchView(MODULE_DEFAULT_VIEW[moduleName]);
  localStorage.setItem('lastModule', moduleName);
}

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
  const target = document.getElementById('view-' + viewName);
  if (target) target.style.display = 'block';
  if (VIEW_INIT[viewName]) VIEW_INIT[viewName]();
}

document.addEventListener('click', e => {
  const mainTab = e.target.closest('.main-tab');
  if (mainTab) {
    e.preventDefault();
    if (!currentUser) { switchToLogin(); return; }
    if (mainTab.dataset.module === 'admin' && currentUser.role !== 'ADMIN') {
      alert('Chỉ tài khoản Admin mới có quyền truy cập module này.');
      return;
    }
    switchModule(mainTab.dataset.module);
    return;
  }
  const subTab = e.target.closest('.sub-tab');
  if (subTab) {
    e.preventDefault();
    switchView(subTab.dataset.view);
  }
});

// ---------------------------------------------------------------
// PHIÊN ĐĂNG NHẬP
// ---------------------------------------------------------------
function switchToLogin() {
  document.querySelectorAll('.module-section').forEach(el => el.style.display = 'none');
  document.getElementById('view-login').style.display = 'block';
}

function renderUserArea() {
  const el = document.getElementById('userArea');
  if (currentUser) {
    el.innerHTML = `
      <span class="user-info">${escapeHtmlCommon(currentUser.full_name)} <span class="role-badge">${ROLE_LABEL[currentUser.role] || currentUser.role}</span></span>
      <button class="btn btn-light" id="btnLogout">Đăng xuất</button>`;
    document.getElementById('btnLogout').addEventListener('click', doLogout);
  } else {
    el.innerHTML = `<button class="btn btn-primary" id="btnGotoLogin">Đăng nhập</button>`;
    document.getElementById('btnGotoLogin').addEventListener('click', switchToLogin);
  }
}

async function checkSession() {
  try {
    const res = await fetch(`${API}/auth/me`);
    const json = await res.json();
    if (json.success) {
      currentUser = json.data;
      renderUserArea();
      const last = localStorage.getItem('lastModule') || 'rooms';
      switchModule(last === 'admin' && currentUser.role !== 'ADMIN' ? 'rooms' : last);
    } else {
      currentUser = null;
      renderUserArea();
      switchToLogin();
    }
  } catch (err) {
    currentUser = null;
    renderUserArea();
    switchToLogin();
  }
}

document.getElementById('btnLogin').addEventListener('click', doLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const code = document.getElementById('loginCode').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  if (!code || !password) { errorEl.textContent = 'Vui lòng nhập Mã nhân viên và Mật khẩu.'; return; }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password }),
    });
    const json = await res.json();
    if (!json.success) { errorEl.textContent = json.message; return; }
    currentUser = json.data;
    document.getElementById('loginCode').value = '';
    document.getElementById('loginPassword').value = '';
    renderUserArea();
    switchModule(currentUser.role === 'QUAN_LY_PHONG' ? 'rooms' : (currentUser.role === 'ADMIN' ? 'admin' : 'employee'));
  } catch (err) {
    errorEl.textContent = 'Lỗi kết nối máy chủ.';
  }
}

async function doLogout() {
  await fetch(`${API}/auth/logout`, { method: 'POST' });
  currentUser = null;
  renderUserArea();
  switchToLogin();
}

// ---------------------------------------------------------------
// Helper dùng chung
// ---------------------------------------------------------------
function escapeHtmlCommon(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
window.escapeHtmlCommon = escapeHtmlCommon;
window.API = API;
window.switchView = switchView;

// ---------------------------------------------------------------
// HỘP THOẠI THÔNG BÁO THÀNH CÔNG / LỖI (dùng chung mọi module)
// ---------------------------------------------------------------
function showNotify(type, message, onOk) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay notify-overlay';
  overlay.innerHTML = `
    <div class="notify-box">
      <div class="notify-icon ${type === 'success' ? 'notify-icon-success' : 'notify-icon-error'}">
        ${type === 'success' ? '✓' : '!'}
      </div>
      <div class="notify-message">${escapeHtmlCommon(message)}</div>
      <button class="btn btn-primary notify-ok">OK</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    if (onOk) onOk();
  };
  overlay.querySelector('.notify-ok').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
window.showNotify = showNotify;

// ---------------------------------------------------------------
// Ô "Không tìm thấy dữ liệu" dùng chung cho các bảng có tìm kiếm
// ---------------------------------------------------------------
function emptyStateRow(colspan, message, onRefresh) {
  const btnId = 'emptyRefresh' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const btn = document.getElementById(btnId);
    if (btn && onRefresh) btn.addEventListener('click', onRefresh);
  }, 0);
  return `
    <tr class="empty-state-row"><td colspan="${colspan}">
      <div class="empty-state-box">
        <div class="empty-state-icon">📄🔍</div>
        <div class="empty-state-text">${escapeHtmlCommon(message)}</div>
        <button class="btn btn-primary" id="${btnId}">Làm mới</button>
      </div>
    </td></tr>`;
}
window.emptyStateRow = emptyStateRow;

checkSession();