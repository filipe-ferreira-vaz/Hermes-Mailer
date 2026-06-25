import sqlite3
import os
import json

DB_FILE = 'hermes.db'

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables and default settings."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    
    # Events table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            description TEXT,
            participant_first_name TEXT,
            participant_last_name TEXT,
            participant_email TEXT,
            email_subject TEXT,
            email_body TEXT,
            status TEXT DEFAULT 'draft',
            sent_at TEXT,
            is_customized INTEGER DEFAULT 0,
            event_day TEXT,
            week_day TEXT,
            event_month TEXT,
            event_time_24h TEXT
        )
    ''')
    
    # Email Formats table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS email_formats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            subject_template TEXT NOT NULL,
            body_template TEXT NOT NULL
        )
    ''')
    
    # Run migrations for existing databases that were initialized before
    new_cols = [
        ('event_day', 'TEXT'),
        ('week_day', 'TEXT'),
        ('event_month', 'TEXT'),
        ('event_time_24h', 'TEXT')
    ]
    for col_name, col_type in new_cols:
        try:
            cursor.execute(f"ALTER TABLE events ADD COLUMN {col_name} {col_type}")
        except sqlite3.OperationalError:
            # Column already exists
            pass
            
    # Insert default settings if they do not exist
    default_settings = {
        'calendar_id': 'primary',
        'smtp_host': 'smtp.gmail.com',
        'smtp_port': '587',
        'smtp_user': '',
        'smtp_pass': '',
        'smtp_use_tls': '1',
        'default_format_name': 'Default Reminder'
    }
    
    for key, val in default_settings.items():
        cursor.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (key, val))
        
    # Check if we need to seed email_formats
    cursor.execute('SELECT COUNT(*) FROM email_formats')
    count = cursor.fetchone()[0]
    if count == 0:
        # Check if we have legacy templates in settings to migrate
        cursor.execute("SELECT value FROM settings WHERE key = 'email_subject_template'")
        legacy_subj_row = cursor.fetchone()
        cursor.execute("SELECT value FROM settings WHERE key = 'email_body_template'")
        legacy_body_row = cursor.fetchone()
        
        subj_val = legacy_subj_row[0] if legacy_subj_row else 'Reminder: {event_name} on {event_day} de {event_month} ({week_day})'
        body_val = legacy_body_row[0] if legacy_body_row else (
            "Dear {first_name} {last_name},\n\n"
            "This is a friendly reminder for your upcoming event: {event_name}.\n"
            "It is scheduled on {week_day}, {event_day} de {event_month} at {event_time_24h}.\n\n"
            "We look forward to seeing you!\n\n"
            "Best regards,\n"
            "Event Staff"
        )
        
        cursor.execute('''
            INSERT INTO email_formats (name, subject_template, body_template)
            VALUES (?, ?, ?)
        ''', ('Default Reminder', subj_val, body_val))
        
    conn.commit()
    conn.close()

def reset_db():
    """Wipe all events data (upcoming, sent, deleted)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM events')
    conn.commit()
    conn.close()

# Settings Helpers
def get_setting(key, default=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else default

def get_all_settings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT key, value FROM settings')
    rows = cursor.fetchall()
    conn.close()
    return {row['key']: row['value'] for row in rows}

def save_setting(key, value):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(value)))
    conn.commit()
    conn.close()

def save_settings(settings_dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    for key, val in settings_dict.items():
        cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(val)))
    conn.commit()
    conn.close()

# Events Helpers
def get_all_events(status=None):
    """Retrieve events ordered chronologically by start time."""
    conn = get_db_connection()
    cursor = conn.cursor()
    if status:
        cursor.execute('SELECT * FROM events WHERE status = ? ORDER BY start_time ASC', (status,))
    else:
        cursor.execute('SELECT * FROM events ORDER BY start_time ASC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_event(event_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM events WHERE event_id = ?', (event_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def insert_event(event_data):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO events (
            event_id, name, start_time, description, 
            participant_first_name, participant_last_name, participant_email, 
            email_subject, email_body, status, sent_at, is_customized,
            event_day, week_day, event_month, event_time_24h
        ) VALUES (
            :event_id, :name, :start_time, :description, 
            :participant_first_name, :participant_last_name, :participant_email, 
            :email_subject, :email_body, :status, :sent_at, :is_customized,
            :event_day, :week_day, :event_month, :event_time_24h
        )
    ''', event_data)
    conn.commit()
    conn.close()

def update_event(event_id, data):
    """Update event fields and mark as customized if draft fields are modified."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # We build the update query dynamically
    fields = []
    values = []
    for k, v in data.items():
        fields.append(f"{k} = ?")
        values.append(v)
    
    values.append(event_id)
    query = f"UPDATE events SET {', '.join(fields)} WHERE event_id = ?"
    
    cursor.execute(query, tuple(values))
    conn.commit()
    conn.close()

def delete_event(event_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM events WHERE event_id = ?', (event_id,))
    conn.commit()
    conn.close()

# Email Formats Helpers
def get_all_formats():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM email_formats ORDER BY name ASC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_format(name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM email_formats WHERE name = ?', (name,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def save_format(name, subject, body, original_name=None):
    """
    Inserts or updates an email format.
    If original_name is provided and is different from name, we rename/update the record.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if original_name and original_name != name:
        cursor.execute('''
            UPDATE email_formats
            SET name = ?, subject_template = ?, body_template = ?
            WHERE name = ?
        ''', (name, subject, body, original_name))
    else:
        cursor.execute('''
            INSERT INTO email_formats (name, subject_template, body_template)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                subject_template = excluded.subject_template,
                body_template = excluded.body_template
        ''', (name, subject, body))
        
    conn.commit()
    conn.close()

def delete_format(name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM email_formats WHERE name = ?', (name,))
    conn.commit()
    conn.close()
