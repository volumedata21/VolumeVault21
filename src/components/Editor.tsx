import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Note, AppSettings } from '../types';
import {
    Save, Check, Bold, Italic, Underline, Strikethrough, Heading1, Heading2,
    List, ListOrdered, Code, Quote, Tag, AlertOctagon,
    FileCode, Eye, CheckSquare, Image as ImageIcon, Lock, X, Trash2, RotateCcw,
    Minus, RemoveFormatting, Link 
} from 'lucide-react';
// @ts-ignore
import { marked } from 'marked';
// @ts-ignore
import TurndownService from 'turndown';

// SVG Checkmark (White) - URL Encoded for CSS
const CHECKMARK_URL = `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")`;

// Configure Marked globally
const renderer = new marked.Renderer();

// Override List Item
// @ts-ignore
renderer.listitem = function (item: any) {
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
        const cleanText = text.replace(/^<input[^>]+>\s*/, '');

        // FIX: Removed inline style background-image. 
        // Added 'task-checkbox' class which targets the CSS rule defined in the component.
        return `<li class="checklist-item" style="list-style: none; display: flex; align-items: flex-start; margin-bottom: 0.25rem;">
      <input type="checkbox" ${checked ? 'checked' : ''} 
             class="
                task-checkbox
                appearance-none h-5 w-5 border-2 border-sky-400 dark:border-sky-500 rounded-md bg-transparent
                hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/30 dark:hover:border-sky-400
                checked:bg-sky-600 checked:border-sky-600 dark:checked:bg-sky-500 dark:checked:border-sky-500
                focus:ring-2 focus:ring-sky-400 focus:outline-none
                cursor-pointer transition-all duration-200 ease-in-out
                flex-shrink-0 mt-0.5 mr-2
             "
      >
      <span style="flex: 1; min-width: 0; ${checked ? 'text-decoration: line-through; opacity: 0.6; color: #6b7280;' : ''}">${cleanText}</span>
    </li>`;
    }
    return `<li>${text}</li>`;
};

// Override Link Renderer
// @ts-ignore
renderer.link = function(href, title, text) {
    let cleanHref = href;
    let cleanTitle = title;
    let cleanText = text;
    
    if (typeof href === 'object') {
        cleanHref = href.href;
        cleanTitle = href.title;
        cleanText = href.text;
    }

    const titleAttr = cleanTitle ? ` title="${cleanTitle}"` : '';
    return `<a href="${cleanHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${cleanText}</a>`;
};

marked.use({ renderer, gfm: true, breaks: true });

interface EditorProps {
    note: Note;
    onChange: (updates: Partial<Note>, saveToDisk?: boolean) => void;
    onSave: () => void;
    settings: AppSettings;
    availableCategories: string[];
    onRestore?: () => void;
    onDeleteForever?: () => void;
}

const DEFAULT_CONTENT = '# New Note\n\nStart writing here...';
const DEFAULT_TITLE = 'Untitled Note';

