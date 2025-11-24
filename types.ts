export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  synced?: boolean;
  isDeleted?: boolean;
}

export type ViewMode = 'edit' | 'preview' | 'split';

export interface AppSettings {
  autoSave: boolean;
  saveInterval: number;
  serverUrl?: string;
  serverApiKey?: string;
}