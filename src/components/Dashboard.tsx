import React, { useMemo, useState, useEffect } from 'react';
import { Note } from '../types';
import { Plus, Triangle, MoreVertical, Copy, Trash2, Palette, Folder, Tag, Check, CircleOff } from 'lucide-react';
// @ts-ignore
import { marked } from 'marked';

interface DashboardProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onPinNote: (id: string) => void;
  onDuplicateNote: (note: Note) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkCategory: (ids: string[], category: string) => void;
  onBulkColor: (ids: string[], color: string) => void;
  availableCategories: string[];
  onBulkTags: (ids: string[], add: string[], remove: string[]) => void;
  availableTags: string[];
}

const NOTE_COLORS = [
  { name: 'Default', value: '' }, 
  { name: 'Dark Charcoal', value: '#17252A' }, 
  { name: 'Deep Purple', value: '#440154' },   
  { name: 'Royal Purple', value: '#51127C' },   
  { name: 'Berry', value: '#9D2E66' },         
  { name: 'Vibrant Red', value: '#DD3D2D' },    
  { name: 'Burnt Orange', value: '#C65D3B' },  
  { name: 'Forest Green', value: '#2F855A' },  
  { name: 'Teal', value: '#21918C' },          
  { name: 'Ocean', value: '#1F7A7A' },         
];

// FIX: Reduced size from 14px to 10px (~70%)
const CHECKED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 text-blue-600 dark:text-blue-400 align-middle"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
const UNCHECKED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1 text-gray-400 dark:text-gray-500 align-middle"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;

const decodeHTMLEntities = (text: string): string => {
    try {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    } catch (e) { return text; }
};

const getLeadingHeadingLevel = (html: string): 0 | 1 | 2 | 3 => {
    if (!html) return 0;
    const trimmedHtml = html.trim();
    if (trimmedHtml.startsWith('<h1>')) return 1;
    if (trimmedHtml.startsWith('<h2>')) return 2;
    if (trimmedHtml.startsWith('<h3>')) return 3;
    return 0; 
};

// Helper to lighten a hex color by % (for border calculation)
const lightenColor = (color: string, percent: number) => {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255)).toString(16).slice(1);
};

