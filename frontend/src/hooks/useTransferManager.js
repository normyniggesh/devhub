import { useState, useCallback } from 'react';
import { apiClient } from '../api/client';

export function useTransferManager() {
  const [clipboard, setClipboard] = useState(null);
  // clipboard: { sourceProvider: 'local'|'devhub'|'gdrive', operation: 'copy'|'move', items: [...], sourceContext: {...} }
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');

  const copyItems = useCallback((sourceProvider, items, sourceContext = {}) => {
    if (!items || items.length === 0) return;
    setClipboard({
      sourceProvider,
      operation: 'copy',
      items: Array.isArray(items) ? items : [items],
      sourceContext
    });
  }, []);

  const cutItems = useCallback((sourceProvider, items, sourceContext = {}) => {
    if (!items || items.length === 0) return;
    setClipboard({
      sourceProvider,
      operation: 'move',
      items: Array.isArray(items) ? items : [items],
      sourceContext
    });
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
  }, []);

  /**
   * Execute transfer into targetProvider with targetContext
   * targetContext can contain: { dirHandle, projectId, folderId }
   */
  const executeTransfer = useCallback(async (targetProvider, targetContext = {}, customItems = null, customOp = null, customSourceProvider = null) => {
    const items = customItems || clipboard?.items;
    const operation = customOp || clipboard?.operation || 'copy';
    const sourceProvider = customSourceProvider || clipboard?.sourceProvider;

    if (!items || items.length === 0 || !sourceProvider) {
      throw new Error('No items selected for transfer');
    }

    setIsTransferring(true);
    let successCount = 0;

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setTransferMessage(`Transferring ${i + 1}/${items.length}: "${item.name}"...`);

        // Case 1: LOCAL PC -> DEVHUB
        if (sourceProvider === 'local' && targetProvider === 'devhub') {
          if (!targetContext.projectId) throw new Error('Target DEVHUB project must be selected');
          const rawFile = item.file || (item.handle ? await item.handle.getFile() : null);
          if (rawFile) {
            const formData = new FormData();
            formData.append('files', rawFile);
            formData.append('projectId', targetContext.projectId);
            if (targetContext.folderId) {
              formData.append('folderId', targetContext.folderId);
            }
            await apiClient('/files/upload', { body: formData });
            // If move, delete from PC handle if supported
            if (operation === 'move' && clipboard?.sourceContext?.dirHandle) {
              try { await clipboard.sourceContext.dirHandle.removeEntry(item.name); } catch(_) {}
            }
          }
        }

        // Case 2: LOCAL PC -> GOOGLE DRIVE
        else if (sourceProvider === 'local' && (targetProvider === 'gdrive' || targetProvider === 'google_drive')) {
          const rawFile = item.file || (item.handle ? await item.handle.getFile() : null);
          if (rawFile) {
            const formData = new FormData();
            formData.append('file', rawFile);
            if (targetContext.folderId && targetContext.folderId !== 'root') {
              formData.append('parentId', targetContext.folderId);
            }
            await apiClient('/integrations/google_drive/upload', { body: formData });
            if (operation === 'move' && clipboard?.sourceContext?.dirHandle) {
              try { await clipboard.sourceContext.dirHandle.removeEntry(item.name); } catch(_) {}
            }
          }
        }

        // Case 3: GOOGLE DRIVE -> DEVHUB
        else if ((sourceProvider === 'gdrive' || sourceProvider === 'google_drive') && targetProvider === 'devhub') {
          if (!targetContext.projectId) throw new Error('Target DEVHUB project must be selected');
          await apiClient('/integrations/google_drive/import', {
            method: 'POST',
            body: {
              fileId: item.id,
              fileName: item.name,
              projectId: targetContext.projectId,
              folderId: targetContext.folderId || null
            }
          });
          if (operation === 'move') {
            await apiClient(`/integrations/google_drive/files/${item.id}`, { method: 'DELETE' });
          }
        }

        // Case 4: GOOGLE DRIVE -> LOCAL PC
        else if ((sourceProvider === 'gdrive' || sourceProvider === 'google_drive') && targetProvider === 'local') {
          const res = await fetch(`/api/integrations/google_drive/download/${item.id}`, { credentials: 'include' });
          if (!res.ok) throw new Error(`Failed to download ${item.name} from Google Drive`);
          const arrayBuf = await res.arrayBuffer();

          if (targetContext.dirHandle && targetContext.dirHandle.getFileHandle) {
            const targetFileHandle = await targetContext.dirHandle.getFileHandle(item.name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(arrayBuf);
            await writable.close();
          } else {
            // Fallback download directly to user's PC via browser download trigger
            const blob = new Blob([arrayBuf]);
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          }

          if (operation === 'move') {
            await apiClient(`/integrations/google_drive/files/${item.id}`, { method: 'DELETE' });
          }
        }

        // Case 5: DEVHUB -> LOCAL PC
        else if (sourceProvider === 'devhub' && targetProvider === 'local') {
          const dlRes = await apiClient(`/files/${item.id}/download`);
          if (!dlRes.url) throw new Error('Failed to get download URL from DEVHUB');
          const fileRes = await fetch(dlRes.url);
          const arrayBuf = await fileRes.arrayBuffer();

          if (targetContext.dirHandle && targetContext.dirHandle.getFileHandle) {
            const targetFileHandle = await targetContext.dirHandle.getFileHandle(item.name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(arrayBuf);
            await writable.close();
          } else {
            // Fallback download directly to user's PC via browser download trigger
            const blob = new Blob([arrayBuf]);
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          }

          if (operation === 'move') {
            await apiClient(`/files/${item.id}`, { method: 'DELETE' });
          }
        }

        // Case 6: DEVHUB -> GOOGLE DRIVE
        else if (sourceProvider === 'devhub' && (targetProvider === 'gdrive' || targetProvider === 'google_drive')) {
          await apiClient('/integrations/google_drive/export', {
            method: 'POST',
            body: {
              devhubFileId: item.id,
              targetFolderId: targetContext.folderId || 'root'
            }
          });
          if (operation === 'move') {
            await apiClient(`/files/${item.id}`, { method: 'DELETE' });
          }
        }

        // Case 7: DEVHUB -> DEVHUB
        else if (sourceProvider === 'devhub' && targetProvider === 'devhub') {
          if (operation === 'copy') {
            await apiClient(`/files/${item.id}/copy`, {
              method: 'POST',
              body: {
                targetProjectId: targetContext.projectId,
                targetFolderId: targetContext.folderId || null
              }
            });
          } else if (operation === 'move') {
            await apiClient(`/files/${item.id}`, {
              method: 'PATCH',
              body: {
                folderId: targetContext.folderId || null
              }
            });
          }
        }

        // Case 8: GOOGLE DRIVE -> GOOGLE DRIVE
        else if ((sourceProvider === 'gdrive' || sourceProvider === 'google_drive') && (targetProvider === 'gdrive' || targetProvider === 'google_drive')) {
          await apiClient('/integrations/google_drive/move', {
            method: 'POST',
            body: {
              fileId: item.id,
              newParentId: targetContext.folderId || 'root',
              previousParentId: clipboard?.sourceContext?.folderId || 'root'
            }
          });
        }

        // Case 9: LOCAL PC -> LOCAL PC
        else if (sourceProvider === 'local' && targetProvider === 'local') {
          if (targetContext.dirHandle && item.handle) {
            const rawFile = await item.handle.getFile();
            const targetFileHandle = await targetContext.dirHandle.getFileHandle(item.name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(await rawFile.arrayBuffer());
            await writable.close();

            if (operation === 'move' && clipboard?.sourceContext?.dirHandle) {
              await clipboard.sourceContext.dirHandle.removeEntry(item.name);
            }
          }
        }

        successCount++;
      }

      // If move operation was executed, clear clipboard
      if (operation === 'move') {
        setClipboard(null);
      }

      return { success: true, count: successCount };
    } finally {
      setIsTransferring(false);
      setTransferMessage('');
    }
  }, [clipboard]);

  return {
    clipboard,
    copyItems,
    cutItems,
    clearClipboard,
    isTransferring,
    transferMessage,
    executeTransfer
  };
}
