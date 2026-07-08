import React, { useState, useEffect, useRef } from 'react';
import { AiOrb } from './components/AiOrb';
import CommandPalette from './components/CommandPalette';

const commonCorrections: Record<string, string> = {
  "get status": "git status",
  "get commit": "git commit",
  "get push": "git push",
  "get pull": "git pull",
  "get add": "git add",
  "get branch": "git branch",
  "get checkout": "git checkout",
  "get log": "git log",
  "get remote": "git remote",
  "get diff": "git diff",
  "npm run the": "npm run dev",
  "npm run then": "npm run dev",
  "npm run dynamic": "npm run dev",
  "npm run visual": "npm run dev",
  "npm run bill": "npm run build",
  "npm run bell": "npm run build",
  "npm run compile": "npm run build",
  "npx run": "npx",
  "node run": "npm run",
  "ts node": "ts-node"
};

function cleanVoiceTranscript(text: string): string {
  let cleaned = text.trim();
  for (const [misheard, corrected] of Object.entries(commonCorrections)) {
    const regex = new RegExp(`\\b${misheard}\\b`, 'gi');
    cleaned = cleaned.replace(regex, corrected);
  }
  cleaned = cleaned.replace(/\bfriday\b/gi, 'FRIDAY');
  cleaned = cleaned.replace(/\bjarvis\b/gi, 'JARVIS');
  return cleaned;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  mode?: 'generic' | 'workspace';
  isError?: boolean;
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface ChatThread {
  id: string;
  title: string;
  mode: 'generic' | 'workspace';
  messages: Message[];
  createdAt: string;
}

function MarkdownRenderer({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.split('\n');
          const firstLine = lines[0].slice(3).trim(); // Language (e.g., typescript, python)
          const language = firstLine || 'code';
          const code = lines.slice(1, -1).join('\n');

          return (
            <div key={index} style={{
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              backgroundColor: '#0a0d14',
              margin: '8px 0'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                fontSize: '10px',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <span>{language}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-blue)',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600
                  }}
                >
                  Copy
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '12px',
                overflowX: 'auto',
                fontSize: '12px',
                fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
                color: '#e2e8f0',
                lineHeight: '1.5'
              }}>
                <code>{code}</code>
              </pre>
            </div>
          );
        } else {
          const lines = part.split('\n');
          return (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {lines.map((line, lIdx) => {
                const isListItem = line.trim().startsWith('- ') || line.trim().startsWith('* ');
                const cleanLine = isListItem ? line.trim().slice(2) : line;

                const parseInline = (text: string) => {
                  const inlineParts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
                  return inlineParts.map((subPart, spIdx) => {
                    if (subPart.startsWith('**') && subPart.endsWith('**')) {
                      return <strong key={spIdx} style={{ color: '#fff', fontWeight: 600 }}>{subPart.slice(2, -2)}</strong>;
                    }
                    if (subPart.startsWith('`') && subPart.endsWith('`')) {
                      return (
                        <code key={spIdx} style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          color: 'var(--color-blue)'
                        }}>
                          {subPart.slice(1, -1)}
                        </code>
                      );
                    }
                    return subPart;
                  });
                };

                if (isListItem) {
                  return (
                    <div key={lIdx} style={{ display: 'flex', gap: '8px', paddingLeft: '12px', alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--color-blue)' }}>•</span>
                      <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{parseInline(cleanLine)}</span>
                    </div>
                  );
                }

                if (!line.trim()) {
                  return <div key={lIdx} style={{ height: '6px' }} />;
                }

                return (
                  <p key={lIdx} style={{ margin: 0, fontSize: '13px', color: '#e2e8f0', lineHeight: '1.6' }}>
                    {parseInline(line)}
                  </p>
                );
              })}
            </div>
          );
        }
      })}
    </div>
  );
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  // Navigation & Startup States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'sheets' | 'settings' | 'automations' | 'calendar' | 'gmail' | 'tasks' | 'memory' | 'files'>('dashboard');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [initStep, setInitStep] = useState<number>(0);
  const [initLogs, setInitLogs] = useState<string[]>([]);
  
  // Auth & API States
  const [googleToken, setGoogleToken] = useState<string | null>(localStorage.getItem('friday_google_token'));
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  
  // Chat States & Path Splitting Modes
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    try {
      const saved = localStorage.getItem('friday_chat_threads');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse chat threads from localStorage:', e);
    }
    const defaultThread: ChatThread = {
      id: 'default-workspace',
      title: 'Workspace Assistant',
      mode: 'workspace',
      messages: [
        { role: 'model', content: "Online and ready, Boss. How can I assist you with your workspace today?", mode: 'workspace' }
      ],
      createdAt: new Date().toISOString()
    };
    return [defaultThread];
  });

  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const savedActiveId = localStorage.getItem('friday_active_thread_id');
    const savedThreadsStr = localStorage.getItem('friday_chat_threads');
    if (savedActiveId && savedThreadsStr) {
      try {
        const parsed = JSON.parse(savedThreadsStr);
        if (Array.isArray(parsed) && parsed.some((t: any) => t.id === savedActiveId)) {
          return savedActiveId;
        }
      } catch (e) {}
    }
    return 'default-workspace';
  });

  // Derived properties
  const activeThread = threads.find(t => t.id === activeThreadId) || threads[0] || {
    id: 'default-workspace',
    title: 'Workspace Assistant',
    mode: 'workspace',
    messages: []
  };
  
  const messages = activeThread.messages;
  const chatMode = activeThread.mode;

  const setChatMode = (mode: 'generic' | 'workspace') => {
    setThreads(prev => prev.map(t => {
      if (t.id === activeThreadId) {
        let nextMessages = t.messages;
        if (t.messages.length === 1 && t.messages[0].role === 'model') {
          nextMessages = [
            { 
              role: 'model', 
              content: mode === 'workspace' 
                ? "Online and ready, Boss. How can I assist you with your workspace today?" 
                : "Friday Core Chat activated. Ask me anything, Boss!",
              mode: mode
            }
          ];
        }
        return { ...t, mode, messages: nextMessages };
      }
      return t;
    }));
  };

  const setMessages = (update: Message[] | ((prev: Message[]) => Message[])) => {
    setThreads(prev => prev.map(t => {
      if (t.id === activeThreadId) {
        const nextMessages = typeof update === 'function' ? update(t.messages) : update;
        
        let title = t.title;
        if (t.title === 'New Workspace Chat' || t.title === 'New Generic Chat' || t.title === 'Workspace Assistant' || t.title === 'General Assistant') {
          const firstUserMessage = nextMessages.find(m => m.role === 'user');
          if (firstUserMessage) {
            title = firstUserMessage.content.slice(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '');
          }
        }
        return { ...t, messages: nextMessages, title };
      }
      return t;
    }));
  };

  const [inputText, setInputText] = useState<string>('');
  const [orbState, setOrbState] = useState<'idle' | 'listening' | 'thinking' | 'executing' | 'completed'>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'FRIDAY Core initialized and ready.' }
  ]);
  
  // Sheets Data State
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState<boolean>(false);
  
  // Dashboard Widget States
  const [dashboardEvents, setDashboardEvents] = useState<any[]>([]);
  const [dashboardEmails, setDashboardEmails] = useState<any[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Voice Synthesis & Recognition States
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    return localStorage.getItem('friday_voice_enabled') === 'true';
  });
  const [hotkeyEnabled, setHotkeyEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('friday_hotkey_enabled');
    return saved !== null ? saved === 'true' : true; // Default to true
  });
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    return localStorage.getItem('friday_focus_mode') === 'true';
  });
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'ollama'>(() => {
    return (localStorage.getItem('friday_llm_provider') as 'gemini' | 'ollama') || 'gemini';
  });
  const [ollamaModel, setOllamaModel] = useState<string>(() => {
    return localStorage.getItem('friday_ollama_model') || 'llama3';
  });
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const [voiceAutoSubmit, setVoiceAutoSubmit] = useState<boolean>(() => {
    const saved = localStorage.getItem('friday_voice_autosubmit');
    return saved !== null ? saved === 'true' : true;
  });
  const recognitionRef = useRef<any>(null);
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    return localStorage.getItem('friday_theme') || 'hologram';
  });

  useEffect(() => {
    localStorage.setItem('friday_theme', activeTheme);
    const body = document.body;
    body.className = '';
    if (activeTheme !== 'hologram') {
      body.classList.add(`theme-${activeTheme}`);
    }
  }, [activeTheme]);

  useEffect(() => {
    localStorage.setItem('friday_voice_enabled', String(voiceEnabled));
  }, [voiceEnabled]);

  useEffect(() => {
    localStorage.setItem('friday_hotkey_enabled', String(hotkeyEnabled));
  }, [hotkeyEnabled]);

  useEffect(() => {
    localStorage.setItem('friday_focus_mode', String(focusMode));
  }, [focusMode]);

  useEffect(() => {
    localStorage.setItem('friday_llm_provider', llmProvider);
  }, [llmProvider]);

  useEffect(() => {
    localStorage.setItem('friday_ollama_model', ollamaModel);
  }, [ollamaModel]);

  useEffect(() => {
    localStorage.setItem('friday_voice_autosubmit', String(voiceAutoSubmit));
  }, [voiceAutoSubmit]);

  const [memoriesList, setMemoriesList] = useState<{ id: string; text: string; timestamp: string }[]>([]);
  const [newMemoryText, setNewMemoryText] = useState<string>('');
  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);

  const [workspaceFiles, setWorkspaceFiles] = useState<{ name: string; size: number; isFile: boolean; modifiedAt: string }[]>([]);
  const [filePreviewContent, setFilePreviewContent] = useState<string | null>(null);
  const [filePreviewName, setFilePreviewName] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);

  const fetchMemories = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/memories`);
      const data = await res.json();
      setMemoriesList(data.memories || []);
    } catch (e) {
      console.error('Failed to fetch memories:', e);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    setIsSavingMemory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMemoryText })
      });
      const data = await res.json();
      if (data.success) {
        setNewMemoryText('');
        fetchMemories();
        addLog('success', 'Memory record injected successfully, Boss.');
      }
    } catch (e) {
      console.error('Failed to save memory:', e);
      addLog('error', 'Failed to save memory record.');
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/memories/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchMemories();
        addLog('success', 'Memory record removed.');
      }
    } catch (e) {
      console.error('Failed to delete memory:', e);
      addLog('error', 'Failed to delete memory record.');
    }
  };

  const fetchWorkspaceFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspace/files`);
      const data = await res.json();
      setWorkspaceFiles(data.files || []);
    } catch (e) {
      console.error('Failed to fetch files:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handlePreviewFile = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspace/files/preview?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.success) {
        setFilePreviewContent(data.content);
        setFilePreviewName(name);
      } else {
        addLog('error', data.error || 'Failed to preview file');
      }
    } catch (e) {
      console.error('Failed to preview file:', e);
      addLog('error', 'Failed to preview file content.');
    }
  };

  const handleDeleteFile = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}, Boss?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspace/files?name=${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchWorkspaceFiles();
        if (filePreviewName === name) {
          setFilePreviewContent(null);
          setFilePreviewName(null);
        }
        addLog('success', `File ${name} deleted.`);
      }
    } catch (e) {
      console.error('Failed to delete file:', e);
      addLog('error', 'Failed to delete file.');
    }
  };

  const [localOllamaModels, setLocalOllamaModels] = useState<string[]>([]);

  const fetchLocalOllamaModels = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ollama/models`);
      const data = await res.json();
      setLocalOllamaModels(data.models || []);
    } catch (e) {
      console.error('Failed to query local Ollama models:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings' && llmProvider === 'ollama') {
      fetchLocalOllamaModels();
    }
  }, [activeTab, llmProvider]);

  // Calendar, Gmail & Tasks States
  const [calendarEventsList, setCalendarEventsList] = useState<any[]>([]);
  const [isFetchingEvents, setIsFetchingEvents] = useState<boolean>(false);
  const [gmailEmailsList, setGmailEmailsList] = useState<any[]>([]);
  const [isFetchingEmails, setIsFetchingEmails] = useState<boolean>(false);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [emailSummary, setEmailSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  const [localTasksList, setLocalTasksList] = useState<any[]>([]);
  const [isFetchingTasks, setIsFetchingTasks] = useState<boolean>(false);
  const [newTaskText, setNewTaskText] = useState<string>('');
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low'>('medium');

  // Terminal States
  const [terminalLogs, setTerminalLogs] = useState<string[]>(['FRIDAY OS workspace terminal initialized.', 'Current working directory: ./workspace']);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [terminalInput, setTerminalInput] = useState<string>('');
  const [isTerminalExecuting, setIsTerminalExecuting] = useState<boolean>(false);

  const handleRunTerminalCommand = async (cmdStr?: string) => {
    const activeCommand = cmdStr || terminalInput;
    if (!activeCommand.trim()) return;
    
    if (!cmdStr) {
      setTerminalInput('');
    }
    setIsTerminalExecuting(true);
    setTerminalLogs(prev => [...prev, `\n> ${activeCommand}`]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/terminal/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: activeCommand })
      });
      const data = await res.json();
      if (data.stdout) {
        setTerminalLogs(prev => [...prev, data.stdout.trim()]);
      }
      if (data.stderr) {
        setTerminalLogs(prev => [...prev, `[ERROR] ${data.stderr.trim()}`]);
      }
      if (!data.stdout && !data.stderr && data.success) {
        setTerminalLogs(prev => [...prev, '[Command finished with exit code 0]']);
      }
    } catch (e: any) {
      setTerminalLogs(prev => [...prev, `[ERROR] Connection failed: ${e.message}`]);
    } finally {
      setIsTerminalExecuting(false);
    }
  };

  // Background Automation Scheduler States
  interface AutomationJob {
    id: string;
    name: string;
    intervalMinutes: number;
    prompt: string;
    active: boolean;
    lastRun?: string;
    nextRun?: string;
  }

  const [automationJobs, setAutomationJobs] = useState<AutomationJob[]>([]);
  const [newJobName, setNewJobName] = useState('');
  const [newJobInterval, setNewJobInterval] = useState(60);
  const [newJobPrompt, setNewJobPrompt] = useState('');
  const [isSavingJob, setIsSavingJob] = useState(false);

  // 1. Google Calendar Fetch & Mutate
  const fetchCalendarEventsForWeek = async () => {
    if (!googleToken) return;
    setIsFetchingEvents(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/calendar?googleToken=${googleToken}`);
      const data = await res.json();
      setCalendarEventsList(data.events || []);
    } catch (e) {
      console.error('Failed to load week calendar events:', e);
    } finally {
      setIsFetchingEvents(false);
    }
  };

  const handleCreateCalendarEvent = async (summary: string, start: string, end: string, loc?: string, desc?: string) => {
    if (!googleToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/calendar/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleToken, summary, startTime: start, endTime: end, location: loc, description: desc })
      });
      if (res.ok) {
        addLog('success', `Scheduled calendar event: "${summary}"`);
        fetchCalendarEventsForWeek();
        fetchDashboardData();
      } else {
        const error = await res.json();
        addLog('error', `Failed to create event: ${error.error}`);
      }
    } catch (e: any) {
      addLog('error', `Failed to schedule event: ${e.message}`);
    }
  };

  const handleDeleteCalendarEvent = async (id: string) => {
    if (!googleToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/calendar/delete/${id}?googleToken=${googleToken}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addLog('success', 'Calendar event cancelled.');
        fetchCalendarEventsForWeek();
        fetchDashboardData();
      } else {
        addLog('error', 'Failed to delete calendar event.');
      }
    } catch (e: any) {
      addLog('error', `Event deletion failed: ${e.message}`);
    }
  };

  // 2. Gmail Inbox Fetch & Summarize
  const fetchInboxEmails = async () => {
    if (!googleToken) return;
    setIsFetchingEmails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/emails?googleToken=${googleToken}`);
      const data = await res.json();
      setGmailEmailsList(data.emails || []);
    } catch (e) {
      console.error('Failed to load gmail messages:', e);
    } finally {
      setIsFetchingEmails(false);
    }
  };

  const handleSummarizeEmail = async (subject: string, snippet: string) => {
    setIsGeneratingSummary(true);
    setEmailSummary('');
    try {
      const prompt = `Boss is requesting an AI brief. Summarize this email:
Sender Info: ${selectedEmail?.from}
Subject line: ${subject}
Message content/snippet: ${snippet}
Please provide a 3-bullet core brief highlighting action items.`;
      
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          history: [],
          googleToken: null,
          mode: 'generic',
          provider: llmProvider,
          model: ollamaModel
        })
      });
      
      if (!response.ok) throw new Error('AI summary generation failed.');
      const data = await response.json();
      setEmailSummary(data.content || 'Failed to generate email summary brief.');
    } catch (err: any) {
      setEmailSummary(`Error generating email summary: ${err.message}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // 3. Local Tasks CRUD
  const fetchTasks = async () => {
    setIsFetchingTasks(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks`);
      const data = await res.json();
      setLocalTasksList(data.tasks || []);
    } catch (e) {
      console.error('Failed to load tasks list:', e);
    } finally {
      setIsFetchingTasks(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newTaskText, priority: newTaskPriority })
      });
      if (res.ok) {
        setNewTaskText('');
        fetchTasks();
        addLog('success', 'Task added successfully.');
      }
    } catch (e) {
      console.error('Failed to add task:', e);
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/toggle/${id}`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (e) {
      console.error('Failed to toggle task:', e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchTasks();
        addLog('success', 'Task purged.');
      }
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'calendar') {
      fetchCalendarEventsForWeek();
    } else if (activeTab === 'gmail') {
      fetchInboxEmails();
    } else if (activeTab === 'tasks') {
      fetchTasks();
    }
  }, [activeTab, googleToken]);

  const fetchAutomationJobs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/automation`);
      const data = await res.json();
      setAutomationJobs(data.jobs || []);
    } catch (e) {
      console.error('Failed to load automation jobs:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'automations') {
      fetchAutomationJobs();
    }
  }, [activeTab]);

  const handleToggleJob = async (job: AutomationJob) => {
    try {
      await fetch(`${API_BASE_URL}/api/automation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...job, active: !job.active })
      });
      fetchAutomationJobs();
      addLog('info', `Background task "${job.name}" toggled.`);
    } catch (e) {
      addLog('error', `Failed to toggle background task: ${job.name}`);
    }
  };

  const handleRunJobNow = async (jobId: string) => {
    addLog('info', `Manually executing background task: ${jobId}`);
    try {
      const res = await fetch(`${API_BASE_URL}/api/automation/run/${jobId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        addLog('success', `Task execution completed.`);
      } else {
        addLog('error', `Task execution failed.`);
      }
      fetchAutomationJobs();
    } catch (e) {
      addLog('error', `Connection error during manual run.`);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/automation/${jobId}`, {
        method: 'DELETE'
      });
      fetchAutomationJobs();
      addLog('warning', `Background task deleted.`);
    } catch (e) {
      addLog('error', `Failed to delete task.`);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobName || !newJobPrompt) return;
    setIsSavingJob(true);
    try {
      await fetch(`${API_BASE_URL}/api/automation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newJobName,
          intervalMinutes: newJobInterval,
          prompt: newJobPrompt,
          active: true
        })
      });
      setNewJobName('');
      setNewJobInterval(60);
      setNewJobPrompt('');
      fetchAutomationJobs();
      addLog('success', `New background task scheduled.`);
    } catch (e) {
      addLog('error', `Failed to schedule task.`);
    } finally {
      setIsSavingJob(false);
    }
  };

  const speakResponse = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();

    let cleanText = text
      .replace(/```[\s\S]*?```/g, '[Code snippet hidden from voice synthesis]')
      .replace(/`[^`]+`/g, '')
      .replace(/[*#_\-~`>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText.length > 250) {
      cleanText = cleanText.slice(0, 230) + "... details are displayed on screen, Boss.";
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => 
      v.name.includes('Google US English') || 
      v.name.includes('Natural') || 
      (v.lang === 'en-US' && v.name.includes('Female'))
    ) || voices.find(v => v.lang.startsWith('en'));

    if (premiumVoice) utterance.voice = premiumVoice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setOrbState('executing');
    };
    utterance.onend = () => {
      setOrbState('idle');
    };
    utterance.onerror = () => {
      setOrbState('idle');
    };

    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (orbState === 'thinking' || orbState === 'executing') return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      playChime(); // Play futuristic audio chime feedback instantly
      recognitionRef.current.start();
    }
  };

  // Play Futuristic Sci-Fi Chime Sound
  const playChime = () => {
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.1); // G5
      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);
      
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error('Audio chime error:', e);
    }
  };

  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setOrbState('listening');
        addLog('info', 'Microphone active. Listening...');
      };

      rec.onend = () => {
        setIsListening(false);
        setOrbState(prev => prev === 'listening' ? 'idle' : prev);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error !== 'no-speech') {
          addLog('error', `Microphone error: ${event.error}`);
        }
        setIsListening(false);
        setOrbState('idle');
      };

      rec.onresult = (event: any) => {
        // Prevent duplicate voice triggers if the engine is busy
        if (orbState !== 'idle' && orbState !== 'listening') return;
        const transcript = event.results[0][0].transcript;
        if (transcript.trim()) {
          try { rec.stop(); } catch (e) {}
          const cleaned = cleanVoiceTranscript(transcript);
          setInputText(cleaned);
          addLog('success', `Voice transcribed: "${cleaned}"`);
          
          if (voiceAutoSubmitRef.current) {
            sendMessageRef.current(cleaned);
          } else {
            setOrbState('idle');
            addLog('info', 'Voice loaded. Review, edit, or press Send to execute.');
          }
        }
      };

      recognitionRef.current = rec;
    }
  }, [orbState]);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);

  const voiceAutoSubmitRef = useRef(voiceAutoSubmit);
  useEffect(() => {
    voiceAutoSubmitRef.current = voiceAutoSubmit;
  }, [voiceAutoSubmit]);

  // Global keyboard shortcut listener (Alt + Space / Alt + V)
  useEffect(() => {
    if (!hotkeyEnabled) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isVoiceShortcut = (e.altKey && (e.code === 'Space' || e.code === 'KeyV'));
      
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (isVoiceShortcut && !isTyping) {
        e.preventDefault();
        toggleListeningRef.current();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [hotkeyEnabled]);

  // Voice Responsive Volume Analyser (Connects microphone levels to CSS --orb-volume-scale variable)
  useEffect(() => {
    if (!isListening) {
      document.documentElement.style.setProperty('--orb-volume-scale', '1');
      return;
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: any = new Uint8Array(0);
    let source: MediaStreamAudioSourceNode | null = null;
    let stream: MediaStream | null = null;
    let animationId: number = 0;

    async function startAudioMonitor() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;

        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        function updateVolume() {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);

          let total = 0;
          for (let i = 0; i < dataArray.length; i++) {
            total += dataArray[i];
          }
          const average = total / dataArray.length;
          // Scale from 1.0 to 1.5 based on volume
          const scale = 1.0 + (average / 128) * 0.5;

          document.documentElement.style.setProperty('--orb-volume-scale', String(scale));
          animationId = requestAnimationFrame(updateVolume);
        }

        updateVolume();
      } catch (err) {
        console.warn('Audio context monitor blocked or not supported:', err);
      }
    }

    startAudioMonitor();

    return () => {
      cancelAnimationFrame(animationId);
      if (source) source.disconnect();
      if (audioContext) audioContext.close();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isListening]);

  // Check Backend Health
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'online') {
          setBackendOnline(true);
          addLog('info', 'Secure connection established with backend server.');
        }
      })
      .catch(() => {
        setBackendOnline(false);
        addLog('error', `Unable to connect to local backend on port ${API_BASE_URL.split(':').pop() || '3000'}. Please run the server.`);
      });
  }, []);

  // Simulated loading sequence
  useEffect(() => {
    const startupSequence = [
      'Initializing core AI network protocols...',
      'Synthesizing quantum memory blocks...',
      'Contacting Google Workspace secure gateways...',
      'Verifying Gemini LLM tool mapping...',
      'Holographic command system online.',
    ];

    if (initStep < startupSequence.length) {
      const timer = setTimeout(() => {
        setInitLogs(prev => [...prev, `[OK] ${startupSequence[initStep]}`]);
        setInitStep(prev => prev + 1);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initStep]);

  // OAuth Callback handler
  useEffect(() => {
    if (window.location.pathname === '/oauth-callback') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        localStorage.setItem('friday_google_token', token);
        setGoogleToken(token);
        addLog('success', 'Google OAuth authorization completed successfully.');
      }
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const notifyUser = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body.length > 120 ? body.slice(0, 117) + '...' : body
      });
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Listen for real-time logs from backend EventSource
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/logs`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLogs(prev => [data, ...prev]);
      
      // Trigger native notification if scheduler task completed in background
      if (data.message.includes('[Scheduler]') && data.message.includes('completed')) {
        const parts = data.message.split('completed. Response:');
        const content = parts[1] || data.message;
        notifyUser('FRIDAY OS System Update', content.trim());
      }
      
      // Map log lines to appropriate orb states
      if (data.message.includes('initiating') || data.message.includes('requesting') || data.message.includes('Fetching')) {
        setOrbState('thinking');
      } else if (data.message.includes('Executing') || data.message.includes('Sending')) {
        setOrbState('executing');
      } else if (data.message.includes('completed') || data.message.includes('Success') || data.message.includes('synced')) {
        setOrbState('completed');
        setTimeout(() => setOrbState('idle'), 2000);
      }
    };
    return () => eventSource.close();
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll terminal console log to bottom
  useEffect(() => {
    if (isTerminalOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, isTerminalOpen]);

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    setLogs(prev => [
      { timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type, message },
      ...prev
    ]);
  };

  const handleGoogleConnect = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  const handleDisconnect = () => {
    localStorage.removeItem('friday_google_token');
    setGoogleToken(null);
    setDashboardEvents([]);
    setDashboardEmails([]);
    addLog('warning', 'Google Account connection terminated.');
  };

  const sendMessageToFriday = async (userMsg: string) => {
    // Add user message to active history
    setMessages(prev => [...prev, { role: 'user', content: userMsg, mode: chatMode }]);
    setOrbState('thinking');
    addLog('info', `Sending ${chatMode} query: "${userMsg}"`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          // Strip frontend-only properties to avoid schema matching errors on the LLM backend
          history: messages.map(m => ({ role: m.role, content: m.content })),
          googleToken: chatMode === 'workspace' ? googleToken : null,
          mode: chatMode,
          provider: llmProvider,
          model: ollamaModel
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }
      
      const data = await response.json();
      const finalContent = data.content?.trim() || "I am online, Boss, but the connection returned an empty response. Let me know if I should retry the query.";

      setMessages(prev => [...prev, { role: 'model', content: finalContent, mode: chatMode }]);
      setOrbState('completed');
      addLog('success', 'Instruction executed.');
      speakResponse(finalContent);
      setTimeout(() => setOrbState('idle'), 1500);

      // Auto-reload data widgets if calendar or sheet actions were executed
      if (userMsg.toLowerCase().includes('calendar') || userMsg.toLowerCase().includes('event') || userMsg.toLowerCase().includes('schedule') || userMsg.toLowerCase().includes('email') || userMsg.toLowerCase().includes('sheet') || userMsg.toLowerCase().includes('row')) {
        fetchDashboardData();
        fetchSheetsData();
      }

    } catch (error: any) {
      addLog('error', `Execution failed: ${error.message}`);
      
      const isAuthError = error.message.toLowerCase().includes('authentication') || 
                          error.message.toLowerCase().includes('oauth') || 
                          error.message.toLowerCase().includes('login') ||
                          error.message.toLowerCase().includes('credentials');

      if (isAuthError) {
        localStorage.removeItem('friday_google_token');
        setGoogleToken(null);
        setMessages(prev => [...prev, { 
          role: 'model', 
          content: "Your Google Workspace session has expired, Boss. I have automatically cleared the credentials. Please connect your account again to restore full tool access.",
          mode: chatMode,
          isError: true
        }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'model', 
          content: `I encountered an issue executing that command, Boss: ${error.message}`,
          mode: chatMode,
          isError: true
        }]);
      }
      setOrbState('idle');
    }
  };

  // Keep latest message handler reference in a ref to avoid stale closures
  const sendMessageRef = useRef(sendMessageToFriday);
  useEffect(() => {
    sendMessageRef.current = sendMessageToFriday;
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setInputText('');
    
    // Auto toggle to chat tab to show conversation stream
    setActiveTab('chat');
    await sendMessageToFriday(userMsg);
  };

  const handleCreateNewThread = (mode: 'generic' | 'workspace' = 'workspace') => {
    const newId = Date.now().toString();
    const newThread: ChatThread = {
      id: newId,
      title: mode === 'workspace' ? 'New Workspace Chat' : 'New Generic Chat',
      mode,
      messages: [
        { 
          role: 'model', 
          content: mode === 'workspace' 
            ? "Online and ready, Boss. How can I assist you with your Workspace today?" 
            : "Friday Core Chat activated. Ask me anything, Boss!" 
        }
      ],
      createdAt: new Date().toISOString()
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(newId);
    addLog('info', `Created new ${mode} chat session.`);
  };

  const handleDeleteThread = (threadId: string) => {
    setThreads(prev => {
      const nextThreads = prev.filter(t => t.id !== threadId);
      if (nextThreads.length === 0) {
        const defaultThread: ChatThread = {
          id: 'default-workspace',
          title: 'Workspace Assistant',
          mode: 'workspace',
          messages: [
            { role: 'model', content: "Online and ready, Boss. How can I assist you with your Workspace today?" }
          ],
          createdAt: new Date().toISOString()
        };
        return [defaultThread];
      }
      return nextThreads;
    });

    if (activeThreadId === threadId) {
      setTimeout(() => {
        setThreads(current => {
          if (current.length > 0) {
            setActiveThreadId(current[0].id);
          }
          return current;
        });
      }, 50);
    }
    addLog('warning', 'Chat session deleted.');
  };

  const fetchSheetsData = async () => {
    if (!googleToken) return;
    setIsLoadingSheets(true);
    setOrbState('executing');
    addLog('info', 'Syncing spreadsheet matrix rows...');
    try {
      const response = await fetch(`${API_BASE_URL}/api/sheets?googleToken=${encodeURIComponent(googleToken)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }
      const data = await response.json();
      setSheetRows(data.rows || []);
      addLog('success', 'Spreadsheet synced successfully.');
      setOrbState('completed');
      setTimeout(() => setOrbState('idle'), 1500);
    } catch (e: any) {
      addLog('error', `Sheets fetch failed: ${e.message}`);
      
      const isAuthError = e.message.toLowerCase().includes('authentication') || 
                          e.message.toLowerCase().includes('oauth') || 
                          e.message.toLowerCase().includes('login') ||
                          e.message.toLowerCase().includes('credentials');

      if (isAuthError) {
        localStorage.removeItem('friday_google_token');
        setGoogleToken(null);
        addLog('warning', 'Google OAuth session expired during sheet sync. Connection cleared.');
      }
      setOrbState('idle');
    } finally {
      setIsLoadingSheets(false);
    }
  };

  const fetchDashboardData = async () => {
    if (!googleToken) return;
    try {
      // Fetch Calendar
      const calRes = await fetch(`${API_BASE_URL}/api/dashboard/calendar?googleToken=${encodeURIComponent(googleToken)}`);
      if (calRes.ok) {
        const calData = await calRes.json();
        setDashboardEvents(calData.events || []);
      }

      // Fetch Emails
      const mailRes = await fetch(`${API_BASE_URL}/api/dashboard/emails?googleToken=${encodeURIComponent(googleToken)}`);
      if (mailRes.ok) {
        const mailData = await mailRes.json();
        setDashboardEmails(mailData.emails || []);
      }
    } catch (e) {
      console.error('Error loading dashboard stats:', e);
    }
  };

  useEffect(() => {
    if (googleToken) {
      fetchDashboardData();
    } else {
      setDashboardEvents([]);
      setDashboardEmails([]);
    }
  }, [googleToken]);

  useEffect(() => {
    if (activeTab === 'dashboard' && googleToken) {
      fetchDashboardData();
    }
  }, [activeTab]);

  // Persist threads to localstorage
  useEffect(() => {
    localStorage.setItem('friday_chat_threads', JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    localStorage.setItem('friday_active_thread_id', activeThreadId);
  }, [activeThreadId]);

  // Global keydown handler for Raycast Command Palette (Ctrl/Cmd + K)
  useEffect(() => {
    const handleGlobalPaletteKey = (e: KeyboardEvent) => {
      const isPaletteShortcut = (e.ctrlKey || e.metaKey) && e.code === 'KeyK';
      if (isPaletteShortcut) {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalPaletteKey);
    return () => window.removeEventListener('keydown', handleGlobalPaletteKey);
  }, []);

  const handleExecuteCommand = (commandKey: string) => {
    addLog('info', `Command Palette triggered action: ${commandKey}`);
    switch (commandKey) {
      case 'workspace':
        setChatMode('workspace');
        setActiveTab('chat');
        speakResponse('Workspace node active, Boss.');
        break;
      case 'generic':
        setChatMode('generic');
        setActiveTab('chat');
        speakResponse('Friday Core activated, Boss.');
        break;
      case 'clear':
        setMessages([]);
        speakResponse('Timeline reset, Boss.');
        break;
      case 'talk':
        setTimeout(() => {
          if (toggleListeningRef.current) {
            toggleListeningRef.current();
          }
        }, 150);
        break;
      case 'dashboard':
        setActiveTab('dashboard');
        break;
      case 'sheets':
        setActiveTab('sheets');
        fetchSheetsData();
        break;
      case 'settings':
        setActiveTab('settings');
        break;
      case 'automations':
        setActiveTab('automations');
        break;
      case 'calendar':
        setActiveTab('calendar');
        break;
      case 'gmail':
        setActiveTab('gmail');
        break;
      case 'tasks':
        setActiveTab('tasks');
        break;
      case 'memory':
        setActiveTab('memory');
        fetchMemories();
        break;
      case 'files':
        setActiveTab('files');
        fetchWorkspaceFiles();
        break;
      case 'disconnect':
        handleDisconnect();
        break;
      default:
        break;
    }
  };

  // Startup Screen
  if (isInitializing) {
    return (
      <div style={styles.startContainer}>
        <div className="glass-panel" style={styles.startPanel}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" stroke="var(--color-blue)" strokeWidth="2" strokeDasharray="3 3" />
              <circle cx="12" cy="12" r="4" fill="var(--color-blue)" />
            </svg>
          </div>
          <h1 style={styles.logoTitle}>FRIDAY Core Initializing</h1>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${(initStep / 5) * 100}%` }}></div>
          </div>
          <div style={styles.startLogs}>
            {initLogs.map((l, i) => (
              <div key={i} style={styles.logLine}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pendingTasksCount = localTasksList.filter(t => !t.completed).length;
  const completedTasksCount = localTasksList.filter(t => t.completed).length;
  const totalTasksCount = localTasksList.length;
  const completionRate = totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) : 0;
  const strokeDashoffsetValue = 188 - (188 * completionRate);

  const highPriorityCount = localTasksList.filter(t => !t.completed && t.priority === 'high').length;
  const inProgressCount = localTasksList.filter(t => !t.completed && t.priority !== 'high').length;

  return (
    <div style={styles.appContainer}>
      <CommandPalette 
        isOpen={commandPaletteOpen} 
        onClose={() => setCommandPaletteOpen(false)} 
        onExecute={handleExecuteCommand}
      />
      <div style={styles.mainLayout}>
        
        {/* LEFT NAVIGATION SIDEBAR (Adapted exactly from mockup sidebar grid) */}
        <div 
          className="layout-sidebar"
          style={{
            ...styles.sidebar,
            width: focusMode ? '0px' : '240px',
            padding: focusMode ? '0px' : '24px',
            opacity: focusMode ? 0 : 1,
            pointerEvents: focusMode ? 'none' : 'auto',
            borderRight: focusMode ? 'none' : '1px solid var(--border-light)',
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'hidden'
          }}
        >
          <div style={styles.sidebarHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="8" stroke="var(--color-blue)" strokeWidth="2" strokeDasharray="3 3" />
                <circle cx="12" cy="12" r="4" fill="var(--color-blue)" />
              </svg>
              <div>
                <div style={styles.sidebarTitle}>FRIDAY OS</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', letterSpacing: '0.5px' }}>
                  Your AI Command Center
                </div>
              </div>
            </div>
          </div>
          
          <div style={styles.navMenu}>
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`sidebar-btn-custom ${activeTab === 'dashboard' ? 'active' : ''}`}
            >
              <span style={{ fontSize: '14px' }}>⌗</span> Home
            </button>
            <button 
              onClick={() => setActiveTab('chat')} 
              className={`sidebar-btn-custom ${activeTab === 'chat' ? 'active' : ''}`}
            >
              <span style={{ fontSize: '14px' }}>✉</span> AI Chat
            </button>
            <button 
              onClick={() => { setActiveTab('sheets'); fetchSheetsData(); }} 
              className={`sidebar-btn-custom ${activeTab === 'sheets' ? 'active' : ''}`}
            >
              <span style={{ fontSize: '14px' }}>☷</span> Google Sheets
            </button>
            <button 
              onClick={() => setActiveTab('settings')} 
              className={`sidebar-btn-custom ${activeTab === 'settings' ? 'active' : ''}`}
            >
              <span style={{ fontSize: '14px' }}>⚙</span> Settings
            </button>
            
            {/* Visual placeholder nodes to exactly match mockup sidebar visual weight */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.02)', margin: '15px 0' }} />
             <button 
              onClick={() => { setActiveTab('calendar'); fetchCalendarEventsForWeek(); }}
              className={`sidebar-btn-custom ${activeTab === 'calendar' ? 'active' : ''}`}
              style={{ opacity: 1, cursor: 'pointer' }}
            >
              <span style={{ fontSize: '14px' }}>🗓</span> Calendar
            </button>
            <button 
              onClick={() => { setActiveTab('gmail'); fetchInboxEmails(); }}
              className={`sidebar-btn-custom ${activeTab === 'gmail' ? 'active' : ''}`}
              style={{ opacity: 1, cursor: 'pointer' }}
            >
              <span style={{ fontSize: '14px' }}>✉</span> Gmail
            </button>
            <button 
              onClick={() => { setActiveTab('tasks'); fetchTasks(); }}
              className={`sidebar-btn-custom ${activeTab === 'tasks' ? 'active' : ''}`}
              style={{ opacity: 1, cursor: 'pointer' }}
            >
              <span style={{ fontSize: '14px' }}>✓</span> Tasks
            </button>
            <button 
              onClick={() => { setActiveTab('automations'); }} 
              className={`sidebar-btn-custom ${activeTab === 'automations' ? 'active' : ''}`}
              style={{ opacity: 1, cursor: 'pointer' }}
            >
              <span style={{ fontSize: '14px' }}>✨</span> Automations
            </button>
            <button 
              onClick={() => { setActiveTab('memory'); fetchMemories(); }}
              className={`sidebar-btn-custom ${activeTab === 'memory' ? 'active' : ''}`}
              style={{ opacity: 1, cursor: 'pointer' }}
            >
              <span style={{ fontSize: '14px' }}>🧠</span> Memory Bank
            </button>
            <button 
              onClick={() => { setActiveTab('files'); fetchWorkspaceFiles(); }}
              className={`sidebar-btn-custom ${activeTab === 'files' ? 'active' : ''}`}
              style={{ opacity: 1, cursor: 'pointer' }}
            >
              <span style={{ fontSize: '14px' }}>📁</span> File Explorer
            </button>
          </div>

          {/* Sidebar Footer User profile card (Exactly matches mockup bottom left) */}
          <div style={styles.sidebarFooter}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={styles.avatarCircle}>YO</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Boss</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>sir@fridayos.ai</span>
              </div>
            </div>
            
            <div style={styles.connectionStatus}>
              <div style={{
                ...styles.statusDot, 
                backgroundColor: backendOnline ? 'var(--color-green)' : 'var(--color-red)'
              }}></div>
              <span>System Online / All operational</span>
            </div>
          </div>
        </div>

        {/* RIGHT ACTIVE PANEL CONTENT CONTAINER */}
        <div style={styles.contentArea}>
          
          {/* 1. DASHBOARD HOME VIEW (Renders the mockup layout row grid + sidebar widgets) */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flex: 1, gap: '30px', height: '100%', overflow: 'hidden' }}>
              
              {/* Left/Center Main Workspace Column */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '25px', overflowY: 'auto', paddingRight: '5px' }}>
                
                {/* Header Greeting widgets (Mockup header) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 500 }}>
                      Good evening, Boss.
                    </h2>
                    <p style={{ color: 'var(--color-blue)', fontSize: '14px', fontWeight: 500, marginTop: '4px' }}>
                      {orbState === 'thinking' && '⚡ FRIDAY is retrieving data...'}
                      {orbState === 'executing' && '⚡ FRIDAY is processing command...'}
                      {orbState === 'listening' && '🎙️ FRIDAY is listening...'}
                      {orbState === 'completed' && '✓ Execution completed'}
                      {orbState === 'idle' && 'FRIDAY is listening.'}
                    </p>
                  </div>
                  
                  {/* Mockup header widgets */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button 
                      onClick={() => setFocusMode(!focusMode)} 
                      style={{
                        background: focusMode ? 'rgba(0,153,255,0.1)' : 'none',
                        border: `1px solid ${focusMode ? 'var(--color-blue)' : 'var(--border-light)'}`,
                        color: focusMode ? 'var(--color-blue)' : '#fff',
                        padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {focusMode ? '🎯 Focus: ON' : '🔍 Focus: OFF'}
                    </button>
                    <button 
                      onClick={() => setVoiceEnabled(!voiceEnabled)} 
                      style={{
                        background: 'none', border: '1px solid var(--border-light)', color: '#fff',
                        padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      {voiceEnabled ? '🔊 Voice' : '🔇 Mute'}
                    </button>
                    <div style={{
                      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)',
                      borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: 'var(--color-text-secondary)'
                    }}>
                      Search... (Cmd + K)
                    </div>
                  </div>
                </div>

                {/* 3 Columns Card Row (Mockup center agenda/orb/task row) */}
                <div style={{ display: 'flex', gap: '20px' }}>
                  
                  {/* Today's Agenda Card */}
                  <div className="glass-panel" style={{ flex: 1.1, padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '260px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Today's Agenda
                      </span>
                      <span style={{ color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '14px' }}>+</span>
                    </div>

                    {!googleToken ? (
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: 1, textAlign: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '24px', opacity: 0.5 }}>🔒</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Google Calendar disconnected</span>
                        <button 
                          onClick={() => setActiveTab('settings')} 
                          className="cyber-btn-primary" 
                          style={{ padding: '4px 10px', fontSize: '9px', marginTop: '5px' }}
                        >
                          Connect Google
                        </button>
                      </div>
                    ) : dashboardEvents.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                        {dashboardEvents.slice(0, 3).map((event, idx) => {
                          const timeStr = event.start 
                            ? new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : 'All Day';
                          const statusColors = ['#0099ff', '#8b5cf6', '#10b981'];
                          return (
                            <div key={idx} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.01)', borderRadius: '6px', borderLeft: `3px solid ${statusColors[idx % 3]}` }}>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{timeStr}</div>
                              <div style={{ fontSize: '12px', fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.summary}</div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.location || 'Online Meet'}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, textAlign: 'center', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                        No events scheduled today, Boss.
                      </div>
                    )}
                    
                    <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
                      <span onClick={() => setActiveTab('chat')} style={{ fontSize: '11px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                        View Calendar →
                      </span>
                    </div>
                  </div>

                  {/* Center Orb Card */}
                  <div style={{ flex: 1.2, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '260px', position: 'relative' }}>
                    <div className="orb-glow-bg"></div>
                    <AiOrb state={orbState} />
                  </div>

                  {/* Task Overview Card */}
                  <div className="glass-panel" style={{ flex: 1.1, padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '260px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Task Overview
                      </span>
                    </div>

                    {/* Progress Circle Ring */}
                    <div style={{ position: 'relative', width: '70px', height: '70px', margin: '0 auto 15px' }}>
                      <svg width="70" height="70" viewBox="0 0 70 70">
                        <circle cx="35" cy="35" r="30" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="5" />
                        <circle cx="35" cy="35" r="30" fill="none" stroke="var(--color-blue)" strokeWidth="5"
                                strokeDasharray="188" strokeDashoffset={strokeDashoffsetValue} strokeLinecap="round"
                                transform="rotate(-90 35 35)" />
                      </svg>
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{pendingTasksCount}</div>
                        <div style={{ fontSize: '8px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Left</div>
                      </div>
                    </div>

                    {/* Task Breakdown list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-red)' }} />
                          High Priority
                        </span>
                        <span style={{ color: '#fff' }}>{highPriorityCount}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-blue)' }} />
                          In Progress
                        </span>
                        <span style={{ color: '#fff' }}>{inProgressCount}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-green)' }} />
                          Completed
                        </span>
                        <span style={{ color: '#fff' }}>{completedTasksCount}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
                      <span onClick={() => setActiveTab('chat')} style={{ fontSize: '11px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                        View All Tasks →
                      </span>
                    </div>
                  </div>

                </div>

                {/* Quick Actions (Mockup bottom horizontal actions) */}
                <div>
                  <h4 style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Quick Actions
                  </h4>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div 
                      className="glass-panel" 
                      onClick={() => { setInputText('Summarize my recent unread emails'); }}
                      style={styles.quickActionBtn}
                    >
                      <span style={{ fontSize: '16px' }}>✉</span>
                      <span>Summarize Emails</span>
                    </div>
                    <div 
                      className="glass-panel" 
                      onClick={() => { setInputText('Schedule a new event on my calendar for Design Review today at 2 PM'); }}
                      style={styles.quickActionBtn}
                    >
                      <span style={{ fontSize: '16px' }}>🗓</span>
                      <span>Create Event</span>
                    </div>
                    <div 
                      className="glass-panel" 
                      onClick={() => { setInputText('Add a new success log row to my Google Sheet'); }}
                      style={styles.quickActionBtn}
                    >
                      <span style={{ fontSize: '16px' }}>☷</span>
                      <span>Update Sheet</span>
                    </div>
                    <div 
                      className="glass-panel" 
                      onClick={() => speakResponse('I am ready, Boss. What workspace outcome should I execute?')}
                      style={styles.quickActionBtn}
                    >
                      <span style={{ fontSize: '16px' }}>✨</span>
                      <span>Ask FRIDAY</span>
                    </div>
                  </div>
                </div>

                {/* Dashboard bottom input console (Mockup dashboard chat interface) */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '16px', cursor: 'pointer' }}>📎</span>
                    <input 
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={orbState === 'thinking' || orbState === 'executing' ? "FRIDAY is processing..." : "Ask FRIDAY anything..."}
                      className="neon-input-custom"
                      style={{ border: 'none', background: 'transparent', padding: '4px 0' }}
                      disabled={orbState === 'thinking' || orbState === 'executing'}
                    />
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {speechSupported && (
                        <button 
                          type="button" 
                          onClick={toggleListening}
                          disabled={orbState === 'thinking' || orbState === 'executing'}
                          style={{
                            background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                            border: 'none', color: isListening ? 'var(--color-red)' : 'var(--color-text-secondary)',
                            fontSize: '16px', cursor: 'pointer', padding: '4px',
                            opacity: (orbState === 'thinking' || orbState === 'executing') ? 0.5 : 1
                          }}
                        >
                          🎙️
                        </button>
                      )}
                      <button 
                        type="submit" 
                        disabled={orbState === 'thinking' || orbState === 'executing'}
                        style={{
                          background: 'var(--color-blue)', color: '#fff', border: 'none',
                          borderRadius: '50%', width: '32px', height: '32px', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          opacity: (orbState === 'thinking' || orbState === 'executing') ? 0.5 : 1
                        }}
                      >
                        →
                      </button>
                    </div>
                  </form>
                  
                  {/* Category action selector tags matching mockup */}
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    <span style={{ border: '1px solid var(--color-blue)', color: 'var(--color-blue)', borderRadius: '15px', padding: '2px 8px', cursor: 'pointer' }}>
                      ● Smart
                    </span>
                    <span style={{ border: '1px solid transparent', borderRadius: '15px', padding: '2px 8px', cursor: 'pointer' }} onClick={() => speakResponse('Research engine is active, Boss.')}>
                      Research
                    </span>
                    <span style={{ border: '1px solid transparent', borderRadius: '15px', padding: '2px 8px', cursor: 'pointer' }} onClick={() => speakResponse('Analytical protocols mapped.')}>
                      Analyze
                    </span>
                    <span style={{ border: '1px solid transparent', borderRadius: '15px', padding: '2px 8px', cursor: 'pointer' }} onClick={() => speakResponse('Automation sequence active.')}>
                      Automate
                    </span>
                  </div>
                </div>

              </div>

              {/* Right Sidebar Widgets Column (Activity, Insights, Status mockup) */}
              <div 
                className="layout-right-sidebar"
                style={{
                  ...styles.rightSidebar,
                  width: focusMode ? '0px' : '280px',
                  opacity: focusMode ? 0 : 1,
                  pointerEvents: focusMode ? 'none' : 'auto',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  overflow: 'hidden'
                }}
              >
                
                {/* Recent Activity Card */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                      Recent Activity
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>View All</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Activity Row 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: googleToken ? 'var(--color-green)' : 'var(--color-yellow)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Gmail</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                          {googleToken ? (dashboardEmails.length > 0 ? `${dashboardEmails.length} unread emails` : 'No unread emails') : 'Service disconnected'}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{googleToken ? 'Just now' : '--'}</span>
                    </div>

                    {/* Activity Row 2 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: googleToken ? 'var(--color-green)' : 'var(--color-yellow)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Calendar</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                          {googleToken ? (dashboardEvents.length > 0 ? `Next: ${dashboardEvents[0].summary}` : 'No meetings scheduled') : 'Service disconnected'}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{googleToken ? 'Just now' : '--'}</span>
                    </div>

                    {/* Activity Row 3 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: googleToken ? 'var(--color-green)' : 'var(--color-yellow)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Sheets</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                          {googleToken ? (sheetRows.length > 0 ? 'Log spreadsheet synced' : 'Log sheet empty') : 'Service disconnected'}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{googleToken ? 'Just now' : '--'}</span>
                    </div>
                  </div>
                </div>

                {/* AI Insight Card */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                      AI Insight
                    </span>
                    <span style={{ color: 'var(--color-blue)', fontSize: '12px' }}>📊</span>
                  </div>
                  
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                    {googleToken 
                      ? (dashboardEvents.length > 0 
                          ? `You have a busy day tomorrow. ${dashboardEvents.length} meetings scheduled on your agenda.` 
                          : 'Your calendar is clear for tomorrow, Boss. Enjoy the quiet focus time!')
                      : 'Google Workspace is currently disconnected. Click settings to authorize calendar sync and retrieve AI daily briefings.'}
                  </p>
                  
                  {googleToken && (
                    <button 
                      onClick={() => { setInputText('Prepare me for tomorrow'); }} 
                      style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)',
                        borderRadius: '6px', padding: '6px', fontSize: '11px', color: '#fff', cursor: 'pointer'
                      }}
                    >
                      Prepare me →
                    </button>
                  )}
                </div>

                {/* System Status Card (Human-readable statuses) */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    System Status
                  </span>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>AI Core</span>
                      <span style={{ color: 'var(--color-green)' }}>● Online</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Google Services</span>
                      <span style={{ color: googleToken ? 'var(--color-green)' : 'var(--color-yellow)' }}>
                        ● {googleToken ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Data Sync</span>
                      <span style={{ color: backendOnline ? 'var(--color-green)' : 'var(--color-red)' }}>
                        ● {backendOnline ? 'Synced' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
                    Last sync: Just now
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* 2. CHAT VIEW (Claude/ChatGPT style text timeline) */}
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', height: '100%', gap: '20px', width: '100%' }}>
              
              {/* Left Chat Threads Sidebar */}
              <div style={styles.threadsSidebar}>
                <button 
                  onClick={() => handleCreateNewThread('workspace')} 
                  style={{ ...styles.newThreadBtn, marginBottom: '10px' }}
                >
                  + New Workspace Chat
                </button>
                <button 
                  onClick={() => handleCreateNewThread('generic')} 
                  style={styles.newThreadBtn}
                >
                  + New Generic Chat
                </button>
                
                <div style={styles.threadsList}>
                  {threads.map(thread => (
                    <div 
                      key={thread.id} 
                      onClick={() => setActiveThreadId(thread.id)}
                      style={{
                        ...styles.threadItem,
                        ...(activeThreadId === thread.id ? styles.activeThreadItem : {})
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '12px' }}>
                          {thread.mode === 'workspace' ? '🌌' : '💬'}
                        </span>
                        <span style={styles.threadItemTitle}>{thread.title}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.id); }} 
                        style={styles.deleteThreadBtn}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Chat Box Container */}
              <div style={{ ...styles.chatContainer, flex: 1 }}>
                <div style={{ ...styles.chatHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px' }}>FRIDAY INTERACTIVE COCKPIT</h3>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Gemini-2.5-Flash Workspace Node</span>
                  </div>
                  
                  {/* Mode Selector and Voice Toggle */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button 
                      onClick={() => setVoiceEnabled(!voiceEnabled)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        backgroundColor: voiceEnabled ? 'rgba(0, 153, 255, 0.1)' : 'transparent',
                        color: voiceEnabled ? 'var(--color-blue)' : 'var(--color-text-secondary)',
                        border: '1px solid',
                        borderColor: voiceEnabled ? 'rgba(0, 153, 255, 0.2)' : 'var(--border-light)',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      {voiceEnabled ? '🔊 Voice: On' : '🔇 Voice: Off'}
                    </button>

                    <div style={styles.chatModeSelector}>
                      <button 
                        onClick={() => setChatMode('workspace')}
                        style={{
                          ...styles.chatModeBtn,
                          ...(chatMode === 'workspace' ? styles.activeChatModeBtn : {})
                        }}
                      >
                        Workspace
                      </button>
                      <button 
                        onClick={() => setChatMode('generic')}
                        style={{
                          ...styles.chatModeBtn,
                          ...(chatMode === 'generic' ? styles.activeChatModeBtn : {})
                        }}
                      >
                        Generic
                      </button>
                    </div>
                  </div>
                </div>

                {/* Timeline Messages Area */}
                <div style={styles.chatMessageArea}>
                  {chatMode === 'workspace' && !googleToken ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      alignItems: 'center', height: '100%', textAlign: 'center', padding: '30px',
                      maxWidth: '400px', margin: 'auto'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '15px' }}>🔒</div>
                      <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '10px', fontSize: '16px' }}>Workspace Integration Locked</h3>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', lineHeight: '1.5', marginBottom: '25px' }}>
                        Google Workspace action execution requires secure token connection.
                      </p>
                      <button onClick={handleGoogleConnect} style={styles.gButton}>
                        CONNECT GOOGLE WORKSPACE
                      </button>
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={styles.emptyChatState}>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {chatMode === 'workspace' 
                          ? "Online and ready, Boss. How can I assist you with your Workspace today?" 
                          : "Friday Core Chat activated. Ask me anything, Boss!"}
                      </p>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const msgMode = msg.mode || chatMode;
                      return (
                        <div 
                          key={i} 
                          className={`chat-bubble-custom ${msg.role === 'user' ? 'user' : 'friday'}`}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                            padding: '16px 12px',
                            borderRadius: '8px',
                            margin: '8px 0',
                            backgroundColor: msg.isError 
                              ? 'rgba(239, 68, 68, 0.03)' 
                              : 'transparent',
                            border: msg.isError 
                              ? '1px solid rgba(239, 68, 68, 0.15)' 
                              : 'none'
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px'
                          }}>
                            <div style={{
                              fontSize: '11px', fontWeight: 600, letterSpacing: '1px',
                              color: msg.isError 
                                ? 'var(--color-red)' 
                                : msg.role === 'user' 
                                  ? 'var(--color-blue)' 
                                  : 'var(--color-text-secondary)',
                              textTransform: 'uppercase',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              {msg.role === 'user' ? 'Boss' : 'FRIDAY'}
                              {msg.isError && (
                                <span style={{
                                  fontSize: '9px',
                                  color: 'var(--color-red)',
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  textTransform: 'uppercase'
                                }}>
                                  [Error]
                                </span>
                              )}
                            </div>
                            
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              letterSpacing: '0.5px',
                              textTransform: 'uppercase',
                              border: msg.isError 
                                ? '1px solid rgba(239, 68, 68, 0.2)' 
                                : msgMode === 'workspace' 
                                  ? '1px solid rgba(0, 153, 255, 0.2)' 
                                  : '1px solid rgba(255, 255, 255, 0.08)',
                              color: msg.isError 
                                ? 'var(--color-red)' 
                                : msgMode === 'workspace' 
                                  ? 'var(--color-blue)' 
                                  : 'var(--color-text-secondary)',
                              backgroundColor: msg.isError 
                                ? 'rgba(239, 68, 68, 0.05)' 
                                : msgMode === 'workspace' 
                                  ? 'rgba(0, 153, 255, 0.05)' 
                                  : 'rgba(255, 255, 255, 0.02)',
                              boxShadow: msgMode === 'workspace' && !msg.isError
                                ? '0 0 8px rgba(0, 153, 255, 0.15)'
                                : 'none'
                            }}>
                              {msgMode === 'workspace' ? 'Workspace Node' : 'Generic Chat'}
                            </span>
                          </div>
                          
                          <div style={{ marginTop: '4px' }}>
                            <MarkdownRenderer content={msg.content} />
                          </div>
                        </div>
                      );
                    })
                  )}
                  
                  {/* Realtime step loader during AI Thinking */}
                  {(orbState === 'thinking' || orbState === 'executing') && logs.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--color-blue)', padding: '10px 0' }}>
                      <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(0,153,255,0.2)', borderTopColor: 'var(--color-blue)', borderRadius: '50%', animation: 'rotateCw 1s linear infinite' }} />
                      <span>{logs[0]?.message}</span>
                    </div>
                  )}
                  
                  <div ref={chatEndRef} />
                </div>

                {/* Collapsible Local Workspace Terminal Console */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(5, 5, 8, 0.4)',
                  marginBottom: '12px',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease'
                }}>
                  <div 
                    onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 16px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderBottom: isTerminalOpen ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600
                    }}
                  >
                    <span style={{ color: 'var(--color-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📁</span> Local Workspace Console {isTerminalExecuting && '• running...'}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{isTerminalOpen ? '▼ Collapse' : '▲ Open Console'}</span>
                  </div>

                  {isTerminalOpen && (
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{
                        height: '120px',
                        overflowY: 'auto',
                        backgroundColor: '#050508',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '6px',
                        padding: '12px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#4af626',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.4'
                      }}>
                        {terminalLogs.map((log, index) => (
                          <div key={index}>{log}</div>
                        ))}
                        <div ref={terminalEndRef} />
                      </div>

                      <form onSubmit={(e) => { e.preventDefault(); handleRunTerminalCommand(); }} style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#4af626', fontFamily: 'monospace', fontSize: '12px', alignSelf: 'center' }}>$</span>
                        <input 
                          type="text"
                          value={terminalInput}
                          onChange={e => setTerminalInput(e.target.value)}
                          placeholder="Type a workspace command (e.g. npm run build, ls, git status)..."
                          className="neon-input-custom"
                          style={{
                            flex: 1,
                            fontSize: '11px',
                            padding: '6px 12px',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '4px',
                            color: '#fff',
                            outline: 'none',
                            fontFamily: 'monospace'
                          }}
                          disabled={isTerminalExecuting}
                        />
                        <button 
                          type="submit" 
                          className="cyber-btn-primary"
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                          disabled={isTerminalExecuting || !terminalInput.trim()}
                        >
                          {isTerminalExecuting ? 'Running...' : 'Execute'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSendMessage} style={styles.chatInputForm}>
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      style={{
                        background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid',
                        borderColor: isListening ? '#ef4444' : 'var(--border-light)',
                        color: isListening ? '#ef4444' : 'var(--color-text-secondary)',
                        padding: '0 16px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
                      }}
                    >
                      {isListening ? '🎙️ Listening' : '🎙️ Mic'}
                    </button>
                  )}
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={orbState === 'thinking' || orbState === 'executing' ? "FRIDAY is executing tools..." : "Ask FRIDAY..."}
                    className="neon-input-custom"
                    disabled={orbState === 'thinking' || orbState === 'executing'}
                  />
                  <button 
                    type="submit" 
                    className="cyber-btn-primary" 
                    disabled={orbState === 'thinking' || orbState === 'executing' || !inputText.trim()}
                  >
                    Send
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* 3. GOOGLE SHEETS VIEW */}
          {activeTab === 'sheets' && (
            !googleToken ? (
              <div style={styles.authContainer}>
                <div style={{ textAlign: 'center', maxWidth: '400px', margin: 'auto', padding: '50px' }}>
                  <div style={styles.authIcon}>🔒</div>
                  <h2 style={{ marginBottom: '10px', fontFamily: 'var(--font-display)', fontSize: '18px' }}>Google Sheets Access Required</h2>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '30px', fontSize: '13px', lineHeight: '1.6' }}>
                    Google Sheets log view requires authentication to access backend spreadsheets.
                  </p>
                  <button onClick={handleGoogleConnect} className="cyber-btn-primary">
                    CONNECT GOOGLE WORKSPACE
                  </button>
                </div>
              </div>
            ) : (
              <div style={styles.sheetsViewPanel}>
                <div style={styles.sheetsHeader}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px' }}>GOOGLE SHEETS SYSTEM LOGS</h3>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      Synchronized dynamically from google workspace API
                    </span>
                  </div>
                  <button 
                    onClick={fetchSheetsData} 
                    disabled={isLoadingSheets}
                    className="cyber-btn-primary"
                    style={{ padding: '8px 16px', fontSize: '11px' }}
                  >
                    {isLoadingSheets ? 'SYNCING...' : 'FORCE REFRESH'}
                  </button>
                </div>

                <div className="glass-panel" style={styles.tableScroll}>
                  {isLoadingSheets ? (
                    <div style={styles.emptyTableState}>Syncing rows...</div>
                  ) : sheetRows.length === 0 ? (
                    <div style={styles.emptyTableState}>
                      <p style={{ marginBottom: '10px' }}>AI Datasheet logger is idle.</p>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                        Google actions logged automatically by FRIDAY.
                      </p>
                    </div>
                  ) : (
                    <table className="cyber-table">
                      <thead>
                        <tr>
                          {sheetRows[0]?.map((col: string, index: number) => (
                            <th key={index}>{col}</th>
                          )) || (
                            <>
                              <th>Date</th>
                              <th>User Query</th>
                              <th>AI Response</th>
                              <th>Status</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.slice(1).map((row: string[], rIndex: number) => (
                          <tr key={rIndex}>
                            {row.map((cell: string, cIndex: number) => (
                              <td key={cIndex} style={{
                                color: cell === 'Success' || cell === 'Completed' || cell === 'success' || cell === 'completed' ? 'var(--color-green)' : 
                                       cell === 'Failed' || cell === 'Error' || cell === 'failed' || cell === 'error' ? 'var(--color-red)' : '#fff'
                              }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )
          )}

          {/* 4. SETTINGS VIEW */}
          {activeTab === 'settings' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '30px', fontSize: '18px' }}>SYSTEM SETTINGS</h3>
              
              <div className="glass-panel" style={styles.settingsGroup}>
                <h4 style={{ marginBottom: '15px', fontSize: '14px' }}>CONNECTION CREDENTIALS</h4>
                <div style={styles.settingRow}>
                  <span>OAuth Redirect Callback URI:</span>
                  <code style={styles.settingCode}>http://localhost:3000/oauth2callback</code>
                </div>
                <div style={styles.settingRow}>
                  <span>LLM Core Model:</span>
                  <code style={styles.settingCode}>{llmProvider === 'gemini' ? 'gemini-2.5-flash' : ollamaModel}</code>
                </div>
                <div style={styles.settingRow}>
                  <span>Dashboard Holographic Theme:</span>
                  <select 
                    value={activeTheme}
                    onChange={e => setActiveTheme(e.target.value)}
                    className="neon-input-custom"
                    style={{
                      width: '180px',
                      fontSize: '11px',
                      padding: '6px 10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="hologram">Hologram Blue (FRIDAY)</option>
                    <option value="stark">Stark Red (JARVIS)</option>
                    <option value="matrix">Matrix Green (Terminal)</option>
                    <option value="cyberpunk">Cyberpunk Purple (Neon)</option>
                    <option value="obsidian">Obsidian Gold (Stealth)</option>
                  </select>
                </div>
                <div style={styles.settingRow}>
                  <span>Intelligence Model Provider:</span>
                  <select 
                    value={llmProvider}
                    onChange={e => setLlmProvider(e.target.value as 'gemini' | 'ollama')}
                    className="neon-input-custom"
                    style={{
                      width: '180px',
                      fontSize: '11px',
                      padding: '6px 10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="gemini">Google Gemini (Cloud)</option>
                    <option value="ollama">Ollama Local (Offline)</option>
                  </select>
                </div>
                {llmProvider === 'ollama' && (
                  <div style={styles.settingRow}>
                    <span>Ollama Model Name:</span>
                    {localOllamaModels.length > 0 ? (
                      <select 
                        value={ollamaModel}
                        onChange={e => setOllamaModel(e.target.value)}
                        className="neon-input-custom"
                        style={{
                          width: '180px',
                          fontSize: '11px',
                          padding: '6px 10px',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                      >
                        {localOllamaModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                        <input 
                          type="text"
                          value={ollamaModel}
                          onChange={e => setOllamaModel(e.target.value)}
                          placeholder="e.g. llama3, mistral"
                          className="neon-input-custom"
                          style={{
                            width: '160px',
                            fontSize: '11px',
                            padding: '6px 10px',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '4px',
                            color: '#fff',
                            outline: 'none'
                          }}
                        />
                        <span style={{ fontSize: '9px', color: 'var(--color-red)' }}>
                          ⚠️ Local Ollama server offline or no models found
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="glass-panel" style={styles.settingsGroup}>
                <h4 style={{ marginBottom: '15px', fontSize: '14px' }}>VOICE CONSOLE CONFIGURATION</h4>
                
                <div style={styles.settingRow}>
                  <span>Voice Hotkey Shortcut (Alt + Space / Alt + V):</span>
                  <button 
                    onClick={() => setHotkeyEnabled(!hotkeyEnabled)}
                    className="cyber-btn-primary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '11px',
                      border: `1px solid ${hotkeyEnabled ? 'var(--color-blue)' : 'var(--border-light)'}`,
                      color: hotkeyEnabled ? 'var(--color-blue)' : 'var(--color-text-secondary)',
                      background: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {hotkeyEnabled ? 'ACTIVE • ON' : 'DISABLED • OFF'}
                  </button>
                </div>

                <div style={styles.settingRow}>
                  <span>Voice Synthesis (Speak responses out loud):</span>
                  <button 
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className="cyber-btn-primary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '11px',
                      border: `1px solid ${voiceEnabled ? 'var(--color-blue)' : 'var(--border-light)'}`,
                      color: voiceEnabled ? 'var(--color-blue)' : 'var(--color-text-secondary)',
                      background: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {voiceEnabled ? 'ACTIVE • ON' : 'DISABLED • OFF'}
                  </button>
                </div>

                <div style={styles.settingRow}>
                  <span>Voice Auto-Submit (Auto-send voice transcriptions):</span>
                  <button 
                    onClick={() => setVoiceAutoSubmit(!voiceAutoSubmit)}
                    className="cyber-btn-primary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '11px',
                      border: `1px solid ${voiceAutoSubmit ? 'var(--color-blue)' : 'var(--border-light)'}`,
                      color: voiceAutoSubmit ? 'var(--color-blue)' : 'var(--color-text-secondary)',
                      background: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {voiceAutoSubmit ? 'ACTIVE • ON' : 'DISABLED • OFF'}
                  </button>
                </div>
              </div>

              <div className="glass-panel" style={styles.settingsGroup}>
                <h4 style={{ marginBottom: '15px', fontSize: '14px' }}>REVOKE SESSIONS</h4>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginBottom: '20px' }}>
                  Disconnect session tokens and remove cache credentials from Google interfaces.
                </p>
                <button onClick={handleDisconnect} style={styles.dangerBtn}>
                  DE-AUTHORIZE GOOGLE ACCESS
                </button>
              </div>
            </div>
          )}

          {/* 5. AUTOMATIONS VIEW */}
          {activeTab === 'automations' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '30px', fontSize: '18px' }}>SYSTEM AUTOMATIONS</h3>
              
              <div className="glass-panel" style={styles.settingsGroup}>
                <h4 style={{ marginBottom: '15px', fontSize: '14px' }}>BACKGROUND AUTOMATION RULES (CRON)</h4>
                
                {automationJobs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
                    {automationJobs.map(job => (
                      <div key={job.id} style={{
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.01)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{job.name}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleToggleJob(job)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                background: 'none',
                                border: `1px solid ${job.active ? 'var(--color-green)' : 'var(--border-light)'}`,
                                color: job.active ? 'var(--color-green)' : 'var(--color-text-secondary)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              {job.active ? 'ACTIVE' : 'PAUSED'}
                            </button>
                            <button
                              onClick={() => handleRunJobNow(job.id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                background: 'none',
                                border: '1px solid var(--color-blue)',
                                color: 'var(--color-blue)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              RUN NOW
                            </button>
                            <button
                              onClick={() => handleDeleteJob(job.id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                background: 'none',
                                border: '1px solid var(--color-red)',
                                color: 'var(--color-red)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                          Prompt: <code style={{ color: '#fff' }}>{job.prompt}</code>
                        </p>
                        <div style={{ display: 'flex', gap: '15px', fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                          <span>Interval: {job.intervalMinutes} min</span>
                          {job.lastRun && <span>Last Run: {job.lastRun}</span>}
                          {job.nextRun && <span>Next Run: {job.nextRun}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginBottom: '20px' }}>
                    No automated background rules scheduled.
                  </p>
                )}

                {/* Create Task Form */}
                <form onSubmit={handleCreateJob} style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingTop: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>CREATE NEW ROUTINE</span>
                  
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                      type="text"
                      placeholder="Routine Name (e.g. Health Summary Log)"
                      value={newJobName}
                      onChange={e => setNewJobName(e.target.value)}
                      className="neon-input-custom"
                      style={{ fontSize: '12px', padding: '8px 12px' }}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Minutes (e.g. 60)"
                      value={newJobInterval}
                      onChange={e => setNewJobInterval(Number(e.target.value))}
                      className="neon-input-custom"
                      style={{ width: '120px', fontSize: '12px', padding: '8px 12px' }}
                      required
                      min={1}
                    />
                  </div>

                  <textarea
                    placeholder="Instruct FRIDAY what task to execute periodically (e.g., Check my calendar for design meetings and send an email brief to sir@fridayos.ai)"
                    value={newJobPrompt}
                    onChange={e => setNewJobPrompt(e.target.value)}
                    className="neon-input-custom"
                    style={{
                      height: '60px',
                      fontSize: '12px',
                      padding: '8px 12px',
                      resize: 'none',
                      fontFamily: 'var(--font-sans)'
                    }}
                    required
                  />

                  <button
                    type="submit"
                    className="cyber-btn-primary"
                    disabled={isSavingJob}
                    style={{ padding: '8px 16px', alignSelf: 'flex-start', fontSize: '11px' }}
                  >
                    {isSavingJob ? 'SCHEDULING...' : 'SCHEDULE ROUTINE'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Memory Bank View */}
          {activeTab === 'memory' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '30px', fontSize: '18px' }}>🧠 COGNITIVE MEMORY BANK (RAG)</h3>
              
              <div className="glass-panel" style={{ ...styles.settingsGroup, marginBottom: '25px' }}>
                <h4 style={{ marginBottom: '15px', fontSize: '14px' }}>ADD DIRECT CONTEXT MEMORY</h4>
                <form onSubmit={handleAddMemory} style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text"
                    placeholder="E.g. Shreyas is the lead creator of FRIDAY OS. Prefer node workspaces."
                    value={newMemoryText}
                    onChange={e => setNewMemoryText(e.target.value)}
                    className="neon-input-custom"
                    style={{ fontSize: '12px', padding: '8px 12px', flex: 1 }}
                    required
                  />
                  <button 
                    type="submit" 
                    className="cyber-btn-primary" 
                    disabled={isSavingMemory}
                    style={{ padding: '8px 16px', fontSize: '11px' }}
                  >
                    {isSavingMemory ? 'SAVING...' : 'INJECT FACT'}
                  </button>
                </form>
              </div>

              <div className="glass-panel" style={styles.settingsGroup}>
                <h4 style={{ marginBottom: '15px', fontSize: '14px' }}>STORED COGNITIVE FACTS</h4>
                
                {memoriesList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {memoriesList.map(mem => (
                      <div key={mem.id} style={{
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.01)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '15px'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                          <span style={{ fontSize: '12px', color: '#fff', lineHeight: '1.4' }}>{mem.text}</span>
                          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
                            Saved: {new Date(mem.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <button 
                          onClick={() => handleDeleteMemory(mem.id)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--color-red)',
                            color: 'var(--color-red)',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '10px',
                            cursor: 'pointer'
                          }}
                        >
                          DELETE
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                    No cognitive facts stored in vector memory, Boss. Add context above or instruct FRIDAY in chat to remember details.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Workspace File Explorer View */}
          {activeTab === 'files' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '30px', fontSize: '18px' }}>📁 WORKSPACE FILE EXPLORER</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', height: 'calc(100vh - 200px)' }}>
                {/* Left Column: Files list */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>WORKSPACE DIRECTORY (./workspace)</span>
                    <button onClick={fetchWorkspaceFiles} className="cyber-btn-primary" style={{ padding: '4px 10px', fontSize: '10px' }} disabled={isLoadingFiles}>
                      {isLoadingFiles ? 'SCANNING...' : 'SCAN'}
                    </button>
                  </div>

                  {workspaceFiles.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {workspaceFiles.map(file => (
                        <div 
                          key={file.name}
                          onClick={() => handlePreviewFile(file.name)}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: filePreviewName === file.name ? '1px solid var(--color-blue)' : '1px solid rgba(255, 255, 255, 0.05)',
                            backgroundColor: filePreviewName === file.name ? 'rgba(0, 153, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                            <span style={{ fontWeight: 600, fontSize: '12px', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {file.name}
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
                              {(file.size / 1024).toFixed(2)} KB • {new Date(file.modifiedAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <a 
                              href={`${API_BASE_URL}/api/workspace/files/download?name=${encodeURIComponent(file.name)}`}
                              onClick={e => e.stopPropagation()}
                              style={{
                                padding: '4px 8px',
                                fontSize: '9px',
                                border: '1px solid var(--border-light)',
                                color: '#fff',
                                textDecoration: 'none',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.02)'
                              }}
                            >
                              GET
                            </a>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.name); }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '9px',
                                border: '1px solid var(--color-red)',
                                color: 'var(--color-red)',
                                background: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              DEL
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                      No files found inside the workspace sandbox, Boss. Run a terminal command or ask FRIDAY to save code files!
                    </div>
                  )}
                </div>

                {/* Right Column: Code Preview Panel */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                  {filePreviewContent !== null && filePreviewName !== null ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '10px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-blue)' }}>{filePreviewName}</span>
                        <button 
                          onClick={() => { setFilePreviewContent(null); setFilePreviewName(null); }}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border-light)',
                            color: '#fff',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            cursor: 'pointer'
                          }}
                        >
                          CLOSE
                        </button>
                      </div>
                      <pre style={{
                        flex: 1,
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        padding: '15px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: 'var(--color-green)',
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                        margin: 0
                      }}>
                        {filePreviewContent || '// Empty file'}
                      </pre>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: 1, color: 'var(--color-text-secondary)', gap: '10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '28px' }}>📄</span>
                      <span style={{ fontSize: '12px' }}>Select a file from the workspace list to view its code preview, Boss.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 6. GMAIL VIEW */}
          {activeTab === 'gmail' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px', fontSize: '18px' }}>GMAIL COMMAND INBOX</h3>
              {!googleToken ? (
                <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
                    Boss, Google Account authorization is required to access your Gmail messages.
                  </p>
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className="cyber-btn-primary"
                    style={{ padding: '8px 16px' }}
                  >
                    GO TO SETTINGS & CONNECT
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', height: 'calc(100vh - 200px)' }}>
                  {/* Left Column: Email list */}
                  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>INBOX MESSAGES</span>
                      <button onClick={fetchInboxEmails} className="cyber-btn-primary" style={{ padding: '4px 10px', fontSize: '10px' }} disabled={isFetchingEmails}>
                        {isFetchingEmails ? 'SYNCING...' : 'SYNC'}
                      </button>
                    </div>

                    {gmailEmailsList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {gmailEmailsList.map(email => (
                          <div 
                            key={email.id} 
                            onClick={() => { setSelectedEmail(email); setEmailSummary(''); }}
                            style={{
                              padding: '12px',
                              borderRadius: '8px',
                              border: selectedEmail?.id === email.id ? '1px solid var(--color-blue)' : '1px solid rgba(255, 255, 255, 0.05)',
                              backgroundColor: selectedEmail?.id === email.id ? 'rgba(0, 153, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 600, fontSize: '11px', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>{email.from.split('<')[0].trim()}</span>
                              <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{new Date(email.date).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span>
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{email.subject}</div>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{email.snippet}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px', padding: '20px' }}>No messages loaded.</div>
                    )}
                  </div>

                  {/* Right Column: Reading Pane & AI Summary */}
                  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                    {selectedEmail ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Sender: <span style={{ color: '#fff' }}>{selectedEmail.from}</span></div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Received: <span style={{ color: '#fff' }}>{selectedEmail.date}</span></div>
                          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: '8px 0 0 0' }}>{selectedEmail.subject}</h4>
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '15px' }} />

                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0, 0, 0, 0.1)', padding: '12px', borderRadius: '8px' }}>
                          {selectedEmail.snippet}...
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }} />

                        <button 
                          onClick={() => handleSummarizeEmail(selectedEmail.subject, selectedEmail.snippet)} 
                          className="cyber-btn-primary" 
                          style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: '11px' }}
                          disabled={isGeneratingSummary}
                        >
                          {isGeneratingSummary ? 'GENERATING SUMMARY BRIEF...' : '✨ SUMMARIZE WITH FRIDAY'}
                        </button>

                        {emailSummary && (
                          <div style={{ 
                            padding: '14px', 
                            borderRadius: '8px', 
                            border: '1px solid rgba(0, 153, 255, 0.2)', 
                            backgroundColor: 'rgba(0, 153, 255, 0.02)',
                            fontSize: '11px',
                            color: '#fff',
                            lineHeight: '1.6'
                          }}>
                            <div style={{ fontWeight: 700, color: 'var(--color-blue)', marginBottom: '8px', letterSpacing: '0.5px' }}>AI BRIEF SUMMARY</div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{emailSummary}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                        <span style={{ fontSize: '24px', marginBottom: '8px' }}>✉️</span>
                        <span>No message selected, Boss.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. CALENDAR VIEW */}
          {activeTab === 'calendar' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px', fontSize: '18px' }}>CALENDAR BRIEF</h3>
              {!googleToken ? (
                <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
                    Boss, Google Account authorization is required to access your Calendar events.
                  </p>
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className="cyber-btn-primary"
                    style={{ padding: '8px 16px' }}
                  >
                    GO TO SETTINGS & CONNECT
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', height: 'calc(100vh - 200px)' }}>
                  {/* Left Column: Events Schedule list */}
                  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>TODAY'S SCHEDULE</span>
                      <button onClick={fetchCalendarEventsForWeek} className="cyber-btn-primary" style={{ padding: '4px 10px', fontSize: '10px' }} disabled={isFetchingEvents}>
                        {isFetchingEvents ? 'SYNCING...' : 'SYNC'}
                      </button>
                    </div>

                    {calendarEventsList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {calendarEventsList.map(event => {
                          const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
                          const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                          const timeStr = start ? `${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'All Day';
                          return (
                            <div key={event.id} style={{
                              padding: '12px',
                              borderRadius: '8px',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              backgroundColor: 'rgba(255, 255, 255, 0.01)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '12px', color: '#fff' }}>{event.summary}</div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>⏱ {timeStr}</div>
                                {event.location && <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>📍 {event.location}</div>}
                              </div>
                              <button onClick={() => handleDeleteCalendarEvent(event.id)} style={{ background: 'none', border: 'none', color: 'var(--color-red)', fontSize: '12px', cursor: 'pointer', padding: '5px' }}>
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px', padding: '20px' }}>No events scheduled for today.</div>
                    )}
                  </div>

                  {/* Right Column: Create Event Form */}
                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '15px' }}>SCHEDULE NEW EVENT</h4>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const summary = (form.elements.namedItem('summary') as HTMLInputElement).value;
                      const location = (form.elements.namedItem('location') as HTMLInputElement).value;
                      const start = (form.elements.namedItem('start') as HTMLInputElement).value;
                      const end = (form.elements.namedItem('end') as HTMLInputElement).value;
                      const desc = (form.elements.namedItem('desc') as HTMLTextAreaElement).value;
                      
                      handleCreateCalendarEvent(summary, new Date(start).toISOString(), new Date(end).toISOString(), location, desc);
                      form.reset();
                    }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <input name="summary" type="text" placeholder="Event Summary (e.g. Design Review)" className="neon-input-custom" required style={{ fontSize: '11px', padding: '8px 12px' }} />
                      <input name="location" type="text" placeholder="Location (e.g. Google Meet)" className="neon-input-custom" style={{ fontSize: '11px', padding: '8px 12px' }} />
                      
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>START TIME</span>
                          <input name="start" type="datetime-local" className="neon-input-custom" required style={{ fontSize: '11px', padding: '8px 12px' }} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>END TIME</span>
                          <input name="end" type="datetime-local" className="neon-input-custom" required style={{ fontSize: '11px', padding: '8px 12px' }} />
                        </div>
                      </div>

                      <textarea name="desc" placeholder="Description / Agenda Brief" className="neon-input-custom" style={{ height: '60px', fontSize: '11px', padding: '8px 12px', resize: 'none', fontFamily: 'var(--font-sans)' }} />

                      <button type="submit" className="cyber-btn-primary" style={{ padding: '8px 16px', fontSize: '11px', alignSelf: 'flex-start' }}>
                        CREATE MEETING
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 8. TASKS VIEW */}
          {activeTab === 'tasks' && (
            <div style={styles.settingsPanel}>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px', fontSize: '18px' }}>TASK ARCHIVE</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', height: 'calc(100vh - 200px)' }}>
                {/* Left Column: Tasks List */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>PENDING OPERATIONS</span>
                    <button onClick={fetchTasks} className="cyber-btn-primary" style={{ padding: '4px 10px', fontSize: '10px' }} disabled={isFetchingTasks}>
                      {isFetchingTasks ? 'LOADING...' : 'RELOAD'}
                    </button>
                  </div>

                  {localTasksList.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {localTasksList.map(task => {
                        const priorityColors: { [key: string]: string } = {
                          high: 'var(--color-red)',
                          medium: 'var(--color-blue)',
                          low: 'var(--color-text-secondary)'
                        };
                        return (
                          <div key={task.id} style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            backgroundColor: 'rgba(255, 255, 255, 0.01)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            opacity: task.completed ? 0.6 : 1
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input 
                                type="checkbox" 
                                checked={task.completed} 
                                onChange={() => handleToggleTask(task.id)}
                                style={{ cursor: 'pointer' }}
                              />
                              <span style={{ 
                                fontSize: '11px', 
                                color: '#fff', 
                                textDecoration: task.completed ? 'line-through' : 'none' 
                              }}>
                                {task.text}
                              </span>
                              <span style={{ 
                                fontSize: '8px', 
                                padding: '1px 5px', 
                                borderRadius: '3px', 
                                border: `1px solid ${priorityColors[task.priority]}`, 
                                color: priorityColors[task.priority], 
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}>
                                {task.priority}
                              </span>
                            </div>
                            <button onClick={() => handleDeleteTask(task.id)} style={{ background: 'none', border: 'none', color: 'var(--color-red)', fontSize: '12px', cursor: 'pointer', padding: '5px' }}>
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px', padding: '20px' }}>No active tasks, Boss! You are all caught up.</div>
                  )}
                </div>

                {/* Right Column: Add Task form */}
                <div className="glass-panel" style={{ padding: '24px', height: 'fit-content' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '15px' }}>ADD DIRECTIVE</h4>
                  <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input 
                      type="text" 
                      placeholder="Task description (e.g. Code database rotation module)" 
                      value={newTaskText}
                      onChange={e => setNewTaskText(e.target.value)}
                      className="neon-input-custom" 
                      required 
                      style={{ fontSize: '11px', padding: '8px 12px' }} 
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>PRIORITY LEVEL</span>
                      <select 
                        value={newTaskPriority}
                        onChange={e => setNewTaskPriority(e.target.value as 'high' | 'medium' | 'low')}
                        className="neon-input-custom"
                        style={{
                          fontSize: '11px',
                          padding: '6px 10px',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                      >
                        <option value="high">High Priority</option>
                        <option value="medium">Medium Priority</option>
                        <option value="low">Low Priority</option>
                      </select>
                    </div>

                    <button type="submit" className="cyber-btn-primary" style={{ padding: '8px 16px', fontSize: '11px', marginTop: '10px' }}>
                      ADD TO BACKLOG
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Inline styles corresponding strictly to Apple/Linear Raycast aesthetics
const styles: { [key: string]: React.CSSProperties } = {
  startContainer: {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'var(--bg-deep)',
    fontFamily: 'var(--font-sans)',
  },
  startPanel: {
    width: '450px',
    padding: '30px',
    textAlign: 'center',
  },
  logoTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: 500,
    letterSpacing: '1px',
    marginBottom: '20px',
    color: '#fff',
  },
  progressBar: {
    height: '2px',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '1px',
    overflow: 'hidden',
    marginBottom: '25px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--color-blue)',
    transition: 'width 0.4s ease',
  },
  startLogs: {
    textAlign: 'left',
    height: '120px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
  },
  logLine: {
    marginBottom: '6px',
  },
  appContainer: {
    height: '100vh',
    width: '100vw',
    padding: '0',
    display: 'flex',
    fontFamily: 'var(--font-sans)',
    backgroundColor: 'var(--bg-deep)',
  },
  mainLayout: {
    width: '100%',
    height: '100%',
    display: 'flex',
    overflow: 'hidden',
    border: 'none',
    background: 'transparent',
    borderRadius: 0,
    boxShadow: 'none',
  },
  sidebar: {
    width: '240px',
    borderRight: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    backgroundColor: 'rgba(5,5,8,0.2)',
  },
  sidebarHeader: {
    marginBottom: '35px',
  },
  sidebarTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    letterSpacing: '1px',
    color: '#fff',
  },
  navMenu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  sidebarFooter: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  avatarCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-blue) 0%, rgba(0, 153, 255, 0.4) 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '12px',
    fontFamily: 'var(--font-display)',
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  contentArea: {
    flex: 1,
    padding: '30px 40px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  authContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  authIcon: {
    fontSize: '40px',
    marginBottom: '20px',
  },
  gButton: {
    width: '100%',
    padding: '12px',
    background: 'none',
    border: '1px solid var(--color-blue)',
    color: 'var(--color-blue)',
    borderRadius: '8px',
    fontWeight: 600,
    letterSpacing: '1px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '12px',
  },
  quickActionBtn: {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  },
  rightSidebar: {
    width: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    overflowY: 'auto',
    maxHeight: '100%',
    paddingRight: '5px',
  },
  threadsSidebar: {
    width: '240px',
    borderRight: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    paddingRight: '15px',
    height: '100%',
  },
  newThreadBtn: {
    padding: '10px',
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: '8px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    textAlign: 'left',
  },
  threadsList: {
    marginTop: '15px',
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  threadItem: {
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  },
  activeThreadItem: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderLeft: '2px solid var(--color-blue)',
    paddingLeft: '10px',
  },
  threadItemTitle: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '140px',
  },
  deleteThreadBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  chatHeader: {
    paddingBottom: '15px',
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '15px',
  },
  chatModeSelector: {
    display: 'flex',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px solid var(--border-light)',
    borderRadius: '6px',
    padding: '3px',
    gap: '2px',
  },
  chatModeBtn: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
  },
  activeChatModeBtn: {
    backgroundColor: 'rgba(0, 153, 255, 0.08)',
    color: 'var(--color-blue)',
    fontWeight: 500,
  },
  chatMessageArea: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    paddingRight: '5px',
    marginBottom: '15px',
  },
  emptyChatState: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  },
  chatBubbleContainer: {
    display: 'flex',
    width: '100%',
  },
  chatInputForm: {
    display: 'flex',
    gap: '10px',
  },
  sheetsViewPanel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  sheetsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '15px',
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '20px',
  },
  tableScroll: {
    flex: 1,
    overflow: 'auto',
    padding: '10px',
  },
  emptyTableState: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
  },
  settingsPanel: {
    height: '100%',
    overflowY: 'auto',
  },
  settingsGroup: {
    padding: '24px',
    marginBottom: '20px',
    border: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-panel)',
    borderRadius: '12px'
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.01)',
    fontSize: '13px',
  },
  settingCode: {
    fontFamily: 'monospace',
    background: 'rgba(255, 255, 255, 0.02)',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    color: 'var(--color-blue)',
  },
  dangerBtn: {
    width: '100%',
    padding: '12px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '12px',
  }
};