// Utility: DOMParser-based stripper
const processNoteContent = (html: string) => {
  if (!html) return { imageUrl: null, headingLevel: 0, headingLine: '', bodyPreview: '' };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 1. Extract Cover Image
  const img = doc.querySelector('img');
  const imageUrl = img ? img.getAttribute('src') : null;
  
  // 2. Find First Text Content
  let contentStartNode = doc.body.firstChild;
  while (contentStartNode && (
      (contentStartNode.nodeType !== Node.ELEMENT_NODE && !contentStartNode.textContent?.trim()) || 
      (contentStartNode.nodeName === 'IMG')
  )) {
      contentStartNode = contentStartNode.nextSibling;
  }

  let headingLevel: 0 | 1 | 2 | 3 = 0;
  let headingLine = '';
  
  if (contentStartNode && ['H1', 'H2', 'H3'].includes(contentStartNode.nodeName)) {
      headingLevel = parseInt(contentStartNode.nodeName.substring(1)) as 1|2|3;
      headingLine = contentStartNode.textContent || '';
      contentStartNode = contentStartNode.nextSibling;
  }

  // 3. Generate Body Preview
  let bodyPreview = '';
  
  const walk = (node: Node) => {
      if (!node) return;
      if (node.nodeName === 'IMG') return;

      if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          bodyPreview += text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tagName = el.tagName.toLowerCase();
          
          if (['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'pre', 'blockquote'].includes(tagName)) {
              bodyPreview += `<${tagName}>`;
              el.childNodes.forEach(walk);
              bodyPreview += `</${tagName}>`;
              return;
          }
          
          const isBlock = ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName);
          
          const preventBreak = 
              !bodyPreview || 
              bodyPreview.endsWith('<br>') || 
              /<blockquote>\s*$/i.test(bodyPreview) || 
              /<\/blockquote>\s*$/i.test(bodyPreview) || 
              /<pre>\s*$/i.test(bodyPreview) || 
              /<\/pre>\s*$/i.test(bodyPreview);
          
          if (isBlock && !preventBreak) {
              bodyPreview += '<br>';
          }

          if (tagName === 'ol') {
              let idx = 1;
              Array.from(el.children).forEach(child => {
                  if (child.nodeName === 'LI') {
                       if (bodyPreview && !bodyPreview.endsWith('<br>') && !/<blockquote>\s*$/i.test(bodyPreview)) bodyPreview += '<br>';
                       bodyPreview += `<span class="text-gray-900 dark:text-gray-200 font-medium">${idx}.</span> `;
                       child.childNodes.forEach(walk);
                       idx++;
                  }
              });
              return;
          }
          if (tagName === 'ul') {
               Array.from(el.children).forEach(child => {
                  if (child.nodeName === 'LI') {
                       if (bodyPreview && !bodyPreview.endsWith('<br>') && !/<blockquote>\s*$/i.test(bodyPreview)) bodyPreview += '<br>';
                       const checkbox = child.querySelector('input[type="checkbox"]');
                       if (checkbox) {
                           const checked = checkbox.hasAttribute('checked');
                           // FIX: Use updated SVG strings
                           bodyPreview += checked ? CHECKED_SVG : UNCHECKED_SVG;
                           child.childNodes.forEach(c => { if (c.nodeName !== 'INPUT') walk(c); });
                       } else {
                           bodyPreview += '• ';
                           child.childNodes.forEach(walk);
                       }
                  }
              });
              return;
          }
          
          if (tagName === 'hr') {
              bodyPreview += '<hr class="my-2 border-t border-gray-300 dark:border-gray-600" />';
              return;
          }
          
          if (tagName === 'a') {
              const href = el.getAttribute('href');
              if (href) {
                  const attrs = ` href="${href}" target="_blank" rel="noopener noreferrer" class="text-[#788eb7] no-underline z-20 relative" onclick="event.stopPropagation()"`;
                  bodyPreview += `<a${attrs}>`;
                  el.childNodes.forEach(walk);
                  bodyPreview += `</a>`;
                  return;
              }
          }

          el.childNodes.forEach(walk);
      }
  };
  
  let currentNode = contentStartNode;
  while (currentNode) {
      walk(currentNode);
      currentNode = currentNode.nextSibling;
  }

  bodyPreview = bodyPreview.replace(/(<br\s*\/?>)+$/i, '');

  return { imageUrl, headingLevel, headingLine, bodyPreview };
};

