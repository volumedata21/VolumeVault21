import React, { useState } from 'react';
import { Note } from '../types';
import { Plus, Search, Trash2, X, Download, Settings, ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarProps {
  notes: Note[];
  currentNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onExport: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  currentNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  isOpen,
  onCloseMobile,
  onExport,
  onOpenSettings
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const filteredNotes = notes
    .filter((note) => 
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  // Group by category
  const groupedNotes = filteredNotes.reduce((acc, note) => {
    const category = note.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(note);
    return acc;
  }, {} as Record<string, Note[]>);

  const sortedCategories = Object.keys(groupedNotes).sort();

  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  return (
    <div className={`
      fixed inset-y-0 left-0 z-30 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out flex flex-col
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:relative md:translate-x-0
    `}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-500 dark:from-blue-400 dark:to-indigo-300 tracking-tight">
          VolumeVault21
        </h1>
        <button onClick={onCloseMobile} className="md:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
          <X size={20} />
        </button>
      </div>

      {/* Search & Actions */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-500 dark:text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-500"
            aria-label="Search notes"
          />
        </div>
        <button
          onClick={onCreateNote}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white py-2 px-4 rounded-lg text-sm font-bold transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-700 dark:ring-offset-gray-900"
        >
          <Plus size={16} />
          New Note
        </button>
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredNotes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            {searchTerm ? 'No notes found' : 'Create your first note!'}
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {sortedCategories.map(category => (
              <div key={category} className="space-y-1">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-2 px-2 py-1 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 uppercase tracking-wider transition-colors"
                >
                  {collapsedCategories.has(category) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  {category} <span className="text-gray-400 font-normal">({groupedNotes[category].length})</span>
                </button>
                
                {!collapsedCategories.has(category) && (
                  <ul className="space-y-1">
                    {groupedNotes[category].map(note => (
                      <li key={note.id}>
                        <button
                          onClick={() => {
                            onSelectNote(note.id);
                            onCloseMobile();
                          }}
                          className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 group relative ${
                            currentNoteId === note.id 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' 
                            : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="pr-6">
                            <h3 className={`font-semibold text-sm truncate`}>
                              {note.title || 'Untitled'}
                            </h3>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                              {new Date(note.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNote(note.id);
                            }}
                            className="absolute right-2 top-3 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-700 dark:hover:text-red-400 cursor-pointer rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Delete Note"
                          >
                            <Trash2 size={14} />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer / Settings */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 font-medium">
           <span>{notes.length} notes</span>
           <div className="flex items-center gap-3">
             <button onClick={onExport} className="flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline" title="Download JSON Backup">
               <Download size={14} /> Backup
             </button>
             <button onClick={onOpenSettings} className="flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline" title="Settings">
               <Settings size={14} />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};