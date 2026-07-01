import { emitLog } from './logger';

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Sends a chat prompt and history to a local Ollama server (http://localhost:11434)
 */
export async function chatWithOllama(
  modelName: string,
  message: string,
  history: any[] = [],
  systemInstruction?: string
): Promise<{ content: string; role: string }> {
  const url = 'http://localhost:11434/api/chat';
  
  // Consolidate messages matching Ollama's schema: { role, content }
  const messages: OllamaMessage[] = [];
  
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  history.forEach(h => {
    messages.push({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.content
    });
  });

  // Append the current active user prompt
  messages.push({ role: 'user', content: message });

  emitLog('info', `[Ollama] Sending chat payload to local model "${modelName}"...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
    const content = data.message?.content || '';
    
    emitLog('info', '[Ollama] Response generated successfully.');

    return {
      content,
      role: 'model'
    };
  } catch (err: any) {
    emitLog('error', `[Ollama] Failed to connect to local server: ${err.message}`);
    throw new Error(`Local LLM offline. Ensure Ollama is installed and running on http://localhost:11434 with model "${modelName}" downloaded.`);
  }
}