export const Dashboard: React.FC<DashboardProps> = ({
  notes,
  onSelectNote,
  onCreateNote,
  onPinNote,
  onDuplicateNote,
  onBulkDelete,
  onBulkCategory,
  onBulkColor,
  availableCategories,
  onBulkTags,
  availableTags
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null); 
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const activeNotes = notes.filter(n => !n.deleted);
  const totalNotes = activeNotes.length;
  const isSelectionMode = selectedIds.size > 0;

  useEffect(() => {
      const handleClickOutside = () => {
          setActiveMenuId(null);
          if (showColorPicker && showColorPicker !== 'bulk') setShowColorPicker(null);
      };
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
  }, [showColorPicker]);

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const getHeadingClasses = (level: 0 | 1 | 2 | 3, isDarkBg: boolean): string => {
    const base = level === 1 ? 'font-black text-xl' : level === 2 ? 'font-extrabold text-lg' : 'font-semibold text-base';
    return isDarkBg ? `${base} text-white` : `${base} text-gray-900 dark:text-gray-100`;
  };

  const preparedNotes = useMemo(() => {
    return activeNotes.map(note => {
      const safeContent = note.content || ''; 
      let htmlContent = '';
      try { 
          htmlContent = marked.parse(safeContent, { breaks: true }) as string; 
      } catch (e) { htmlContent = '<i>Error</i>'; }
      
      const { imageUrl, headingLevel, headingLine, bodyPreview } = processNoteContent(htmlContent);
      
      const lines = bodyPreview.split('<br>');
      const bodySnippet = lines.slice(0, 5).join('<br>'); 

      return {
        ...note,
        imageUrl,
        headingLine, 
        bodySnippet,
        headingLevel
      };
    });
  }, [activeNotes]);

  const formatDate = (timestamp: number) => {
      try {
          return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch (e) { return 'Invalid date'; }
  };

  const isDarkColor = (color?: string) => {
      if (!color) return false;
      if (color === '#ffffff') return false;
      return true; 
  };

  return (
    <div className="p-4 md:p-8 h-full relative">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 md:mb-8 flex justify-between items-center">
        <span>Your Notes ({totalNotes})</span>
        {isSelectionMode && (
            <button onClick={clearSelection} className="text-sm text-blue-600 font-semibold">
                Deselect All
            </button>
        )}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24">
          {preparedNotes.map(note => {
            const isSelected = selectedIds.has(note.id);
            const isDark = isDarkColor(note.color);
            
            const borderColor = note.color 
                ? lightenColor(note.color, 5) 
                : undefined;

            return (
            <div
              key={note.id}
              className={`group relative flex flex-col justify-between rounded-lg shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700 h-full min-h-[180px] overflow-hidden ${isSelected ? 'ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-gray-900' : 'hover:shadow-lg'}`}
              style={{ 
                  background: note.color ? `linear-gradient(to bottom, #121826, ${note.color}BF)` : undefined,
                  backgroundColor: note.color ? undefined : undefined,
                  borderColor: borderColor || undefined
              }}
              onClick={() => {
                  if (isSelectionMode) toggleSelection(note.id);
                  else onSelectNote(note.id);
              }}
            >
              <div className="flex flex-col">
                  {note.imageUrl && (
                      <div className="w-full h-32 bg-gray-100 dark:bg-gray-700">
                          <img src={note.imageUrl} alt="Cover" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                  )}
                  
                  <div className="p-4 pb-0"> 
                      <div className={`absolute top-2 right-2 z-10 transition-opacity p-1 rounded-full ${note.isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button
                              onClick={(e) => { e.stopPropagation(); onPinNote(note.id); }}
                              className={`p-1 rounded-full hover:bg-black/10 transition-colors ${note.isPinned ? (isDark ? 'text-white' : 'text-blue-600') : (isDark ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-blue-600')}`}
                              style={note.imageUrl ? { backgroundColor: 'rgba(255,255,255,0.8)' } : {}}
                          >
                              <Triangle size={18} fill={note.isPinned ? 'currentColor' : 'none'} />
                          </button>
                      </div>

                      <h3 className={`text-lg font-semibold truncate mb-2 pr-6 ${isDark ? 'text-white' : 'text-blue-600 dark:text-sky-400'}`}>
                        {note.title || 'Untitled Note'}
                      </h3>
                      
                      {note.headingLevel > 0 && (
                        <div 
                            className={`flex-shrink-0 ${getHeadingClasses(note.headingLevel, isDark)}`}
                            dangerouslySetInnerHTML={{ __html: note.headingLine }}
                        />
                      )}

                      <div 
                        className={`text-sm flex-1 overflow-hidden pt-1 line-clamp-6 ${isDark ? 'text-gray-200' : 'text-gray-600 dark:text-gray-400'} 
                        [&>pre]:bg-gray-200 [&>pre]:dark:bg-gray-800 [&>pre]:p-2 [&>pre]:rounded [&>pre]:font-mono [&>pre]:text-xs [&>pre]:my-2 
                        [&>code]:font-mono [&>code]:bg-gray-200 [&>code]:dark:bg-gray-800 [&>code]:px-1 [&>code]:rounded 
                        [&>blockquote]:my-2 [&>blockquote]:border-l-2 [&>blockquote]:border-gray-300 [&>blockquote]:dark:border-gray-600 [&>blockquote]:pl-2 [&>blockquote]:italic [&>blockquote]:my-1`}
                        dangerouslySetInnerHTML={{ __html: note.bodySnippet || 'No content preview.' }}
                      />
                  </div>
              </div>
              
              <div className="mt-4 flex items-center justify-between p-4 pt-0">
                  <div className="flex items-center gap-3">
                      <div 
                        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center cursor-pointer transition-all border-2 ${
                            isSelected 
                                ? 'bg-blue-600 border-blue-600' 
                                : (note.color 
                                    ? 'bg-transparent border-white/80 hover:border-white hover:bg-white/10' 
                                    : 'bg-transparent border-gray-400 dark:border-gray-500 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20')
                        }`}
                        onClick={(e) => { e.stopPropagation(); toggleSelection(note.id); }}
                      >
                         {isSelected && <Check size={11} className="text-white" />}
                      </div>

                      <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                        {formatDate(note.updatedAt)}
                      </span>
                  </div>

                  <div className={`transition-opacity ${activeMenuId === note.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <div className="relative">
                          <button
                              onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === note.id ? null : note.id); }}
                              className={`p-1 rounded-full hover:bg-black/10 transition-colors ${isDark ? 'text-white' : 'text-gray-500'}`}
                          >
                              <MoreVertical size={18} />
                          </button>
                          
                          {activeMenuId === note.id && (
                              <div className="absolute right-0 bottom-8 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-30 flex flex-col" onClick={(e) => e.stopPropagation()}>
                                  <div className="grid grid-cols-5 gap-1 px-3 mb-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                                    {NOTE_COLORS.map(c => (
                                          <button
                                            key={c.name}
                                            onClick={() => { onBulkColor([note.id], c.value); setActiveMenuId(null); }}
                                            className="w-7 h-7 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                            style={{ backgroundColor: c.value || 'transparent' }}
                                            title={c.name}
                                          >
                                              {!c.value && <CircleOff size={16} className="text-gray-400" />}
                                          </button>
                                      ))}
                                  </div>

                                  <button onClick={() => { onDuplicateNote(note); setActiveMenuId(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200">
                                      <Copy size={14} /> Duplicate
                                  </button>
                                  <button onClick={() => { onBulkDelete([note.id]); setActiveMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                      <Trash2 size={14} /> Delete
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
            </div>
          )})}
      </div>

      {isSelectionMode && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-full px-6 py-3 flex items-center gap-6 z-50">
              <span className="text-sm font-bold text-gray-500">{selectedIds.size} selected</span>
              <div className="h-6 w-px bg-gray-300"></div>
              
              <div className="relative">
                <button onClick={() => setShowColorPicker(showColorPicker === 'bulk' ? null : 'bulk')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Change Color">
                    <Palette size={20} />
                </button>
                {showColorPicker === 'bulk' && (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-30 grid grid-cols-5 gap-1 w-48">
                        {NOTE_COLORS.map(c => (
                            <button
                            key={c.name}
                            onClick={() => { onBulkColor(Array.from(selectedIds), c.value); setShowColorPicker(null); clearSelection(); }}
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: c.value || 'transparent' }}
                            title={c.name}
                            >
                                {!c.value && <CircleOff size={16} className="text-gray-400" />}
                            </button>
                        ))}
                    </div>
                )}
              </div>

              <button onClick={() => setShowCategoryModal(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Set Category">
                  <Folder size={20} />
              </button>

              <button onClick={() => setShowTagModal(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Edit Tags">
                  <Tag size={20} />
              </button>

              <button 
                onClick={() => { 
                    onBulkDelete(Array.from(selectedIds)); 
                    clearSelection();
                }} 
                className="p-2 hover:bg-red-100 text-red-600 rounded-full" 
                title="Delete"
              >
                  <Trash2 size={20} />
              </button>
          </div>
      )}

      {showCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm shadow-xl">
                  <h3 className="text-lg font-bold mb-4">Move to Category</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                      {availableCategories.map(cat => (
                          <button 
                            key={cat} 
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => { onBulkCategory(Array.from(selectedIds), cat); setShowCategoryModal(false); clearSelection(); }}
                          >
                              {cat}
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setShowCategoryModal(false)} className="mt-4 w-full py-2 text-gray-500">Cancel</button>
              </div>
          </div>
      )}
      
      {showTagModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm shadow-xl">
                  <h3 className="text-lg font-bold mb-4">Add Tags</h3>
                  <input 
                    type="text" 
                    className="w-full p-2 border rounded mb-4 dark:bg-gray-700" 
                    placeholder="New tag..." 
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                  />
                  <button 
                    onClick={() => { if(tagInput) { onBulkTags(Array.from(selectedIds), [tagInput], []); setShowTagModal(false); clearSelection(); setTagInput(''); } }}
                    className="w-full py-2 bg-blue-600 text-white rounded font-bold"
                  >
                      Add Tag
                  </button>
                  <button onClick={() => setShowTagModal(false)} className="mt-2 w-full py-2 text-gray-500">Cancel</button>
              </div>
          </div>
      )}

      <button onClick={onCreateNote} className="fixed bottom-4 right-4 z-40 md:hidden p-4 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 transition-colors" title="Create New Note">
        <Plus size={24} />
      </button>
    </div>
  );
};