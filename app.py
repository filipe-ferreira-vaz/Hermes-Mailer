import os
import sys
from datetime import datetime, timezone
from flask import Flask, request, jsonify, render_template, redirect, session, url_for
import webbrowser
import threading
from werkzeug.utils import secure_filename
from google_auth_oauthlib.flow import Flow

# Allow OAuth callback over HTTP for local dashboard
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

import db
import calendar_helper
import email_sender

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Initialize database on startup
db.init_db()

# Google OAuth2 configurations
REDIRECT_URI = 'http://127.0.0.1.nip.io:5000/oauth2callback'

@app.route('/')
def index():
    return render_template('index.html')

# OAuth API Endpoints
@app.route('/api/auth/status')
def auth_status():
    credentials_exists = os.path.exists('credentials.json')
    authenticated = calendar_helper.is_authenticated()
    return jsonify({
        'credentials_exists': credentials_exists,
        'authenticated': authenticated
    })

@app.route('/api/auth/google')
def auth_google():
    if not os.path.exists('credentials.json'):
        return jsonify({'error': 'credentials.json is missing. Please upload it first.'}), 400
        
    flow = Flow.from_client_secrets_file(
        'credentials.json',
        scopes=calendar_helper.SCOPES,
        redirect_uri=REDIRECT_URI
    )
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )
    
    session['oauth_state'] = state
    return redirect(authorization_url)

@app.route('/oauth2callback')
def oauth2callback():
    state = session.get('oauth_state')
    flow = Flow.from_client_secrets_file(
        'credentials.json',
        scopes=calendar_helper.SCOPES,
        state=state,
        redirect_uri=REDIRECT_URI
    )
    
    # Fetch token
    flow.fetch_token(authorization_response=request.url)
    credentials = flow.credentials
    
    # Save credentials
    with open('token.json', 'w') as token_file:
        token_file.write(credentials.to_json())
        
    return redirect('/')

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    if os.path.exists('token.json'):
        os.remove('token.json')
    return jsonify({'success': True, 'message': 'Logged out successfully.'})

# Settings API
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'GET':
        settings = db.get_all_settings()
        # Mask password
        if settings.get('smtp_pass'):
            settings['smtp_pass'] = '********'
        return jsonify(settings)
        
    elif request.method == 'POST':
        data = request.json or {}
        
        # Preserve password if masked
        if data.get('smtp_pass') == '********':
            current_settings = db.get_all_settings()
            data['smtp_pass'] = current_settings.get('smtp_pass', '')
            
        db.save_settings(data)
        return jsonify({'success': True, 'message': 'Settings saved successfully.'})

@app.route('/api/settings/upload-credentials', methods=['POST'])
def upload_credentials():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        file.save('credentials.json')
        return jsonify({'success': True, 'message': 'credentials.json uploaded successfully.'})

@app.route('/api/settings/test-smtp', methods=['POST'])
def test_smtp():
    data = request.json or {}
    # Use existing password if masked
    if data.get('smtp_pass') == '********':
        current_settings = db.get_all_settings()
        data['smtp_pass'] = current_settings.get('smtp_pass', '')
        
    success, message = email_sender.test_smtp_connection(data)
    return jsonify({'success': success, 'message': message})

# Events API
@app.route('/api/events', methods=['GET'])
def get_events():
    status = request.args.get('status') # 'draft' or 'sent'
    events = db.get_all_events(status=status)
    
    # Format dates/times nicely for display
    for event in events:
        # Extract date and time strings from Google start_time format
        start_data = {'dateTime': event['start_time']} if 'T' in event['start_time'] else {'date': event['start_time']}
        event_date, event_time = calendar_helper.format_date_time(start_data)
        event['date_display'] = event_date
        event['time_display'] = event_time
        
    return jsonify(events)

@app.route('/api/events/sync', methods=['POST'])
def sync_events():
    success, message = calendar_helper.sync_calendar()
    if success:
        return jsonify({'success': True, 'message': message})
    else:
        return jsonify({'success': False, 'error': message}), 500

@app.route('/api/events/<event_id>', methods=['PUT'])
def update_event_details(event_id):
    existing = db.get_event(event_id)
    if not existing:
        return jsonify({'error': 'Event not found'}), 404
        
    data = request.json or {}
    
    # We want to record that the draft has been customized if the email subject/body or participant details change.
    is_customized = existing['is_customized']
    if any(k in data for k in ['email_subject', 'email_body', 'participant_first_name', 'participant_last_name', 'participant_email']):
        # If changed, mark customized
        is_customized = 1
        
    update_data = {
        'name': data.get('name', existing['name']),
        'start_time': data.get('start_time', existing['start_time']),
        'participant_first_name': data.get('participant_first_name', existing['participant_first_name']),
        'participant_last_name': data.get('participant_last_name', existing['participant_last_name']),
        'participant_email': data.get('participant_email', existing['participant_email']),
        'email_subject': data.get('email_subject', existing['email_subject']),
        'email_body': data.get('email_body', existing['email_body']),
        'is_customized': is_customized,
        'event_day': data.get('event_day', existing.get('event_day', '')),
        'week_day': data.get('week_day', existing.get('week_day', '')),
        'event_month': data.get('event_month', existing.get('event_month', '')),
        'event_time_24h': data.get('event_time_24h', existing.get('event_time_24h', ''))
    }
    
    db.update_event(event_id, update_data)
    return jsonify({'success': True, 'message': 'Event updated successfully.'})

