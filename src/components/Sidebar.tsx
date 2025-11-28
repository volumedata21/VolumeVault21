import React, { useState, useMemo } from 'react';
import { Note } from './types';
import { Plus, Search, Trash2, X, Settings, ChevronDown, ChevronRight, Github, RotateCcw, AlertOctagon, Grid, LayoutDashboard, AppWindow } from 'lucide-react';

interface SidebarProps {
  notes: Note[];
  currentNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void; // Soft delete
  onRestoreNote: (id: string) => void;
  onPermanentDeleteNote: (id: string) => void;
  onEmptyTrash: () => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  view: 'notes' | 'trash';
  onChangeView: (view: 'notes' | 'trash') => void;
  trashCount: number;
  navigateToDashboard: () => void; 
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  currentNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onRestoreNote,
  onPermanentDeleteNote,
  onEmptyTrash,
  isOpen,
  onCloseMobile,
  onOpenSettings,
  view,
  onChangeView,
  trashCount,
  navigateToDashboard 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [sortCriterion, setSortCriterion] = useState<'updatedAt' | 'title'>('updatedAt');

  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        const searchLower = searchTerm.toLowerCase();
        return (
          note.title.toLowerCase().includes(searchLower) || 
          note.content.toLowerCase().includes(searchLower) ||
          note.category.toLowerCase().includes(searchLower) ||
          (note.tags && note.tags.some(tag => tag.toLowerCase().includes(searchLower)))
        );
      })
      .sort((a, b) => {
          // 1. Sort by Pinned status first (Sidebar should also reflect pinned state)
          if (a.isPinned !== b.isPinned) {
              return a.isPinned ? -1 : 1;
          }
          // 2. Then by criterion
          if (sortCriterion === 'title') {
              return a.title.localeCompare(b.title);
          }
          return b.updatedAt - a.updatedAt;
      });
  }, [notes, searchTerm, sortCriterion]);

  const groupedNotes = useMemo(() => {
    return filteredNotes.reduce((acc, note) => {
      const category = note.category || 'Uncategorized';
      if (!acc[category]) acc[category] = [];
      acc[category].push(note);
      return acc;
    }, {} as Record<string, Note[]>);
  }, [filteredNotes]);

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
  
  const collapseAll = () => {
    setCollapsedCategories(new Set(sortedCategories));
  };

  const expandAll = () => {
    setCollapsedCategories(new Set());
  };

  const shouldShowExpand = collapsedCategories.size > 0;

  const isTrash = view === 'trash';
  

  return (
    <div className={`
      fixed inset-y-0 left-0 z-30 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out flex flex-col
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:relative md:translate-x-0
    `}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
        <button 
            onClick={isTrash ? undefined : navigateToDashboard}
            className={`
                text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r cursor-pointer 
                ${isTrash ? 'pointer-events-none' : 'hover:brightness-110 transition-all'}
            `}
            style={{backgroundImage: 'linear-gradient(to right, #DD3D2D, #F67E4B)'}}
            title="Go to Dashboard"
        >
          {isTrash ? 'Trash Bin' : 'VolumeVault21'}
        </button>
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
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-500"
            aria-label="Search"
          />
        </div>
        
        {!isTrash ? (
            <button
            onClick={onCreateNote}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white py-2 px-4 rounded-lg text-sm font-bold transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-700 dark:ring-offset-gray-900"
            >
            <Plus size={16} />
            New Note
            </button>
        ) : (
             <button
                onClick={() => {
                    if (confirm("Are you sure you want to permanently delete all notes in the trash? This cannot be undone.")) {
                        onEmptyTrash();
                    }
                }}
                className="w-full flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 py-2 px-4 rounded-lg text-sm font-bold transition-all border border-red-200 dark:border-red-800"
            >
                <Trash2 size={16} />
                Empty Trash
            </button>
        )}
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto px-2">
        {/* Dashboard Link */}
        {!isTrash && (
            <div className="p-2">
                <button
                    onClick={() => {
                        navigateToDashboard();
                        onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold ${
                        currentNoteId === null 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' 
                            : 'text-gray-700 dark:text-gray-300'
                    }`}
                >
                    <AppWindow size={20} /> Dashboard
                </button>
            </div>
        )}
        
        {filteredNotes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            {searchTerm 
                ? 'No notes found' 
                : isTrash 
                    ? 'Trash is empty' 
                    : 'Select a note or create a new one!'}
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            
            {/* Sort & Collapse Controls */}
            <div className="flex justify-between items-center px-2 pt-2 pb-1 text-xs">
                <select
                    value={sortCriterion}
                    onChange={(e) => setSortCriterion(e.target.value as 'updatedAt' | 'title')}
                    className="bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer focus:outline-none"
                >
                    <option value="updatedAt">Sort by Date</option>
                    <option value="title">Sort by Title</option>
                </select>

                <button
                    onClick={shouldShowExpand ? expandAll : collapseAll}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                    {shouldShowExpand ? 'Expand All' : 'Collapse All'}
                </button>
            </div>
            
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
                  <ul className="space-y-0.5"> {/* FIX: Reduced from space-y-1 to 0.5 */}
                    {groupedNotes[category].map(note => (
                      <li key={note.id}>
                        <button
                          onClick={() => {
                            onSelectNote(note.id);
                            onCloseMobile(); 
                          }}
                          // FIX: Reduced p-3 to py-2 px-3 for tighter vertical spacing
                          className={`w-full text-left py-2 px-3 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 group relative ${
                            currentNoteId === note.id 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' 
                            : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="pr-6">
                            <h3 className={`font-semibold text-sm truncate ${isTrash ? 'line-through text-gray-500' : ''}`}>
                              {note.title || 'Untitled'}
                            </h3>
                            {/* FIX: Reduced margin-top from mt-1 to mt-0.5 */}
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {new Date(note.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          
                          <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-100 md:opacity-0 group-hover:md:opacity-100 transition-opacity">
                             {!isTrash ? (
                                <div 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteNote(note.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-700 dark:hover:text-red-400 cursor-pointer rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
                                    title="Move to Trash"
                                >
                                    <Trash2 size={14} />
                                </div>
                             ) : (
                                <>
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRestoreNote(note.id);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 cursor-pointer rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
                                        title="Restore"
                                    >
                                        <RotateCcw size={14} />
                                    </div>
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("Delete this note permanently?")) {
                                                onPermanentDeleteNote(note.id);
                                            }
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-red-700 dark:hover:text-red-400 cursor-pointer rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
                                        title="Delete Permanently"
                                    >
                                        <AlertOctagon size={14} />
                                    </div>
                                </>
                             )}
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
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 space-y-3">
        <div className="flex bg-gray-200 dark:bg-gray-800 rounded-lg p-1 text-xs font-medium">
             <button 
                onClick={() => onChangeView('notes')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${!isTrash ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
             >
                Notes
             </button>
             <button 
                onClick={() => onChangeView('trash')}
                className={`flex-1 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${isTrash ? 'bg-white dark:bg-gray-700 shadow text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
             >
                <Trash2 size={12} /> Trash {trashCount > 0 && `(${trashCount})`}
             </button>
        </div>

        <div className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 font-medium">
           <span>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>
           <div className="flex items-center gap-3">
             <a 
               href="https://github.com/volumedata21/volumevault21" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline" 
               title="GitHub Repo"
             >
               <Github size={14} />
             </a>
             <button onClick={onOpenSettings} className="flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline" title="Settings">
               <Settings size={14} />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};