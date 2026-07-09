// =====================================================================
// EMPLOYEE.JS - Module NHÂN VIÊN (WBS 2.5.1)
// =====================================================================
const RESPONSE_LABEL = { CHO_PHAN_HOI: 'Chờ phản hồi', XAC_NHAN: 'Đã xác nhận', TU_CHOI: 'Đã từ chối' };
const RESPONSE_CLASS = { CHO_PHAN_HOI: 'status-bao_tri', XAC_NHAN: 'status-trong', TU_CHOI: 'status-dang_hop' };
const MEETING_STATUS_LABEL = { DA_XAC_NHAN: 'Đã lên lịch', DA_HUY: 'Đã hủy', HOAN_THANH: 'Đã diễn ra' };

let empState = {
  calendarLoaded: false,
  createdPage: 1,
  invitationsPage: 1,
  editingMeetingId: null,
};

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =====================================================================
// 1) LỊCH HỌP CÁ NHÂN (Ngày/Tuần/Tháng) + LỌC
// =====================================================================
window.initEmpCalendar = async function () {
  if (!empState.calendarLoaded) {
    document.getElementById('empDate').value = new Date().toISOString().slice(0, 10);
    await populateEmpFilters();
    document.getElementById('empView').addEventListener('change', loadEmpCalendar);
    document.getElementById('empDate').addEventListener('change', loadEmpCalendar);
    document.getElementById('empOrganizerFilter').addEventListener('change', loadEmpCalendar);
    document.getElementById('empRoomFilter').addEventListener('change', loadEmpCalendar);
    empState.calendarLoaded = true;
  }
  loadEmpCalendar();
};

async function populateEmpFilters() {
  const [usersRes, roomsRes] = await Promise.all([
    fetch(`${API}/meetings/users`).then(r => r.json()),
    fetch(`${API}/rooms/options`).then(r => r.json()),
  ]);
  document.getElementById('empOrganizerFilter').innerHTML =
    `<option value="">-- Tất cả người tổ chức --</option>` +
    usersRes.data.map(u => `<option value="${u.id}">${escapeHtmlCommon(u.full_name)}</option>`).join('');
  document.getElementById('empRoomFilter').innerHTML =
    `<option value="">-- Tất cả phòng --</option>` +
    roomsRes.data.map(r => `<option value="${r.id}">${escapeHtmlCommon(r.name)}</option>`).join('');
}

async function loadEmpCalendar() {
  const view = document.getElementById('empView').value;
  const date = document.getElementById('empDate').value;
  const organizer_id = document.getElementById('empOrganizerFilter').value;
  const room_id = document.getElementById('empRoomFilter').value;

  const params = new URLSearchParams({ view, date });
  if (organizer_id) params.set('organizer_id', organizer_id);
  if (room_id) params.set('room_id', room_id);

  const res = await fetch(`${API}/meetings?${params}`);
  const json = await res.json();
  const tbody = document.getElementById('empCalendarBody');
  tbody.innerHTML = '';

  if (json.range) {
    document.getElementById('empRangeLabel').textContent = `Khoảng thời gian: ${json.range.start} → ${json.range.end}`;
  }

  (json.data || []).forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtmlCommon(m.title)}</td>
      <td>${escapeHtmlCommon(m.room_name)}</td>
      <td>${fmtDateTime(m.start_time)} - ${fmtDateTime(m.end_time).split(' ').pop()}</td>
      <td>${escapeHtmlCommon(m.organizer_name)}${m.is_owner ? ' <em>(bạn)</em>' : ''}</td>
      <td>${m.my_response ? `<span class="status-pill ${RESPONSE_CLASS[m.my_response]}">${RESPONSE_LABEL[m.my_response]}</span>` : '—'}</td>`;
    tbody.appendChild(tr);
  });
  if (!json.data || !json.data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center;color:#999">Không có cuộc họp nào trong khoảng thời gian này</td></tr>`;
  }
}

// =====================================================================
// 2) TẠO CUỘC HỌP MỚI (dùng chung cho cả Sửa cuộc họp)
// =====================================================================
window.initEmpCreate = async function () {
  resetEmpCreateForm();
  await Promise.all([populateEmpRoomSelect(), populateEmpParticipantSelect()]);
};

async function populateEmpRoomSelect(selectedId) {
  const res = await fetch(`${API}/rooms/options`);
  const json = await res.json();
  const sel = document.getElementById('empRoomSelect');
  sel.innerHTML = `<option value="">-- Chọn phòng họp --</option>` +
    json.data.map(r => `<option value="${r.id}">${escapeHtmlCommon(r.name)} (${r.capacity} chỗ)</option>`).join('');
  if (selectedId) sel.value = selectedId;
}

