import fs from 'fs';
import path from 'path';
import { loadMemories, saveMemories } from './memory';
import { listWorkspaceFiles } from './files';

const STATE_FILE = path.resolve(__dirname, '../../../digital_state.json');

export interface DigitalState {
  currentFocus: string;
  mood: 'focused' | 'calm' | 'interrupted';
  interruptions: 'low' | 'medium' | 'high';
  energy: 'high' | 'medium' | 'low';
  pendingDecisions: string[];
  blockedTasks: string[];
  currentGoal: string;
  progressPercentage: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'project' | 'file' | 'memory' | 'tool' | 'email' | 'event';
  metadata?: any;
}

export interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

export interface ContextGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface TrustTraceItem {
  source: string;
  type: 'state' | 'memory' | 'file' | 'gmail' | 'calendar';
  weight: number; // 0-100 score representing context score/similarity
}

/**
 * Initialize default digital state
 */
const DEFAULT_STATE: DigitalState = {
  currentFocus: "Refactoring AI Context Engine",
  mood: "focused",
  interruptions: "low",
  energy: "high",
  pendingDecisions: [
    "Test Context Graph rendering in frontend",
    "Calibrate Memory Decay lambda coefficient"
  ],
  blockedTasks: [
    "Configure multi-account OAuth callbacks"
  ],
  currentGoal: "Launch FRIDAY OS V4.0 with explainable AI context layers",
  progressPercentage: 80
};

/**
 * Load User Digital State from local cache
 */
export function loadDigitalState(): DigitalState {
  if (!fs.existsSync(STATE_FILE)) {
    saveDigitalState(DEFAULT_STATE);
    return DEFAULT_STATE;
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw) || DEFAULT_STATE;
  } catch (err) {
    console.error('[Context Engine] Failed to read digital_state.json:', err);
    return DEFAULT_STATE;
  }
}

/**
 * Save User Digital State
 */
export function saveDigitalState(state: DigitalState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Context Engine] Failed to save digital_state.json:', err);
  }
}

/**
 * Compute Ebbinghaus-styled Memory Decay score.
 * Formula: score = importance * e^(-lambda * delta_t) + log2(1 + frequency)
 * lambda = 0.00005 (half-life of approx. 10 days)
 */
export function calculateDecayScore(entry: any, now: Date): number {
  const importance = entry.importance !== undefined ? Number(entry.importance) : 50;
  const frequency = entry.frequency !== undefined ? Number(entry.frequency) : 1;
  const recencyStr = entry.recency || entry.timestamp;
  
  const recencyDate = new Date(recencyStr);
  const diffMs = now.getTime() - recencyDate.getTime();
  const diffMin = Math.max(0, diffMs / (1000 * 60)); // elapsed time in minutes
  
  const lambda = 0.00005; // decay factor
  const retention = Math.exp(-lambda * diffMin);
  
  const decayScore = (importance * retention) + Math.log2(1 + frequency);
  return Math.min(100, Math.max(0, decayScore));
}

/**
 * Update memory usage metadata (strengthen memory trace)
 */
export function recordMemoryAccess(id: string) {
  const memories = loadMemories();
  const updated = memories.map(entry => {
    if (entry.id === id) {
      const currentEntry = entry as any;
      return {
        ...entry,
        importance: currentEntry.importance !== undefined ? currentEntry.importance : 50,
        frequency: (currentEntry.frequency !== undefined ? currentEntry.frequency : 1) + 1,
        recency: new Date().toISOString()
      };
    }
    return entry;
  });
  saveMemories(updated);
}

/**
 * Compile the dynamic contextual node graph
 */
export function generateContextGraph(): ContextGraph {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Root User node
  nodes.push({ id: 'boss', label: 'Shreyas (Boss)', type: 'user' });

  // Current Project node
  const state = loadDigitalState();
  nodes.push({ 
    id: 'project_node', 
    label: state.currentGoal || 'FRIDAY OS', 
    type: 'project',
    metadata: { focus: state.currentFocus } 
  });
  links.push({ source: 'boss', target: 'project_node', relationship: 'focuses_on' });

  // Stored memories nodes
  const memories = loadMemories();
  memories.slice(0, 10).forEach((mem, index) => {
    const memId = `mem_${mem.id}`;
    const truncatedText = mem.text.length > 25 ? mem.text.substring(0, 25) + '...' : mem.text;
    nodes.push({ id: memId, label: `🧠 ${truncatedText}`, type: 'memory', metadata: { text: mem.text } });
    links.push({ source: 'boss', target: memId, relationship: 'remembers' });
  });

  // Local Workspace files nodes
  try {
    const workspacePath = path.resolve(__dirname, '../../../workspace');
    if (fs.existsSync(workspacePath)) {
      const files = fs.readdirSync(workspacePath);
      files.slice(0, 10).forEach(file => {
        const fileId = `file_${file}`;
        nodes.push({ id: fileId, label: `📁 ${file}`, type: 'file' });
        links.push({ source: 'project_node', target: fileId, relationship: 'contains_code' });
      });
    }
  } catch (err) {
    console.error('[Context Graph] Failed to read workspace files for graph:', err);
  }

  // Active tools
  nodes.push({ id: 'tool_sheets', label: 'Google Sheets Logs', type: 'tool' });
  nodes.push({ id: 'tool_calendar', label: 'Calendar Schedule', type: 'tool' });
  nodes.push({ id: 'tool_gmail', label: 'Gmail Stream', type: 'tool' });
  
  links.push({ source: 'boss', target: 'tool_sheets', relationship: 'logs_actions' });
  links.push({ source: 'boss', target: 'tool_calendar', relationship: 'manages_events' });
  links.push({ source: 'boss', target: 'tool_gmail', relationship: 'receives_emails' });

  return { nodes, links };
}

