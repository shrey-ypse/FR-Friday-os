import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  readSheetData, 
  appendRow, 
  sendGmail, 
  listCalendarEvents, 
  listGmailMessages,
  createCalendarEvent,
  modifyGmailMessage,
  createSpreadsheet,
  getGmailMessageBody
} from './google';
import { readWorkspaceFile, writeWorkspaceFile, listWorkspaceFiles } from './files';
import { saveMemory, searchMemory } from './memory';
import dotenv from 'dotenv';
import path from 'path';

import { emitLog } from './logger';

// Load env variables directly at module load time to prevent empty API key
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Define the system instructions that give FRIDAY her personality and system directives
const SYSTEM_INSTRUCTION = `
You are FRIDAY, a calm, professional, and highly intelligent personal AI operating system inspired by Iron Man's assistant.
- Address the user respectfully as "Boss" or "Sir" (e.g., "Yes, Boss", "Online and ready, Sir").
- Be concise, efficient, and direct. Eliminate conversational filler, pleasantries, and unnecessary intros/outros.
- The current year is 2026.

[SENIOR COCKPIT EXECUTION DIRECTIVES]

1. TECHNICAL & CODING TASKS:
   - Provide production-grade, modular, typed, and well-structured code.
   - Minimize inline comments; explain only high-level architecture or non-trivial algorithmic decisions.
   - Avoid generic tutorials or explanations of basic concepts unless explicitly requested.
   - Write robust code considering edge cases, error handling, and performance.

2. MATH & LOGICAL REASONING:
   - Solve step-by-step from first principles when reasoning is requested.
   - Present final mathematical values with high precision.
   - Explicitly declare any assumptions made for ambiguous parameters.

3. WORKSPACE TOOL INTEGRATION & DECISION MATRIX:
   - You have access to tools for Gmail, Google Calendar, and Google Sheets.
   - Do not speculate or simulate data if a tool is active—always query the tool to obtain source-of-truth workspace data.
   - When executing tool calls:
     * Dates/Times: Carefully compute ISO-8601 timestamps using the reference timestamp provided.
     * Gmail: Ensure recipient email addresses are valid. For body content, use professional HTML styling.
     * Sheets: If writing logs, ensure all fields are formatted properly.
   - If workspace tools are de-authorized or disabled for the session, politely explain that the action requires Workspace Mode authorization and guide the user on how to enable it.
`;

// Parse multiple comma-separated keys if provided in GEMINI_API_KEY
const getApiKeys = (): string[] => {
  const envKey = process.env.GEMINI_API_KEY || '';
  return envKey.split(',').map(k => k.trim()).filter(Boolean);
};

let activeKeyIndex = 0;

interface ChatWrapper {
  chat: any;
  dynamicInstruction: string;
  tools: any;
}

/**
 * Helper function to send messages to Gemini with automatic API key rotation and exponential backoff
 */
