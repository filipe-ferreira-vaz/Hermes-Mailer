// Hermes Dashboard Frontend State Management
let state = {
    events: [],
    settings: {},
    authStatus: { credentials_exists: false, authenticated: false },
    currentEvent: null
};

// DOM Elements
const elements = {
    tabs: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    syncBtn: document.getElementById('sync-now-btn'),
    
    // Upcoming Events Tab
    upcomingGrid: document.getElementById('upcoming-events-grid'),
    eventsLoader: document.getElementById('events-loader'),
    filterDaysToggle: document.getElementById('filter-days-toggle'),
    filterDaysSelect: document.getElementById('filter-days-select'),
    
    // Sent Emails Tab
    sentTableBody: document.getElementById('sent-events-table-body'),
    
    // Settings Tab
    authStatusText: document.getElementById('auth-status-text'),
    authStatusBadge: document.getElementById('auth-status-badge'),
    credentialsInput: document.getElementById('credentials-file-input'),
    calendarIdInput: document.getElementById('calendar-id-input'),
    googleAuthBtn: document.getElementById('google-auth-btn'),
    googleLogoutBtn: document.getElementById('google-logout-btn'),
    googleSettingsForm: document.getElementById('google-settings-form'),
    deletedGrid: document.getElementById('deleted-events-grid'),
    modalDeleteBtn: document.getElementById('modal-delete-btn'),
    modalRestoreBtn: document.getElementById('modal-restore-btn'),
    resetAllBtn: document.getElementById('reset-all-btn'),
    
    smtpForm: document.getElementById('smtp-settings-form'),
    smtpHost: document.getElementById('smtp-host-input'),
    smtpPort: document.getElementById('smtp-port-input'),
    smtpUser: document.getElementById('smtp-user-input'),
    smtpPass: document.getElementById('smtp-pass-input'),
    smtpUseTls: document.getElementById('smtp-use-tls-input'),
    testSmtpBtn: document.getElementById('test-smtp-btn'),
    
    templateForm: document.getElementById('template-settings-form'),
    settingsFormatSelect: document.getElementById('settings-format-select'),
    createFormatBtn: document.getElementById('create-format-btn'),
    deleteFormatBtn: document.getElementById('delete-format-btn'),
    templateNameInput: document.getElementById('template-name-input'),
    setDefaultFormatCheckbox: document.getElementById('set-default-format-checkbox'),
    templateSubject: document.getElementById('template-subject-input'),
    templateBody: document.getElementById('template-body-input'),
    
    // Modal Details
    eventModal: document.getElementById('event-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalSaveBtn: document.getElementById('modal-save-btn'),
    modalSendBtn: document.getElementById('modal-send-btn'),
    modalTitle: document.getElementById('modal-event-name-title'),
    modalTimeTitle: document.getElementById('modal-event-time-title'),
    modalStatusBadgeContainer: document.getElementById('modal-status-badge-container'),
    
    modalInputTitle: document.getElementById('modal-event-title-input'),
    modalInputStart: document.getElementById('modal-event-start-input'),
    modalInputFirst: document.getElementById('modal-first-name-input'),
    modalInputLast: document.getElementById('modal-last-name-input'),
    modalInputEmail: document.getElementById('modal-email-input'),
    modalOriginalDesc: document.getElementById('modal-original-description'),
    modalFormatSelect: document.getElementById('modal-format-select'),
    modalInputSubject: document.getElementById('modal-email-subject-input'),
    modalInputBody: document.getElementById('modal-email-body-input'),
    
    toastContainer: document.getElementById('toast-container')
};

// Toast Helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon mapping
    let icon = '';
    if (type === 'success') {
        icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
        icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
        icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }
    
    toast.innerHTML = `${icon} <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    
    // Dismiss after 4s
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

// Format Start Time ISO to nicer readable string
function formatDisplayDateTime(isoStr) {
    if (!isoStr) return "";
    try {
        const dt = new Date(isoStr);
        if (isNaN(dt.getTime())) return isoStr;
        return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
        return isoStr;
    }
}

// Tab Switching
function initTabs() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Toggle active classes on tab buttons
            elements.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Toggle active classes on content views
            elements.tabContents.forEach(content => {
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
            
            // Refetch current tab data
            if (targetTab === 'upcoming') {
                fetchEvents();
            } else if (targetTab === 'sent') {
                fetchSentEvents();
            } else if (targetTab === 'deleted') {
                fetchDeletedEvents();
            } else if (targetTab === 'settings') {
                fetchSettings();
                fetchAuthStatus();
            }
        });
    });
}

// Fetch OAuth Connection status
async function fetchAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        state.authStatus = data;
        renderAuthUI();
    } catch (e) {
        showToast('Error loading auth status', 'error');
    }
}

function renderAuthUI() {
    const badge = elements.authStatusBadge;
    const text = elements.authStatusText;
    const logoutBtn = elements.googleLogoutBtn;
    const authBtn = elements.googleAuthBtn;
    
    if (state.authStatus.authenticated) {
        badge.className = 'auth-badge auth-badge-connected';
        badge.textContent = 'CONNECTED';
        text.textContent = 'Your Google account is linked and ready.';
        logoutBtn.style.display = 'block';
        authBtn.textContent = 'Re-authenticate Google Account';
    } else {
        badge.className = 'auth-badge auth-badge-disconnected';
        badge.textContent = 'NOT LINKED';
        logoutBtn.style.display = 'none';
        authBtn.textContent = 'Authenticate Google Account';
        
        if (state.authStatus.credentials_exists) {
            text.textContent = 'credentials.json found. Ready to authenticate.';
            authBtn.removeAttribute('disabled');
            authBtn.style.opacity = '1';
            authBtn.style.pointerEvents = 'auto';
        } else {
            text.textContent = 'Please upload credentials.json to authorize this app.';
            authBtn.setAttribute('disabled', 'true');
            authBtn.style.opacity = '0.5';
            authBtn.style.pointerEvents = 'none';
        }
    }
}

// Handle Google Logout
async function handleGoogleLogout() {
    if (!confirm('Are you sure you want to disconnect your Google Calendar authorization?')) return;
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Disconnected from Google successfully', 'success');
            fetchAuthStatus();
        }
    } catch (e) {
        showToast('Failed to disconnect', 'error');
    }
}

// Sync Google Calendar
async function syncCalendarEvents() {
    elements.syncBtn.disabled = true;
    elements.syncBtn.innerHTML = '<span class="loading-spinner">🔄</span> Syncing...';
    
    try {
        const res = await fetch('/api/events/sync', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
            if (activeTab === 'upcoming') {
                fetchEvents();
            } else if (activeTab === 'sent') {
                fetchSentEvents();
            }
        } else {
            showToast(data.error || 'Sync failed', 'error');
        }
    } catch (e) {
        showToast('Calendar sync network error', 'error');
    } finally {
        elements.syncBtn.disabled = false;
        elements.syncBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Sync Calendar
        `;
    }
}

