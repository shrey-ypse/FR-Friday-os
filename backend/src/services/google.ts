import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables directly at module load time to prevent empty values in oauth client
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Initialize the Google OAuth2 client using our local credentials
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Generate a secure Google login URL with access to Sheets, Gmail, and Calendar
 */
export function getAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Requests a refresh token so the user stays logged in
    scope: scopes,
    prompt: 'consent' // Forces consent screen so refresh token is returned
  });
}

/**
 * Exchange the authorization code from the frontend redirect callback for tokens
 */
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Create an authenticated Google Sheets client instance
 */
export function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all rows from a Google Sheet range
 */
export async function readSheetData(accessToken: string, sheetId: string, range: string) {
  const sheets = getSheetsClient(accessToken);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range
  });
  return response.data.values || [];
}

/**
 * Append a row of data (e.g. logging a query and AI response) to a Google Sheet
 */
export async function appendRow(accessToken: string, sheetId: string, range: string, values: any[]) {
  const sheets = getSheetsClient(accessToken);
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [values]
    }
  });
  return response.data;
}

/**
 * Send an email via the Gmail API
 */
export async function sendGmail(accessToken: string, to: string, subject: string, body: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  // Construct raw RFC 2822 email format
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    body
  ];
  const message = messageParts.join('\n');

  // Encode the message to Base64URL safe format required by Gmail API
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });
  
  return response.data;
}

/**
 * Fetch calendar events for today
 */
export async function listCalendarEvents(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });

  return response.data.items || [];
}

/**
 * List and fetch recent emails from Gmail
 */
export async function listGmailMessages(accessToken: string, query: string = '') {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  // Retrieve the list of top 5 messages
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 5,
    q: query || undefined
  });

  const messages = response.data.messages || [];
  const detailedMessages = [];

  // Fetch headers and details for each email message
  for (const msg of messages) {
    if (!msg.id) continue;
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
      const snippet = detail.data.snippet || '';

      detailedMessages.push({
        id: msg.id,
        from,
        subject,
        date,
        snippet
      });
    } catch (e: any) {
      console.error(`Error loading email ${msg.id}:`, e.message);
    }
  }

  return detailedMessages;
}

/**
 * Create a new event on the primary Google Calendar
 */
export async function createCalendarEvent(
  accessToken: string,
  summary: string,
  startTime: string,
  endTime: string,
  location?: string,
  description?: string
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      location,
      description,
      start: { dateTime: startTime },
      end: { dateTime: endTime }
    }
  });

  return response.data;
}

/**
 * Perform label operations on a Gmail message (archive, delete, star, read, unread)
 */
export async function modifyGmailMessage(
  accessToken: string,
  messageId: string,
  action: 'archive' | 'delete' | 'star' | 'read' | 'unread'
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  let addLabelIds: string[] = [];
  let removeLabelIds: string[] = [];

  if (action === 'archive') {
    removeLabelIds = ['INBOX'];
  } else if (action === 'delete') {
    await gmail.users.messages.trash({ userId: 'me', id: messageId });
    return { success: true };
  } else if (action === 'star') {
    addLabelIds = ['STARRED'];
  } else if (action === 'read') {
    removeLabelIds = ['UNREAD'];
  } else if (action === 'unread') {
    addLabelIds = ['UNREAD'];
  }

  const response = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds,
      removeLabelIds
    }
  });

  return response.data;
}

/**
 * Create a brand new Google Sheet and return its properties
 */
export async function createSpreadsheet(accessToken: string, title: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title
      }
    }
  });

  return response.data;
}

/**
 * Fetch and decode the full body content (text/plain or text/html) of a specific email
 */
export async function getGmailMessageBody(accessToken: string, messageId: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const payload = response.data.payload;
  if (!payload) return '';

  let body = '';

  // Helper function to recursively search for body text in email payload parts
  function extractBody(part: any) {
    if (part.body && part.body.data) {
      const decoded = Buffer.from(part.body.data, 'base64url').toString('utf8');
      if (part.mimeType === 'text/plain') {
        body = decoded;
      } else if (part.mimeType === 'text/html' && !body) {
        body = decoded;
      }
    }

    if (part.parts) {
      for (const subPart of part.parts) {
        extractBody(subPart);
      }
    }
  }

  extractBody(payload);

  // Fallback to top-level body if parts structure is not present
  if (!body && payload.body && payload.body.data) {
    body = Buffer.from(payload.body.data, 'base64url').toString('utf8');
  }

  // Strip excessive HTML tags to reduce token size before passing to Gemini
  if (body.includes('<body') || body.includes('<div') || body.includes('<p')) {
    body = body.replace(/<style[\s\S]*?<\/style>/gi, '')
               .replace(/<script[\s\S]*?<\/script>/gi, '')
               .replace(/<[^>]+>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
  }

  return body;
}

/**
 * Delete a specific calendar event from Google Calendar
 */
export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId: 'primary',
    eventId
  });
}
