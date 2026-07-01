import { EventEmitter } from 'events';

export const logEmitter = new EventEmitter();

export function emitLog(type: 'info' | 'success' | 'warning' | 'error', message: string) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[FRIDAY Log] [${type.toUpperCase()}] ${message}`);
  logEmitter.emit('log', { timestamp, type, message });
}
