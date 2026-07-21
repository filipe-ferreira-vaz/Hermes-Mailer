// Templates Management Module
// Uses global functions: showToast, openConfirmModal, closeConfirmModal, and the API object.

let currentTemplateId = null;
let allTemplates = [];

async function loadTemplates() {
  try {
    const data = await API.getTemplates();
    allTemplates = data.templates || data || [];
    renderTemplateList();
    populateActiveTemplateDropdown();
    updateTemplatePreview();
  } catch (e) { console.error(e); }
}

function renderTemplateList() {
  const list = document.getElementById('template-list');
  list.innerHTML = '';
  
  allTemplates.forEach(template => {
    const item = document.createElement('div');
    item.className = 'template-item' + (template.id === currentTemplateId ? ' active' : '');
    item.innerHTML = `
      <span class="template-item-name">
        ${template.is_active ? '<span class="star-icon">★</span>' : ''}
        ${template.name}
      </span>
      <div class="template-item-actions">
        <button class="btn btn-sm btn-ghost" onclick="editTemplate(${template.id})">✏️</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteTemplate(${template.id})" style="color: var(--danger);">🗑️</button>
      </div>
    `;
    item.addEventListener('click', (e) => {
      if (!e.target.closest('button')) editTemplate(template.id);
    });
    list.appendChild(item);
  });
}

function populateActiveTemplateDropdown() {
  const select = document.getElementById('active-template-select');
  select.innerHTML = '<option value="">Select active template...</option>';
  allTemplates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    if (t.is_active) opt.selected = true;
    select.appendChild(opt);
  });
}

function editTemplate(id) {
  const template = allTemplates.find(t => t.id === id);
  if (!template) return;
  currentTemplateId = id;
  document.getElementById('template-name').value = template.name;
  document.getElementById('template-subject').value = template.subject || '';
  document.getElementById('template-body').value = template.body || '';
  document.getElementById('template-delete-btn').style.display = 'inline-flex';
  renderTemplateList();
  updateTemplatePreview();
}

function newTemplate() {
  currentTemplateId = null;
  document.getElementById('template-name').value = '';
  document.getElementById('template-subject').value = '';
  document.getElementById('template-body').value = '';
  document.getElementById('template-delete-btn').style.display = 'none';
  renderTemplateList();
  updateTemplatePreview();
}

async function saveTemplate() {
  const data = {
    name: document.getElementById('template-name').value.trim(),
    subject: document.getElementById('template-subject').value.trim(),
    body: document.getElementById('template-body').value,
  };
  if (!data.name) { showToast('Template name is required', 'error'); return; }
  
  try {
    if (currentTemplateId) {
      await API.updateTemplate(currentTemplateId, data);
      showToast('Template updated! ✅', 'success');
    } else {
      const result = await API.createTemplate(data);
      currentTemplateId = (result.template || result).id;
      showToast('Template created! ✅', 'success');
    }
    await loadTemplates();
  } catch (e) { console.error(e); }
}

async function deleteTemplate(id) {
  openConfirmModal('Are you sure you want to delete this template?', async () => {
    try {
      await API.deleteTemplate(id);
      showToast('Template deleted', 'info');
      if (currentTemplateId === id) newTemplate();
      closeConfirmModal();
      await loadTemplates();
    } catch (e) { console.error(e); }
  });
}

async function activateTemplate(id) {
  try {
    await API.activateTemplate(id);
    showToast('Active template updated! ⭐', 'success');
    await loadTemplates();
  } catch (e) { console.error(e); }
}

function updateTemplatePreview() {
  const preview = document.getElementById('template-preview');
  const body = document.getElementById('template-body').value;
  
  // Replace placeholders with sample data
  const sampleData = {
    first_name: 'John',
    last_name: 'Doe',
    event_name: 'Team Meeting',
    event_day: '15',
    week_day: 'Monday',
    event_month: 'January',
    event_time: '10:00 AM',
  };
  
  let rendered = body;
  Object.keys(sampleData).forEach(key => {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), sampleData[key]);
  });
  
  preview.innerHTML = rendered || '<p style="color: #999; font-style: italic;">Preview will appear here...</p>';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('template-new-btn').addEventListener('click', newTemplate);
  document.getElementById('template-save-btn').addEventListener('click', saveTemplate);
  document.getElementById('template-delete-btn').addEventListener('click', () => {
    if (currentTemplateId) deleteTemplate(currentTemplateId);
  });
  document.getElementById('active-template-select').addEventListener('change', (e) => {
    if (e.target.value) activateTemplate(e.target.value);
  });
  document.getElementById('template-body').addEventListener('input', updateTemplatePreview);
});

// Make globally accessible
window.loadTemplates = loadTemplates;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
