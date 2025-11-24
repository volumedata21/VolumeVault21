import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Note, AppSettings } from '../types';
import { 
  Save, Check, Bold, Italic, Underline, Strikethrough, Heading1, Heading2, 
  List, ListOrdered, Code, Quote, Link as LinkIcon, Tag,
  FileCode, Eye, CheckSquare, Image as ImageIcon, Undo, Redo, Trash2
} from 'lucide-react';
// @ts-ignore
import { marked } from 'marked';
// @ts-ignore
import TurndownService from 'turndown';

interface HistoryState {
  content: string;
  title: string;
  category: string;
  timestamp: number;
}

interface EditorProps {
  note: Note;
  onChange: (updates: Partial<Note>) => void;
  onSave: () => void;
  onDelete: () => void;
  settings: AppSettings;
  availableCategories: string[];
}

export const Editor: React.FC<EditorProps> = ({ 
  note, 
  onChange, 
  onSave, 
  onDelete, 
  settings,
  availableCategories
}) => {
  // --- STATE ---
  const [currentContent, setCurrentContent] = useState(note.content);
  const [title, setTitle] = useState(note.title);
  const [category, setCategory] = useState(note.category || 'General');
  
  const [isDirty, setIsDirty] = useState(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  
  // --- HISTORY STATE ---
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- REFS ---
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelection = useRef<Range | null>(null);
  const isInternalUpdate = useRef<NodeJS.Timeout | null>(null);

  const isDefaultContent = useMemo(() => {
    if (isSourceMode) return currentContent.includes('# New Note') && currentContent.includes('Start writing here');
    const text = contentEditableRef.current?.innerText || '';
    return text.includes('New Note') && text.includes('Start writing here');
  }, [currentContent, isSourceMode, title]);

  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
    service.addRule('checklist', {
      filter: 'input',
      replacement: function (_content: any, node: any) {
          if (node.type === 'checkbox') {
              const isChecked = node.hasAttribute('checked') || node.checked;
              return isChecked ? '[x] ' : '[ ] ';
          }
          return '';
      }
    });
    return service;
  }, []);

  useEffect(() => {
     const renderer = new marked.Renderer();
     // @ts-ignore
     renderer.listitem = function(item: any) {
        let text = '';
        let task = false;
        let checked = false;

        if (typeof item === 'object' && item !== null && 'text' in item) {
            text = item.text;
            task = item.task || false;
            checked = item.checked || false;
        } else {
            text = item;
            // @ts-ignore
            task = arguments[1];
            // @ts-ignore
            checked = arguments[2];
        }

       if (task) {
         const cleanText = text.replace(/^<input[^>]+>/, '').trim();
         const checkedAttr = checked ? 'checked="checked"' : '';
         return `<li class="checklist-item" style="list-style: none; display: flex; align-items: flex-start; margin-bottom: 0.25rem;">
           <input type="checkbox" ${checkedAttr} style="margin-top: 0.35rem; margin-right: 0.5rem; flex-shrink: 0; cursor: pointer;">
           <span style="flex: 1; min-width: 0; line-height: 1.5; ${checked ? 'text-decoration: line-through; opacity: 0.6; color: #6b7280;' : ''}">${cleanText}</span>
         </li>`;
       }
       return `<li>${text}</li>`;
     };
     marked.use({ renderer, gfm: true });
  }, []);

  // --- HARD RESET WHEN NOTE CHANGES ---
  useEffect(() => {
    if (isInternalUpdate.current) clearTimeout(isInternalUpdate.current);
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);

    setTitle(note.title);
    setCategory(note.category || 'General');
    setCurrentContent(note.content);
    setIsDirty(false);
    
    setHistory([{ 
        content: note.content, 
        title: note.title, 
        category: note.category || 'General',
        timestamp: Date.now() 
    }]);
    setHistoryIndex(0);

    if (!isSourceMode && contentEditableRef.current) {
        const html = marked.parse(note.content) as string;
        contentEditableRef.current.innerHTML = html;
    }
  }, [note.id]);

  useEffect(() => {
      if (!isSourceMode && contentEditableRef.current) {
          const html = marked.parse(currentContent) as string;
          if (contentEditableRef.current.innerHTML !== html) {
              contentEditableRef.current.innerHTML = html;
          }
      }
  }, [isSourceMode]); 

  // --- UPDATED: GENERIC CHANGE HANDLER (Fixes Title/Category Bug) ---
  const handleDataChange = (updates: { title?: string, category?: string, content?: string }) => {
      // 1. Update Local State
      if (updates.title !== undefined) setTitle(updates.title);
      if (updates.category !== undefined) setCategory(updates.category);
      if (updates.content !== undefined) setCurrentContent(updates.content);

      // 2. Flag as Dirty (Enables Save Button)
      setIsDirty(true);

      // 3. Push to History
      pushToHistory(
          updates.content ?? currentContent, 
          updates.title ?? title, 
          updates.category ?? category
      );

      // 4. Notify Parent (Debounced)
      if (isInternalUpdate.current) clearTimeout(isInternalUpdate.current);
      // @ts-ignore
      isInternalUpdate.current = setTimeout(() => {
          onChange(updates);
      }, 500);
  };

  const pushToHistory = useCallback((newContent: string, newTitle: string, newCat: string) => {
      if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
      historyTimeoutRef.current = setTimeout(() => {
          setHistory(prev => {
              const current = prev[historyIndex];
              if (current && current.content === newContent && current.title === newTitle && current.category === newCat) {
                  return prev;
              }
              const newHistory = prev.slice(0, historyIndex + 1);
              newHistory.push({
                  content: newContent,
                  title: newTitle,
                  category: newCat,
                  timestamp: Date.now()
              });
              if (newHistory.length > 50) newHistory.shift();
              return newHistory;
          });
          setHistoryIndex(prev => Math.min(prev + 1, 49));
      }, 1000);
  }, [historyIndex]);

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const state = history[newIndex];
          setHistoryIndex(newIndex);
          restoreState(state);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          const state = history[newIndex];
          setHistoryIndex(newIndex);
          restoreState(state);
      }
  };

  const restoreState = (state: HistoryState) => {
      setTitle(state.title);
      setCategory(state.category);
      setCurrentContent(state.content);
      if (!isSourceMode && contentEditableRef.current) {
          contentEditableRef.current.innerHTML = marked.parse(state.content) as string;
      }
      onChange({ title: state.title, category: state.category, content: state.content });
  };

  const handleVisualInput = () => {
    if (contentEditableRef.current) {
      const html = contentEditableRef.current.innerHTML;
      const md = turndownService.turndown(html);
      // Use the new generic handler
      handleDataChange({ content: md });
    }
  };

  const handleSourceInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleDataChange({ content: e.target.value });
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') || 
          ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [historyIndex, history]);

  useEffect(() => {
    if (!settings.autoSave) return;
    const timer = setInterval(() => {
      if (isDirty) handleManualSave();
    }, settings.saveInterval);
    return () => clearInterval(timer);
  }, [settings.autoSave, settings.saveInterval, isDirty, currentContent, title, category]);

  const handleManualSave = () => {
    let contentToSave = currentContent;
    if (!isSourceMode && contentEditableRef.current) {
        const html = contentEditableRef.current.innerHTML;
        contentToSave = turndownService.turndown(html);
    }
    onChange({ title, category, content: contentToSave });
    onSave();
    setIsDirty(false);
  };

  const toggleMode = () => {
      if (isSourceMode) {
          setIsSourceMode(false);
      } else {
          if (contentEditableRef.current) {
              const html = contentEditableRef.current.innerHTML;
              const md = turndownService.turndown(html);
              setCurrentContent(md);
          }
          setIsSourceMode(true);
      }
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
    if (contentEditableRef.current) contentEditableRef.current.focus();
    document.execCommand(command, false, value);
    
    if (command === 'formatBlock' && (value === '<pre>' || value === '<blockquote>')) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            let node = selection.anchorNode as Node | null;
            while (node && node.nodeName !== 'PRE' && node.nodeName !== 'BLOCKQUOTE' && node !== contentEditableRef.current) {
                node = node.parentNode;
            }

            if (node && (node.nodeName === 'PRE' || node.nodeName === 'BLOCKQUOTE')) {
                const blockNode = node as HTMLElement;
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                
                if (blockNode.nextSibling) {
                    blockNode.parentNode?.insertBefore(p, blockNode.nextSibling);
                } else {
                    blockNode.parentNode?.appendChild(p);
                }
            }
        }
    }
    handleVisualInput();
  };
  
  const insertChecklist = () => {
    document.execCommand('insertUnorderedList');
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    let node = selection.anchorNode;
    while (node && node.nodeName !== 'UL' && node !== contentEditableRef.current) {
        node = node.parentNode;
    }
    if (node && node.nodeName === 'UL') {
        const ul = node as HTMLUListElement;
        Array.from(ul.querySelectorAll('li')).forEach(li => {
            if (!li.querySelector('input[type="checkbox"]')) {
                li.style.listStyle = 'none';
                li.style.display = 'flex';
                li.style.alignItems = 'flex-start';
                li.classList.add('checklist-item');
                li.style.marginBottom = '0.25rem';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.style.marginTop = '0.35rem';
                checkbox.style.marginRight = '0.5rem';
                checkbox.style.flexShrink = '0';
                const span = document.createElement('span');
                span.style.flex = '1';
                span.style.minWidth = '0';
                span.style.lineHeight = '1.5';
                while (li.firstChild) {
                    span.appendChild(li.firstChild);
                }
                if (!span.textContent?.trim()) span.innerHTML = '<br>';
                li.appendChild(checkbox);
                li.appendChild(span);
            }
        });
        const firstSpan = ul.querySelector('li span');
        if (firstSpan) {
            const range = document.createRange();
            range.setStart(firstSpan, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    handleVisualInput();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        if (savedSelection.current) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(savedSelection.current);
        } else {
            contentEditableRef.current?.focus();
        }
        execCmd('insertImage', data.url);
    } catch (err) {
        console.error(err);
        alert('Failed to upload image');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        const checkbox = target as HTMLInputElement;
        const li = checkbox.closest('li');
        const span = li?.querySelector('span');

        if (checkbox.checked) checkbox.setAttribute('checked', 'checked');
        else checkbox.removeAttribute('checked');

        setTimeout(() => {
            if (checkbox.checked) {
                if (span) {
                    span.style.textDecoration = 'line-through';
                    span.style.opacity = '0.6';
                    span.style.color = '#6b7280';
                }
            } else {
                if (span) {
                    span.style.textDecoration = 'none';
                    span.style.opacity = '1';
                    span.style.color = '';
                }
            }
            handleVisualInput();
        }, 50);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (isSourceMode) return;
    const breakOutOfBlock = (nodeName: string) => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return false;
        let node = selection.anchorNode;
        while (node && node.nodeName !== nodeName && node !== contentEditableRef.current) {
            node = node.parentNode;
        }
        if (node && node.nodeName === nodeName) {
             const p = document.createElement('p');
             p.innerHTML = '<br>';
             if (node.nextSibling) node.parentNode?.insertBefore(p, node.nextSibling);
             else node.parentNode?.appendChild(p);
             const range = document.createRange();
             range.setStart(p, 0);
             range.collapse(true);
             selection.removeAllRanges();
             selection.addRange(range);
             return true;
        }
        return false;
    };
    if (e.key === 'Enter' && e.shiftKey) {
        if (breakOutOfBlock('PRE') || breakOutOfBlock('BLOCKQUOTE')) {
            e.preventDefault();
            return;
        }
    }
    if (e.key === 'Backspace') {
        const selection = window.getSelection();
        if (selection && selection.isCollapsed) {
            let li = selection.anchorNode as HTMLElement;
            while (li && li.nodeName !== 'LI' && li !== contentEditableRef.current) {
                li = li.parentNode as HTMLElement;
            }
            if (li && li.nodeName === 'LI' && li.querySelector('input[type="checkbox"]')) {
                const range = selection.getRangeAt(0);
                const span = li.querySelector('span');
                const isAtStart = (range.startContainer === span && range.startOffset === 0) ||
                                  (range.startContainer.parentNode === span && range.startOffset === 0);
                if (isAtStart) {
                     e.preventDefault();
                     const checkbox = li.querySelector('input[type="checkbox"]');
                     if (checkbox) checkbox.remove();
                     if (span) {
                         while(span.firstChild) li.insertBefore(span.firstChild, span);
                         span.remove();
                     }
                     li.style.listStyle = '';
                     li.style.display = '';
                     li.classList.remove('checklist-item');
                     li.style.marginBottom = '';
                     handleVisualInput();
                     return;
                }
            }
        }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        const selection = window.getSelection();
        if (!selection) return;
        let li = selection.anchorNode as HTMLElement;
        while (li && li.nodeName !== 'LI' && li !== contentEditableRef.current) {
            li = li.parentNode as HTMLElement;
        }
        if (li && li.nodeName === 'LI' && li.querySelector('input[type="checkbox"]')) {
            e.preventDefault(); 
            const span = li.querySelector('span');
            const textContent = span ? span.innerText.replace(/\u200B/g, '').trim() : li.innerText.trim();
            if (textContent === '') {
                const ul = li.parentNode;
                if (ul) {
                    ul.removeChild(li);
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    if (ul.nextSibling) ul.parentNode?.insertBefore(p, ul.nextSibling);
                    else ul.parentNode?.appendChild(p);
                    const range = document.createRange();
                    range.setStart(p, 0);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            } else {
                const newLi = li.cloneNode(false) as HTMLLIElement;
                newLi.classList.add('checklist-item');
                const newCheckbox = document.createElement('input');
                newCheckbox.type = 'checkbox';
                newCheckbox.style.marginTop = '0.35rem';
                newCheckbox.style.marginRight = '0.5rem';
                newCheckbox.style.flexShrink = '0';
                const newSpan = document.createElement('span');
                newSpan.style.flex = '1';
                newSpan.style.minWidth = '0';
                newSpan.style.lineHeight = '1.5';
                newSpan.innerHTML = '<br>'; 
                newLi.appendChild(newCheckbox);
                newLi.appendChild(newSpan);
                if (li.nextSibling) li.parentNode?.insertBefore(newLi, li.nextSibling);
                else li.parentNode?.appendChild(newLi);
                const range = document.createRange();
                range.setStart(newSpan, 0);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            handleVisualInput();
        }
    }
  };

  const handleTitleFocus = () => {
    if (title === 'Untitled Note') setTitle('');
  };

  const handleEditorFocus = () => {
      const text = contentEditableRef.current?.innerText || '';
      if (text.includes('New Note') && text.includes('Start writing here')) {
          if (contentEditableRef.current) {
              contentEditableRef.current.innerHTML = '<p><br></p>';
              const range = document.createRange();
              const sel = window.getSelection();
              const p = contentEditableRef.current.querySelector('p');
              if (p && sel) {
                  range.setStart(p, 0);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
              }
          }
          handleVisualInput();
      }
  };

  const ToolbarBtn = ({ icon: Icon, label, onClick, active = false }: any) => (
    <button
      onClick={(e) => { e.preventDefault(); onClick(); }}
      className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        active 
        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
      title={label}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
      
      <div className="flex flex-col gap-4 p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* UPDATED: Title Input using new Handler */}
            <input
                type="text"
                value={title}
                onChange={(e) => handleDataChange({ title: e.target.value })}
                onFocus={handleTitleFocus}
                className="text-2xl font-bold bg-transparent border-none focus:ring-0 placeholder-gray-400 text-gray-900 dark:text-white flex-1 min-w-0"
                placeholder="Untitled Note"
            />
            
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    <button 
                        onClick={handleUndo} 
                        disabled={historyIndex <= 0}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 disabled:opacity-30"
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo size={16} />
                    </button>
                    <button 
                        onClick={handleRedo} 
                        disabled={historyIndex >= history.length - 1}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 disabled:opacity-30"
                        title="Redo (Ctrl+Shift+Z)"
                    >
                        <Redo size={16} />
                    </button>
                </div>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>

                <button
                    onClick={() => {
                        if (confirm('Are you sure you want to delete this note?')) {
                            onDelete();
                        }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                >
                    <Trash2 size={16} />
                </button>

                <button
                    onClick={handleManualSave}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${isDirty ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'}`}
                >
                    {isDirty ? <Save size={16} /> : <Check size={16} />}
                    <span className="hidden sm:inline">{isDirty ? 'Save' : 'Saved'}</span>
                </button>

                <button
                    onClick={toggleMode}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium"
                >
                    {isSourceMode ? <Eye size={16} /> : <FileCode size={16} />}
                    <span className="hidden sm:inline">{isSourceMode ? 'Preview' : 'Markdown'}</span>
                </button>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="relative group flex items-center">
                <Tag size={16} className="absolute left-2 text-gray-400" />
                {/* UPDATED: Category Input using new Handler */}
                <input 
                    type="text" 
                    list="categories" 
                    value={category}
                    onChange={(e) => handleDataChange({ category: e.target.value })}
                    placeholder="Category"
                    className="pl-8 pr-3 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 w-48"
                />
                <datalist id="categories">
                    {availableCategories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
            </div>
        </div>
      </div>

      {!isSourceMode && (
        <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 overflow-x-auto">
          <ToolbarBtn icon={Bold} label="Bold" onClick={() => execCmd('bold')} />
          <ToolbarBtn icon={Italic} label="Italic" onClick={() => execCmd('italic')} />
          <ToolbarBtn icon={Underline} label="Underline" onClick={() => execCmd('underline')} />
          <ToolbarBtn icon={Strikethrough} label="Strikethrough" onClick={() => execCmd('strikeThrough')} />
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
          <ToolbarBtn icon={Heading1} label="Heading 1" onClick={() => execCmd('formatBlock', '<h1>')} />
          <ToolbarBtn icon={Heading2} label="Heading 2" onClick={() => execCmd('formatBlock', '<h2>')} />
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
          <ToolbarBtn icon={List} label="Bullet List" onClick={() => execCmd('insertUnorderedList')} />
          <ToolbarBtn icon={ListOrdered} label="Numbered List" onClick={() => execCmd('insertOrderedList')} />
          <ToolbarBtn icon={CheckSquare} label="Checklist" onClick={insertChecklist} />
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
          <ToolbarBtn icon={Quote} label="Blockquote" onClick={() => execCmd('formatBlock', '<blockquote>')} />
          <ToolbarBtn icon={Code} label="Code Block" onClick={() => execCmd('formatBlock', '<pre>')} />
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
          <ToolbarBtn icon={LinkIcon} label="Link" onClick={() => {
              const url = prompt('Enter URL:');
              if (url) execCmd('createLink', url);
          }} />
          <ToolbarBtn icon={ImageIcon} label="Image" onClick={() => {
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0);
              fileInputRef.current?.click();
          }} />
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {isSourceMode ? (
            <textarea
                ref={sourceTextareaRef}
                value={currentContent}
                onChange={handleSourceInput}
                className="w-full h-full resize-none p-6 bg-white dark:bg-gray-900 font-mono text-sm leading-relaxed text-gray-900 dark:text-gray-200 focus:outline-none"
                spellCheck={false}
                placeholder="# Start writing markdown..."
            />
        ) : (
            <div 
              className="h-full overflow-y-auto p-8 bg-white dark:bg-gray-900 cursor-text" 
              onClick={(e) => {
                  if (e.target === e.currentTarget && contentEditableRef.current) contentEditableRef.current.focus();
              }}
            >
                <div
                    ref={contentEditableRef}
                    contentEditable
                    onInput={handleVisualInput}
                    onClick={handleEditorClick}
                    onKeyDown={handleEditorKeyDown}
                    onFocus={handleEditorFocus}
                    className={`
                        prose prose-slate dark:prose-invert max-w-none focus:outline-none min-h-[50vh] 
                        prose-p:my-2 prose-headings:my-4 prose-img:rounded-lg prose-img:shadow-md
                        prose-img:max-h-[400px] prose-img:w-auto prose-img:max-w-full prose-img:object-contain
                        ${isDefaultContent ? 'text-slate-500 dark:text-slate-400 opacity-80' : ''}
                    `}
                />
            </div>
        )}
      </div>
    </div>
  );
};