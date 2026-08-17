const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jjssFiles', Object.freeze({
    getPaths: () => ipcRenderer.invoke('jjss-files:get-paths'),
    saveFile: ({ category, fileName, data }) => ipcRenderer.invoke('jjss-files:save-file', {
        category,
        fileName,
        data: data instanceof Uint8Array ? data : new Uint8Array(data),
    }),
    savePdf: ({ category, fileName, html }) => ipcRenderer.invoke('jjss-files:save-pdf', { category, fileName, html }),
    openFolder: folderKey => ipcRenderer.invoke('jjss-files:open-folder', folderKey),
    openSavedDirectory: openToken => ipcRenderer.invoke('jjss-files:open-saved-directory', openToken),
    chooseImportFolder: ({ includeSubfolders } = {}) => ipcRenderer.invoke('jjss-files:choose-import-folder', { includeSubfolders }),
    importLegacyDocuments: ({ token, mode }) => ipcRenderer.invoke('jjss-files:import-legacy-documents', { token, mode }),
}));