@app.route('/api/events/<event_id>/send', methods=['POST'])
def send_event_email(event_id):
    event = db.get_event(event_id)
    if not event:
        return jsonify({'error': 'Event not found'}), 404
        
    # Get SMTP configuration
    smtp_config = db.get_all_settings()
    
    # Send email
    success, message = email_sender.send_email(
        to_email=event['participant_email'],
        subject=event['email_subject'],
        body=event['email_body'],
        smtp_config=smtp_config
    )
    
    if success:
        now_str = datetime.now(timezone.utc).isoformat()
        db.update_event(event_id, {
            'status': 'sent',
            'sent_at': now_str
        })
        return jsonify({'success': True, 'message': 'Email sent successfully!'})
    else:
        return jsonify({'success': False, 'error': message}), 500

@app.route('/api/events/<event_id>/delete', methods=['POST'])
def delete_event_endpoint(event_id):
    existing = db.get_event(event_id)
    if not existing:
        return jsonify({'error': 'Event not found'}), 404
    db.update_event(event_id, {'status': 'deleted'})
    return jsonify({'success': True, 'message': 'Event moved to trash.'})

@app.route('/api/events/<event_id>/restore', methods=['POST'])
def restore_event_endpoint(event_id):
    existing = db.get_event(event_id)
    if not existing:
        return jsonify({'error': 'Event not found'}), 404
    db.update_event(event_id, {'status': 'draft'})
    return jsonify({'success': True, 'message': 'Event restored to drafts.'})

@app.route('/api/settings/reset', methods=['POST'])
def reset_database_endpoint():
    db.reset_db()
    return jsonify({'success': True, 'message': 'All dashboard events and sent history have been reset.'})

# Email Formats API
@app.route('/api/formats', methods=['GET'])
def get_formats_endpoint():
    formats = db.get_all_formats()
    return jsonify(formats)

@app.route('/api/formats', methods=['POST'])
def save_format_endpoint():
    data = request.json or {}
    name = data.get('name', '').strip()
    subject = data.get('subject_template', '').strip()
    body = data.get('body_template', '').strip()
    original_name = data.get('original_name', '').strip() or None
    
    if not name or not subject or not body:
        return jsonify({'error': 'Format name, subject template, and body template are all required.'}), 400
        
    try:
        db.save_format(name, subject, body, original_name)
        
        # If this is the first format or if we renamed the default format, update default_format_name setting
        default_format = db.get_setting('default_format_name')
        if not default_format or (original_name and default_format == original_name):
            db.save_setting('default_format_name', name)
            
        return jsonify({'success': True, 'message': 'Email format saved successfully.'})
    except Exception as e:
        return jsonify({'error': f'Failed to save format: {str(e)}'}), 500

@app.route('/api/formats/<name>', methods=['DELETE'])
def delete_format_endpoint(name):
    all_formats = db.get_all_formats()
    if len(all_formats) <= 1:
        return jsonify({'error': 'You must keep at least one email format.'}), 400
        
    try:
        db.delete_format(name)
        
        # If we deleted the default format, update default_format_name to another template
        default_format = db.get_setting('default_format_name')
        if default_format == name:
            remaining_formats = db.get_all_formats()
            if remaining_formats:
                db.save_setting('default_format_name', remaining_formats[0]['name'])
                
        return jsonify({'success': True, 'message': 'Email format deleted.'})
    except Exception as e:
        return jsonify({'error': f'Failed to delete format: {str(e)}'}), 500

@app.route('/api/formats/compile', methods=['POST'])
def compile_format_endpoint():
    data = request.json or {}
    subject_template = data.get('subject_template', '')
    body_template = data.get('body_template', '')
    event_data = data.get('event_data', {})
    
    compiled_subject = calendar_helper.compile_template(subject_template, event_data)
    compiled_body = calendar_helper.compile_template(body_template, event_data)
    
    return jsonify({
        'compiled_subject': compiled_subject,
        'compiled_body': compiled_body
    })

def open_browser():
    import tempfile
    lock_path = os.path.join(tempfile.gettempdir(), 'hermes_browser.lock')
    if os.path.exists(lock_path):
        return
    try:
        with open(lock_path, 'w') as f:
            f.write('opened')
    except OSError:
        pass
        
    url = "http://127.0.0.1.nip.io:5000"
    print(f"\nTo open the dashboard, press CTRL + this link: {url}\n")
    webbrowser.open(url)

if __name__ == '__main__':
    # Clean up lock file on fresh startup (parent process)
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        import tempfile
        lock_path = os.path.join(tempfile.gettempdir(), 'hermes_browser.lock')
        if os.path.exists(lock_path):
            try:
                os.remove(lock_path)
            except OSError:
                pass

    # Automatically open browser on start (except reloader double-runs)
    if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        threading.Timer(1.2, open_browser).start()
        
    # Run locally on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
