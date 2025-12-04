import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import { Note } from '../types';
import { Search, Plus, FileText, Settings, LayoutDashboard, X } from 'lucide-react';

interface CommandPaletteProps {
  notes: Note[];
  isOpen: boolean; // NEW: Controlled by parent
  onOpenChange: (open: boolean) => void; // NEW: Callback to parent
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onNavigateDashboard: () => void;
  onOpenSettings: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  notes,
  isOpen,
  onOpenChange,
  onSelectNote,
  onCreateNote,
  onNavigateDashboard,
  onOpenSettings
}) => {
  // Toggle the menu when ⌘K or Ctrl+K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!isOpen);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, onOpenChange]);

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  if (!isOpen) return null;

  return (
    // OUTER CONTAINER:
    // Mobile: Fixed full screen, white background, z-50
    // Desktop: Fixed full screen, flex center for modal positioning
    <div className="fixed inset-0 z-50 flex flex-col md:block items-start justify-center md:pt-[20vh] px-0 md:px-4 bg-white dark:bg-gray-900 md:bg-transparent md:dark:bg-transparent">
      
      {/* Backdrop (Desktop Only) */}
      <div 
        className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={() => onOpenChange(false)}
      />
      
      {/* Command Palette Modal / Full Screen Container */}
      <div className="relative w-full md:max-w-xl mx-auto flex flex-col h-full md:h-auto bg-white dark:bg-gray-800 md:rounded-xl shadow-none md:shadow-2xl overflow-hidden border-none md:border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-100">
        <Command label="Command Menu" className="w-full flex-1 flex flex-col">
          
          {/* Header / Search Input */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4 py-2 md:py-0">
            <Search className="mr-3 h-5 w-5 text-gray-500 shrink-0" />
            <Command.Input 
              autoFocus
              placeholder="Type a command or search notes..." 
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-base md:text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100"
            />
            {/* Mobile Close Button */}
            <button 
                onClick={() => onOpenChange(false)}
                className="md:hidden p-2 -mr-2 text-gray-500"
            >
                <X size={20} />
            </button>
          </div>

          {/* List of Results */}
          <Command.List className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 md:max-h-[300px]">
            <Command.Empty className="py-6 text-center text-sm text-gray-500">No results found.</Command.Empty>

            {/* Global Actions Group */}
            <Command.Group heading="Actions" className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 mb-2">
              <Command.Item 
                onSelect={() => runCommand(onCreateNote)}
                className="flex items-center gap-3 px-3 py-3 md:py-2 text-base md:text-sm text-gray-700 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 aria-selected:bg-blue-600 aria-selected:text-white transition-colors"
              >
                <Plus size={18} className="md:w-4 md:h-4" />
                <span>Create New Note</span>
              </Command.Item>
              
              <Command.Item 
                onSelect={() => runCommand(onNavigateDashboard)}
                className="flex items-center gap-3 px-3 py-3 md:py-2 text-base md:text-sm text-gray-700 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 aria-selected:bg-blue-600 aria-selected:text-white transition-colors"
              >
                <LayoutDashboard size={18} className="md:w-4 md:h-4" />
                <span>Go to Dashboard</span>
              </Command.Item>

              <Command.Item 
                onSelect={() => runCommand(onOpenSettings)}
                className="flex items-center gap-3 px-3 py-3 md:py-2 text-base md:text-sm text-gray-700 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 aria-selected:bg-blue-600 aria-selected:text-white transition-colors"
              >
                <Settings size={18} className="md:w-4 md:h-4" />
                <span>Settings</span>
              </Command.Item>
            </Command.Group>

            <Command.Separator className="my-2 h-px bg-gray-200 dark:bg-gray-700" />

            {/* Notes Group */}
            <Command.Group heading="Notes" className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
              {notes.filter(n => !n.deleted).map((note) => (
                <Command.Item
                  key={note.id}
                  value={`${note.title} ${note.content}`}
                  onSelect={() => runCommand(() => onSelectNote(note.id))}
                  className="flex items-center gap-3 px-3 py-3 md:py-2 text-base md:text-sm text-gray-700 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 aria-selected:bg-blue-600 aria-selected:text-white transition-colors"
                >
                  <FileText size={18} className="opacity-50 md:w-4 md:h-4" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{note.title || 'Untitled'}</span>
                    <span className="text-xs opacity-70 truncate">
                      {note.category} • {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

          </Command.List>
        </Command>
      </div>
    </div>
  );
};