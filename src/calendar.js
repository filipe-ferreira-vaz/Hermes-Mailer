const { google } = require('googleapis');

const WEEK_DAYS_PT = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Create a Google Calendar API auth client using Service Account credentials.
 */
function getAuth() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar.readonly']
  );
  return auth;
}

/**
 * Fetch all upcoming events from Google Calendar.
 * @returns {Promise<Array>} Array of calendar event objects
 */
async function fetchUpcomingEvents() {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  return response.data.items || [];
}

/**
 * Parse event name from calendar summary.
 * Format: "Event Name - Extra Info" → returns "Event Name"
 * @param {string} summary - Calendar event summary
 * @returns {string} Parsed event name
 */
function parseEventName(summary) {
  if (!summary) return 'Untitled Event';
  const trimmed = summary.trim();
  if (!trimmed) return 'Untitled Event';

  const separatorIndex = trimmed.indexOf(' - ');
  if (separatorIndex !== -1) {
    return trimmed.substring(0, separatorIndex).trim();
  }
  return trimmed;
}

/**
 * Parse participant data from event description.
 * Expected format: "Participant: FirstName LastName (email@example.com)"
 * @param {string} description - Calendar event description
 * @returns {{ firstName: string, lastName: string, email: string }}
 */
function parseDescription(description) {
  if (!description) {
    return { firstName: 'Unknown', lastName: 'Unknown', email: '' };
  }

  // Primary pattern: Participant: FirstName LastName (email)
  const primaryRegex = /Participant:\s*([\w\-À-ÿ]+)\s+([\w\-À-ÿ]+)\s*\(([^)]+)\)/i;
  let match = description.match(primaryRegex);
  if (match) {
    return { firstName: match[1].trim(), lastName: match[2].trim(), email: match[3].trim() };
  }

  // Try with more than two name parts: Participant: First Middle Last (email)
  const extendedRegex = /Participant:\s*([\w\-À-ÿ]+)\s+([\w\-À-ÿ\s]+?)\s*\(([^)]+)\)/i;
  match = description.match(extendedRegex);
  if (match) {
    const nameParts = match[2].trim().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];
    return { firstName: match[1].trim(), lastName: lastName, email: match[3].trim() };
  }

  // Try simpler pattern: just name and email on separate lines or any format
  const emailRegex = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/;
  const emailMatch = description.match(emailRegex);

  const nameRegex = /Participant:\s*(.+)/i;
  const nameMatch = description.match(nameRegex);

  if (nameMatch && emailMatch) {
    const namePart = nameMatch[1].replace(/\(.*\)/, '').trim();
    const parts = namePart.split(/\s+/);
    return {
      firstName: parts[0] || 'Unknown',
      lastName: parts.length > 1 ? parts[parts.length - 1] : 'Unknown',
      email: emailMatch[1].trim()
    };
  }

  if (emailMatch) {
    return { firstName: 'Unknown', lastName: 'Unknown', email: emailMatch[1].trim() };
  }

  return { firstName: 'Unknown', lastName: 'Unknown', email: '' };
}

/**
 * Parse an ISO datetime string into structured date components.
 * @param {string} dateTimeStr - ISO datetime string
 * @returns {{ event_day: string, week_day: string, event_month: string, event_time: string }}
 */
function parseDateTime(dateTimeStr) {
  const date = new Date(dateTimeStr);

  const event_day = String(date.getDate()).padStart(2, '0');
  const week_day = WEEK_DAYS_PT[date.getDay()];
  const event_month = MONTHS_PT[date.getMonth()];
  const event_time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return { event_day, week_day, event_month, event_time };
}

/**
 * Sync Google Calendar events with the local database.
 * CRITICAL: When events are deleted from Calendar and were 'scheduled',
 * also cancel the corresponding Google Sheet email job.
 * @param {object} db - Database operations object
 * @param {object} sheets - Google Sheets operations object
 * @returns {Promise<{ synced: number, newEvents: number, canceled: number }>}
 */
