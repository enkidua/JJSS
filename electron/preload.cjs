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

// 자동 업데이트: 상태 조회·확인·내려받기·설치·내려받기 페이지 열기(주소는 앱에 고정). 상태에는 버전·진행률만 있다.
contextBridge.exposeInMainWorld('jjssUpdates', Object.freeze({
    getStatus: () => ipcRenderer.invoke('jjss-update:get-status'),
    check: () => ipcRenderer.invoke('jjss-update:check'),
    download: () => ipcRenderer.invoke('jjss-update:download'),
    install: () => ipcRenderer.invoke('jjss-update:install'),
    openDownloadPage: () => ipcRenderer.invoke('jjss-update:open-download-page'),
    onStatus: callback => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, status) => callback(status);
        ipcRenderer.on('jjss-update:status', listener);
        return () => ipcRenderer.removeListener('jjss-update:status', listener);
    },
}));

// 저장 데이터 암호화 키(운영체제 보안 저장소: Windows DPAPI, macOS Keychain으로 보호). 사용할 수 없으면 null을 돌려준다.
// getStatus는 보안 저장소 사용 가능 여부·배포용(패키징) 여부·플랫폼만 알려 준다(경로·키 값 없음).
contextBridge.exposeInMainWorld('jjssSecure', Object.freeze({
    getDataKey: () => ipcRenderer.invoke('jjss-secure:get-data-key'),
    getStatus: () => ipcRenderer.invoke('jjss-secure:get-status'),
}));
