// =====================================================================
// APP.JS - Module Quản lý phòng họp (Frontend)
// Gọi REST API của app.py (Flask) để thao tác dữ liệu
// (biến API dùng chung được khai báo trong common.js, nạp trước file này)
// =====================================================================
const ADMIN_STATUS_LABEL = { DANG_HOAT_DONG: 'Đang hoạt động', BAO_TRI: 'Bảo trì', NGUNG_HOAT_DONG: 'Ngừng hoạt động' };
const ADMIN_STATUS_CLASS = { DANG_HOAT_DONG: 'status-dang_hoat_dong', BAO_TRI: 'status-bao_tri', NGUNG_HOAT_DONG: 'status-ngung_hoat_dong' };
const OCC_LABEL = { TRONG: 'Đang trống', DANG_HOP: 'Đang họp' };
const OCC_CLASS = { TRONG: 'status-trong', DANG_HOP: 'status-dang_hop' };

let state = {
  roomPage: 1, roomSearch: '',
  usagePage: 1, usageRoomId: 'all',
  bookingPage: 1, bookingRoomId: 'all', bookingFrom: '', bookingTo: '',
  availDate: new Date().toISOString().slice(0, 10),
  editingRoomId: null,
  modalMode: null // 'add' | 'edit' | 'delete'
};

// (Điều hướng giữa các view/module nay dùng chung trong common.js)

// =====================================================================
// 1) DANH SÁCH / TÌM KIẾM / PHÂN TRANG PHÒNG HỌP
// =====================================================================
async function loadRooms() {
  const params = new URLSearchParams({ search: state.roomSearch, page: state.roomPage });
  const res = await fetch(`${API}/rooms?${params}`);
  const json = await res.json();
  renderRoomTable(json.data);
  renderPagination('roomPagination', json.pagination, p => { state.roomPage = p; loadRooms(); });
}

function canManageRooms() {
  return currentUser && (currentUser.role === 'QUAN_LY_PHONG' || currentUser.role === 'ADMIN');
}

