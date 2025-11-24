export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  synced?: boolean;
  isDeleted?: boolean; // Must be present
}

export type ViewMode = 'all' | 'trash'; // <--- UPDATED: New View Mode Type

export interface AppSettings {
  autoSave: boolean;
  saveInterval: number; // in milliseconds
  serverUrl?: string;
  serverApiKey?: string;
}