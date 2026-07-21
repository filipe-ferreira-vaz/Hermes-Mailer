const { google } = require('googleapis');

let cachedAuth = null;
let cachedSheetName = null;

/**
 * Get or create the Google Sheets auth client (cached).
 * @returns {google.auth.JWT}
 */
function getAuth() {
  if (cachedAuth) return cachedAuth;

  cachedAuth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  return cachedAuth;
}

/**
 * Get a Google Sheets API instance.
 * @returns {google.sheets}
 */
function getSheetsApi() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Get the Google Sheet ID, auto-sanitizing common mistakes like pasting the full URL.
 * Handles: full URL, URL with /edit?gid=0, or just the ID.
 */
function SHEET_ID() {
  let id = process.env.GOOGLE_SHEET_ID || '';
  // If user pasted a full Google Sheets URL, extract just the ID
  const urlMatch = id.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    id = urlMatch[1];
  } else {
    // Strip any trailing /edit, ?gid=, #gid=, etc.
    id = id.split('/')[0].split('?')[0].split('#')[0];
  }
  return id.trim();
}
const HEADERS = ['event_id', 'to_email', 'subject', 'body', 'send_at', 'status', 'sent_at'];

/**
 * Auto-detect the first sheet tab name (e.g. "Sheet1", "Folha1", "Feuille 1").
 * Caches the result after first call.
 * @returns {Promise<string>} The sheet tab name
 */
async function getSheetName() {
  if (cachedSheetName) return cachedSheetName;

  try {
    const sheets = getSheetsApi();
    const spreadsheetId = SHEET_ID();
    console.log(`[Sheets] Detecting tab name for spreadsheet: ${spreadsheetId}`);
    
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });

    cachedSheetName = meta.data.sheets[0].properties.title;
    console.log(`[Sheets] Detected sheet tab name: "${cachedSheetName}"`);
    return cachedSheetName;
  } catch (err) {
    console.error(`[Sheets] Failed to detect sheet tab name: ${err.message}`);
    console.error(`[Sheets] Check that GOOGLE_SHEET_ID is correct and the Sheet is shared with the service account.`);
    throw err;
  }
}

/**
 * Build a range string like "Folha1!A1:G1" using the auto-detected tab name.
 */
async function range(cells) {
  const name = await getSheetName();
  return `'${name}'!${cells}`;
}

/**
 * Ensure the Google Sheet has the correct headers in row 1.
 */
async function ensureHeaders() {
  try {
    const sheets = getSheetsApi();
    const r = await range('A1:G1');

    // Try to read row 1
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID(),
      range: r,
    });

    const existingHeaders = response.data.values && response.data.values[0];

    // Check if headers match
    if (!existingHeaders || existingHeaders.length === 0 || existingHeaders[0] !== HEADERS[0]) {
      console.log('[Sheets] Writing headers to row 1...');
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID(),
        range: r,
        valueInputOption: 'RAW',
        requestBody: {
          values: [HEADERS],
        },
      });
      console.log('[Sheets] Headers written successfully');
    } else {
      console.log('[Sheets] Headers already present');
    }
  } catch (err) {
    console.error('[Sheets] Error ensuring headers:', err.message);
    throw err;
  }
}

/**
 * Append a new email job row to the Google Sheet.
 * @param {string} eventId - Google Calendar event ID
 * @param {string} toEmail - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} body - Email body HTML
 * @param {string} sendAt - ISO datetime string for when to send
 * @returns {Promise<number>} The row number where the data was written
 */
async function writeEmailJob(eventId, toEmail, subject, body, sendAt) {
  try {
    const sheets = getSheetsApi();
    const r = await range('A:G');

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID(),
      range: r,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[eventId, toEmail, subject, body, sendAt, 'scheduled', '']],
      },
    });

    // Parse the row number from the updatedRange (e.g., "Folha1!A5:G5")
    const updatedRange = response.data.updates.updatedRange;
    const rowMatch = updatedRange.match(/(\d+)/g);
    const rowNumber = rowMatch ? parseInt(rowMatch[rowMatch.length - 1]) : -1;

    console.log(`[Sheets] Email job written for event ${eventId} at row ${rowNumber}`);
    return rowNumber;
  } catch (err) {
    console.error('[Sheets] Error writing email job:', err.message);
    throw err;
  }
}

/**
 * Cancel an email job in the Google Sheet by finding the row with the matching event_id
 * and setting its status to 'canceled'.
 * CRITICAL: This prevents orphaned scheduled emails from being sent by Apps Script
 * when calendar events are deleted.
 * @param {string} eventId - Google Calendar event ID
 * @returns {Promise<boolean>} true if found and canceled, false if not found
 */
async function cancelEmailJob(eventId) {
  try {
    const sheets = getSheetsApi();
    const r = await range('A:G');

    // Read all rows
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID(),
      range: r,
    });

    const rows = response.data.values || [];
    let found = false;
    const sheetName = await getSheetName();

    // Skip header row (index 0), search for matching event_id with status 'scheduled'
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowEventId = row[0]; // Column A: event_id
      const rowStatus = row[5];  // Column F: status

      if (rowEventId === eventId && rowStatus === 'scheduled') {
        // Update status to 'canceled' (row index i+1 because sheets are 1-indexed)
        const rowNumber = i + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID(),
          range: `'${sheetName}'!F${rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['canceled']],
          },
        });

        console.log(`[Sheets] Canceled email job for event ${eventId} at row ${rowNumber}`);
        found = true;
      }
    }

    if (!found) {
      console.log(`[Sheets] No scheduled email job found for event ${eventId}`);
    }

    return found;
  } catch (err) {
    console.error('[Sheets] Error canceling email job:', err.message);
    throw err;
  }
}

/**
 * Sync sent status from Google Sheet back to the local database.
 * When Apps Script sends an email and marks the Sheet row as 'sent',
 * this function updates the corresponding DB records.
 * @param {object} db - Database operations object
 */
async function syncSentStatus(db) {
  try {
    const sheets = getSheetsApi();
    const r = await range('A:G');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID(),
      range: r,
    });

    const rows = response.data.values || [];
    let updatedCount = 0;

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const eventId = row[0];   // Column A: event_id
      const status = row[5];    // Column F: status

      if (status === 'sent' && eventId) {
        const dbEvent = db.events.getById(eventId);
        if (dbEvent && dbEvent.status === 'scheduled') {
          db.events.updateStatus(eventId, 'sent');
          updatedCount++;
          console.log(`[Sheets] Synced sent status for event ${eventId}`);
        }
      }
    }

    if (updatedCount > 0) {
      console.log(`[Sheets] Synced ${updatedCount} sent status updates from Sheet`);
    }
  } catch (err) {
    console.error('[Sheets] Error syncing sent status:', err.message);
    throw err;
  }
}

/**
 * Clear all data rows from the Google Sheet (keep headers).
 * Used during database reset.
 */
async function clearAllJobs() {
  try {
    const sheets = getSheetsApi();
    const r = await range('A2:G');

    // Clear everything after the header row
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID(),
      range: r,
    });

    console.log('[Sheets] All email jobs cleared from Sheet');
  } catch (err) {
    console.error('[Sheets] Error clearing all jobs:', err.message);
    throw err;
  }
}

module.exports = {
  ensureHeaders,
  writeEmailJob,
  cancelEmailJob,
  syncSentStatus,
  clearAllJobs
};