function renderRoomTable(rooms) {
  const tbody = document.getElementById('roomTableBody');
  tbody.innerHTML = '';
  const canManage = canManageRooms();
  document.getElementById('btnOpenAdd').style.display = canManage ? 'inline-block' : 'none';

  rooms.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(state.roomPage - 1) * 8 + idx + 1}</td>
      <td>${escapeHtml(r.room_code)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.capacity} chỗ</td>
      <td>${escapeHtml(r.equipment || '')}</td>
      <td><span class="status-pill ${OCC_CLASS[r.occupancy_status]}">${OCC_LABEL[r.occupancy_status]}</span></td>
      <td class="row-actions">
        ${canManage ? `<button onclick="openEditModal(${r.id})">Chỉnh sửa</button>` : '<span style="color:#999">Chỉ xem</span>'}
      </td>`;
    tbody.appendChild(tr);
  });
  for (let i = rooms.length; i < 8; i++) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

function renderPagination(containerId, pagination, onClick) {
  const el = document.getElementById(containerId);
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
  for (let p = 1; p <= totalPages; p++) {
    el.appendChild(mkBtn(String(p), p, false, p === page));
  }
  el.appendChild(mkBtn('Trang cuối', totalPages, page === totalPages));
}

document.getElementById('searchInput').addEventListener('input', debounce(e => {
  state.roomSearch = e.target.value;
  state.roomPage = 1;
  loadRooms();
}, 350));

// =====================================================================
// MODAL: THÊM / SỬA / XÓA PHÒNG HỌP
// (theo đúng thứ tự mockup 8-11: Mã phòng -> Tên phòng -> Số chỗ ngồi
//  -> Thiết bị (multi-select) -> Trạng thái phòng)
// =====================================================================
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const fRoomCode = document.getElementById('fRoomCode');
const fName = document.getElementById('fName');
const fCapacity = document.getElementById('fCapacity');
const fEquipment = document.getElementById('fEquipment');
const fStatus = document.getElementById('fStatus');
const formError = document.getElementById('formError');
const deleteConfirmBox = document.getElementById('deleteConfirmBox');
const btnSave = document.getElementById('btnSave');
const btnAskDelete = document.getElementById('btnAskDelete');

document.getElementById('btnOpenAdd').addEventListener('click', openAddModal);
document.getElementById('btnCancel').addEventListener('click', closeModal);

// --- 8. Nạp danh sách "Mã phòng họp" còn trống (PH001..PH00N) ---
async function populateRoomCodeSelect(selectedCode) {
  const res = await fetch(`${API}/rooms/codes/available`);
  const json = await res.json();
  const options = [...json.data];
  if (selectedCode && !options.includes(selectedCode)) options.unshift(selectedCode);
  fRoomCode.innerHTML = `<option value="">-- Chọn mã phòng --</option>` +
    options.map(c => `<option value="${c}">${c}</option>`).join('');
  if (selectedCode) fRoomCode.value = selectedCode;
}

// --- 9. Nạp gợi ý "Tên phòng họp" ---
async function populateRoomNameSelect(selectedName) {
  const res = await fetch(`${API}/rooms/names/suggestions`);
  const json = await res.json();
  const options = [...json.data];
  if (selectedName && !options.includes(selectedName)) options.unshift(selectedName);
  fName.innerHTML = `<option value="">-- Chọn tên phòng --</option>` +
    options.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (selectedName) fName.value = selectedName;
}

// --- 10. Nạp danh mục "Thiết bị" (multi-select) ---
async function populateEquipmentSelect(selectedIds = []) {
  const res = await fetch(`${API}/equipment/options`);
  const json = await res.json();
  fEquipment.innerHTML = json.data.map(e =>
    `<option value="${e.id}" ${selectedIds.includes(e.id) ? 'selected' : ''}>${escapeHtml(e.name)}</option>`
  ).join('');
}

function getSelectedEquipmentIds() {
  return Array.from(fEquipment.selectedOptions).map(o => parseInt(o.value));
}

async function openAddModal() {
  state.modalMode = 'add';
  state.editingRoomId = null;
  modalTitle.textContent = 'Tạo phòng họp';

  await populateRoomCodeSelect();
  await populateRoomNameSelect();
  await populateEquipmentSelect([]);

  fRoomCode.disabled = false;
  fCapacity.value = '';
  fStatus.value = 'DANG_HOAT_DONG';
  formError.textContent = '';
  deleteConfirmBox.style.display = 'none';
  btnSave.style.display = 'inline-block';
  btnAskDelete.style.display = 'none';
  modalOverlay.style.display = 'flex';
}

window.openEditModal = async function (roomId) {
  state.modalMode = 'edit';
  state.editingRoomId = roomId;
  modalTitle.textContent = 'Chỉnh sửa thông tin phòng họp';

  const [roomRes, equipRes] = await Promise.all([
    fetch(`${API}/rooms/${roomId}`).then(r => r.json()),
    fetch(`${API}/rooms/${roomId}/equipment`).then(r => r.json())
  ]);
  if (!roomRes.success) { alert(roomRes.message || 'Không tìm thấy phòng.'); return; }
  const room = roomRes.data;
  const selectedEquipIds = equipRes.data || [];

  await populateRoomCodeSelect(room.room_code);
  await populateRoomNameSelect(room.name);
  await populateEquipmentSelect(selectedEquipIds);

  fRoomCode.disabled = true; // không đổi mã phòng khi sửa
  fCapacity.value = room.capacity;
  fStatus.value = room.admin_status;

  formError.textContent = '';
  deleteConfirmBox.style.display = 'none';
  btnSave.style.display = 'inline-block';
  btnAskDelete.style.display = 'inline-block';
  modalOverlay.style.display = 'flex';
};

btnSave.addEventListener('click', async () => {
  formError.textContent = '';
  const capacity = parseInt(fCapacity.value);
  const equipmentIds = getSelectedEquipmentIds();

  if (!fRoomCode.value || !fName.value || !capacity) {
    formError.textContent = 'Vui lòng chọn/nhập đầy đủ thông tin bắt buộc (*).';
    return;
  }
  if (!equipmentIds.length) {
    formError.textContent = 'Vui lòng chọn ít nhất một thiết bị.';
    return;
  }

  try {
    let res;
    if (state.modalMode === 'add') {
      res = await fetch(`${API}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: fRoomCode.value,
          name: fName.value,
          capacity, equipment_ids: equipmentIds,
          admin_status: fStatus.value
        })
      });
    } else {
      res = await fetch(`${API}/rooms/${state.editingRoomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fName.value, capacity,
          equipment_ids: equipmentIds, admin_status: fStatus.value
        })
      });
    }
    const json = await res.json();
    if (!json.success) { formError.textContent = json.message; return; }
    closeModal();
    loadRooms();
  } catch (err) {
    formError.textContent = 'Lỗi kết nối máy chủ.';
  }
});

btnAskDelete.addEventListener('click', () => { deleteConfirmBox.style.display = 'block'; });
document.getElementById('btnCancelDelete').addEventListener('click', () => { deleteConfirmBox.style.display = 'none'; });
document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  const res = await fetch(`${API}/rooms/${state.editingRoomId}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) { formError.textContent = json.message; deleteConfirmBox.style.display = 'none'; return; }
  closeModal();
  loadRooms();
});

function closeModal() { modalOverlay.style.display = 'none'; }

// =====================================================================
// 5) LỊCH SỬ SỬ DỤNG PHÒNG
// =====================================================================
async function loadUsageHistory() {
  await populateRoomFilter('usageRoomFilter');
  const params = new URLSearchParams({ room_id: state.usageRoomId, page: state.usagePage });
  const res = await fetch(`${API}/rooms/usage-history?${params}`);
  const json = await res.json();
  renderHistoryTable('usageTableBody', json.data, state.usagePage);
  renderPagination('usagePagination', json.pagination, p => { state.usagePage = p; loadUsageHistory(); });
}
document.getElementById('usageRoomFilter').addEventListener('change', e => {
  state.usageRoomId = e.target.value; state.usagePage = 1; loadUsageHistory();
});

