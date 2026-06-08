/**
 * @file 国际化语言包 - zh TW
 *
 * 组织 zh TW 的核心逻辑、类型和协作边界，供 国际化语言包 模块复用。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

export default {
  common: {
    confirm: '確認',
    cancel: '取消',
    save: '儲存',
    reset: '重設',
    delete: '刪除',
    add: '新增',
    close: '關閉',
    copy: '複製',
    copied: '已複製到剪貼簿',
    copyFailed: '複製失敗',
    loading: '載入中...',
    saveFailed: '儲存失敗',
    autoSaveHint: '所有變更自動儲存到本機',
    resetNotSupported: '目前版本暫不支援一鍵重設',
    pressShortcut: '按下快捷鍵',
    shortcutHint: '請同時按下 Ctrl / Alt / Shift / Meta 與一個按鍵'
  },
  nav: {
    notes: '筆記列表',
    canvas: '畫布',
    clipboard: '剪貼簿',
    todo: '待辦',
    stats: '統計'
  },
  settings: {
    title: '設定',
    allChangesAutoSave: '所有變更自動儲存',
    loadError: '載入錯誤',
    sections: {
      general: '一般',
      appearance: '外觀',
      shortcuts: '快捷鍵',
      todo: '待辦浮窗',
      reminders: '提醒設定',
      privacy: '隱私安全',
      storage: '儲存',
      about: '關於'
    },
    eyebrows: {
      general: '啟動與速記',
      appearance: '主題與編輯',
      shortcuts: '全域入口',
      todo: '快捷與位置',
      reminders: '快捷選項',
      privacy: '本機優先',
      storage: '路徑與備份',
      about: '版本資訊'
    },
    general: {
      title: '一般',
      desc: '啟動與速記相關行為，決定 Steno 如何駐留在桌面工作流中。',
      groupStartup: '啟動與速記',
      groupLanguage: '語言',
      floatingWidth: '速記浮窗寬度',
      floatingWidthDesc: '新開啟速記浮窗時使用的預設寬度。',
      floatingHeight: '速記浮窗高度',
      floatingHeightDesc: '新開啟速記浮窗時使用的預設高度。',
      blurCloseDelay: '失焦關閉延遲',
      blurCloseDelayDesc: '速記浮窗失去焦點後等待關閉的毫秒數。',
      language: '介面語言',
      languageDesc: '切換應用介面的顯示語言，變更後立即生效。'
    },
    appearance: {
      title: '外觀',
      desc: '主題、編輯器模式和未來紙張偏好集中在這裡管理。',
      groupTheme: '主題',
      groupEditor: '編輯器',
      colorMode: '色彩模式',
      colorModeDesc: '跟隨系統會回應作業系統淺色或深色模式。',
      light: '淺色',
      dark: '深色',
      system: '跟隨系統',
      accentColor: '主題強調色',
      accentColorDesc: '原型中的強調色選擇已預留，目前版本不寫入設定。',
      editorMode: '編輯器模式',
      editorModeDesc: '控制 Markdown 編輯器預設展示方式。',
      editorSplit: '編輯 + 預覽',
      editorEdit: '只編輯',
      editorPreview: '只預覽',
      stickyNote: '便籤預設底色',
      stickyNoteDesc: '新便籤紙張顏色將在後續版本接入畫布卡片。',
      planned: '規劃中'
    },
    shortcuts: {
      title: '快捷鍵',
      desc: '聚焦快捷鍵控制項後直接按下組合鍵儲存；系統級快捷鍵會重新註冊。',
      groupGlobal: '全域入口',
      mainWindow: '主視窗',
      mainWindowDesc: '喚出或聚焦 Steno 主視窗。',
      quicknote: '速記浮窗',
      quicknoteDesc: '從任意應用快速開啟速記輸入框。',
      clipboard: '剪貼簿',
      clipboardDesc: '喚出 Steno 主視窗並開啟剪貼簿歷史。',
      search: '搜尋',
      searchDesc: '目前為應用內預留欄位，暫不註冊到作業系統。',
      shortcutUpdated: '已更新「{name}」',
      shortcutSaveFailed: '快捷鍵儲存失敗'
    },
    todo: {
      title: '待辦浮窗',
      desc: '全域快捷鍵隨時喚出今日待辦；可選擇浮窗的彈出位置策略。',
      groupPanel: '浮窗',
      enabled: '啟用待辦浮窗',
      enabledDesc: '關閉後系統級快捷鍵會註銷，浮窗不可喚出。',
      shortcut: '喚出快捷鍵',
      shortcutDesc: '聚焦後直接按下組合鍵儲存；系統級快捷鍵會重新註冊。',
      position: '彈出位置',
      positionDesc: '選擇浮窗在螢幕上的初始位置策略。',
      positionBottomRight: '螢幕右下角',
      positionCursor: '跟隨游標',
      positionLast: '記住上次位置',
      enabledSuccess: '已啟用待辦浮窗',
      disabledSuccess: '已停用待辦浮窗'
    },
    reminders: {
      title: '提醒設定',
      desc: '設定任務編輯器中的快捷提醒選項，修改後會立即用於下次開啟的提醒選單。',
      addOption: '新增選項',
      restoreDefaults: '恢復預設',
      restoreDefaultsConfirm: '使用預設 6 個提醒選項覆蓋目前列表。',
      displayLabel: '顯示名稱',
      typeRelative: '相對',
      typeAbsolute: '絕對',
      unitMinute: '分鐘',
      unitHour: '小時',
      unitDay: '天',
      defaultLabel: '15 分鐘後',
      emptyHint: '暫無快捷提醒選項。',
      saveFailed: '提醒選項儲存失敗'
    },
    privacy: {
      title: '隱私安全',
      desc: 'Steno 目前保持本機優先，隱私增強項先展示邊界，不寫入不存在的設定鍵。',
      groupLocal: '本機保護',
      dbEncryption: '資料庫加密',
      dbEncryptionDesc: 'SQLCipher 加密入口規劃中，目前版本不會修改資料庫結構。',
      sensitiveFilter: '敏感內容過濾',
      sensitiveFilterDesc: '信用卡號、Token、私鑰等模式過濾需要後端規則支援。',
      appExclusion: '應用排除名單',
      appExclusionDesc: '密碼管理器和指定應用排除名單將在權限層接入。',
      readOnly: '唯讀'
    },
    storage: {
      title: '儲存位置',
      desc: '查看本機資料目錄、資料庫檔案和備份目錄；路徑以普通文字渲染。',
      groupPath: '本機路徑',
      groupBackup: '備份',
      dataDir: '資料目錄',
      dbFile: '資料庫檔案',
      backupDir: '備份目錄',
      backupThreshold: '累計修改次數觸發備份',
      backupThresholdDesc: '達到閾值後打包本機 Markdown 與索引。'
    },
    about: {
      title: '關於 Steno',
      desc: '一款本機優先的桌面速記工具，使用 Tauri、Rust 和 Vue 建構。',
      version: '版本',
      versionValue: 'Steno 0.0.0',
      versionSub: '本機開發版',
      runtime: '執行階段',
      runtimeValue: 'Tauri 2 + Vue 3',
      runtimeSub: 'Rust 後端 · SQLite 本機庫',
      dataPolicy: '資料策略',
      dataPolicyValue: '本機優先',
      dataPolicySub: '預設不上傳筆記內容',
      license: '授權',
      licenseValue: 'MIT',
      licenseSub: '開源專案'
    }
  },
  languages: {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    de: 'Deutsch'
  },
  sidebar: {
    settings: '設定',
    language: '語言',
    collapse: '折疊側邊欄',
    expand: '展開側邊欄'
  },
  featureSearch: {
    placeholder: '搜尋功能、設定…',
    noResults: '沒有匹配的功能或設定',
    notesDesc: '回到主筆記工作台',
    canvasDesc: '在無限畫布上整理筆記',
    clipboardDesc: '查看剪貼簿歷史（規劃中）',
    todoDesc: '管理待辦事項',
    statsDesc: '查看待辦活躍度與趨勢',
    newNote: '新增筆記',
    newNoteDesc: '開啟筆記編輯器建立一篇新筆記',
    quicknote: '速記浮窗',
    quicknoteDesc: '喚出速記浮窗快速記錄',
    settingsDesc: '開啟應用設定面板'
  },
  mainView: {
    searchPlaceholder: '搜尋筆記…',
    noNotes: '暫無筆記',
    newNote: '新增筆記'
  },
  window: {
    minimize: '最小化',
    maximize: '最大化'
  },
  markdown: {
    copy: '複製',
    copied: '已複製'
  }
};
