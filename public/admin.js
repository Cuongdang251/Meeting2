// =====================================================================
// ADMIN.JS - Module ADMIN (WBS 2.5.3)
// =====================================================================
const ROLE_OPTIONS = [
  { value: 'NHAN_VIEN', label: 'Nhân viên' },
  { value: 'QUAN_LY_PHONG', label: 'Quản lý phòng họp' },
  { value: 'ADMIN', label: 'Admin' },
];

let adminState = { usersPage: 1, usersSearch: '', dashboardYear: new Date().getFullYear() };

// =====================================================================
// 1) QUẢN LÝ TÀI KHOẢN
// =====================================================================
window.initAdminUsers = function () {
  if (!document.getElementById('adminUserSearch').dataset.bound) {
    document.getElementById('adminUserSearch').addEventListener('input', debounceAdmin(e => {
      adminState.usersSearch = e.target.value; adminState.usersPage = 1; loadAdminUsers();
    }, 350));
    document.getElementById('adminUserSearch').dataset.bound = '1';
    document.getElementById('btnOpenCreateUser').addEventListener('click', openCreateUserModal);
  }
  loadAdminUsers();
};

async function loadAdminUsers() {
  const params = new URLSearchParams({ search: adminState.usersSearch, page: adminState.usersPage });
  const res = await fetch(`${API}/admin/users?${params}`);
  const json = await res.json();
  const tbody = document.getElementById('adminUsersBody');
  tbody.innerHTML = '';

  (json.data || []).forEach((u, idx) => {
    const tr = document.createElement('tr');
    const roleOptionsHtml = ROLE_OPTIONS.map(r => `<option value="${r.value}" ${r.value === u.role ? 'selected' : ''}>${r.label}</option>`).join('');
    tr.innerHTML = `
      <td>${(adminState.usersPage - 1) * 8 + idx + 1}</td>
      <td>${escapeHtmlCommon(u.code)}</td>
      <td>${escapeHtmlCommon(u.full_name)}</td>
      <td>${escapeHtmlCommon(u.email || '')}</td>
      <td><select class="select-box" onchange="changeUserRole(${u.id}, this.value)">${roleOptionsHtml}</select></td>
      <td><span class="status-pill ${u.is_locked ? 'status-dang_hop' : 'status-trong'}">${u.is_locked ? 'Đã khóa' : 'Đang hoạt động'}</span></td>
      <td class="row-actions">
        <button onclick="toggleLockUser(${u.id}, ${u.is_locked ? 'false' : 'true'})">${u.is_locked ? 'Mở khóa' : 'Khóa'}</button>
      </td>`;
    tbody.appendChild(tr);
  });
  for (let i = (json.data || []).length; i < 8; i++) {
    const tr = document.createElement('tr'); tr.className = 'empty-row';
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
  renderAdminPagination('adminUsersPagination', json.pagination, p => { adminState.usersPage = p; loadAdminUsers(); });
}

function renderAdminPagination(containerId, pagination, onClick) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const { page, totalPages } = pagination;
  const mkBtn = (label, target, disabled = false, active = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (active) b.classList.add('active');
    b.disabled = disabled;
    b.onclick = () => onClick(target);
    return b;
  };
  el.appendChild(mkBtn('Trang đầu', 1, page === 1));
  for (let p = 1; p <= totalPages; p++) el.appendChild(mkBtn(String(p), p, false, p === page));
  el.appendChild(mkBtn('Trang cuối', totalPages, page === totalPages));
}

window.toggleLockUser = async function (userId, locked) {
  const res = await fetch(`${API}/admin/users/${userId}/lock`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locked }),
  });
  const json = await res.json();
  if (!json.success) { alert(json.message); return; }
  loadAdminUsers();
};

window.changeUserRole = async function (userId, role) {
  const res = await fetch(`${API}/admin/users/${userId}/role`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
  });
  const json = await res.json();
  if (!json.success) { alert(json.message); loadAdminUsers(); return; }
};

// --- Modal tạo tài khoản ---
function openCreateUserModal() {
  document.getElementById('newUserCode').value = '';
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserPassword').value = '';
  document.getElementById('newUserRole').value = 'NHAN_VIEN';
  document.getElementById('createUserError').textContent = '';
  document.getElementById('createUserModal').style.display = 'flex';
}
document.getElementById('btnCancelCreateUser').addEventListener('click', () => {
  document.getElementById('createUserModal').style.display = 'none';
});
document.getElementById('btnSaveCreateUser').addEventListener('click', async () => {
  const body = {
    code: document.getElementById('newUserCode').value.trim(),
    full_name: document.getElementById('newUserName').value.trim(),
    email: document.getElementById('newUserEmail').value.trim(),
    password: document.getElementById('newUserPassword').value,
    role: document.getElementById('newUserRole').value,
  };
  const errorEl = document.getElementById('createUserError');
  const res = await fetch(`${API}/admin/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) { errorEl.textContent = json.message; return; }
  document.getElementById('createUserModal').style.display = 'none';
  loadAdminUsers();
});

// =====================================================================
// 2) DASHBOARD & THỐNG KÊ
// =====================================================================
window.initAdminDashboard = function () {
  if (!document.getElementById('dashboardYear').dataset.bound) {
    document.getElementById('dashboardYear').value = adminState.dashboardYear;
    document.getElementById('dashboardYear').addEventListener('change', e => {
      adminState.dashboardYear = e.target.value; loadDashboard();
    });
    document.getElementById('dashboardYear').dataset.bound = '1';
  }
  loadDashboard();
};

async function loadDashboard() {
  const [monthRes, roomUsageRes, topRoomRes, topOrgRes] = await Promise.all([
    fetch(`${API}/admin/dashboard/meetings-by-month?year=${adminState.dashboardYear}`).then(r => r.json()),
    fetch(`${API}/admin/dashboard/room-usage`).then(r => r.json()),
    fetch(`${API}/admin/dashboard/top-room`).then(r => r.json()),
    fetch(`${API}/admin/dashboard/top-organizer`).then(r => r.json()),
  ]);

  const topRoom = topRoomRes.data;
  const topOrg = topOrgRes.data;
  document.getElementById('cardTopRoom').textContent = topRoom ? `${topRoom.name} (${topRoom.so_cuoc_hop} cuộc họp)` : 'Chưa có dữ liệu';
  document.getElementById('cardTopOrganizer').textContent = topOrg ? `${topOrg.full_name} (${topOrg.so_cuoc_hop} cuộc họp)` : 'Chưa có dữ liệu';

  const maxCount = Math.max(1, ...monthRes.data.map(d => d.so_luong));
  const chartEl = document.getElementById('monthChart');
  chartEl.innerHTML = monthRes.data.map(d => `
    <div class="bar-row">
      <span class="bar-label">Tháng ${d.thang}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.so_luong / maxCount) * 100}%">${d.so_luong || ''}</div></div>
    </div>`).join('');

  const usageBody = document.getElementById('roomUsageBody');
  usageBody.innerHTML = (roomUsageRes.data || []).map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtmlCommon(r.name)}</td>
      <td>${r.so_cuoc_hop}</td>
      <td>${r.tong_gio} giờ</td>
    </tr>`).join('') || `<tr class="empty-row"><td colspan="4" style="text-align:center;color:#999">Chưa có dữ liệu</td></tr>`;
}

// ---------------------------------------------------------------
function debounceAdmin(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