// Fetch Upcoming Event Drafts
async function fetchEvents() {
    elements.eventsLoader.style.display = 'block';
    elements.upcomingGrid.style.display = 'none';
    
    try {
        const res = await fetch('/api/events?status=draft');
        const data = await res.json();
        state.events = data;
        renderUpcomingGrid();
    } catch (e) {
        showToast('Failed to retrieve draft events', 'error');
    } finally {
        elements.eventsLoader.style.display = 'none';
        elements.upcomingGrid.style.display = 'grid';
    }
}

// Render upcoming drafts
function renderUpcomingGrid() {
    let drafts = state.events;
    
    console.log("renderUpcomingGrid called. Total drafts:", drafts.length);
    console.log("filterDaysToggle checked:", elements.filterDaysToggle ? elements.filterDaysToggle.checked : "null");
    
    // Filter by upcoming x days if toggle is enabled
    if (elements.filterDaysToggle && elements.filterDaysToggle.checked) {
        const daysLimit = parseInt(elements.filterDaysSelect.value, 10) || 2;
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + daysLimit);
        limitDate.setHours(23, 59, 59, 999);
        
        console.log(`Filtering limit active: next ${daysLimit} days. Limit Date Threshold:`, limitDate.toLocaleString());
        
        drafts = drafts.filter(event => {
            if (!event.start_time) return false;
            const eventDate = new Date(event.start_time);
            const keep = eventDate <= limitDate;
            console.log(`Event "${event.name}" - start_time: ${event.start_time}, parsedDate: ${eventDate.toLocaleString()}, keep: ${keep}`);
            return keep;
        });
    }

    elements.upcomingGrid.innerHTML = '';
    
    if (drafts.length === 0) {
        elements.upcomingGrid.innerHTML = `
            <div class="glass-panel" style="grid-column: 1 / -1;">
                <div class="empty-state">
                    <svg viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <h3>No Upcoming Event Drafts</h3>
                    <p>There are no upcoming events in draft mode matching current filters. Click 'Sync Calendar' above to fetch latest schedule.</p>
                </div>
            </div>
        `;
        return;
    }
    
    drafts.forEach(event => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.addEventListener('click', () => openEventModal(event));
        
        const participantName = (event.participant_first_name || event.participant_last_name) 
            ? `${event.participant_first_name} ${event.participant_last_name}`.stripName()
            : 'Unspecified Participant';
            
        const participantEmail = event.participant_email || 'No email parsed';
        
        card.innerHTML = `
            <div class="event-header">
                <h4 class="event-title">${event.name}</h4>
                <div class="event-meta">
                    <div class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span>${event.date_display}</span>
                    </div>
                    <div class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>${event.time_display}</span>
                    </div>
                </div>
            </div>
            
            <div class="event-divider"></div>
            
            <div class="participant-preview">
                <div class="participant-label">Parsed Recipient</div>
                <div class="participant-name">${participantName}</div>
                <div class="participant-email">${participantEmail}</div>
            </div>
            
            <div class="card-footer">
                <span class="status-badge status-draft">Draft</span>
                <span class="card-action-text">
                    Review & Send
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </span>
            </div>
        `;
        
        elements.upcomingGrid.appendChild(card);
    });
}

