import React, { useState } from 'react';
import { AppSettings } from '../types';
import { X, Save, Clock, Server, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { noteService } from '../services/noteService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  // syncStatus holds the confirmation message: "Sync complete!", "Sync failed."
  const [syncStatus, setSyncStatus] = useState<string>(''); 

  if (!isOpen) return null;

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Syncing...');
    
    // We use the new, integrated sync function from noteService
    try {
        await noteService.sync();
        setSyncStatus('Sync complete! Changes pulled from server.');
        setTimeout(() => setSyncStatus(''), 5000);
    } catch (e) {
        setSyncStatus('Sync failed. Check your network connection.');
        setTimeout(() => setSyncStatus(''), 5000);
    } finally {
        setIsSyncing(false);
    }
  };
  
  const StatusMessage = () => {
      if (!syncStatus) return null;
      
      const isSuccess = syncStatus.includes('complete');
      const Icon = isSuccess ? CheckCircle : XCircle;
      const colorClass = isSuccess ? 'text-green-500' : 'text-red-500';

      return (
          <p className={`flex items-center gap-2 text-sm text-right ${colorClass} font-medium mt-2`}>
              <Icon size={16} />
              {syncStatus}
          </p>
      );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-8 overflow-y-auto">
          {/* Sync Section (Updated) */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Server size={16} /> Sync & Backup
            </h3>
            
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Manually trigger synchronization with your server backend. This pushes local changes and pulls updates from other devices.
            </p>

            <div className="flex justify-end pt-2">
                <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                    <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                    {isSyncing ? "Syncing..." : "Manual Sync Now"}
                </button>
            </div>
            <div className="text-right">
                <StatusMessage />
            </div>
          </div>
          
          {/* Persistence Section */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Saving & Persistence
            </h3>
            
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-blue-700 dark:text-blue-300">
                <Save size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="autosave-toggle" className="font-semibold text-gray-900 dark:text-gray-100 cursor-pointer">
                    Auto-Save
                  </label>
                  <button
                    id="autosave-toggle"
                    onClick={() => onUpdateSettings({ ...settings, autoSave: !settings.autoSave })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                      settings.autoSave ? 'bg-blue-700' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    aria-pressed={settings.autoSave}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.autoSave ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Automatically save changes to local storage.
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-4 transition-opacity ${settings.autoSave ? 'opacity-100' : 'opacity-50'}`}>
              <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg text-purple-700 dark:text-purple-300">
                <Clock size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Save Interval</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Content saves every <span className="font-bold text-gray-900 dark:text-gray-200">{settings.saveInterval / 1000} seconds</span>.
                </p>
              </div>
            </div>
          </div>
          
          {/* Old Sync Settings (Removed Server URL/API Key inputs as they are not used in your current architecture) */}
          
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};