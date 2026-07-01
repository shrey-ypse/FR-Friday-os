import fs from 'fs';
import path from 'path';

// Define the root workspace directory path
const WORKSPACE_DIR = path.resolve(__dirname, '../../../workspace');

// Automatically initialize the workspace directory on startup
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

/**
 * Resolves the given filename to a safe absolute path, blocking directory traversal attacks
 */
function getSafePath(filename: string): string {
  // Prevent empty or malicious file names
  if (!filename || filename.trim() === '') {
    throw new Error('Filename cannot be empty.');
  }
  
  const resolvedPath = path.resolve(WORKSPACE_DIR, filename);
  if (!resolvedPath.startsWith(WORKSPACE_DIR)) {
    throw new Error('Access denied: File operations restricted to the local workspace folder.');
  }
  return resolvedPath;
}

/**
 * Read text content of a workspace file
 */
export function readWorkspaceFile(filename: string): string {
  const filePath = getSafePath(filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filename}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write or update content of a workspace file
 */
export function writeWorkspaceFile(filename: string, content: string): boolean {
  const filePath = getSafePath(filename);
  const dirPath = path.dirname(filePath);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(filePath, content || '', 'utf-8');
  return true;
}

/**
 * Recursively list all files relative to the workspace directory
 */
export function listWorkspaceFiles(): string[] {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    return [];
  }
  
  function getFiles(dir: string): string[] {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat && stat.isDirectory()) {
        results.push(...getFiles(filePath));
      } else {
        results.push(path.relative(WORKSPACE_DIR, filePath).replace(/\\/g, '/'));
      }
    }
    return results;
  }
  
  try {
    return getFiles(WORKSPACE_DIR);
  } catch (err: any) {
    console.error('[Filesystem Tools] Failed to list directory:', err.message);
    return [];
  }
}