// String cleanup helper for templates
String.prototype.stripName = function() {
    return this.replace(/\s+/g, ' ').trim();
};

// Fetch Sent History
async function fetchSentEvents() {
    try {
        const res = await fetch('/api/events?status=sent');
        const data = await res.json();
        renderSentTable(data);
    } catch (e) {
        showToast('Failed to load sent history log', 'error');
    }
}

// Render sent history list
function renderSentTable(sentList) {
    elements.sentTableBody.innerHTML = '';
    
    if (sentList.length === 0) {
        elements.sentTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    No emails have been sent yet.
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort reverse chronological on sent date
    sentList.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    
    sentList.forEach(event => {
        const row = document.createElement('tr');
        row.className = 'table-row-clickable';
        row.addEventListener('click', () => openEventModal(event));
        
        const participantName = `${event.participant_first_name} ${event.participant_last_name}`.trim() || 'N/A';
        const emailAddress = event.participant_email || 'N/A';
        const sentTime = formatDisplayDateTime(event.sent_at);
        
        row.innerHTML = `
            <td style="font-weight: 500;">${event.name}</td>
            <td>${participantName}</td>
            <td style="color: var(--text-muted); font-size:0.9rem;">${emailAddress}</td>
            <td>${event.date_display}</td>
            <td>${sentTime}</td>
            <td><span class="status-badge status-sent">Sent</span></td>
        `;
        elements.sentTableBody.appendChild(row);
    });
}

// Fetch Deleted Events Trash
async function fetchDeletedEvents() {
    elements.eventsLoader.style.display = 'block';
    elements.deletedGrid.style.display = 'none';
    
    try {
        const res = await fetch('/api/events?status=deleted');
        const data = await res.json();
        state.events = data;
        renderDeletedGrid();
    } catch (e) {
        showToast('Failed to retrieve deleted events from trash', 'error');
    } finally {
        elements.eventsLoader.style.display = 'none';
        elements.deletedGrid.style.display = 'grid';
    }
}

// Render deleted events trash
function renderDeletedGrid() {
    const deleted = state.events;
    elements.deletedGrid.innerHTML = '';
    
    if (deleted.length === 0) {
        elements.deletedGrid.innerHTML = `
            <div class="glass-panel" style="grid-column: 1 / -1;">
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <h3>Trash is Empty</h3>
                    <p>There are no deleted event drafts here.</p>
                </div>
            </div>
        `;
        return;
    }
    
    deleted.forEach(event => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.addEventListener('click', () => openEventModal(event));
        
        const participantName = (event.participant_first_name || event.participant_last_name) 
            ? `${event.participant_first_name} ${event.participant_last_name}`.stripName()
            : 'Unspecified Participant';
            
        const participantEmail = event.participant_email || 'No email parsed';
        
        card.innerHTML = `
            <div class="event-header">
                <h4 class="event-title">${event.name}</h4>
                <div class="event-meta">
                    <div class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span>${event.date_display}</span>
                    </div>
                    <div class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>${event.time_display}</span>
                    </div>
                </div>
            </div>
            
            <div class="event-divider"></div>
            
            <div class="participant-preview">
                <div class="participant-label">Parsed Recipient</div>
                <div class="participant-name">${participantName}</div>
                <div class="participant-email">${participantEmail}</div>
            </div>
            
            <div class="card-footer">
                <span class="status-badge status-deleted">Deleted</span>
                <button class="btn btn-success restore-btn-quick" data-id="${event.event_id}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; border-radius: var(--radius-sm); border: none;">
                    Restore
                </button>
            </div>
        `;
        
        // Prevent card click when clicking the Restore button
        const restoreBtn = card.querySelector('.restore-btn-quick');
        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            restoreEvent(event.event_id);
        });
        
        elements.deletedGrid.appendChild(card);
    });
}