export const Editor: React.FC<EditorProps> = ({
    note,
    onChange,
    onSave,
    settings,
    availableCategories,
    onRestore,
    onDeleteForever
}) => {
    const [title, setTitle] = useState(note.title);
    const [category, setCategory] = useState(note.category || 'General');
    const [tags, setTags] = useState<string[]>(note.tags || []);
    const [tagInput, setTagInput] = useState('');

    const [isDirty, setIsDirty] = useState(false);
    const [isContentFocused, setIsContentFocused] = useState(false);
    const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'readOnly'>('edit');
    const [editorContent, setEditorContent] = useState('');

    const contentEditableRef = useRef<HTMLDivElement>(null);
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const savedSelection = useRef<Range | null>(null);

    const isTrashed = note.deleted || false;

    const turndownService = useMemo(() => {
        const service = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });

        service.addRule('checklist', {
            filter: 'input',
            replacement: function (_content: any, node: any) {
                if (node.type === 'checkbox') {
                    return node.checked ? '[x] ' : '[ ] ';
                }
                return '';
            }
        });

        service.addRule('strikethrough', {
            filter: ['del', 's', 'strike'],
            replacement: function (content: string) {
                return '~~' + content + '~~';
            }
        });
        
        service.addRule('fencedCodeBlock', {
            filter: function (node: any, options: any) {
                return (
                    options.codeBlockStyle === 'fenced' &&
                    node.nodeName === 'PRE'
                );
            },
            replacement: function (content: string, node: any, options: any) {
                const firstChild = node.firstChild;
                let language = '';
                if (firstChild && firstChild.nodeName === 'CODE') {
                     const className = firstChild.getAttribute('class') || '';
                     const match = className.match(/language-(\S+)/);
                     if (match) language = match[1];
                }
                const text = node.textContent || '';
                return (
                    '\n\n' + options.fence + language + '\n' +
                    text +
                    '\n' + options.fence + '\n\n'
                );
            }
        });

        service.addRule('image', {
            filter: 'img',
            replacement: function (_content: any, node: any) {
                const alt = node.alt || 'Image';
                const src = node.getAttribute('src') || '';

                if (src && src.startsWith('/uploads')) {
                    return `![${alt}](${src})`;
                }
                return '';
            }
        });
        return service;
    }, []);

    useEffect(() => {
        setTitle(note.title);
        setCategory(note.category || 'General');
        setTags(note.tags || []);
        setIsDirty(false);
        setIsContentFocused(false); 

        const safeContent = note.content || '';
        let html = '';
        try {
            html = marked.parse(safeContent, { breaks: true }) as string;
        } catch (e) {
            console.error('Error parsing markdown in Editor:', e);
            html = '<p>Error loading content.</p>';
        }

        setEditorContent(viewMode === 'preview' ? safeContent : html);

        if (note.deleted) {
            setViewMode('readOnly');
        } else {
            setViewMode('edit');
        }

        if (contentEditableRef.current && viewMode !== 'preview') {
            contentEditableRef.current.innerHTML = html;
            attachCopyButtons();
        }
    }, [note.id, note.deleted]); 

    const attachCopyButtons = useCallback(() => {
        if (!contentEditableRef.current) return;
        const preBlocks = contentEditableRef.current.querySelectorAll('pre');

        preBlocks.forEach((pre) => {
            if (pre.parentNode && (pre.parentNode as HTMLElement).classList.contains('code-wrapper')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'code-wrapper relative group';
            pre.parentNode?.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            const btn = document.createElement('button');
            btn.className = 'absolute top-2 right-2 p-1.5 bg-gray-700/50 hover:bg-gray-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-10';
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"></path></svg>`;
            btn.title = 'Copy code';

            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const code = pre.textContent || '';
                navigator.clipboard.writeText(code);

                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => {
                    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"></path></svg>`;
                }, 2000);
            };

            wrapper.appendChild(btn);
        });
    }, []);

    useEffect(() => {
        if (viewMode !== 'preview') {
            attachCopyButtons();
        }
    }, [editorContent, viewMode, attachCopyButtons]);

    useEffect(() => {
        if (isTrashed) return;
        if (title !== note.title || category !== note.category || JSON.stringify(tags) !== JSON.stringify(note.tags)) {
            setIsDirty(true);
        }
    }, [title, category, tags, note.title, note.category, note.tags, isTrashed]);

    useEffect(() => {
        if (isTrashed) return;
        if (!settings.autoSave) return;
        const timer = setInterval(() => {
            if (isDirty) handleManualSave();
        }, settings.saveInterval);
        return () => clearInterval(timer);
    }, [settings.autoSave, settings.saveInterval, isDirty, isTrashed]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleManualSave();
            }
        };
        if (!isTrashed) {
            window.addEventListener('keydown', handleGlobalKeyDown);
        }
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [title, category, editorContent, tags, isTrashed]);

    const handleManualSave = () => {
        if (isTrashed) return;
        let contentToSave = '';

        if (viewMode === 'preview') {
            contentToSave = sourceTextareaRef.current?.value || '';
        } else {
            if (contentEditableRef.current) {
                const checkboxes = contentEditableRef.current.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach((cb: any) => {
                    if (cb.checked) {
                        cb.setAttribute('checked', 'true');
                    } else {
                        cb.removeAttribute('checked');
                    }
                });
            }
            const html = contentEditableRef.current?.innerHTML || '';
            contentToSave = turndownService.turndown(html);
        }

        onChange({ title, category, tags, content: contentToSave }, true);
        onSave();
        setIsDirty(false);
    };

    const handleVisualInput = () => {
        if (isTrashed) return;
        if (contentEditableRef.current) {
            const checkboxes = contentEditableRef.current.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach((cb: any) => {
                if (cb.checked) {
                    cb.setAttribute('checked', 'true');
                } else {
                    cb.removeAttribute('checked');
                }
            });

            const html = contentEditableRef.current.innerHTML;
            const md = turndownService.turndown(html);
            onChange({ content: md });
            setIsDirty(true);
        }
    };

    const handleSourceInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (isTrashed) return;
        const val = e.target.value;
        setEditorContent(val);
        setIsDirty(true);
    };

    const toggleViewMode = (mode: 'edit' | 'preview' | 'readOnly') => {
        if (isTrashed && mode === 'edit') return;

        if (mode === 'preview') {
            alert("Markdown Source Code view is currently disabled due to instability and potential data loss.");
            return;
        }

        if (viewMode === 'preview' && mode !== 'preview') {
            const mdToParse = sourceTextareaRef.current?.value || note.content;

            if (mdToParse !== note.content) {
                onChange({ content: mdToParse });
            }

            const html = marked.parse(mdToParse) as string;
            setEditorContent(html);

            if (contentEditableRef.current) {
                contentEditableRef.current.innerHTML = html;
                attachCopyButtons();
            }
        } else if (viewMode !== 'preview' && mode === 'preview') {
            const html = contentEditableRef.current?.innerHTML || '';
            const md = turndownService.turndown(html);

            setEditorContent(md);
        }
        setViewMode(mode);
    };

    const execCmd = (command: string, value: string | undefined = undefined) => {
        if (viewMode === 'readOnly' || isTrashed) return;
        if (contentEditableRef.current) {
            contentEditableRef.current.focus();
        }
        
        if (command === 'insertHorizontalRule') {
            document.execCommand('insertHorizontalRule', false, undefined);
        } else if (command === 'removeFormat') {
            document.execCommand('removeFormat', false, undefined);
        } else if (command === 'createLink') {
            const url = prompt('Enter the link URL:');
            if (url) {
                document.execCommand('createLink', false, url);
            }
        } else {
            document.execCommand(command, false, value);
        }
        
        if (command === 'formatBlock' && (value === '<pre>' || value === 'blockquote')) {
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
        attachCopyButtons();
    };

    const insertChecklist = () => {
        if (viewMode === 'readOnly' || isTrashed) return;
        if (contentEditableRef.current) contentEditableRef.current.focus();

        const uniqueId = `cl-${Date.now()}`;
        const html = `<ul style="list-style: none;">
        <li class="checklist-item" style="list-style: none; display: flex; align-items: flex-start; margin-bottom: 0.25rem;">
            <input type="checkbox" style="margin-top: 0.35rem; margin-right: 0.5rem; flex-shrink: 0; cursor: pointer;">
            <span id="${uniqueId}" style="flex: 1; min-width: 0;"><br></span>
        </li>
      </ul>`;

        document.execCommand('insertHTML', false, html);

        const span = document.getElementById(uniqueId);
        if (span) {
            span.removeAttribute('id');
            const range = document.createRange();
            range.setStart(span, 0);
            range.collapse(true);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        handleVisualInput();
    };

    const addTag = () => {
        if (isTrashed) return;
        const cleanTag = tagInput.trim();
        if (cleanTag && !tags.includes(cleanTag)) {
            const newTags = [...tags, cleanTag];
            setTags(newTags);
            setTagInput('');
            onChange({ tags: newTags }, true);
        }
    };

    const removeTag = (tagToRemove: string) => {
        if (isTrashed) return;
        const newTags = tags.filter(t => t !== tagToRemove);
        setTags(newTags);
        onChange({ tags: newTags }, true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Image upload FAILED: HTTP Status', response.status);
                console.error('Response body:', errorText);
                alert('Image upload failed. Check console for details.');

                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            const data = await response.json();
            const imageUrl = data.url;

            const imageMarkdown = `![Image](${imageUrl})`;

            if (savedSelection.current) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(savedSelection.current);
            } else {
                contentEditableRef.current?.focus();
            }

            contentEditableRef.current?.focus();
            document.execCommand('insertHTML', false, ' '); 
            const currentMd = turndownService.turndown(contentEditableRef.current.innerHTML);
            const combinedMd = currentMd.trim() + '\n\n' + imageMarkdown; 
            onChange({ content: combinedMd });
            const newHtml = marked.parse(combinedMd) as string;
            if (contentEditableRef.current) {
                contentEditableRef.current.innerHTML = newHtml;
                setIsDirty(true);
            }

        } catch (error) {
            console.error('An unhandled critical error occurred during image upload:', error);
            alert('Image upload failed. Check console for details.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDragPrevent = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (viewMode !== 'edit' || isTrashed) return;

        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        const imageFile = Array.from(files).find(file => file.type.startsWith('image/'));

        if (imageFile) {
            const syntheticEvent = {
                target: { files: [imageFile] } as unknown as HTMLInputElement
            } as React.ChangeEvent<HTMLInputElement>;
            
            contentEditableRef.current?.focus(); 
            await handleImageUpload(syntheticEvent);
        }
    };

    const handleEditorClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
            const checkbox = target as HTMLInputElement;
            const li = checkbox.closest('li');
            const span = li?.querySelector('span');

            if (isTrashed) {
                e.preventDefault();
                return;
            }

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
                if (viewMode === 'readOnly') {
                    const html = contentEditableRef.current?.innerHTML || '';
                    const md = turndownService.turndown(html);
                    onChange({ content: md });
                } else {
                    handleVisualInput();
                }
            }, 50);
        }

        if (viewMode === 'edit' && target === e.currentTarget) {
            const content = contentEditableRef.current;
            if (!content) return;
            const lastChild = content.lastElementChild;
            if (lastChild && (lastChild.nodeName === 'PRE' || lastChild.nodeName === 'BLOCKQUOTE')) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                content.appendChild(p);

                const range = document.createRange();
                range.setStart(p, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);

                handleVisualInput();
            }
        }
    };

    const handleEditorKeyDown = (e: React.KeyboardEvent) => {
        if (viewMode !== 'edit' || isTrashed) return;

        if (e.metaKey || e.ctrlKey) {
            const key = e.key.toLowerCase();
            if (!e.shiftKey) {
                if (key === 'b') { e.preventDefault(); execCmd('bold'); return; }
                if (key === 'i') { e.preventDefault(); execCmd('italic'); return; }
                if (key === 'u') { e.preventDefault(); execCmd('underline'); return; }
            } else {
                if (key === 'x' || key === 's') { e.preventDefault(); execCmd('strikeThrough'); return; }
            }
        }

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

        if (e.key === 'Enter') {
            if (e.shiftKey) {
                if (breakOutOfBlock('PRE') || breakOutOfBlock('BLOCKQUOTE')) {
                    e.preventDefault();
                    return;
                }
            }

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                let li = range.startContainer as HTMLElement;
                while (li && li.nodeName !== 'LI' && li !== contentEditableRef.current) {
                    li = li.parentNode as HTMLElement;
                }

                if (li && li.nodeName === 'LI') {
                    const checkbox = li.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        e.preventDefault();

                        const span = li.querySelector('span');
                        const textContent = span ? span.textContent || '' : li.textContent || '';
                        const isEmpty = textContent.trim() === '';

                        if (isEmpty) {
                            const ul = li.parentElement;
                            const p = document.createElement('p');
                            p.innerHTML = '<br>';

                            if (ul) {
                                if (li.nextSibling) {
                                    ul.parentNode?.insertBefore(p, ul.nextSibling);
                                } else {
                                    ul.parentNode?.insertBefore(p, ul.nextSibling);
                                }
                                li.remove();
                                if (ul.children.length === 0) ul.remove();
                            } else {
                                li.replaceWith(p);
                            }

                            const newRange = document.createRange();
                            newRange.setStart(p, 0);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        } else {
                            const newLi = document.createElement('li');
                            newLi.className = 'checklist-item';
                            newLi.style.cssText = 'list-style: none; display: flex; align-items: flex-start; margin-bottom: 0.25rem;';
                            newLi.innerHTML = `<input type="checkbox" style="margin-top: 0.35rem; margin-right: 0.5rem; flex-shrink: 0; cursor: pointer;"><span><br></span>`;

                            if (li.nextSibling) {
                                li.parentNode?.insertBefore(newLi, li.nextSibling);
                            } else {
                                li.parentNode?.appendChild(newLi);
                            }

                            const newSpan = newLi.querySelector('span');
                            if (newSpan) {
                                const newRange = document.createRange();
                                newRange.setStart(newSpan, 0);
                                newRange.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            }
                        }
                        handleVisualInput();
                        return;
                    }
                }
            }

            if (selection && selection.isCollapsed) {
                const node = selection.anchorNode;
                if (node && (node.textContent === '' || node.textContent === '\n')) {
                    if (breakOutOfBlock('PRE') || breakOutOfBlock('BLOCKQUOTE')) {
                        e.preventDefault();
                        return;
                    }
                }
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
                            while (span.firstChild) {
                                li.insertBefore(span.firstChild, span);
                            }
                            span.remove();
                        }
                        li.style.cssText = '';
                        li.classList.remove('checklist-item');
                        handleVisualInput();
                        return;
                    }
                }
            }
        }
    };

    const handleTitleFocus = () => {
        if (title === DEFAULT_TITLE) {
            setTitle('');
        }
    };

    const handleTitleBlur = () => {
        if (title.trim() === '') {
            setTitle(DEFAULT_TITLE);
        }
    };

    const handleContentFocus = () => {
        if (!contentEditableRef.current) return;
        
        // Set focus state on mobile
        if (window.innerWidth < 768) { 
            setIsContentFocused(true);
        }
        
        const text = contentEditableRef.current.innerText || '';
        if (text.includes('New Note') && text.includes('Start writing here')) {
            contentEditableRef.current.innerHTML = '<p><br></p>';
            handleVisualInput();
        }
    };

    const handleContentBlur = () => {
        if (!contentEditableRef.current) return;
        
        // Unset focus state on mobile
        if (window.innerWidth < 768) { 
            setIsContentFocused(false);
        }
        
        const text = contentEditableRef.current.innerText?.trim();
        const hasMedia = contentEditableRef.current.querySelector('img, iframe, video, hr, table');

        if (!text && !hasMedia) {
            const html = contentEditableRef.current.innerHTML.trim();
            if (html === '' || html === '<br>' || html === '<p><br></p>') {

                // FIX: Only re-insert the placeholder if the content was the default to begin with.
                if (note.content === DEFAULT_CONTENT) {
                    const html = marked.parse(DEFAULT_CONTENT) as string;
                    contentEditableRef.current.innerHTML = html;
                    handleVisualInput();
                }
            }
        }
    };

    const isPlaceholderTitle = title === DEFAULT_TITLE || title === '';
    const isPlaceholderContent = useMemo(() => {
        if (viewMode === 'preview') return false;
        const text = contentEditableRef.current?.innerText?.trim() || '';
        return text.includes('New Note') && text.includes('Start writing here');
    }, [editorContent, note.content]);
    
    // Condition to hide the ENTIRE header when focused on mobile
    const isMobileAndFocused = window.innerWidth < 768 && isContentFocused;

    const toolbarBtnClass = "p-2 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors";

    const onToolbarButtonDown = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-900 relative">
            {/* FIX: Added custom CSS for checked checkbox background image */}
            <style>{`
                .task-checkbox:checked {
                    background-image: ${CHECKMARK_URL};
                    background-position: center;
                    background-repeat: no-repeat;
                    background-size: 100%;
                }
            `}</style>
            
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

            {/* TRASH BANNER */}
            {isTrashed && (
                <div className="bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center justify-between border-b border-red-100 dark:border-red-900/50">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                        <Trash2 size={18} />
                        <span className="text-sm font-semibold">This note is in the trash.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRestore}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded shadow-sm border border-gray-200 dark:border-gray-600 transition-colors"
                        >
                            <RotateCcw size={14} /> Restore
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('Delete this note permanently? This action cannot be undone.')) {
                                    onDeleteForever?.();
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded shadow-sm transition-colors"
                        >
                            Delete Forever
                        </button>
                    </div>
                </div>
            )}

            {/* MOBILE FLOATING CONTROLS (Moved Save and Toggles to top right) */}
            {!isTrashed && (
                 <div className="fixed top-3 right-2 z-40 md:hidden flex items-center gap-2">
                     {/* SAVE BUTTON */}
                     <button
                         onClick={handleManualSave}
                         // FIX: Use h-8 and px-3 to match the total height of the toggle container
                         className={`
                             flex items-center justify-center gap-2 px-3 h-8 rounded-lg text-sm font-bold transition-all
                             ${isDirty
                                 ? 'bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white shadow-md'
                                 : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 shadow-sm'
                             }
                         `}
                     >
                         {isDirty ? <Save size={16} /> : <Check size={16} />}
                     </button>
                     
                     {/* VIEW MODE TOGGLES */}
                     {/* FIX: Ensure the toggle container is aligned and sized correctly */}
                     <div className="bg-gray-100 dark:bg-gray-800 p-1 h-8 rounded-lg flex items-center shadow-md">
                         <button
                             onClick={() => toggleViewMode('edit')}
                             className={`p-1.5 rounded-md transition-all ${viewMode === 'edit' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700'}`}
                             title="Edit Mode"
                         >
                             <FileCode size={16} />
                         </button>
                         <button
                             onClick={() => toggleViewMode('readOnly')}
                             className={`p-1.5 rounded-md transition-all ${viewMode === 'readOnly' ? 'bg-white dark:bg-gray-700 shadow text-green-600 dark:text-green-400' : 'text-gray-500 hover:text-gray-700'}`}
                             title="Read Only Mode"
                         >
                             {viewMode === 'readOnly' ? <Lock size={16} /> : <Eye size={16} />}
                         </button>
                     </div>
                 </div>
            )}

            {/* HEADER - HIDES ON MOBILE FOCUS */}
            <div className={`flex flex-col gap-4 p-4 border-b border-gray-200 dark:border-gray-800 ${isTrashed ? 'opacity-50 pointer-events-none' : ''} ${isMobileAndFocused ? 'hidden md:flex' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                onChange({ title: e.target.value }, false); 
                            }}
                            onFocus={handleTitleFocus}
                            onBlur={handleTitleBlur}
                            readOnly={viewMode === 'readOnly' || isTrashed}
                            className={`text-2xl font-bold bg-transparent border-none focus:ring-0 w-full ${
                                isPlaceholderTitle ? 'text-gray-400 dark:text-gray-500 italic' : 'text-gray-900 dark:text-white'
                            }`}
                            placeholder="Untitled Note"
                        />

                        {/* TAGS */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag size={14} className="text-gray-400" />
                            {tags.map(tag => (
                                <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    {tag}
                                    {viewMode !== 'readOnly' && !isTrashed && (
                                        <button onClick={() => removeTag(tag)} className="ml-1 hover:text-blue-600 focus:outline-none">
                                            <X size={12} />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {viewMode !== 'readOnly' && !isTrashed && (
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                                    placeholder="Add tag..."
                                    className="bg-transparent border-none focus:ring-0 text-xs text-gray-600 dark:text-gray-400 placeholder-gray-400 w-24"
                                />
                            )}
                        </div>
                    </div>

                    {/* Desktop Controls (Hidden on Mobile) */}
                    {!isTrashed && (
                        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                            {/* SAVE BUTTON */}
                            <button
                                onClick={handleManualSave}
                                className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all
                                ${isDirty
                                    ? 'bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                }
                                `}
                            >
                                {isDirty ? <Save size={16} /> : <Check size={16} />}
                            </button>
                            
                            {/* VIEW MODE TOGGLES */}
                            <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex items-center">
                                <button
                                    onClick={() => toggleViewMode('edit')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'edit' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700'}`}
                                    title="Edit Mode"
                                >
                                    <FileCode size={16} />
                                </button>
                                <button
                                    onClick={() => toggleViewMode('readOnly')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'readOnly' ? 'bg-white dark:bg-gray-700 shadow text-green-600 dark:text-green-400' : 'text-gray-500 hover:text-gray-700'}`}
                                    title="Read Only Mode"
                                >
                                    {viewMode === 'readOnly' ? <Lock size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Category Picker (Only visible in edit mode) */}
                {viewMode === 'edit' && !isTrashed && (
                    <div className="flex items-center gap-2">
                        <div className="relative group flex items-center">
                            <span className="text-xs font-semibold text-gray-500 uppercase mr-2">Category:</span>
                            <input
                                type="text"
                                list="categories"
                                value={category}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setCategory(val);
                                    // Immediate save for Category
                                    onChange({ category: val }, true);
                                }}
                                className="px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                            />
                            <datalist id="categories">
                                {availableCategories.map(cat => (
                                    <option key={cat} value={cat} />
                                ))}
                            </datalist>
                        </div>
                    </div>
                )}
            </div>

            {/* TOOLBAR - Scrollable on Mobile, Always Visible */}
            {viewMode === 'edit' && !isTrashed && (
                <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 overflow-x-auto whitespace-nowrap">
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('bold')} title="Bold (Ctrl+B)"><Bold size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('italic')} title="Italic (Ctrl+I)"><Italic size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('underline')} title="Underline (Ctrl+U)"><Underline size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('strikeThrough')} title="Strikethrough (Ctrl+Shift+X)"><Strikethrough size={18} /></button>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('formatBlock', '<h1>')}><Heading1 size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('formatBlock', '<h2>')}><Heading2 size={18} /></button>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('insertUnorderedList')}><List size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('insertOrderedList')}><ListOrdered size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={insertChecklist}><CheckSquare size={18} /></button>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('formatBlock', 'blockquote')}><Quote size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('formatBlock', '<pre>')}><Code size={18} /></button>
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('insertHorizontalRule')} title="Insert Horizontal Rule"><Minus size={18} /></button>
                    {/* NEW: Remove Format Button */}
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('removeFormat')} title="Clear Formatting"><RemoveFormatting size={18} /></button>
                    {/* NEW: Link Button */}
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => execCmd('createLink')} title="Insert Link"><Link size={18} /></button>
                    
                    <button className={toolbarBtnClass} onMouseDown={onToolbarButtonDown} onClick={() => {
                        const sel = window.getSelection();
                        if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0);
                        fileInputRef.current?.click();
                    }}><ImageIcon size={18} /></button>
                </div>
            )}

            {/* EDITOR CONTENT */}
            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'preview' ? (
                    <textarea
                        ref={sourceTextareaRef}
                        value={editorContent}
                        onChange={handleSourceInput}
                        className="w-full h-full resize-none p-6 bg-white dark:bg-gray-900 font-mono text-sm leading-relaxed text-gray-900 dark:text-gray-200 focus:outline-none"
                        spellCheck={false}
                        disabled={isTrashed}
                    />
                ) : (
                    <div
                        className={`h-full overflow-y-auto p-8 bg-white dark:bg-gray-900 ${viewMode === 'readOnly' || isTrashed ? 'cursor-default' : 'cursor-text'}`}
                        onClick={handleEditorClick}
                        // NEW DRAG HANDLERS
                        onDragOver={handleDragPrevent} 
                        onDragEnter={handleDragPrevent}
                        onDrop={handleDrop}
                    >
                        <div
                            ref={contentEditableRef}
                            contentEditable={viewMode === 'edit' && !isTrashed}
                            onInput={handleVisualInput}
                            onKeyDown={handleEditorKeyDown}
                            onFocus={handleContentFocus}
                            onBlur={handleContentBlur}
                            className={`
                        prose prose-slate dark:prose-invert max-w-none focus:outline-none min-h-[50vh] 
                        prose-p:my-2 prose-headings:my-4 prose-img:rounded-lg prose-img:shadow-md
                        prose-img:max-h-[400px] prose-img:w-auto prose-img:max-w-full prose-img:object-contain
                        prose-a:text-[#788eb7] prose-a:no-underline prose-a:font-normal prose-a:cursor-pointer
                        ${isPlaceholderContent && viewMode === 'edit' ? 'text-gray-300 dark:text-gray-600 italic' : ''}
                        ${viewMode === 'readOnly' || isTrashed ? 'select-text' : ''}
                    `}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};