export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null; // ID of the parent note, or null if top-level
  expanded: boolean;       // Whether sub-notes are visible in the sidebar
  lastSavedTitle?: string; // Tracks the title currently saved to disk (for renaming)
  isFavorite?: boolean;    // Whether the note is pinned to Favorites
}

export type ViewMode = 'editor' | 'graph';
export type RightSidebarMode = 'ai' | 'note';

export interface GraphNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GraphLink {
  source: string; // Note ID
  target: string; // Note ID
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  autoSync: boolean;
}

export type AppTheme = 'zinc' | 'blue' | 'purple' | 'amber';

// Browser File System Access API Types
export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(options?: any): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory';
  getDirectoryHandle(name: string, options?: any): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: any): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: any): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: any): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}