// Delete Event API call
async function deleteEvent(eventId) {
    try {
        const res = await fetch(`/api/events/${eventId}/delete`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
            if (activeTab === 'upcoming') {
                fetchEvents();
            } else if (activeTab === 'deleted') {
                fetchDeletedEvents();
            }
        } else {
            showToast('Failed to delete event', 'error');
        }
    } catch (e) {
        showToast('Network error deleting event', 'error');
    }
}

// Restore Event API call
async function restoreEvent(eventId) {
    try {
        const res = await fetch(`/api/events/${eventId}/restore`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
            if (activeTab === 'upcoming') {
                fetchEvents();
            } else if (activeTab === 'deleted') {
                fetchDeletedEvents();
            }
        } else {
            showToast('Failed to restore event', 'error');
        }
    } catch (e) {
        showToast('Network error restoring event', 'error');
    }
}

let originalFormatName = "";

async function fetchFormats(selectName = null) {
    try {
        const res = await fetch('/api/formats');
        const formats = await res.json();
        state.formats = formats;
        
        // Populate settings formats select
        if (elements.settingsFormatSelect) {
            elements.settingsFormatSelect.innerHTML = '';
            formats.forEach(fmt => {
                const opt = document.createElement('option');
                opt.value = fmt.name;
                opt.textContent = fmt.name;
                elements.settingsFormatSelect.appendChild(opt);
            });
        }
        
        // Populate modal format select
        if (elements.modalFormatSelect) {
            elements.modalFormatSelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = "";
            placeholder.textContent = "-- Select Template to Apply --";
            elements.modalFormatSelect.appendChild(placeholder);
            
            formats.forEach(fmt => {
                const opt = document.createElement('option');
                opt.value = fmt.name;
                opt.textContent = fmt.name;
                elements.modalFormatSelect.appendChild(opt);
            });
        }
        
        const defaultFormatName = state.settings.default_format_name || 'Default Reminder';
        const nameToSelect = selectName || defaultFormatName;
        
        if (elements.settingsFormatSelect) {
            elements.settingsFormatSelect.value = nameToSelect;
            if (!elements.settingsFormatSelect.value && formats.length > 0) {
                elements.settingsFormatSelect.value = formats[0].name;
            }
            
            loadFormatDetails(elements.settingsFormatSelect.value);
        }
    } catch (e) {
        showToast('Error loading email formats', 'error');
    }
}