async function sendMessageWithRetry(wrapper: ChatWrapper, payload: any, retries: number = 3, delayMs: number = 2000): Promise<any> {
  const keys = getApiKeys();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await wrapper.chat.sendMessage(payload);
      return result;
    } catch (error: any) {
      const isRateLimit = error.message?.includes('429') || 
                          error.message?.includes('Quota exceeded') ||
                          error.message?.includes('Too Many Requests');
      
      if (isRateLimit) {
        if (attempt === retries) {
          emitLog('error', `Gemini API quota limits exhausted. All ${retries} attempts failed.`);
          throw error;
        }

        if (keys.length > 1) {
          activeKeyIndex = (activeKeyIndex + 1) % keys.length;
          emitLog('warning', `Gemini rate limit hit. Rotating API key to index ${activeKeyIndex}...`);
          
          try {
            const currentHistory = await wrapper.chat.getHistory();
            const nextClient = new GoogleGenerativeAI(keys[activeKeyIndex]);
            const nextModel = nextClient.getGenerativeModel({
              model: 'gemini-2.5-flash',
              systemInstruction: wrapper.dynamicInstruction,
              tools: [wrapper.tools as any]
            });
            wrapper.chat = nextModel.startChat({ history: currentHistory });
            
            // Add a short delay to prevent thrashing multiple keys in milliseconds
            await new Promise(resolve => setTimeout(resolve, 500));
            delayMs = 1000; // Reset backoff since we rotated to a fresh key
            continue;
          } catch (rebuildError: any) {
            console.error('[FRIDAY Keypool] Failed to rebuild chat during rotation:', rebuildError.message);
          }
        }
        
        emitLog('warning', `Quota limit hit. Retrying attempt ${attempt}/${retries} in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // exponential backoff
        continue;
      }
      throw error;
    }
  }
}

/**
 * Local filesystem and memory tool schemas
 */
const localTools = {
  functionDeclarations: [
    {
      name: 'readWorkspaceFile',
      description: 'Read the contents of a text file inside your local workspace directory.',
      parameters: {
        type: 'OBJECT',
        properties: {
          filename: { type: 'STRING', description: 'The relative path or name of the file to read.' }
        },
        required: ['filename']
      }
    },
    {
      name: 'writeWorkspaceFile',
      description: 'Create or overwrite a file inside your local workspace directory with the given text content.',
      parameters: {
        type: 'OBJECT',
        properties: {
          filename: { type: 'STRING', description: 'The relative path or name of the file to write.' },
          content: { type: 'STRING', description: 'The full text content to write inside the file.' }
        },
        required: ['filename', 'content']
      }
    },
    {
      name: 'listWorkspaceFiles',
      description: 'List the filenames of all files present inside the local workspace directory.',
      parameters: {
        type: 'OBJECT',
        properties: {}
      }
    },
    {
      name: 'saveMemory',
      description: 'Save an important piece of context, note, or preference to your local long-term vector memory database.',
      parameters: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'The text snippet or note to remember.' }
        },
        required: ['text']
      }
    },
    {
      name: 'searchMemory',
      description: 'Search your local long-term vector memory database for matching past context or notes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'The query to match past notes/memories against.' }
        },
        required: ['query']
      }
    }
  ]
};

/**
 * Configure the spreadsheet, email, and calendar tools that Gemini can call autonomously
 */
const assistantTools = {
  functionDeclarations: [
    ...localTools.functionDeclarations,
    {
      name: 'readSheet',
      description: 'Read rows of data from the connected Google Sheet.',
      parameters: {
        type: 'OBJECT',
        properties: {
          range: {
            type: 'STRING',
            description: 'The sheet range to read, e.g. "Sheet1!A1:D10" or "Sheet1!A:D"'
          }
        },
        required: ['range']
      }
    },
    {
      name: 'addLogToSheet',
      description: 'Append a new log entry (row) of data to the Google Sheet.',
      parameters: {
        type: 'OBJECT',
        properties: {
          userQuery: { type: 'STRING', description: 'The query/question the user asked.' },
          aiResponse: { type: 'STRING', description: 'The response given by the AI.' },
          status: { type: 'STRING', description: 'Task status, e.g., "Success", "Pending", "Completed"' }
        },
        required: ['userQuery', 'aiResponse', 'status']
      }
    },
    {
      name: 'sendGmail',
      description: 'Send an email to a recipient using the Gmail API.',
      parameters: {
        type: 'OBJECT',
        properties: {
          to: { type: 'STRING', description: 'The recipient email address.' },
          subject: { type: 'STRING', description: 'The subject line of the email.' },
          body: { type: 'STRING', description: 'The body content of the email (HTML is supported).' }
        },
        required: ['to', 'subject', 'body']
      }
    },
    {
      name: 'listCalendarEvents',
      description: 'Fetch the list of meetings and events scheduled on the calendar for today.',
      parameters: {
        type: 'OBJECT',
        properties: {}
      }
    },
    {
      name: 'listGmailMessages',
      description: 'Fetch recent emails and search the inbox for messages.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'Optional search query, e.g. "from:Amazon" or "invoices"'
          }
        }
      }
    },
    {
      name: 'getGmailMessageBody',
      description: 'Retrieve the full text content/body of a specific email by its message ID.',
      parameters: {
        type: 'OBJECT',
        properties: {
          messageId: { type: 'STRING', description: 'The unique message ID of the email.' }
        },
        required: ['messageId']
      }
    },
    {
      name: 'createCalendarEvent',
      description: 'Schedule a new calendar event or meeting.',
      parameters: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING', description: 'Title or summary of the meeting.' },
          startTime: { type: 'STRING', description: 'Meeting start time in ISO-8601 format, e.g. "2026-06-29T10:00:00+05:30"' },
          endTime: { type: 'STRING', description: 'Meeting end time in ISO-8601 format, e.g. "2026-06-29T11:00:00+05:30"' },
          location: { type: 'STRING', description: 'Optional location.' },
          description: { type: 'STRING', description: 'Optional description/details.' }
        },
        required: ['summary', 'startTime', 'endTime']
      }
    },
    {
      name: 'modifyGmailMessage',
      description: 'Manage a Gmail message by archiving, deleting, starring, or marking it read/unread.',
      parameters: {
        type: 'OBJECT',
        properties: {
          messageId: { type: 'STRING', description: 'The unique Gmail message ID.' },
          action: {
            type: 'STRING',
            description: 'The action to perform.',
            enum: ['archive', 'delete', 'star', 'read', 'unread']
          }
        },
        required: ['messageId', 'action']
      }
    },
    {
      name: 'createSpreadsheet',
      description: 'Create a brand new Google Sheets spreadsheet.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'The title of the new spreadsheet.' }
        },
        required: ['title']
      }
    }
  ]
};

/**
 * Execute the chat request, handling any tool calls automatically
 */
export async function chatWithFriday(
  message: string,
  history: any[] = [],
  googleAccessToken?: string,
  mode: 'workspace' | 'generic' = 'workspace'
) {
  // Inject the current timestamp dynamically to maintain relative time consistency
  const currentTimestamp = new Date();
  const dynamicInstruction = `${SYSTEM_INSTRUCTION}
  
- CONSTRAINTS & TIME SYNC:
  * The current reference date/time is: ${currentTimestamp.toString()}.
  * Resolve all relative date/time queries (e.g. "tomorrow", "next Monday at 2 PM", "today") based on this timestamp.
  * When executing tool actions, enforce valid data constraints (valid emails, logical start/end times).
  * Current Session Node: ${mode.toUpperCase()} mode. ${
    mode === 'workspace' && googleAccessToken
      ? "You have active tools enabled to query and modify the user's Google Workspace."
      : "Workspace tools are disabled for this session. Do not attempt to use function declarations. Instruct the user to switch to Workspace mode or connect Google Workspace if they try to trigger calendars, sheets, or emails."
  }
  `;

  const keys = getApiKeys();
  const primaryKey = keys[activeKeyIndex % keys.length] || process.env.GEMINI_API_KEY || '';
  const aiClient = new GoogleGenerativeAI(primaryKey);

  const modelConfig: any = {
    model: 'gemini-2.5-flash',
    systemInstruction: dynamicInstruction
  };

  // Provision tools dynamically based on active session capabilities
  if (mode === 'workspace' && googleAccessToken) {
    // Workspace Mode with credentials has access to ALL tools (Local + Workspace)
    modelConfig.tools = [assistantTools as any];
  } else {
    // Generic Mode or unauthenticated Workspace has access to Local Tools only (Files + Memory)
    modelConfig.tools = [localTools as any];
  }

  const model = aiClient.getGenerativeModel(modelConfig);

  // Start chat session with history, consolidating consecutive roles to satisfy Gemini constraints
  let formattedHistory: any[] = [];
  history.forEach(h => {
    const role = h.role === 'model' ? 'model' : 'user';
    const content = h.content;
    
    if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === role) {
      formattedHistory[formattedHistory.length - 1].parts[0].text += `\n\n${content}`;
    } else {
      formattedHistory.push({
        role,
        parts: [{ text: content }]
      });
    }
  });

  // Slices history starting from the first user turn to satisfy Gemini API constraints
  const firstUserIndex = formattedHistory.findIndex(h => h.role === 'user');
  if (firstUserIndex !== -1) {
    formattedHistory = formattedHistory.slice(firstUserIndex);
  } else {
    formattedHistory = [];
  }

  const chat = model.startChat({
    history: formattedHistory
  });

  const wrapper: ChatWrapper = {
    chat,
    dynamicInstruction,
    tools: (mode === 'workspace' && googleAccessToken) ? assistantTools : localTools
  };

  emitLog('info', `Processing prompt: "${message}"`);
  let result = await sendMessageWithRetry(wrapper, message);
  let responseText = result.response.text();
  let functionCalls = result.response.functionCalls();

  if (functionCalls && functionCalls.length > 0) {
    emitLog('info', `Gemini requested tool execution: ${functionCalls[0].name}`);
  }

  // Handle function calling if Gemini decided to invoke a tool (supports multi-turn recursive tool execution with depth guard)
  let toolTurns = 0;
  const maxToolTurns = 10;

  while (functionCalls && functionCalls.length > 0) {
    if (toolTurns >= maxToolTurns) {
      emitLog('warning', `Max tool execution depth (${maxToolTurns}) reached. Halting loop to prevent runaway cycles.`);
      break;
    }
    toolTurns++;

    const call = functionCalls[0];
    const { name, args } = call;
    let toolResult: any;

    try {
      const googleTools = [
        'readSheet', 'addLogToSheet', 'sendGmail', 
        'listCalendarEvents', 'listGmailMessages', 'getGmailMessageBody', 
        'createCalendarEvent', 'modifyGmailMessage', 'createSpreadsheet'
      ];
      
      if (googleTools.includes(name)) {
        if (!googleAccessToken) {
          throw new Error('Google authorization token is missing. Please log in first.');
        }
      }

      const token = googleAccessToken || '';
      const sheetId = process.env.GOOGLE_SHEET_ID || '';
      
      if (googleTools.includes(name) && (name === 'readSheet' || name === 'addLogToSheet') && !sheetId) {
        throw new Error('GOOGLE_SHEET_ID is not configured in .env');
      }

      if (name === 'readSheet') {
        let range = (args as any).range || '';
        const configuredSheet = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
        
        // Auto-resolve range if it doesn't specify a sheet name (does not contain !)
        if (range && !range.includes('!')) {
          range = `${configuredSheet}!${range}`;
        } else if (!range) {
          range = `${configuredSheet}!A1:D50`;
        }

        // Auto-resolve default "Sheet1" prefix if user has customized GOOGLE_SHEET_NAME in .env
        if (range.startsWith('Sheet1!') && configuredSheet !== 'Sheet1') {
          range = range.replace(/^Sheet1!/, `${configuredSheet}!`);
        }

        emitLog('info', `Reading Sheet range: "${range}"...`);
        const data = await readSheetData(token, sheetId, range);
        toolResult = { data };
      } else if (name === 'addLogToSheet') {
        const { userQuery, aiResponse, status } = args as any;
        const dateStr = new Date().toLocaleString();
        const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
        emitLog('info', `Logging action row to Sheet "${sheetName}"...`);
        await appendRow(token, sheetId, `${sheetName}!A:D`, [
          dateStr,
          userQuery,
          typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse),
          status
        ]);
        toolResult = { success: true, message: 'Row successfully added to Google Sheets.' };
      } else if (name === 'sendGmail') {
        const { to, subject, body } = args as any;
        
        // Email integrity check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
          throw new Error(`Invalid email address format: "${to}". Please provide a valid recipient address.`);
        }
        
        emitLog('info', `Sending email message to <${to}>...`);
        await sendGmail(token, to, subject, body);
        toolResult = { success: true, message: `Email sent successfully to ${to}.` };
      } else if (name === 'listCalendarEvents') {
        emitLog('info', 'Retrieving calendar events...');
        const events = await listCalendarEvents(token);
        const mappedEvents = events.map((e: any) => ({
          summary: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location
        }));
        toolResult = { events: mappedEvents };
      } else if (name === 'listGmailMessages') {
        const query = (args as any).query || '';
        emitLog('info', `Searching Gmail inbox query: "${query}"...`);
        const emails = await listGmailMessages(token, query);
        toolResult = { emails };
      } else if (name === 'createCalendarEvent') {
        const { summary, startTime, endTime, location, description } = args as any;
        
        // Datetime constraints & integrity validation
        const start = new Date(startTime);
        const end = new Date(endTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new Error(`Date/time parsing error. Ensure timestamps are valid ISO-8601 strings (Start: "${startTime}", End: "${endTime}").`);
        }
        if (end.getTime() <= start.getTime()) {
          throw new Error(`Consistency error: The end time (${endTime}) must occur after the start time (${startTime}).`);
        }

        emitLog('info', `Scheduling new Calendar event: "${summary}"...`);
        const event = await createCalendarEvent(token, summary, startTime, endTime, location, description);
        toolResult = { success: true, eventId: event.id, htmlLink: event.htmlLink };
      } else if (name === 'modifyGmailMessage') {
        const { messageId, action } = args as any;
        if (!messageId) {
          throw new Error('Gmail messageId is required for modification.');
        }
        emitLog('info', `Modifying Gmail message ${messageId} (${action})...`);
        await modifyGmailMessage(token, messageId, action);
        toolResult = { success: true, action };
      } else if (name === 'createSpreadsheet') {
        const { title } = args as any;
        if (!title || !title.trim()) {
          throw new Error('Spreadsheet title cannot be empty.');
        }
        emitLog('info', `Creating new Google Sheet: "${title}"...`);
        const sheet = await createSpreadsheet(token, title);
        toolResult = { success: true, spreadsheetId: sheet.spreadsheetId, spreadsheetUrl: sheet.spreadsheetUrl };
      } else if (name === 'getGmailMessageBody') {
        const { messageId } = args as any;
        if (!messageId) {
          throw new Error('Gmail messageId is required to fetch content.');
        }
        emitLog('info', `Reading Gmail message body: ${messageId}...`);
        const body = await getGmailMessageBody(token, messageId);
        toolResult = { body };
      } else if (name === 'readWorkspaceFile') {
        const { filename } = args as any;
        emitLog('info', `Reading local workspace file: ${filename}...`);
        const content = readWorkspaceFile(filename);
        toolResult = { success: true, content };
      } else if (name === 'writeWorkspaceFile') {
        const { filename, content } = args as any;
        emitLog('info', `Writing local workspace file: ${filename}...`);
        writeWorkspaceFile(filename, content);
        toolResult = { success: true };
      } else if (name === 'listWorkspaceFiles') {
        emitLog('info', 'Listing local workspace files...');
        const files = listWorkspaceFiles();
        toolResult = { success: true, files };
      } else if (name === 'saveMemory') {
        const { text } = args as any;
        emitLog('info', `Saving record to vector memory...`);
        await saveMemory(text);
        toolResult = { success: true };
      } else if (name === 'searchMemory') {
        const { query } = args as any;
        emitLog('info', `Searching vector memory for: "${query}"...`);
        const matches = await searchMemory(query);
        toolResult = { success: true, matches };
      }

      emitLog('info', `Sending tool outcome back for "${name}"`);
      const loopResult = await sendMessageWithRetry(wrapper, [
        {
          functionResponse: {
            name: name,
            response: toolResult
          }
        }
      ]);
      
      responseText = loopResult.response.text();
      functionCalls = loopResult.response.functionCalls();

    } catch (error: any) {
      emitLog('error', `Tool error in "${name}": ${error.message}`);
      const loopResult = await sendMessageWithRetry(wrapper, [
        {
          functionResponse: {
            name: name,
            response: { error: error.message }
          }
        }
      ]);
      responseText = loopResult.response.text();
      functionCalls = loopResult.response.functionCalls();
    }
  }

  // Zero-blankness guarantee: fallback if Gemini returns an empty response
  if (!responseText || !responseText.trim()) {
    responseText = "I'm online and ready, Boss. However, I did not generate a text response for that request. How else can I assist you?";
  }

  return {
    content: responseText,
    role: 'model'
  };
}
