import re
import os
from datetime import datetime, timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

import db

# Scope for Google Calendar (read-only is sufficient)
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def parse_description(description):
    """
    Parses the event description to extract the participant's first and last name, and email address.
    Format expected:
      Participant: [first name] [last name] ([email address])
      Staff: [non important stuff...]
    """
    if not description:
        return "", "", ""
    
    # Matches "Participant: <First Name> <Last Name> (<Email>)"
    # Allows multiple words in name, hyphenated letters, spaces.
    match = re.search(r"Participant:\s*([^\n\(]+)\s*\(([^)]+)\)", description, re.IGNORECASE)
    if match:
        full_name = match.group(1).strip()
        email = match.group(2).strip()
        
        # Split full name into first and last name
        name_parts = full_name.split(maxsplit=1)
        first_name = name_parts[0] if len(name_parts) > 0 else ""
        last_name = name_parts[1] if len(name_parts) > 1 else ""
        
        return first_name, last_name, email
        
    return "", "", ""

def parse_event_name(original_name):
    """
    Parses event names formatted as "[event name] [optional number] - [event name]"
    and extracts only the first part "[event name] [optional number]".
    """
    if not original_name:
        return ""
    if " - " in original_name:
        parts = original_name.split(" - ", 1)
        return parts[0].strip()
    return original_name.strip()

PORTUGUESE_WEEKDAYS = {
    0: "Segunda-feira",
    1: "Terça-feira",
    2: "Quarta-feira",
    3: "Quinta-feira",
    4: "Sexta-feira",
    5: "Sábado",
    6: "Domingo"
}

PORTUGUESE_MONTHS = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Março",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro"
}

def parse_date_time_portuguese(start_data):
    """
    Parses start date/time into:
      - event_day (e.g. "15" or "01")
      - week_day (e.g. "Quarta-feira")
      - event_month (e.g. "Julho")
      - event_time_24h (e.g. "09:30" or "Dia Inteiro")
    Ignoring the year.
    """
    event_day = ""
    week_day = ""
    event_month = ""
    event_time_24h = ""
    
    if not start_data:
        return event_day, week_day, event_month, event_time_24h
        
    if 'dateTime' in start_data:
        dt_str = start_data['dateTime']
        try:
            if dt_str.endswith('Z'):
                dt_str = dt_str[:-1] + '+00:00'
            dt = datetime.fromisoformat(dt_str)
            event_day = dt.strftime("%d")
            week_day = PORTUGUESE_WEEKDAYS[dt.weekday()]
            event_month = PORTUGUESE_MONTHS[dt.month]
            event_time_24h = dt.strftime("%H:%M")
        except Exception as e:
            # Fallback
            parts = dt_str.split('T')
            if len(parts) > 0:
                d_parts = parts[0].split('-')
                if len(d_parts) == 3:
                    event_day = d_parts[2]
            if len(parts) > 1:
                event_time_24h = parts[1][:5]
    elif 'date' in start_data:
        dt_str = start_data['date']
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d")
            event_day = dt.strftime("%d")
            week_day = PORTUGUESE_WEEKDAYS[dt.weekday()]
            event_month = PORTUGUESE_MONTHS[dt.month]
            event_time_24h = "Dia Inteiro"
        except Exception as e:
            d_parts = dt_str.split('-')
            if len(d_parts) == 3:
                event_day = d_parts[2]
            event_time_24h = "Dia Inteiro"
            
    return event_day, week_day, event_month, event_time_24h

def format_date_time(start_data):
    """
    Formats the Google Calendar start date/time into user-friendly date and time strings.
    """
    if not start_data:
        return "", ""
        
    if 'dateTime' in start_data:
        dt_str = start_data['dateTime']
        try:
            # Handle Z suffix for UTC
            if dt_str.endswith('Z'):
                dt_str = dt_str[:-1] + '+00:00'
            dt = datetime.fromisoformat(dt_str)
            date_str = dt.strftime("%Y-%m-%d")
            time_str = dt.strftime("%I:%M %p")
            return date_str, time_str
        except Exception as e:
            # Simple fallback split
            parts = dt_str.split('T')
            d = parts[0]
            t = parts[1][:5] if len(parts) > 1 else ""
            return d, t
    elif 'date' in start_data:
        return start_data['date'], "All Day"
        
    return "", ""

def compile_template(template, data):
    """
    Replaces placeholders like {first_name}, {last_name}, etc., in a template with actual values.
    Supports Portuguese date/time splits as well.
    """
    if not template:
        return ""
        
    placeholders = {
        '{first_name}': data.get('first_name') or '',
        '{last_name}': data.get('last_name') or '',
        '{event_name}': data.get('event_name') or '',
        '{event_date}': data.get('event_date') or '',
        '{event_time}': data.get('event_time') or '',
        '{email}': data.get('email') or '',
        '{event_day}': data.get('event_day') or '',
        '{week_day}': data.get('week_day') or '',
        '{event_month}': data.get('event_month') or '',
        '{event_time_24h}': data.get('event_time_24h') or '',
    }
    
    result = template
    for key, val in placeholders.items():
        result = result.replace(key, str(val))
    return result