function loadFormatDetails(name) {
    if (!state.formats) return;
    const fmt = state.formats.find(f => f.name === name);
    if (fmt) {
        elements.templateNameInput.value = fmt.name;
        elements.templateSubject.value = fmt.subject_template;
        elements.templateBody.value = fmt.body_template;
        
        const defaultFormatName = state.settings.default_format_name || 'Default Reminder';
        elements.setDefaultFormatCheckbox.checked = (fmt.name === defaultFormatName);
        
        originalFormatName = fmt.name;
    }
}

// Fetch Settings Config
async function fetchSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        state.settings = data;
        
        // Populate inputs
        elements.calendarIdInput.value = data.calendar_id || 'primary';
        
        elements.smtpHost.value = data.smtp_host || '';
        elements.smtpPort.value = data.smtp_port || '';
        elements.smtpUser.value = data.smtp_user || '';
        elements.smtpPass.value = data.smtp_pass || '';
        elements.smtpUseTls.checked = data.smtp_use_tls === '1';
        
        await fetchFormats();
    } catch (e) {
        showToast('Error loading configuration details', 'error');
    }
}

// Save SMTP settings
elements.smtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settingsPayload = {
        ...state.settings,
        calendar_id: elements.calendarIdInput.value,
        smtp_host: elements.smtpHost.value,
        smtp_port: elements.smtpPort.value,
        smtp_user: elements.smtpUser.value,
        smtp_pass: elements.smtpPass.value,
        smtp_use_tls: elements.smtpUseTls.checked ? '1' : '0'
    };
    
    await saveSettingsAPI(settingsPayload, 'SMTP settings updated successfully!');
});

// Save default templates
elements.templateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = elements.templateNameInput.value.trim();
    const subject = elements.templateSubject.value.trim();
    const body = elements.templateBody.value.trim();
    const isDefault = elements.setDefaultFormatCheckbox.checked;
    
    if (!name || !subject || !body) {
        showToast('Template name, subject, and body are all required.', 'error');
        return;
    }
    
    const payload = {
        name: name,
        subject_template: subject,
        body_template: body,
        original_name: originalFormatName
    };
    
    try {
        const res = await fetch('/api/formats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('Template format saved successfully!', 'success');
            
            if (isDefault) {
                const settingsPayload = {
                    ...state.settings,
                    default_format_name: name
                };
                await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settingsPayload)
                });
                state.settings.default_format_name = name;
            }
            
            await fetchSettings();
        } else {
            showToast(data.error || 'Failed to save format', 'error');
        }
    } catch (e) {
        showToast('Network error saving format template', 'error');
    }
});

// Save Google Settings Form (Calendar ID)
elements.googleSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settingsPayload = {
        ...state.settings,
        calendar_id: elements.calendarIdInput.value
    };
    
    await saveSettingsAPI(settingsPayload, 'Google Calendar ID saved successfully!');
});

async function saveSettingsAPI(payload, successMessage) {
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast(successMessage, 'success');
            fetchSettings();
        } else {
            showToast('Failed to save settings', 'error');
        }
    } catch (e) {
        showToast('Network error saving settings', 'error');
    }
}

// Test SMTP Settings
elements.testSmtpBtn.addEventListener('click', async () => {
    const origText = elements.testSmtpBtn.textContent;
    elements.testSmtpBtn.disabled = true;
    elements.testSmtpBtn.textContent = 'Testing...';
    
    const testPayload = {
        smtp_host: elements.smtpHost.value,
        smtp_port: elements.smtpPort.value,
        smtp_user: elements.smtpUser.value,
        smtp_pass: elements.smtpPass.value,
        smtp_use_tls: elements.smtpUseTls.checked ? '1' : '0'
    };
    
    try {
        const res = await fetch('/api/settings/test-smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload)
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('SMTP Test request failed', 'error');
    } finally {
        elements.testSmtpBtn.disabled = false;
        elements.testSmtpBtn.textContent = origText;
    }
});

// Credentials json Upload
elements.credentialsInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch('/api/settings/upload-credentials', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            fetchAuthStatus();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (e) {
        showToast('File upload error', 'error');
    }
});