/**
 * Perform context budgeting: Score context sources, rank them, and output a dynamic system context block
 */
export async function getContextBudgetPrompt(
  userQuery: string,
  limitChars: number = 6000
): Promise<{ contextPrompt: string; trustTrace: TrustTraceItem[] }> {
  const now = new Date();
  const trustTrace: TrustTraceItem[] = [];
  const contextBlocks: { title: string; type: TrustTraceItem['type']; content: string; score: number }[] = [];

  // 1. Digital State Context
  const state = loadDigitalState();
  const stateContent = `
[USER DIGITAL STATE]
Current Goal: ${state.currentGoal}
Current Focus: ${state.currentFocus}
Mood: ${state.mood} | Energy: ${state.energy} | Interruptions: ${state.interruptions}
Pending Decisions: ${state.pendingDecisions.join(', ')}
Blocked Tasks: ${state.blockedTasks.join(', ')}
  `.trim();
  contextBlocks.push({
    title: 'User Digital State',
    type: 'state',
    content: stateContent,
    score: 100 // Digital state always gets highest priority budget allocation
  });
  trustTrace.push({ source: 'User Digital State', type: 'state', weight: 100 });

  // 2. Stored Memories Context (Decaying RAG)
  const memories = loadMemories();
  if (memories.length > 0) {
    // Score all memories using Ebbinghaus decay
    const scoredMemories = memories.map(mem => {
      const score = calculateDecayScore(mem, now);
      return { mem, score };
    });

    // Sort by decay score and take top 5
    const topMemories = scoredMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    topMemories.forEach(({ mem, score }) => {
      contextBlocks.push({
        title: `Memory Fact (${mem.id})`,
        type: 'memory',
        content: `Fact: ${mem.text} (Saved: ${mem.timestamp})`,
        score: Math.round(score)
      });
      
      // Update access stats for memories retrieved
      recordMemoryAccess(mem.id);
      
      const truncated = mem.text.length > 30 ? mem.text.substring(0, 30) + '...' : mem.text;
      trustTrace.push({ source: `Memory: ${truncated}`, type: 'memory', weight: Math.round(score) });
    });
  }

  // 3. Local Workspace files context
  try {
    const files = listWorkspaceFiles();
    if (files.length > 0) {
      // Pick top 3 workspace files based on modification recency
      files.slice(0, 3).forEach(file => {
        const workspacePath = path.resolve(__dirname, '../../../workspace');
        const filePath = path.join(workspacePath, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const sizeKb = (stats.size / 1024).toFixed(1);
          contextBlocks.push({
            title: `Workspace File (${file})`,
            type: 'file',
            content: `Filename: ${file} | Size: ${sizeKb}KB | Modified: ${stats.mtime.toISOString()}`,
            score: 75 // files get constant base priority
          });
          trustTrace.push({ source: `File: ${file}`, type: 'file', weight: 75 });
        }
      });
    }
  } catch (e) {
    console.error('[Context Budget] Failed to load workspace context:', e);
  }

  // Sort all context blocks by score in descending order
  const sortedBlocks = contextBlocks.sort((a, b) => b.score - a.score);

  // Apply context budgeting constraint (fitting character limits)
  let compiledContext = '';
  let budgetRemaining = limitChars;

  for (const block of sortedBlocks) {
    const blockText = `\n--- ${block.title} ---\n${block.content}\n`;
    if (blockText.length <= budgetRemaining) {
      compiledContext += blockText;
      budgetRemaining -= blockText.length;
    } else {
      // Allocate fractional context block if room is tight
      const slicedContent = block.content.substring(0, budgetRemaining);
      if (slicedContent.length > 50) {
        compiledContext += `\n--- ${block.title} (Slipped/Budget-Cut) ---\n${slicedContent}...\n`;
      }
      break;
    }
  }

  return {
    contextPrompt: compiledContext.trim(),
    trustTrace
  };
}