// =====================================================================
// 6) LỊCH SỬ ĐẶT PHÒNG SẮP TỚI
// =====================================================================
async function loadBookingHistory() {
  await populateRoomFilter('bookingRoomFilter');
  const params = new URLSearchParams({
    room_id: state.bookingRoomId, page: state.bookingPage,
    from: state.bookingFrom, to: state.bookingTo
  });
  const res = await fetch(`${API}/rooms/booking-history?${params}`);
  const json = await res.json();
  renderHistoryTable('bookingTableBody', json.data, state.bookingPage);
  renderPagination('bookingPagination', json.pagination, p => { state.bookingPage = p; loadBookingHistory(); });
}
document.getElementById('bookingRoomFilter').addEventListener('change', e => {
  state.bookingRoomId = e.target.value; state.bookingPage = 1; loadBookingHistory();
});
document.getElementById('bookingFrom').addEventListener('change', e => {
  state.bookingFrom = e.target.value; state.bookingPage = 1; loadBookingHistory();
});
document.getElementById('bookingTo').addEventListener('change', e => {
  state.bookingTo = e.target.value; state.bookingPage = 1; loadBookingHistory();
});

function renderHistoryTable(tbodyId, rows, page) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(page - 1) * 8 + idx + 1}</td>
      <td>${escapeHtml(r.room_name)}</td>
      <td>${r.ngay}</td>
      <td>${r.gio}</td>
      <td>${escapeHtml(r.title)}</td>
      <td>${r.nguoi_tao || ''}</td>`;
    tbody.appendChild(tr);
  });
  for (let i = rows.length; i < 8; i++) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

async function populateRoomFilter(selectId) {
  const sel = document.getElementById(selectId);
  if (sel.dataset.loaded) return;
  const res = await fetch(`${API}/rooms/options`);
  const json = await res.json();
  sel.innerHTML = `<option value="all">Tất cả</option>` +
    json.data.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  sel.dataset.loaded = '1';
}

// =====================================================================
// 7) THỜI GIAN TRỐNG CỦA CÁC PHÒNG (Timeline 08:00 - 18:00)
// =====================================================================
const DAY_START_HOUR = 8, DAY_END_HOUR = 18;

document.getElementById('availDate').value = state.availDate;
document.getElementById('availDate').addEventListener('change', e => {
  state.availDate = e.target.value; loadAvailability();
});
document.getElementById('btnPrevDay').addEventListener('click', () => shiftDay(-1));
document.getElementById('btnNextDay').addEventListener('click', () => shiftDay(1));

function shiftDay(delta) {
  const d = new Date(state.availDate);
  d.setDate(d.getDate() + delta);
  state.availDate = d.toISOString().slice(0, 10);
  document.getElementById('availDate').value = state.availDate;
  loadAvailability();
}

async function loadAvailability() {
  buildTimelineHeader();
  const res = await fetch(`${API}/rooms/availability?date=${state.availDate}`);
  const json = await res.json();
  renderTimelineBody(json.data);
}

function buildTimelineHeader() {
  const row = document.getElementById('timelineHeaderRow');
  row.innerHTML = '<th style="width:140px">Tên Phòng</th>';
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
    const th = document.createElement('th');
    th.textContent = String(h).padStart(2, '0') + ':00';
    row.appendChild(th);
  }
}

function renderTimelineBody(rooms) {
  const tbody = document.getElementById('timelineBody');
  tbody.innerHTML = '';
  const dayStart = new Date(state.availDate + 'T00:00:00').getTime() / 1000 + DAY_START_HOUR * 3600;
  const dayEnd = new Date(state.availDate + 'T00:00:00').getTime() / 1000 + DAY_END_HOUR * 3600;
  const totalSpan = dayEnd - dayStart;

  rooms.forEach(room => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = room.room_name;
    tr.appendChild(nameTd);

    const cellTd = document.createElement('td');
    cellTd.colSpan = DAY_END_HOUR - DAY_START_HOUR + 1;
    cellTd.className = 'timeline-cell';
    const track = document.createElement('div');
    track.className = 'timeline-track';

    if (!room.bookings.length) {
      const block = document.createElement('div');
      block.className = 'slot-block slot-free';
      block.style.left = '0%'; block.style.width = '100%';
      block.textContent = 'Trống cả ngày';
      track.appendChild(block);
    } else {
      room.bookings.forEach(b => {
        const left = Math.max(0, (b.start_ts - dayStart) / totalSpan) * 100;
        const width = Math.min(100 - left, ((b.end_ts - b.start_ts) / totalSpan) * 100);
        const block = document.createElement('div');
        block.className = 'slot-block slot-busy';
        block.style.left = left + '%';
        block.style.width = Math.max(width, 4) + '%';
        block.textContent = b.label;
        track.appendChild(block);
      });
    }
    cellTd.appendChild(track);
    tr.appendChild(cellTd);
    tbody.appendChild(tr);
  });

  for (let i = rooms.length; i < 2; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td colspan="${DAY_END_HOUR - DAY_START_HOUR + 1}"></td>`;
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Hàm này được common.js gọi khi người dùng chuyển vào tab "Quản lý phòng họp"
window.initRoomsModule = function () {
  loadRooms();
};
