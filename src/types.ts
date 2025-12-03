export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  deleted?: boolean;
  deletedAt?: number;
  isPinned?: boolean;
  color?: string; // Hex color code
}

export type ViewMode = 'edit' | 'preview' | 'split';

export interface AppSettings {
  autoSave: boolean;
  saveInterval: number; // in milliseconds
  serverUrl?: string;
}