import unittest
import sqlite3
import os
import re
from datetime import datetime

# Inject temporary DB file for testing
import db
db.DB_FILE = 'test_hermes.db'

import calendar_helper

class TestHermesDashboard(unittest.TestCase):
    
    def setUp(self):
        # Initialize test database
        if os.path.exists('test_hermes.db'):
            os.remove('test_hermes.db')
        db.init_db()
        
    def tearDown(self):
        # Clean up test database
        if os.path.exists('test_hermes.db'):
            try:
                os.remove('test_hermes.db')
            except OSError:
                pass

    def test_description_parsing(self):
        # Case 1: Standard Description
        desc1 = "Participant: John Doe (john.doe@example.com)\nStaff: Need materials"
        fn, ln, email = calendar_helper.parse_description(desc1)
        self.assertEqual(fn, "John")
        self.assertEqual(ln, "Doe")
        self.assertEqual(email, "john.doe@example.com")
        
        # Case 2: Hyphenated Names
        desc2 = "Participant: Jane-Marie Smith-Jones (jane.smith@school.edu)\nStaff: None"
        fn, ln, email = calendar_helper.parse_description(desc2)
        self.assertEqual(fn, "Jane-Marie")
        self.assertEqual(ln, "Smith-Jones")
        self.assertEqual(email, "jane.smith@school.edu")
        
        # Case 3: Multiple names / spaces
        desc3 = "Participant: Robert Downey Jr. (robert.jr@marvel.com)\nStaff: VIP"
        fn, ln, email = calendar_helper.parse_description(desc3)
        self.assertEqual(fn, "Robert")
        self.assertEqual(ln, "Downey Jr.")
        self.assertEqual(email, "robert.jr@marvel.com")
        
        # Case 4: No Match
        desc4 = "Random description text with no participant details"
        fn, ln, email = calendar_helper.parse_description(desc4)
        self.assertEqual(fn, "")
        self.assertEqual(ln, "")
        self.assertEqual(email, "")
        
        # Case 5: Empty input
        fn, ln, email = calendar_helper.parse_description(None)
        self.assertEqual(fn, "")
        self.assertEqual(ln, "")
        self.assertEqual(email, "")

    def test_date_time_formatting(self):
        # Case 1: Full ISO string with offset
        start1 = {'dateTime': '2026-07-15T09:30:00-07:00'}
        d, t = calendar_helper.format_date_time(start1)
        self.assertEqual(d, "2026-07-15")
        self.assertEqual(t, "09:30 AM")
        
        # Case 2: Full ISO string with UTC Z
        start2 = {'dateTime': '2026-07-15T14:45:00Z'}
        d, t = calendar_helper.format_date_time(start2)
        self.assertEqual(d, "2026-07-15")
        self.assertEqual(t, "02:45 PM")
        
        # Case 3: All-day event
        start3 = {'date': '2026-08-01'}
        d, t = calendar_helper.format_date_time(start3)
        self.assertEqual(d, "2026-08-01")
        self.assertEqual(t, "All Day")

    def test_template_compilation(self):
        template = "Hi {first_name} {last_name}, your event {event_name} is on {event_date} at {event_time}. Contact {email}."
        data = {
            'first_name': 'Alice',
            'last_name': 'Smith',
            'event_name': 'Orientation',
            'event_date': '2026-09-01',
            'event_time': '10:00 AM',
            'email': 'alice@example.com'
        }
        compiled = calendar_helper.compile_template(template, data)
        expected = "Hi Alice Smith, your event Orientation is on 2026-09-01 at 10:00 AM. Contact alice@example.com."
        self.assertEqual(compiled, expected)
        
        # Verify safety with missing placeholders in data
        template_incomplete = "Hello {first_name} {non_existent_var}"
        compiled_incomplete = calendar_helper.compile_template(template_incomplete, data)
        self.assertEqual(compiled_incomplete, "Hello Alice {non_existent_var}")

    def test_database_settings(self):
        # Read defaults
        smtp_host = db.get_setting('smtp_host')
        self.assertEqual(smtp_host, 'smtp.gmail.com')
        
        # Save & Retrieve custom
        db.save_setting('test_key', 'test_value')
        self.assertEqual(db.get_setting('test_key'), 'test_value')
        
        # Save dict
        settings_dict = {
            'smtp_host': 'smtp.mailgun.org',
            'smtp_port': '465',
            'custom_flag': 'yes'
        }
        db.save_settings(settings_dict)
        all_settings = db.get_all_settings()
        self.assertEqual(all_settings['smtp_host'], 'smtp.mailgun.org')
        self.assertEqual(all_settings['smtp_port'], '465')
        self.assertEqual(all_settings['custom_flag'], 'yes')

    def test_database_events(self):
        # Insert test event
        event_id = 'evt_123456'
        db.insert_event({
            'event_id': event_id,
            'name': 'Test Event',
            'start_time': '2026-07-15T09:30:00-07:00',
            'description': 'Participant: Tim Tester (tim@test.com)',
            'participant_first_name': 'Tim',
            'participant_last_name': 'Tester',
            'participant_email': 'tim@test.com',
            'email_subject': 'Reminder',
            'email_body': 'Hello Tim',
            'status': 'draft',
            'sent_at': None,
            'is_customized': 0,
            'event_day': '15',
            'week_day': 'Quarta-feira',
            'event_month': 'Julho',
            'event_time_24h': '09:30'
        })
        
        evt = db.get_event(event_id)
        self.assertIsNotNone(evt)
        self.assertEqual(evt['name'], 'Test Event')
        self.assertEqual(evt['participant_first_name'], 'Tim')
        self.assertEqual(evt['event_day'], '15')
        self.assertEqual(evt['week_day'], 'Quarta-feira')
        self.assertEqual(evt['event_month'], 'Julho')
        self.assertEqual(evt['event_time_24h'], '09:30')
        
        # Update event
        db.update_event(event_id, {
            'name': 'Updated Title',
            'is_customized': 1
        })
        
        updated_evt = db.get_event(event_id)
        self.assertEqual(updated_evt['name'], 'Updated Title')
        self.assertEqual(updated_evt['is_customized'], 1)
        
        # Fetch drafts vs sent
        drafts = db.get_all_events(status='draft')
        self.assertEqual(len(drafts), 1)
        
        sents = db.get_all_events(status='sent')
        self.assertEqual(len(sents), 0)

    def test_event_name_parsing(self):
        # Case 1: Standard event name format with hyphen
        self.assertEqual(calendar_helper.parse_event_name("Tennis Practice 3 - Tennis Practice"), "Tennis Practice 3")
        self.assertEqual(calendar_helper.parse_event_name("Meeting - Meeting"), "Meeting")
        
        # Case 2: Event name with no hyphen
        self.assertEqual(calendar_helper.parse_event_name("Guitar Class 2"), "Guitar Class 2")
        
        # Case 3: Empty string
        self.assertEqual(calendar_helper.parse_event_name(None), "")
        self.assertEqual(calendar_helper.parse_event_name(""), "")

    def test_date_time_portuguese_parsing(self):
        # Case 1: ISO string (2026-07-15 is Wednesday -> Quarta-feira, 7 is July -> Julho)
        start1 = {'dateTime': '2026-07-15T09:30:00-07:00'}
        day, wday, month, time24 = calendar_helper.parse_date_time_portuguese(start1)
        self.assertEqual(day, "15")
        self.assertEqual(wday, "Quarta-feira")
        self.assertEqual(month, "Julho")
        self.assertEqual(time24, "09:30")
        
        # Case 2: All day event (2026-06-25 is Thursday -> Quinta-feira, 6 is June -> Junho)
        start2 = {'date': '2026-06-25'}
        day, wday, month, time24 = calendar_helper.parse_date_time_portuguese(start2)
        self.assertEqual(day, "25")
        self.assertEqual(wday, "Quinta-feira")
        self.assertEqual(month, "Junho")
        self.assertEqual(time24, "Dia Inteiro")

    def test_database_reset(self):
        # Insert event
        db.insert_event({
            'event_id': 'evt_999',
            'name': 'Event To Delete',
            'start_time': '2026-07-15T09:30:00-07:00',
            'description': '',
            'participant_first_name': '',
            'participant_last_name': '',
            'participant_email': '',
            'email_subject': '',
            'email_body': '',
            'status': 'draft',
            'sent_at': None,
            'is_customized': 0,
            'event_day': '',
            'week_day': '',
            'event_month': '',
            'event_time_24h': ''
        })
        self.assertEqual(len(db.get_all_events()), 1)
        
        # Reset database
        db.reset_db()
        self.assertEqual(len(db.get_all_events()), 0)

if __name__ == '__main__':
    unittest.main()