def get_calendar_service():
    """Gets Google Calendar API service instance if authorized, otherwise returns None."""
    if not os.path.exists('token.json'):
        return None
    try:
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Save the refreshed credentials
            with open('token.json', 'w') as token:
                token.write(creds.to_json())
        return build('calendar', 'v3', credentials=creds)
    except Exception as e:
        print(f"Error initializing calendar service: {e}")
        return None

def is_authenticated():
    """Check if token.json exists and is valid."""
    service = get_calendar_service()
    return service is not None

def sync_calendar():
    """
    Fetches upcoming events from the configured calendar, parses them, 
    and updates/inserts them in the local database.
    """
    service = get_calendar_service()
    if not service:
        return False, "Not authenticated with Google Calendar"
        
    calendar_id = db.get_setting('calendar_id', 'primary')
    
    # Fetch default email format from formats table
    default_format_name = db.get_setting('default_format_name', 'Default Reminder')
    email_format = db.get_format(default_format_name)
    if not email_format:
        # Fallback to the first available format
        all_formats = db.get_all_formats()
        if all_formats:
            email_format = all_formats[0]
            
    subj_template = email_format['subject_template'] if email_format else ''
    body_template = email_format['body_template'] if email_format else ''
    
    try:
        # Fetch upcoming events starting from now
        now = datetime.now(timezone.utc).isoformat()
        events_result = service.events().list(
            calendarId=calendar_id, 
            timeMin=now,
            maxResults=100, 
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        for item in events:
            event_id = item['id']
            name = item.get('summary', 'Untitled Event')
            start = item.get('start', {})
            description = item.get('description', '')
            
            # Filter and parse name
            parsed_name = parse_event_name(name)
            
            # Format date/time (backward compatibility)
            event_date, event_time = format_date_time(start)
            
            # Parse date/time components in Portuguese
            event_day, week_day, event_month, event_time_24h = parse_date_time_portuguese(start)
            
            # Parse description
            first_name, last_name, participant_email = parse_description(description)
            
            # Check if event already exists in our database
            existing_event = db.get_event(event_id)
            
            template_data = {
                'first_name': first_name,
                'last_name': last_name,
                'event_name': parsed_name,
                'event_date': event_date,
                'event_time': event_time,
                'email': participant_email,
                'event_day': event_day,
                'week_day': week_day,
                'event_month': event_month,
                'event_time_24h': event_time_24h
            }
            
            # Generate email subject/body
            new_subject = compile_template(subj_template, template_data)
            new_body = compile_template(body_template, template_data)
            
            # Start time formatting for DB sorting (we will store start time in ISO format or full date time)
            # Standardizing start_time to ISO format from start dictionary
            start_time_iso = start.get('dateTime') or start.get('date') or ""
            
            if not existing_event:
                # Create a new draft
                db.insert_event({
                    'event_id': event_id,
                    'name': parsed_name,
                    'start_time': start_time_iso,
                    'description': description,
                    'participant_first_name': first_name,
                    'participant_last_name': last_name,
                    'participant_email': participant_email,
                    'email_subject': new_subject,
                    'email_body': new_body,
                    'status': 'draft',
                    'sent_at': None,
                    'is_customized': 0,
                    'event_day': event_day,
                    'week_day': week_day,
                    'event_month': event_month,
                    'event_time_24h': event_time_24h
                })
            else:
                # Update existing event
                status = existing_event['status']
                is_customized = existing_event['is_customized']
                
                # Core calendar fields that can change on Google Calendar
                update_data = {
                    'name': parsed_name,
                    'start_time': start_time_iso,
                    'description': description,
                    'event_day': event_day,
                    'week_day': week_day,
                    'event_month': event_month,
                    'event_time_24h': event_time_24h
                }
                
                if status == 'draft':
                    # If it's a draft and has NOT been customized, update everything (including email/participant names)
                    if is_customized == 0:
                        update_data.update({
                            'participant_first_name': first_name,
                            'participant_last_name': last_name,
                            'participant_email': participant_email,
                            'email_subject': new_subject,
                            'email_body': new_body
                        })
                    # If it has been customized, we preserve user edits to email/participant, 
                    # but update name, time, and description
                    
                db.update_event(event_id, update_data)
                
        return True, f"Successfully synced {len(events)} events"
    except Exception as e:
        return False, f"Failed to fetch calendar events: {str(e)}"
