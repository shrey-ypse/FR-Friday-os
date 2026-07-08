import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Cache file path for local vector memories
const MEMORY_FILE = path.resolve(__dirname, '../../../memory.json');

interface MemoryEntry {
  id: string;
  text: string;
  vector: number[];
  timestamp: string;
}

/**
 * Load configured API key from environmental pools
 */
const getApiKey = (): string => {
  const envKey = process.env.GEMINI_API_KEY || '';
  const keys = envKey.split(',').map(k => k.trim()).filter(Boolean);
  return keys[0] || '';
};

/**
 * Query Gemini's text-embedding-004 model to generate numeric vector representations
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent(text);
  
  if (!result.embedding || !result.embedding.values) {
    throw new Error('Failed to generate embedding vector from Gemini API.');
  }
  
  return result.embedding.values;
}

/**
 * Read memory cache file
 */
export function loadMemories(): MemoryEntry[] {
  if (!fs.existsSync(MEMORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (err: any) {
    console.error('[Memory Service] Failed to parse memory.json:', err.message);
    return [];
  }
}

/**
 * Save updated memory cache file
 */
export function saveMemories(memories: MemoryEntry[]) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf-8');
}

/**
 * Encode and store a text snippet locally
 */
export async function saveMemory(text: string): Promise<boolean> {
  if (!text || text.trim() === '') {
    throw new Error('Memory record text cannot be empty.');
  }

  const vector = await getEmbedding(text);
  const memories = loadMemories();
  
  const entry: MemoryEntry = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
    text: text.trim(),
    vector,
    timestamp: new Date().toISOString()
  };
  
  memories.push(entry);
  saveMemories(memories);
  return true;
}

/**
 * Fetch top matching memory records based on cosine dot-product similarity
 */
export async function searchMemory(query: string, limit: number = 3): Promise<string[]> {
  if (!query || query.trim() === '') {
    return [];
  }

  const queryVector = await getEmbedding(query);
  const memories = loadMemories();
  
  if (memories.length === 0) {
    return [];
  }

  // Calculate similarity scores using dot products (Gemini embeddings are unit-normalized, so dot product = cosine similarity)
  const scoredMemories = memories.map(entry => {
    let dotProduct = 0;
    const len = Math.min(queryVector.length, entry.vector.length);
    for (let i = 0; i < len; i++) {
      dotProduct += queryVector[i] * entry.vector[i];
    }
    return {
      text: entry.text,
      score: dotProduct
    };
  });

  // Sort in descending order and return results above threshold (0.3)
  return scoredMemories
    .filter(m => m.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.text);
}

/**
 * Delete a memory record by ID
 */
export function deleteMemory(id: string): boolean {
  const memories = loadMemories();
  const filtered = memories.filter(m => m.id !== id);
  if (filtered.length === memories.length) {
    return false;
  }
  saveMemories(filtered);
  return true;
}
