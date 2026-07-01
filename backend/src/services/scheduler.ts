import fs from 'fs';
import path from 'path';
import { chatWithFriday } from './gemini';
import { sendGmail } from './google';
import { emitLog } from './logger';

export interface AutomationJob {
  id: string;
  name: string;
  intervalMinutes: number;
  prompt: string;
  active: boolean;
  lastRun?: string;
  nextRun?: string;
}

const CONFIG_PATH = path.join(__dirname, '../../../automations.json');
let jobs: AutomationJob[] = [];
let intervals: { [jobId: string]: NodeJS.Timeout } = {};
let latestToken: string | null = null;

// Load schedules from local automations.json persistent file
export function loadJobs() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      jobs = JSON.parse(data);
      console.log(`⏰ [Scheduler] Loaded ${jobs.length} automation rules.`);
    } else {
      // Default placeholder task
      jobs = [
        {
          id: 'morning-brief',
          name: 'Daily Morning Agenda Email Summary',
          intervalMinutes: 1440, // 24 hours
          prompt: 'Retrieve my calendar events for today, compile a friendly 3-sentence daily briefing, and email it to my address sir@fridayos.ai.',
          active: false
        }
      ];
      saveJobs();
    }
  } catch (err) {
    console.error('Failed to load scheduler configuration:', err);
  }
}

export function saveJobs() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(jobs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save scheduler configuration:', err);
  }
}

export function setGoogleTokenForBackground(token: string) {
  latestToken = token;
}

export function getJobs() {
  return jobs;
}

// Start the scheduler daemon loop for a job
function startJobLoop(job: AutomationJob) {
  if (intervals[job.id]) {
    clearInterval(intervals[job.id]);
  }

  if (!job.active) return;

  const runIntervalMs = job.intervalMinutes * 60000;
  
  // Set next execution timestamp estimate
  job.nextRun = new Date(Date.now() + runIntervalMs).toLocaleTimeString();
  saveJobs();

  intervals[job.id] = setInterval(async () => {
    await executeJob(job.id);
  }, runIntervalMs);
}

// Start the scheduler daemon for all active jobs on boot
export function startScheduler() {
  loadJobs();
  jobs.forEach(job => {
    if (job.active) {
      startJobLoop(job);
    }
  });
  console.log('⏰ [Scheduler] Daemon loops initialized.');
}

// Stop all interval timers
export function stopScheduler() {
  Object.keys(intervals).forEach(key => {
    clearInterval(intervals[key]);
  });
  intervals = {};
}

// Execute an individual job manually or via interval trigger
export async function executeJob(jobId: string): Promise<boolean> {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return false;

  console.log(`⏰ [Scheduler] Running background automation task: "${job.name}"...`);
  emitLog('info', `⏰ [Scheduler] Running background automation task: "${job.name}"...`);
  
  try {
    job.lastRun = new Date().toLocaleTimeString();
    
    // Execute job instruction using Gemini V2 tool-calling chain
    const result = await chatWithFriday(
      `Background Automated Instruction: ${job.prompt}`, 
      [], // Empty history for clean isolated run
      latestToken || undefined, 
      'workspace'
    );
    
    const message = `⏰ [Scheduler] Automation "${job.name}" completed. Response: ${result.content.slice(0, 100)}`;
    console.log(message);
    emitLog('success', message);
    
    // If nextRun calculation helper is active, update next run time
    if (job.active) {
      const runIntervalMs = job.intervalMinutes * 60000;
      job.nextRun = new Date(Date.now() + runIntervalMs).toLocaleTimeString();
    }
    saveJobs();
    return true;
  } catch (error: any) {
    const errMsg = `⏰ [Scheduler] Failed executing automation job "${job.name}": ${error.message}`;
    console.error(errMsg);
    emitLog('error', errMsg);
    return false;
  }
}

// Add or update a job in the system
export function addOrUpdateJob(job: Omit<AutomationJob, 'id'> & { id?: string }): AutomationJob {
  const id = job.id || `job-${Date.now()}`;
  const existingIdx = jobs.findIndex(j => j.id === id);

  const updatedJob: AutomationJob = {
    id,
    name: job.name,
    intervalMinutes: Number(job.intervalMinutes) || 60,
    prompt: job.prompt,
    active: job.active,
    lastRun: existingIdx >= 0 ? jobs[existingIdx].lastRun : undefined
  };

  if (existingIdx >= 0) {
    jobs[existingIdx] = updatedJob;
  } else {
    jobs.push(updatedJob);
  }

  saveJobs();
  
  if (updatedJob.active) {
    startJobLoop(updatedJob);
  } else {
    if (intervals[id]) {
      clearInterval(intervals[id]);
      delete intervals[id];
    }
  }

  return updatedJob;
}

// Delete a job
export function deleteJob(id: string): boolean {
  const existingIdx = jobs.findIndex(j => j.id === id);
  if (existingIdx === -1) return false;

  jobs.splice(existingIdx, 1);
  saveJobs();

  if (intervals[id]) {
    clearInterval(intervals[id]);
    delete intervals[id];
  }

  return true;
}
