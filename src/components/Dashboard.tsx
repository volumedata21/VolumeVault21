import React, { useMemo } from 'react';
import { Note } from '../types';
import { Plus } from 'lucide-react';
// @ts-ignore
import { marked } from 'marked';

interface DashboardProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
}

// NEW: Helper function to decode HTML entities (e.g., converts &#39; back to ')
const decodeHTMLEntities = (text: string): string => {
    // Uses a temporary DOM element (like a textarea) to leverage browser decoding
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
};


// Utility to detect the level of the leading heading (must be run on full HTML)
const getLeadingHeadingLevel = (html: string): 0 | 1 | 2 | 3 => {
    const trimmedHtml = html.trim();
    if (trimmedHtml.startsWith('<h1>')) return 1;
    if (trimmedHtml.startsWith('<h2>')) return 2;
    if (trimmedHtml.startsWith('<h3>')) return 3;
    return 0; // Not a leading heading
};

// Utility to strip HTML tags and preserve list/heading formatting for clean text block
const stripHtmlAndPreserveStructure = (html: string): string => {
  if (!html) return '';

  let processedHtml = html;
  
  // 1. Remove Heading tags (Headings will be extracted/styled separately)
  processedHtml = processedHtml.replace(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi, '$1\n'); 

  // 2. Pre-process checklist items (handle the span content)
  processedHtml = processedHtml.replace(/<li[^>]*>\s*<input type="checkbox"[^>]*checked[^>]*>\s*<span[^>]*>(.*?)<\/span><\/li>/gi, '\n[x] $1');
  processedHtml = processedHtml.replace(/<li[^>]*>\s*<input type="checkbox"[^>]*>\s*<span[^>]*>(.*?)<\/span><\/li>/gi, '\n[ ] $1');
  
  // 3. Pre-process generic list items
  processedHtml = processedHtml.replace(/<li[^>]*>/gi, '\n• ');
  
  // 4. Convert HTML entities and remove remaining tags
  const text = processedHtml.replace(/<[^>]+>/g, '');
  
  // CRITICAL FIX: Decode entities before returning the clean text
  return decodeHTMLEntities(text).trim();
};

export const Dashboard: React.FC<DashboardProps> = ({
  notes,
  onSelectNote,
  onCreateNote,
}) => {

  const activeNotes = notes.filter(n => !n.deleted);
  const totalNotes = activeNotes.length;

  // Helper to apply differentiated classes based on heading level
  const getHeadingClasses = (level: 0 | 1 | 2 | 3): string => {
    // FIX: Increased font size and weight for better pop and hierarchy
    if (level === 1) return 'font-black text-xl text-gray-900 dark:text-gray-50'; 
    if (level === 2) return 'font-extrabold text-lg text-gray-800 dark:text-gray-100';      
    if (level === 3) return 'font-semibold text-base text-gray-800 dark:text-gray-200'; 
    return 'font-normal text-gray-600 dark:text-gray-400'; 
  };

  // Memoize the prepared notes to avoid recalculating HTML/snippets on every render
  const preparedNotes = useMemo(() => {
    return activeNotes.map(note => {
      // 1. Convert Markdown to HTML
      const htmlContent = marked.parse(note.content) as string;
      
      // 2. Get the full clean text with structure markers
      const fullCleanText = stripHtmlAndPreserveStructure(htmlContent);
      
      // 3. Split the text into the first line (potential heading) and the body
      const lines = fullCleanText.trim().split('\n').filter(line => line.trim() !== '');
      
      const headingLevel = getLeadingHeadingLevel(htmlContent);
      
      // The snippet we show is the first line + a small segment of the rest
      const firstLine = lines[0] || '';
      // Join the next few lines for context preview
      const bodySnippet = lines.slice(1, 4).join('\n'); // Show up to 3 lines of body

      return {
        ...note,
        headingLine: headingLevel > 0 ? firstLine : '',
        bodySnippet: headingLevel > 0 ? bodySnippet : firstLine + '\n' + lines.slice(1, 3).join('\n'), // If no heading, first line is part of body
        headingLevel
      };
    });
  }, [activeNotes]);


  return (
    <div className="p-4 md:p-8 h-full">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 md:mb-8">
        Your Notes ({totalNotes})
      </h2>

      {/* Note Grid */}
      {totalNotes > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {preparedNotes.map(note => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className="group flex flex-col p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 text-left border border-gray-200 dark:border-gray-700 h-full min-h-[150px]"
            >
              {/* Note Title */}
              <h3 className="text-lg font-semibold truncate text-blue-600 dark:text-sky-400 mb-2">
                {note.title || 'Untitled Note'}
              </h3>
              
              {/* Heading Line (Only rendered if detected) */}
              {note.headingLevel > 0 && (
                <div className={`flex-shrink-0 whitespace-pre-wrap ${getHeadingClasses(note.headingLevel)}`}>
                  {note.headingLine}
                </div>
              )}

              {/* Body Snippet (Standard text size/weight) */}
              <div className="text-sm text-gray-600 dark:text-gray-400 flex-1 overflow-hidden whitespace-pre-wrap pt-1">
                {note.bodySnippet || 'No content preview.'}
              </div>
              
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Updated: {new Date(note.updatedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                })}
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
            <Plus size={24} /> Create Your First Note
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