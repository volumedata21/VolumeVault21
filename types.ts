export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export type ViewMode = 'edit' | 'preview' | 'split';

export interface AppSettings {
  autoSave: boolean;
  saveInterval: number; // in milliseconds
  serverUrl?: string;
  serverApiKey?: string;
}
