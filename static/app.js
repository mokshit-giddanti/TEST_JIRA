/* JIRA & BCS Hours Tracker — no frontend build step required. */
(() => {
  'use strict';
  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  const $ = (id) => document.getElementById(id);
  let records = [];
  let detail = null;
  let activeId = null;
  let modalMode = null;
  let editId = null;
  let toastTimer = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmt(num) {
    return Number(num).toLocaleString(undefined, {maximumFractionDigits:2});
  }
  function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function prettyDate(v) {
    if (!v) return '';
    const [year, month, day] = v.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
  }
  function toast(message, error=false) {
    const box = $('toast'); box.textContent = message; box.classList.toggle('error', error); box.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> {box.hidden=true}, 3600);
  }
  async function api(path, {method='GET', body} = {}) {
    const res = await fetch(path, {method, headers: {'Accept':'application/json', 'Content-Type':'application/json', 'X-CSRF-Token':csrf}, body: body ? JSON.stringify(body) : undefined});
    let output;
    try {output = await res.json();} catch (_) {throw new Error('Unexpected server response. Reload and try again.');}
    if (!res.ok) throw new Error(output.error || `Request failed (${res.status}).`);
    return output;
  }
  async function refresh() {
    const data = await api('/api/jiras');
    records = data.jiras;
    renderMaster();
  }
  function renderMaster() {
    let hours=0, booked=0, remaining=0;
    for (const j of records) {hours += j.total_hours; booked += j.booked_hours; remaining += j.remaining_hours;}
    $('countJiras').textContent = records.length;
    $('totalHours').innerHTML = `${fmt(hours)}<span class="stat-unit">h</span>`;
    $('bookedHours').innerHTML = `${fmt(booked)}<span class="stat-unit">h</span>`;
    $('remainingHours').innerHTML = `<span class="${remaining<0?'negative':''}">${fmt(remaining)}</span><span class="stat-unit">h</span>`;
    const selected = $('sprintFilter').value;
    const sprints = [...new Set(records.map(j=>j.sprint))].sort((a,b)=>a.localeCompare(b));
    $('sprintFilter').innerHTML = '<option value="">All sprints</option>' + sprints.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    $('sprintFilter').value = sprints.includes(selected) ? selected : '';
    const q = $('search').value.toLowerCase().trim();
    const rows = records.filter(j => (!q || (j.jira + ' ' + j.sprint).toLowerCase().includes(q)) && (!$('sprintFilter').value || j.sprint===$('sprintFilter').value));
    $('tableCount').textContent = `${rows.length} JIRA${rows.length===1?'':'s'}`;
    const tbody = $('jiraRows');
    if (!rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-art">▦</div><div class="empty-title">${records.length ? 'No matching JIRAs' : 'No JIRAs yet'}</div><div>${records.length ? 'Try another search or filter.' : 'Click Add New JIRA to create your first task.'}</div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(j => `<tr>
      <td><span class="sprint-pill">${esc(j.sprint)}</span></td>
      <td><button class="jira-link" type="button" data-action="open" data-id="${esc(j.id)}">${esc(j.jira)}</button></td>
      <td><b class="hour-highlight">${fmt(j.story_points)}</b></td>
      <td><span class="hour-highlight">${fmt(j.days)}d</span><span class="muted-mini">/ ${fmt(j.total_hours)}h</span></td>
      <td><button type="button" class="open-booking" data-action="open" data-id="${esc(j.id)}">Open bookings ↗ <span style="opacity:.6">(${j.booking_count})</span></button></td>
      <td class="actions-column"><div class="inline-actions"><button type="button" aria-label="Edit ${esc(j.jira)}" title="Edit JIRA" class="icon-action" data-action="edit" data-id="${esc(j.id)}">✎</button><button type="button" aria-label="Delete ${esc(j.jira)}" title="Delete JIRA" class="icon-action danger" data-action="delete" data-id="${esc(j.id)}">×</button></div></td>
    </tr>`).join('');
  }
  async function openJira(id) {
    const data = await api(`/api/jiras/${encodeURIComponent(id)}`);
    activeId = id;
    detail = data.jira;
    $('masterView').hidden = true;
    $('detailView').hidden = false;
    $('breadcrumb').textContent = detail.jira;
    $('navOverview').classList.remove('active');
    $('navJiras').classList.add('active');
    $('detailJiraTitle').textContent = detail.jira;
    $('detailSubtitle').textContent = `${detail.sprint} · Individual BCS booking sheet`;
    $('detailPoints').textContent = fmt(detail.story_points);
    $('detailDays').textContent = `${fmt(detail.days)} days allocated`;
    $('detailTotal').innerHTML = `${fmt(detail.total_hours)}<span class="stat-unit">h</span>`;
    $('detailBooked').innerHTML = `${fmt(detail.booked_hours)}<span class="stat-unit">h</span>`;
    $('detailRemaining').innerHTML = `<span class="${detail.remaining_hours < 0 ? 'negative' : ''}">${fmt(detail.remaining_hours)}</span><span class="stat-unit">h</span>`;
    $('bookingCount').textContent = `${detail.booking_count} ${detail.booking_count===1?'entry':'entries'}`;
    $('bookingRows').innerHTML = detail.bookings.length ? detail.bookings.map(b=>`<tr>
      <td><b class="hour-highlight">${fmt(detail.total_hours)}h</b></td>
      <td>${esc(prettyDate(b.date))}</td>
      <td><b class="hour-highlight">${fmt(b.hours)}h</b></td>
      <td class="remark-cell">${esc(b.remark) || '<span class="muted-mini">—</span>'}</td>
      <td><span class="${b.remaining_hours < 0 ? 'negative' : 'positive'}">${fmt(b.remaining_hours)}h</span></td>
      <td class="actions-column"><div class="inline-actions"><button type="button" title="Edit booking" aria-label="Edit booking" class="icon-action" data-action="edit-booking" data-id="${esc(b.id)}">✎</button><button type="button" title="Delete booking" aria-label="Delete booking" class="icon-action danger" data-action="delete-booking" data-id="${esc(b.id)}">×</button></div></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="6"><div class="empty-art">◷</div><div class="empty-title">No hours booked yet</div><div>Use Add Booking to start tracking this JIRA.</div></td></tr>';
    if (window.location.hash !== `#jira/${id}`) history.replaceState(null,'',`#jira/${id}`);
    window.scrollTo({top:0,behavior:'instant'});
  }
  function back() {
    activeId = null;
    detail = null;
    $('masterView').hidden = false;
    $('detailView').hidden = true;
    $('breadcrumb').textContent = 'Dashboard';
    $('navOverview').classList.add('active');
    $('navJiras').classList.remove('active');
    if (location.hash) history.replaceState(null,'',location.pathname);
    window.scrollTo({top:0,behavior:'instant'});
  }
  function showForm(mode, id=null) {
    editId = id; modalMode=mode;
    const isBooking = mode.includes('booking');
    $('modalEyebrow').textContent = isBooking ? (detail?.jira || 'BCS BOOKING') : 'MASTER JIRA TRACKER';
    $('modalTitle').textContent = mode === 'add-jira' ? 'Add New JIRA' : mode === 'edit-jira' ? 'Edit JIRA' : mode === 'add-booking' ? 'Add New Booking' : 'Edit Booking';
    $('saveEntryBtn').textContent = mode.startsWith('add') ? (isBooking ? 'Add Booking' : 'Add JIRA') : 'Save Changes';
    $('formError').hidden = true;
    if (isBooking) {
      const b = mode === 'edit-booking' ? detail?.bookings.find(b=>b.id === id) : null;
      $('formFields').innerHTML = `<div class="field-grid"><div class="field"><label for="fDate">Date</label><input type="date" id="fDate" name="date" value="${esc(b?.date || isoToday())}" required><span class="field-help">Today's date by default, editable.</span></div><div class="field"><label for="fHours">BCS booking hours</label><input type="number" id="fHours" name="hours" min="0.01" max="10000" step="0.01" value="${esc(b?.hours ?? '')}" placeholder="e.g. 4" required></div></div><div class="field"><label for="fRemark">Remark for BCS</label><textarea id="fRemark" name="remark" maxlength="500" placeholder="What did you work on?">${esc(b?.remark ?? '')}</textarea></div><div class="field-help">Remaining hours will update automatically after saving.</div>`;
    } else {
      const j = mode === 'edit-jira' ? records.find(j=>j.id === id) : null;
      $('formFields').innerHTML = `<div class="field"><label for="fSprint">Sprint</label><input id="fSprint" name="sprint" maxlength="64" value="${esc(j?.sprint ?? '')}" placeholder="e.g. Sprint 1" required></div><div class="field"><label for="fJira">JIRA number</label><input id="fJira" name="jira" maxlength="50" value="${esc(j?.jira ?? '')}" placeholder="e.g. OPPC-298" required></div><div class="field"><label for="fPoints">Story Points</label><input type="number" id="fPoints" name="story_points" min="0.01" max="10000" step="0.01" value="${esc(j?.story_points ?? '')}" placeholder="e.g. 5" required><span class="field-help">1 Story Point = 0.5 Day = 4 Hours</span></div>`;
    }
    $('modal').hidden=false;
    $('modal').setAttribute('aria-hidden','false');
    setTimeout(()=>$('formFields').querySelector('input')?.focus(),50);
  }
  function hideForm() { $('modal').hidden=true; $('modal').setAttribute('aria-hidden','true'); modalMode=null; editId=null; }
  async function saveForm(event) {
    event.preventDefault();
    if (!$('entryForm').reportValidity()) return;
    const button=$('saveEntryBtn');button.disabled=true;
    $('formError').hidden=true;
    try {
      const data=Object.fromEntries(new FormData($('entryForm')).entries());
      if (modalMode === 'add-jira') {
        const result=await api('/api/jiras',{method:'POST',body:data});
        hideForm();await refresh();toast(`${result.jira.jira} created.`);
        await openJira(result.jira.id);
      } else if(modalMode === 'edit-jira') {
        const id=editId;
        await api(`/api/jiras/${encodeURIComponent(id)}`,{method:'PUT',body:data});
        hideForm();await refresh();toast('JIRA updated.');if(activeId===id)await openJira(id);
      } else if (modalMode === 'add-booking') {
        await api(`/api/jiras/${encodeURIComponent(activeId)}/bookings`,{method:'POST',body:data});
        hideForm();await refresh();await openJira(activeId);toast('BCS booking added.');
      } else if (modalMode === 'edit-booking') {
        await api(`/api/bookings/${encodeURIComponent(editId)}`,{method:'PUT',body:data});
        hideForm();await refresh();await openJira(activeId);toast('Booking updated.');
      }
    } catch(e) {$('formError').textContent=e.message;$('formError').hidden=false;}
    finally {button.disabled=false;}
  }
  async function deleteJira(id) {
    const j=records.find(j=>j.id===id);if(!j)return;
    if(!confirm(`Delete ${j.jira} and all its booking records? This cannot be undone.`))return;
    try {await api(`/api/jiras/${encodeURIComponent(id)}`,{method:'DELETE'});if(activeId===id)back();await refresh();toast(`${j.jira} deleted.`);}catch(e){toast(e.message,true);}
  }
  async function deleteBooking(id) {
    if(!confirm('Delete this BCS booking record? This cannot be undone.'))return;
    try {await api(`/api/bookings/${encodeURIComponent(id)}`,{method:'DELETE'});await refresh();await openJira(activeId);toast('Booking deleted.');}catch(e){toast(e.message,true);}
  }
  $('newJiraBtn').addEventListener('click',()=>showForm('add-jira'));
  $('newJiraRow').addEventListener('click',()=>showForm('add-jira'));
  $('newBookingBtn').addEventListener('click',()=>showForm('add-booking'));
  $('newBookingRow').addEventListener('click',()=>showForm('add-booking'));
  $('backBtn').addEventListener('click',back);
  $('navOverview').addEventListener('click',back);
  $('navJiras').addEventListener('click',back);
  $('search').addEventListener('input',renderMaster);
  $('sprintFilter').addEventListener('change',renderMaster);
  $('exportJiraBtn').addEventListener('click',()=> {if(activeId) location.href=`/export/excel/jira/${encodeURIComponent(activeId)}`});
  $('closeModal').addEventListener('click',hideForm);
  $('cancelModal').addEventListener('click',hideForm);
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))hideForm()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !$('modal').hidden)hideForm()});
  $('entryForm').addEventListener('submit',saveForm);
  $('jiraRows').addEventListener('click',e=>{
    const el=e.target.closest('[data-action]');if(!el)return;
    const id=el.dataset.id;
    if(el.dataset.action==='open')openJira(id).catch(error=>toast(error.message,true));
    if(el.dataset.action==='edit')showForm('edit-jira',id);
    if(el.dataset.action==='delete')deleteJira(id);
  });
  $('bookingRows').addEventListener('click',e=>{
    const el=e.target.closest('[data-action]');if(!el)return;
    const id=el.dataset.id;
    if(el.dataset.action==='edit-booking')showForm('edit-booking',id);
    if(el.dataset.action==='delete-booking')deleteBooking(id);
  });
  refresh().then(async()=>{
    const match=location.hash.match(/^#jira\/([a-f0-9-]{36})$/);
    if(match)try{await openJira(match[1]);}catch(_){back();}
  }).catch(err=>toast(err.message,true));
})();
