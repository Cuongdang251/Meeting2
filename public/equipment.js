// =====================================================================
// EQUIPMENT.JS - Quản lý danh mục thiết bị (thuộc module Quản lý phòng họp)
// =====================================================================
const EQUIPMENT_STATUS_LABEL = { DANG_HOAT_DONG: 'Đang hoạt động', BAO_TRI: 'Bảo trì', NGUNG_HOAT_DONG: 'Ngừng hoạt động' };
const EQUIPMENT_STATUS_CLASS = { DANG_HOAT_DONG: 'status-dang_hoat_dong', BAO_TRI: 'status-bao_tri', NGUNG_HOAT_DONG: 'status-ngung_hoat_dong' };

let equipmentState = { page: 1, search: '', editingId: null };

window.initEquipmentList = function () {
  if (!document.getElementById('equipmentSearchInput').dataset.bound) {
    document.getElementById('equipmentSearchInput').addEventListener('input', debounceEquipment(e => {
      equipmentState.search = e.target.value; equipmentState.page = 1; loadEquipmentList();
    }, 350));
    document.getElementById('equipmentSearchInput').dataset.bound = '1';
    document.getElementById('btnOpenAddEquipment').addEventListener('click', openAddEquipmentModal);
  }
  loadEquipmentList();
};

async function loadEquipmentList() {
  const params = new URLSearchParams({ search: equipmentState.search, page: equipmentState.page });
  const res = await fetch(`${API}/equipment?${params}`);
  const json = await res.json();
  renderEquipmentTable(json.data || []);
  renderEquipmentPagination(json.pagination);
}

function renderEquipmentTable(rows) {
  const tbody = document.getElementById('equipmentTableBody');
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = emptyStateRow(5, 'Không tìm thấy thiết bị phù hợp', () => {
      document.getElementById('equipmentSearchInput').value = '';
      equipmentState.search = ''; equipmentState.page = 1;
      loadEquipmentList();
    });
    document.getElementById('equipmentPagination').innerHTML = '';
    return;
  }

  rows.forEach((e, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(equipmentState.page - 1) * 8 + idx + 1}</td>
      <td>${escapeHtmlCommon(e.equipment_code)}</td>
      <td>${escapeHtmlCommon(e.name)}</td>
      <td><span class="status-pill ${EQUIPMENT_STATUS_CLASS[e.status]}">${EQUIPMENT_STATUS_LABEL[e.status]}</span></td>
      <td class="row-actions"><button onclick="openEditEquipmentModal(${e.id})">Chỉnh sửa</button></td>`;
    tbody.appendChild(tr);
  });
  for (let i = rows.length; i < 8; i++) {
    const tr = document.createElement('tr'); tr.className = 'empty-row';
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

function renderEquipmentPagination(pagination) {
  const el = document.getElementById('equipmentPagination');
  el.innerHTML = '';
  const { page, totalPages } = pagination;
  const mkBtn = (label, target, disabled = false, active = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (active) b.classList.add('active');
    b.disabled = disabled;
    b.onclick = () => { equipmentState.page = target; loadEquipmentList(); };
    return b;
  };
  el.appendChild(mkBtn('Trang đầu', 1, page === 1));
  for (let p = 1; p <= totalPages; p++) el.appendChild(mkBtn(String(p), p, false, p === page));
  el.appendChild(mkBtn('Trang cuối', totalPages, page === totalPages));
}

// ---------------------------------------------------------------
// MODAL: Thêm / Sửa thiết bị
// ---------------------------------------------------------------
const equipmentModalOverlay = document.getElementById('equipmentModalOverlay');
const equipmentModalTitle = document.getElementById('equipmentModalTitle');
const eqCode = document.getElementById('eqCode');
const eqName = document.getElementById('eqName');
const eqStatus = document.getElementById('eqStatus');
const equipmentFormError = document.getElementById('equipmentFormError');

async function populateEquipmentCodeSelect(selectedCode) {
  const res = await fetch(`${API}/equipment/codes/available`);
  const json = await res.json();
  const options = [...json.data];
  if (selectedCode && !options.includes(selectedCode)) options.unshift(selectedCode);
  eqCode.innerHTML = `<option value="">-- Chọn mã thiết bị --</option>` +
    options.map(c => `<option value="${c}">${c}</option>`).join('');
  if (selectedCode) eqCode.value = selectedCode;
}

async function openAddEquipmentModal() {
  equipmentState.editingId = null;
  equipmentModalTitle.textContent = 'Thêm thiết bị';
  await populateEquipmentCodeSelect();
  eqCode.disabled = false;
  eqName.value = '';
  eqStatus.value = 'DANG_HOAT_DONG';
  equipmentFormError.textContent = '';
  equipmentModalOverlay.style.display = 'flex';
}

window.openEditEquipmentModal = async function (equipmentId) {
  const res = await fetch(`${API}/equipment?search=&page=1`);
  const json = await res.json();
  let item = (json.data || []).find(e => e.id === equipmentId);
  if (!item) {
    // Có thể thiết bị không nằm ở trang 1 (do đang lọc/tìm kiếm) -> tìm theo trang hiện tại
    const res2 = await fetch(`${API}/equipment?search=${encodeURIComponent(equipmentState.search)}&page=${equipmentState.page}`);
    const json2 = await res2.json();
    item = (json2.data || []).find(e => e.id === equipmentId);
  }
  if (!item) { alert('Không tìm thấy thiết bị.'); return; }

  equipmentState.editingId = equipmentId;
  equipmentModalTitle.textContent = 'Chỉnh sửa thiết bị';
  await populateEquipmentCodeSelect(item.equipment_code);
  eqCode.disabled = true; // không đổi mã khi sửa
  eqName.value = item.name;
  eqStatus.value = item.status;
  equipmentFormError.textContent = '';
  equipmentModalOverlay.style.display = 'flex';
};

document.getElementById('btnCancelEquipment').addEventListener('click', () => {
  equipmentModalOverlay.style.display = 'none';
});

document.getElementById('btnSaveEquipment').addEventListener('click', async () => {
  equipmentFormError.textContent = '';
  const name = eqName.value.trim();
  const status = eqStatus.value;
  const isAdd = !equipmentState.editingId;

  if ((isAdd && !eqCode.value) || !name) {
    equipmentFormError.textContent = 'Vui lòng chọn/nhập đầy đủ thông tin bắt buộc (*).';
    return;
  }

  try {
    let res;
    if (isAdd) {
      res = await fetch(`${API}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_code: eqCode.value, name, status }),
      });
    } else {
      res = await fetch(`${API}/equipment/${equipmentState.editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status }),
      });
    }
    const json = await res.json();
    equipmentModalOverlay.style.display = 'none';
    if (!json.success) { showNotify('error', json.message); return; }
    showNotify('success', isAdd ? 'Thêm thiết bị thành công!' : 'Cập nhật thiết bị thành công!');
    loadEquipmentList();
  } catch (err) {
    equipmentFormError.textContent = 'Lỗi kết nối máy chủ.';
  }
});

// ---------------------------------------------------------------
function debounceEquipment(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}