async function populateEmpParticipantSelect(selectedIds = []) {
  const res = await fetch(`${API}/meetings/users`);
  const json = await res.json();
  const sel = document.getElementById('empParticipants');
  sel.innerHTML = json.data
    .filter(u => u.id !== currentUser.id)
    .map(u => `<option value="${u.id}" ${selectedIds.includes(u.id) ? 'selected' : ''}>${escapeHtmlCommon(u.full_name)} (${u.code})</option>`)
    .join('');
}

function resetEmpCreateForm() {
  empState.editingMeetingId = null;
  document.getElementById('empCreateHeader').textContent = 'Tạo cuộc họp mới';
  document.getElementById('empTitle').value = '';
  document.getElementById('empStart').value = '';
  document.getElementById('empEnd').value = '';
  document.getElementById('empCreateError').textContent = '';
  document.getElementById('btnEmpSave').textContent = 'Tạo cuộc họp';
  document.getElementById('btnEmpCancelEdit').style.display = 'none';
}

document.getElementById('btnEmpCancelEdit').addEventListener('click', () => {
  resetEmpCreateForm();
  populateEmpRoomSelect();
  populateEmpParticipantSelect();
});

document.getElementById('btnEmpSave').addEventListener('click', async () => {
  const errorEl = document.getElementById('empCreateError');
  errorEl.innerHTML = '';

  const title = document.getElementById('empTitle').value.trim();
  const room_id = document.getElementById('empRoomSelect').value;
  const start_time = document.getElementById('empStart').value;
  const end_time = document.getElementById('empEnd').value;
  const participant_ids = Array.from(document.getElementById('empParticipants').selectedOptions).map(o => parseInt(o.value));

  if (!title || !room_id || !start_time || !end_time) {
    errorEl.textContent = 'Vui lòng nhập đầy đủ Tiêu đề, Phòng họp và Thời gian.';
    return;
  }

  const payload = { title, room_id: parseInt(room_id), start_time, end_time, participant_ids };
  const isEdit = !!empState.editingMeetingId;
  const url = isEdit ? `${API}/meetings/${empState.editingMeetingId}` : `${API}/meetings`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const json = await res.json();
    if (!json.success) {
      let msg = json.message || 'Có lỗi xảy ra.';
      if (json.room_conflict) msg += ' Phòng đã có lịch trong khung giờ này.';
      if (json.busy_users && json.busy_users.length) {
        msg += ' Người đang bận: ' + json.busy_users.map(u => u.full_name).join(', ') + '.';
      }
      errorEl.textContent = msg;
      return;
    }
    alert(isEdit ? 'Đã cập nhật cuộc họp.' : 'Đã tạo cuộc họp thành công. Lời mời đã được gửi tới người tham gia.');
    resetEmpCreateForm();
    populateEmpRoomSelect();
    populateEmpParticipantSelect();
    switchView('emp-created');
  } catch (err) {
    errorEl.textContent = 'Lỗi kết nối máy chủ.';
  }
});

// =====================================================================
// 3) QUẢN LÝ CUỘC HỌP ĐÃ TẠO
// =====================================================================
window.initEmpCreated = function () { loadEmpCreated(); };

