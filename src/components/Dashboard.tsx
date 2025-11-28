import React from 'react';
import { Note } from '../types';
import { Plus } from 'lucide-react';

interface DashboardProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  notes,
  onSelectNote,
  onCreateNote,
}) => {

  const activeNotes = notes.filter(n => !n.deleted);
  const totalNotes = activeNotes.length;

  return (
    <div className="p-4 md:p-8 h-full">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 md:mb-8">
        Your Notes ({totalNotes})
      </h2>

      {/* Note Grid */}
      {totalNotes > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeNotes.map(note => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className="group flex flex-col p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 text-left border border-gray-200 dark:border-gray-700 h-full"
            >
              <h3 className="text-lg font-semibold truncate text-gray-900 dark:text-gray-100 mb-2">
                {note.title || 'Untitled Note'}
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-400 flex-1 overflow-hidden" 
                   style={{ maxHeight: '100px' }}>
                {/* Display a snippet of the content, sanitized */}
                {note.content.split('\n')[0].substring(0, 150) || 'No content preview.'}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Updated: {new Date(note.updatedAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center h-96 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-10">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            You don't have any active notes yet.
          </p>
          <button
            onClick={onCreateNote}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} /> Create Your First Note
          </button>
        </div>
      )}

      {/* Floating Action Button (FAB) for Mobile Create */}
      <button
        onClick={onCreateNote}
        className="fixed bottom-4 right-4 z-40 md:hidden p-4 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 transition-colors"
        title="Create New Note"
      >
        <Plus size={24} />
      </button>
    </div>
  );
};