// Drag and drop credentials files
const uploadZone = document.querySelector('.upload-zone');
if (uploadZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--accent-primary)';
            uploadZone.style.background = 'rgba(99, 102, 241, 0.08)';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--glass-border)';
            uploadZone.style.background = 'rgba(255, 255, 255, 0.01)';
        }, false);
    });

    uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            elements.credentialsInput.files = files;
            // Trigger change event
            const event = new Event('change');
            elements.credentialsInput.dispatchEvent(event);
        }
    });
}

// Modal management
function openEventModal(event) {
    state.currentEvent = event;
    
    // Set Fields
    elements.modalTitle.textContent = event.name;
    elements.modalTimeTitle.textContent = `${event.date_display} at ${event.time_display}`;
    elements.modalInputTitle.value = event.name;
    elements.modalInputStart.value = event.start_time;
    elements.modalInputFirst.value = event.participant_first_name || '';
    elements.modalInputLast.value = event.participant_last_name || '';
    elements.modalInputEmail.value = event.participant_email || '';
    elements.modalOriginalDesc.textContent = event.description || 'No description provided';
    if (elements.modalFormatSelect) {
        elements.modalFormatSelect.value = "";
    }
    elements.modalInputSubject.value = event.email_subject || '';
    elements.modalInputBody.value = event.email_body || '';
    
    // Status Badge
    const isSent = event.status === 'sent';
    const isDeleted = event.status === 'deleted';
    
    if (isSent) {
        elements.modalStatusBadgeContainer.innerHTML = `<span class="status-badge status-sent">Sent: ${formatDisplayDateTime(event.sent_at)}</span>`;
    } else if (isDeleted) {
        elements.modalStatusBadgeContainer.innerHTML = '<span class="status-badge status-deleted">Deleted (In Trash)</span>';
    } else {
        elements.modalStatusBadgeContainer.innerHTML = '<span class="status-badge status-draft">Draft</span>';
    }
        
    // Toggle editability
    const formControls = [
        elements.modalInputTitle, elements.modalInputStart,
        elements.modalInputFirst, elements.modalInputLast,
        elements.modalInputEmail, elements.modalFormatSelect,
        elements.modalInputSubject, elements.modalInputBody
    ];
    
    formControls.forEach(ctrl => {
        if (isSent || isDeleted) {
            ctrl.setAttribute('disabled', 'true');
        } else {
            ctrl.removeAttribute('disabled');
        }
    });
    
    if (isSent) {
        elements.modalSaveBtn.style.display = 'none';
        elements.modalSendBtn.style.display = 'none';
        elements.modalDeleteBtn.style.display = 'none';
        elements.modalRestoreBtn.style.display = 'none';
    } else if (isDeleted) {
        elements.modalSaveBtn.style.display = 'none';
        elements.modalSendBtn.style.display = 'none';
        elements.modalDeleteBtn.style.display = 'none';
        elements.modalRestoreBtn.style.display = 'block';
    } else {
        elements.modalSaveBtn.style.display = 'block';
        elements.modalSendBtn.style.display = 'block';
        elements.modalDeleteBtn.style.display = 'block';
        elements.modalRestoreBtn.style.display = 'none';
    }
    
    // Show Modal
    elements.eventModal.classList.add('active');
}

function closeEventModal() {
    elements.eventModal.classList.remove('active');
    state.currentEvent = null;
}

elements.modalCloseBtn.addEventListener('click', closeEventModal);
elements.modalCancelBtn.addEventListener('click', closeEventModal);

