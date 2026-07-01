import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { getAuthUrl, getTokensFromCode, readSheetData, listCalendarEvents, listGmailMessages, createCalendarEvent, deleteCalendarEvent } from './services/google';
import { chatWithFriday } from './services/gemini';
import { startScheduler, setGoogleTokenForBackground, getJobs, addOrUpdateJob, deleteJob, executeJob } from './services/scheduler';
import { chatWithOllama } from './services/ollama';
import { getTasks, addTask, toggleTask, deleteTask } from './services/tasks';

// Load environment variables from the parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Guard against uncaught exceptions and unhandled promise rejections crashing the process
process.on('uncaughtException', (error) => {
  console.error('⚠️ [CRITICAL] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:5173', // Default Vite development port
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    apiHealth: {
      gemini: !!process.env.GEMINI_API_KEY ? 'configured' : 'missing',
      googleClientId: !!process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing',
      googleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET ? 'configured' : 'missing',
      googleSheetId: !!process.env.GOOGLE_SHEET_ID ? 'configured' : 'missing'
    }
  });
});

/**
 * 1. Google OAuth Entrypoint: Redirects to Google consent screen
 */
app.get('/api/auth/google', (req, res) => {
  try {
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 2. OAuth Callback: Receives the auth code, exchanges it, and redirects to frontend
 */
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.redirect('http://localhost:5173?error=no_code');
  }

  try {
    const tokens = await getTokensFromCode(code);
    // Securely redirect back to the frontend dashboard, sending the token as a query parameter
    // (In production, you would save this in an encrypted cookie or database session)
    const tokenParam = encodeURIComponent(tokens.access_token || '');
    res.redirect(`http://localhost:5173/oauth-callback?token=${tokenParam}`);
  } catch (error: any) {
    console.error('OAuth Callback Error:', error.message);
    res.redirect(`http://localhost:5173?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * 3. Chat endpoint: Sends prompt and history to Gemini (including Google access token)
 */
app.post('/api/chat', async (req, res) => {
  const { message, history, googleToken, mode, provider, model } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    if (googleToken) {
      setGoogleTokenForBackground(googleToken);
    }
    
    let aiResponse;
    if (provider === 'ollama') {
      const ollamaModelName = model || 'llama3';
      const systemPrompt = `You are FRIDAY, a calm, professional, and highly intelligent personal AI operating system inspired by Iron Man's assistant.
- Address the user respectfully as "Boss" or "Sir" (e.g., "Yes, Boss", "Online and ready, Sir").
- Be concise, efficient, and direct. Eliminate conversational filler, pleasantries, and unnecessary intros/outros.`;
      aiResponse = await chatWithOllama(ollamaModelName, message, history || [], systemPrompt);
    } else {
      aiResponse = await chatWithFriday(message, history || [], googleToken, mode || 'workspace');
    }
    
    // Safety guard: ensure the content returned is a non-empty string
    if (!aiResponse || !aiResponse.content || !aiResponse.content.trim()) {
      aiResponse.content = "System alert: I am here, Boss, but the core processing system returned a blank response. Let me know if I should retry.";
    }
    
    res.json(aiResponse);
  } catch (error: any) {
    console.error('Chat API Error:', error.message);
    const isRateLimit = error.message?.toLowerCase().includes('429') || 
                        error.message?.toLowerCase().includes('quota') ||
                        error.message?.toLowerCase().includes('limit') ||
                        error.message?.toLowerCase().includes('too many requests');
    
    if (isRateLimit) {
      return res.json({
        content: "Boss, we've temporarily hit the Gemini API free-tier rate limits (429). Please wait about 10-15 seconds before sending your next command, or consider upgrading to a pay-as-you-go key in Google AI Studio to guarantee zero-latency execution.",
        role: 'model'
      });
    }
    res.status(500).json({ error: `System execution error, Boss: ${error.message}` });
  }
});

/**
 * 4. Sheets API endpoint: Directly fetches raw rows from Google Sheets
 */
app.get('/api/sheets', async (req, res) => {
  const googleToken = req.query.googleToken as string;
  if (!googleToken) {
    return res.status(401).json({ error: 'Token required' });
  }

  const sheetId = process.env.GOOGLE_SHEET_ID || '';
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  try {
    const rows = await readSheetData(googleToken, sheetId, `${sheetName}!A1:D50`);
    res.json({ rows });
  } catch (error: any) {
    console.error('Direct Sheets Read Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 5. Dashboard Calendar endpoint: Fetches calendar events scheduled for today
 */
app.get('/api/dashboard/calendar', async (req, res) => {
  const googleToken = req.query.googleToken as string;
  if (!googleToken) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const events = await listCalendarEvents(googleToken);
    res.json({ events });
  } catch (error: any) {
    console.error('Dashboard Calendar Read Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 6. Dashboard Emails endpoint: Fetches the latest 5 inbox messages
 */
app.get('/api/dashboard/emails', async (req, res) => {
  const googleToken = req.query.googleToken as string;
  if (!googleToken) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    if (googleToken) {
      setGoogleTokenForBackground(googleToken);
    }
    const emails = await listGmailMessages(googleToken);
    res.json({ emails });
  } catch (error: any) {
    console.error('Dashboard Emails Read Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * REST API for Background Scheduler Tasks
 */
app.get('/api/automation', (req, res) => {
  res.json({ jobs: getJobs() });
});

app.post('/api/automation', (req, res) => {
  try {
    const job = addOrUpdateJob(req.body);
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/automation/:id', (req, res) => {
  const success = deleteJob(req.params.id);
  res.json({ success });
});

app.post('/api/automation/run/:id', async (req, res) => {
  try {
    const success = await executeJob(req.params.id);
    res.json({ success });
  } catch (error: any) {
    console.error('Manual execution route error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ollama/models', async (req, res) => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      return res.json({ models: [] });
    }
    const data = await response.json() as any;
    const models = data.models?.map((m: any) => m.name) || [];
    res.json({ models });
  } catch (err) {
    res.json({ models: [] });
  }
});
app.post('/api/calendar/create', async (req, res) => {
  const { googleToken, summary, startTime, endTime, location, description } = req.body;
  if (!googleToken || !summary || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    const event = await createCalendarEvent(googleToken, summary, startTime, endTime, location, description);
    res.json({ success: true, event });
  } catch (error: any) {
    console.error('Create Calendar Event Route Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/calendar/delete/:id', async (req, res) => {
  const googleToken = req.query.googleToken as string;
  if (!googleToken) {
    return res.status(401).json({ error: 'Token required' });
  }
  try {
    await deleteCalendarEvent(googleToken, req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete Calendar Event Route Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: getTasks() });
});

app.post('/api/tasks', (req, res) => {
  const { text, priority } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  const task = addTask(text, priority);
  res.json({ success: true, task });
});

app.post('/api/tasks/toggle/:id', (req, res) => {
  const success = toggleTask(req.params.id);
  res.json({ success });
});

app.delete('/api/tasks/:id', (req, res) => {
  const success = deleteTask(req.params.id);
  res.json({ success });
});
import { exec } from 'child_process';
import fs from 'fs';

app.post('/api/terminal/run', (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  const workspacePath = path.resolve(__dirname, '../../../workspace');
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
    res.json({
      stdout: stdout || '',
      stderr: stderr || '',
      success: !error
    });
  });
});
import { logEmitter } from './services/logger';

/**
 * 7. Server-Sent Events (SSE) log stream endpoint
 */
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const onLog = (log: any) => {
    try {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    } catch (err) {
      console.error('Failed to write SSE log stream entry:', err);
    }
  };

  logEmitter.on('log', onLog);

  req.on('close', () => {
    logEmitter.off('log', onLog);
  });
});

app.listen(PORT, () => {
  console.log(`⚡ [FRIDAY Core] API Server is running on http://localhost:${PORT}`);
  startScheduler();
});

