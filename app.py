import os
import sys
from datetime import datetime, timezone
from flask import Flask, request, jsonify, render_template, redirect, session, url_for
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

if __name__ == '__main__':
    # Run locally on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
