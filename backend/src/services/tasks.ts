import fs from 'fs';
import path from 'path';

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

const tasksFilePath = path.resolve(__dirname, '../../../tasks.json');

export function getTasks(): TaskItem[] {
  if (!fs.existsSync(tasksFilePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(tasksFilePath, 'utf8');
    return (JSON.parse(data) as TaskItem[]) || [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: TaskItem[]): void {
  fs.writeFileSync(tasksFilePath, JSON.stringify(tasks, null, 2), 'utf8');
}

export function addTask(text: string, priority: 'high' | 'medium' | 'low' = 'medium'): TaskItem {
  const tasks = getTasks();
  const newTask: TaskItem = {
    id: Math.random().toString(36).substring(2, 11),
    text,
    completed: false,
    priority,
    createdAt: new Date().toISOString()
  };
  tasks.push(newTask);
  saveTasks(tasks);
  return newTask;
}

export function toggleTask(id: string): boolean {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasks(tasks);
    return true;
  }
  return false;
}

export function deleteTask(id: string): boolean {
  const tasks = getTasks();
  const filtered = tasks.filter(t => t.id !== id);
  if (filtered.length !== tasks.length) {
    saveTasks(filtered);
    return true;
  }
  return false;
}