async function loadEmpCreated() {
  const res = await fetch(`${API}/meetings/created?page=${empState.createdPage}`);
  const json = await res.json();
  const tbody = document.getElementById('empCreatedBody');
  tbody.innerHTML = '';
  (json.data || []).forEach((m, idx) => {
    const tr = document.createElement('tr');
    const canEdit = m.status === 'DA_XAC_NHAN';
    tr.innerHTML = `
      <td>${(empState.createdPage - 1) * 8 + idx + 1}</td>
      <td>${escapeHtmlCommon(m.title)}</td>
      <td>${escapeHtmlCommon(m.room_name)}</td>
      <td>${fmtDateTime(m.start_time)}</td>
      <td>${m.so_nguoi_moi}</td>
      <td><span class="status-pill ${m.status === 'DA_HUY' ? 'status-dang_hop' : (m.status === 'HOAN_THANH' ? 'status-ngung_hoat_dong' : 'status-trong')}">${MEETING_STATUS_LABEL[m.status]}</span></td>
      <td class="row-actions">
        ${canEdit ? `<button onclick="editEmpMeeting(${m.id})">Sửa</button> <button onclick="cancelEmpMeeting(${m.id})">Hủy</button>` : '—'}
      </td>`;
    tbody.appendChild(tr);
  });
  for (let i = (json.data || []).length; i < 8; i++) {
    const tr = document.createElement('tr'); tr.className = 'empty-row';
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
  renderEmpPagination('empCreatedPagination', json.pagination, p => { empState.createdPage = p; loadEmpCreated(); });
}

window.editEmpMeeting = async function (meetingId) {
  const res = await fetch(`${API}/meetings/${meetingId}`);
  const json = await res.json();
  if (!json.success) { alert(json.message); return; }
  const m = json.data;

  switchView('emp-create');
  empState.editingMeetingId = meetingId;
  document.getElementById('empCreateHeader').textContent = 'Chỉnh sửa cuộc họp';
  document.getElementById('empTitle').value = m.title;
  document.getElementById('empStart').value = toDatetimeLocalValue(m.start_time);
  document.getElementById('empEnd').value = toDatetimeLocalValue(m.end_time);
  document.getElementById('btnEmpSave').textContent = 'Lưu thay đổi';
  document.getElementById('btnEmpCancelEdit').style.display = 'inline-block';

  await populateEmpRoomSelect(m.room_id);
  await populateEmpParticipantSelect(m.participants.map(p => p.id));
};

window.cancelEmpMeeting = async function (meetingId) {
  if (!confirm('Bạn có chắc chắn muốn hủy cuộc họp này? Người tham gia sẽ nhận được thông báo.')) return;
  const res = await fetch(`${API}/meetings/${meetingId}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) { alert(json.message); return; }
  loadEmpCreated();
};

function renderEmpPagination(containerId, pagination, onClick) {
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

// =====================================================================
// 4) PHẢN HỒI LỜI MỜI
// =====================================================================
window.initEmpInvitations = function () { loadEmpInvitations(); };

async function loadEmpInvitations() {
  const res = await fetch(`${API}/meetings/invitations?page=${empState.invitationsPage}`);
  const json = await res.json();
  const tbody = document.getElementById('empInvitationsBody');
  tbody.innerHTML = '';
  (json.data || []).forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(empState.invitationsPage - 1) * 8 + idx + 1}</td>
      <td>${escapeHtmlCommon(m.title)}</td>
      <td>${escapeHtmlCommon(m.room_name)}</td>
      <td>${fmtDateTime(m.start_time)}</td>
      <td>${escapeHtmlCommon(m.organizer_name)}</td>
      <td><span class="status-pill ${RESPONSE_CLASS[m.response]}">${RESPONSE_LABEL[m.response]}</span></td>
      <td class="row-actions">
        ${m.response === 'CHO_PHAN_HOI'
          ? `<button onclick="respondInvitation(${m.id}, 'XAC_NHAN')">Xác nhận</button> <button onclick="respondInvitation(${m.id}, 'TU_CHOI')">Từ chối</button>`
          : '—'}
      </td>`;
    tbody.appendChild(tr);
  });
  for (let i = (json.data || []).length; i < 8; i++) {
    const tr = document.createElement('tr'); tr.className = 'empty-row';
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
  renderEmpPagination('empInvitationsPagination', json.pagination, p => { empState.invitationsPage = p; loadEmpInvitations(); });
}

window.respondInvitation = async function (meetingId, response) {
  const res = await fetch(`${API}/meetings/${meetingId}/respond`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response }),
  });
  const json = await res.json();
  if (!json.success) { alert(json.message); return; }
  loadEmpInvitations();
};

// =====================================================================
// 5) HỒ SƠ CÁ NHÂN / ĐỔI MẬT KHẨU
// =====================================================================
window.initEmpProfile = function () {
  document.getElementById('profileFullName').value = currentUser.full_name;
  document.getElementById('profileEmail').value = currentUser.email || '';
  document.getElementById('profileError').textContent = '';
  document.getElementById('passwordError').textContent = '';
  document.getElementById('oldPassword').value = '';
  document.getElementById('newPassword').value = '';
};

document.getElementById('btnSaveProfile').addEventListener('click', async () => {
  const full_name = document.getElementById('profileFullName').value.trim();
  const email = document.getElementById('profileEmail').value.trim();
  const errorEl = document.getElementById('profileError');
  errorEl.textContent = '';
  const res = await fetch(`${API}/auth/profile`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name, email }),
  });
  const json = await res.json();
  if (!json.success) { errorEl.textContent = json.message; return; }
  currentUser.full_name = full_name; currentUser.email = email;
  renderUserArea();
  errorEl.style.color = '#2e7d32';
  errorEl.textContent = 'Cập nhật hồ sơ thành công.';
});

document.getElementById('btnChangePassword').addEventListener('click', async () => {
  const old_password = document.getElementById('oldPassword').value;
  const new_password = document.getElementById('newPassword').value;
  const errorEl = document.getElementById('passwordError');
  errorEl.style.color = '#c62828';
  errorEl.textContent = '';
  const res = await fetch(`${API}/auth/change-password`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_password, new_password }),
  });
  const json = await res.json();
  if (!json.success) { errorEl.textContent = json.message; return; }
  document.getElementById('oldPassword').value = '';
  document.getElementById('newPassword').value = '';
  errorEl.style.color = '#2e7d32';
  errorEl.textContent = 'Đổi mật khẩu thành công.';
});