async function syncEvents(db, sheets) {
  try {
    console.log('[Calendar] Starting sync...');

    // 1. Fetch all upcoming events from Google Calendar
    const fetchedEvents = await fetchUpcomingEvents();
    console.log(`[Calendar] Fetched ${fetchedEvents.length} upcoming events from Google Calendar`);

    // 2. Get ALL events from DB for the lookup map (prevents UNIQUE constraint on re-insert)
    const allDbEvents = db.events.getAllByStatus(null);
    // For cancellation detection, only consider active (non-final) events
    const activeDbEvents = allDbEvents.filter(e => e.status === 'pending' || e.status === 'scheduled');

    // 3. Build lookup maps
    const fetchedIds = new Set(fetchedEvents.map(e => e.id));
    const dbEventMap = new Map(allDbEvents.map(e => [e.id, e]));

    let newCount = 0;
    let canceledCount = 0;

    // 4. Process fetched events — add new ones, update changed ones
    for (const calEvent of fetchedEvents) {
      const existingEvent = dbEventMap.get(calEvent.id);

      // Get datetime from event
      const dateTimeStr = calEvent.start.dateTime || (calEvent.start.date + 'T00:00:00');
      const eventName = parseEventName(calEvent.summary);
      const parsedDate = parseDateTime(dateTimeStr);
      const participant = parseDescription(calEvent.description);

      if (!existingEvent) {
        // Truly new event — insert
        db.events.insert({
          id: calEvent.id,
          event_name: eventName,
          first_name: participant.firstName,
          last_name: participant.lastName,
          email: participant.email,
          event_datetime: dateTimeStr,
          event_day: parsedDate.event_day,
          week_day: parsedDate.week_day,
          event_month: parsedDate.event_month,
          event_time: parsedDate.event_time,
          status: 'pending'
        });
        newCount++;
        console.log(`[Calendar] New event added: ${eventName} (${calEvent.id})`);
      } else if (existingEvent.status === 'canceled' || existingEvent.status === 'sent') {
        // Event was previously canceled/sent but reappeared in calendar — reactivate
        db.events.update(calEvent.id, {
          event_name: eventName,
          first_name: participant.firstName,
          last_name: participant.lastName,
          email: participant.email,
          event_datetime: dateTimeStr,
          event_day: parsedDate.event_day,
          week_day: parsedDate.week_day,
          event_month: parsedDate.event_month,
          event_time: parsedDate.event_time,
          status: 'pending',
          email_subject: null,
          email_body: null,
          scheduled_send_at: null,
          sheet_row: null
        });
        newCount++;
        console.log(`[Calendar] Reactivated event: ${eventName} (${calEvent.id}) — was ${existingEvent.status}`);
      } else {
        // Existing active event — check for calendar-side changes
        const updates = {};
        if (eventName !== existingEvent.event_name) {
          updates.event_name = eventName;
        }
        if (dateTimeStr !== existingEvent.event_datetime) {
          updates.event_datetime = dateTimeStr;
          updates.event_day = parsedDate.event_day;
          updates.week_day = parsedDate.week_day;
          updates.event_month = parsedDate.event_month;
          updates.event_time = parsedDate.event_time;
        }

        // Update participant data only if it was previously Unknown
        if (existingEvent.first_name === 'Unknown' || existingEvent.email === '') {
          if (participant.firstName !== 'Unknown') {
            updates.first_name = participant.firstName;
            updates.last_name = participant.lastName;
          }
          if (participant.email) {
            updates.email = participant.email;
          }
        }

        // Apply updates if any (but don't overwrite user-edited email fields)
        if (Object.keys(updates).length > 0) {
          db.events.update(calEvent.id, updates);
          console.log(`[Calendar] Updated event: ${eventName} (${calEvent.id})`);
        }
      }
    }

    // 5. Detect deleted events — only from ACTIVE events (pending + scheduled)
    for (const dbEvent of activeDbEvents) {
      if (!fetchedIds.has(dbEvent.id)) {
        console.log(`[Calendar] Event no longer in calendar: ${dbEvent.event_name} (${dbEvent.id}), status was: ${dbEvent.status}`);

        // CRITICAL: If event was scheduled, also cancel the Sheet email job
        if (dbEvent.status === 'scheduled') {
          try {
            await sheets.cancelEmailJob(dbEvent.id);
            console.log(`[Calendar] CRITICAL: Canceled Sheet email job for deleted scheduled event: ${dbEvent.id}`);
          } catch (sheetErr) {
            console.error(`[Calendar] Failed to cancel Sheet job for ${dbEvent.id}:`, sheetErr.message);
          }
        }

        db.events.updateStatus(dbEvent.id, 'canceled');
        canceledCount++;
      }
    }

    // 6. Update app_state
    db.appState.set('last_sync_time', new Date().toISOString());

    if (canceledCount > 0) {
      const currentCount = parseInt(db.appState.get('new_canceled_count')) || 0;
      db.appState.set('new_canceled_count', String(currentCount + canceledCount));
    }

    console.log(`[Calendar] Sync complete: ${fetchedEvents.length} synced, ${newCount} new, ${canceledCount} canceled`);

    return {
      synced: fetchedEvents.length,
      newEvents: newCount,
      canceled: canceledCount
    };
  } catch (err) {
    console.error('[Calendar] Sync error:', err.message);
    throw err;
  }
}

module.exports = {
  fetchUpcomingEvents,
  parseEventName,
  parseDescription,
  parseDateTime,
  syncEvents
};