// Save Event details
async function saveModalDraft(showFeedback = true) {
    if (!state.currentEvent) return false;
    
    const eventId = state.currentEvent.event_id;
    const payload = {
        name: elements.modalInputTitle.value,
        start_time: elements.modalInputStart.value,
        participant_first_name: elements.modalInputFirst.value,
        participant_last_name: elements.modalInputLast.value,
        participant_email: elements.modalInputEmail.value,
        email_subject: elements.modalInputSubject.value,
        email_body: elements.modalInputBody.value
    };
    
    try {
        const res = await fetch(`/api/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            if (showFeedback) {
                showToast('Draft changes saved!', 'success');
            }
            // Update local state event
            Object.assign(state.currentEvent, payload);
            state.currentEvent.is_customized = 1;
            
            // Reload underlying list
            const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
            if (activeTab === 'upcoming') {
                fetchEvents();
            } else if (activeTab === 'sent') {
                fetchSentEvents();
            }
            return true;
        } else {
            showToast(data.error || 'Failed to save modifications', 'error');
            return false;
        }
    } catch (e) {
        showToast('Network error saving draft', 'error');
        return false;
    }
}

elements.modalSaveBtn.addEventListener('click', async () => {
    const success = await saveModalDraft(true);
    if (success) closeEventModal();
});

// Save & Send Event Email
elements.modalSendBtn.addEventListener('click', async () => {
    if (!state.currentEvent) return;
    
    elements.modalSendBtn.disabled = true;
    const origText = elements.modalSendBtn.innerHTML;
    elements.modalSendBtn.innerHTML = 'Sending...';
    
    // 1. Save any pending changes made in the modal first
    const saveSuccess = await saveModalDraft(false);
    if (!saveSuccess) {
        elements.modalSendBtn.disabled = false;
        elements.modalSendBtn.innerHTML = origText;
        return;
    }
    
    // 2. Perform the send action
    const eventId = state.currentEvent.event_id;
    try {
        const res = await fetch(`/api/events/${eventId}/send`, {
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('Email sent successfully!', 'success');
            closeEventModal();
            fetchEvents(); // Refresh drafts list
        } else {
            showToast(data.error || 'Error sending email', 'error');
        }
    } catch (e) {
        showToast('Network error executing mail transmission', 'error');
    } finally {
        elements.modalSendBtn.disabled = false;
        elements.modalSendBtn.innerHTML = origText;
    }
});

// App Startup Initializations
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    
    // Sync button
    if (elements.syncBtn) {
        elements.syncBtn.addEventListener('click', syncCalendarEvents);
    }
    
    // Google logout button
    if (elements.googleLogoutBtn) {
        elements.googleLogoutBtn.addEventListener('click', handleGoogleLogout);
    }
    
    // Google authenticate button (saves ID first, then redirects)
    if (elements.googleAuthBtn) {
        elements.googleAuthBtn.addEventListener('click', async () => {
            const settingsPayload = {
                ...state.settings,
                calendar_id: elements.calendarIdInput.value
            };
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settingsPayload)
                });
                const data = await res.json();
                if (data.success) {
                    window.location.href = '/api/auth/google';
                } else {
                    showToast('Failed to save Calendar ID before authentication', 'error');
                }
            } catch (e) {
                showToast('Network error saving settings', 'error');
            }
        });
    }

    // Format selection dropdown in settings
    if (elements.settingsFormatSelect) {
        elements.settingsFormatSelect.addEventListener('change', (e) => {
            loadFormatDetails(e.target.value);
        });
    }

    // Create format template button in settings
    if (elements.createFormatBtn) {
        elements.createFormatBtn.addEventListener('click', () => {
            const newName = prompt('Enter a name for the new email format template:');
            if (!newName) return;
            const trimmed = newName.trim();
            if (!trimmed) return;
            
            const exists = state.formats.some(f => f.name.toLowerCase() === trimmed.toLowerCase());
            if (exists) {
                showToast('A format template with that name already exists.', 'error');
                return;
            }
            
            elements.templateNameInput.value = trimmed;
            elements.templateSubject.value = '';
            elements.templateBody.value = '';
            elements.setDefaultFormatCheckbox.checked = false;
            originalFormatName = '';
            
            showToast(`Template layout created: "${trimmed}". Customize subject & body below and click Save.`, 'info');
        });
    }

    // Delete format template button in settings
    if (elements.deleteFormatBtn) {
        elements.deleteFormatBtn.addEventListener('click', async () => {
            const currentName = elements.settingsFormatSelect.value;
            if (!currentName) return;
            
            if (state.formats.length <= 1) {
                showToast('You must keep at least one email format template.', 'error');
                return;
            }
            
            if (!confirm(`Are you sure you want to permanently delete the template format "${currentName}"?`)) {
                return;
            }
            
            try {
                const res = await fetch(`/api/formats/${encodeURIComponent(currentName)}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('Template format deleted successfully.', 'success');
                    await fetchSettings();
                } else {
                    showToast(data.error || 'Failed to delete template format', 'error');
                }
            } catch (e) {
                showToast('Network error deleting format template', 'error');
            }
        });
    }

    // Format selection dropdown in event modal
    if (elements.modalFormatSelect) {
        elements.modalFormatSelect.addEventListener('change', async (e) => {
            const selectedFormatName = e.target.value;
            if (!selectedFormatName) return;
            
            if (!state.currentEvent) return;
            
            if (!confirm('Changing the format will overwrite your current subject and body draft. Do you want to continue?')) {
                elements.modalFormatSelect.value = "";
                return;
            }
            
            const selectedFmt = state.formats.find(f => f.name === selectedFormatName);
            if (!selectedFmt) return;
            
            const eventData = {
                ...state.currentEvent,
                name: elements.modalInputTitle.value,
                participant_first_name: elements.modalInputFirst.value,
                participant_last_name: elements.modalInputLast.value,
                participant_email: elements.modalInputEmail.value,
            };
            
            const placeholderData = {
                first_name: eventData.participant_first_name,
                last_name: eventData.participant_last_name,
                event_name: eventData.name,
                event_date: eventData.date_display,
                event_time: eventData.time_display,
                email: eventData.participant_email,
                event_day: eventData.event_day,
                week_day: eventData.week_day,
                event_month: eventData.event_month,
                event_time_24h: eventData.event_time_24h
            };
            
            try {
                const res = await fetch('/api/formats/compile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subject_template: selectedFmt.subject_template,
                        body_template: selectedFmt.body_template,
                        event_data: placeholderData
                    })
                });
                const data = await res.json();
                
                elements.modalInputSubject.value = data.compiled_subject;
                elements.modalInputBody.value = data.compiled_body;
                showToast(`Template "${selectedFormatName}" applied successfully!`, 'success');
            } catch (err) {
                showToast('Failed to compile template', 'error');
            }
        });
    }

    // Upcoming Event Day Filtering Listeners
    if (elements.filterDaysToggle) {
        elements.filterDaysToggle.addEventListener('change', renderUpcomingGrid);
    }
    if (elements.filterDaysSelect) {
        elements.filterDaysSelect.addEventListener('change', () => {
            if (elements.filterDaysToggle && elements.filterDaysToggle.checked) {
                renderUpcomingGrid();
            }
        });
    }

    // Modal Delete Draft button
    if (elements.modalDeleteBtn) {
        elements.modalDeleteBtn.addEventListener('click', async () => {
            if (!state.currentEvent) return;
            if (confirm('Are you sure you want to move this event draft to the trash?')) {
                await deleteEvent(state.currentEvent.event_id);
                closeEventModal();
            }
        });
    }

    // Modal Restore Draft button
    if (elements.modalRestoreBtn) {
        elements.modalRestoreBtn.addEventListener('click', async () => {
            if (!state.currentEvent) return;
            await restoreEvent(state.currentEvent.event_id);
            closeEventModal();
        });
    }

    // Reset Dashboard Data button
    if (elements.resetAllBtn) {
        elements.resetAllBtn.addEventListener('click', async () => {
            if (confirm('⚠️ DANGER: Are you absolutely sure you want to reset all dashboard data?\n\nThis will permanently delete all upcoming draft events, sent emails logs, and trash. Your SMTP configuration settings will be preserved. This action CANNOT be undone!')) {
                try {
                    const res = await fetch('/api/settings/reset', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        showToast(data.message, 'success');
                        document.querySelector('.tab-btn[data-tab="upcoming"]').click();
                    } else {
                        showToast('Reset failed', 'error');
                    }
                } catch (e) {
                    showToast('Network error resetting database', 'error');
                }
            }
        });
    }
    
    // Fetch initial workspace dashboard data
    fetchEvents();
    fetchAuthStatus();
    
    // Auto-update calendar auth status every 30 seconds
    setInterval(fetchAuthStatus, 30000);
});
