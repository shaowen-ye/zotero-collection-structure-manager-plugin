CollectionStructureManagerPlugin = {
  id: null,
  version: null,
  rootURI: null,
  initialized: false,
  windowStates: new WeakMap(),
  config: {
    menuItemID: "collection-structure-manager-menuitem",
    menuSeparatorID: "collection-structure-manager-separator",
    styleID: "collection-structure-manager-style",
    overlayID: "collection-structure-manager-overlay",
    menuLabel: "文件夹结构管理器...",
    shortcutLabel: "Shift+Cmd/Ctrl+M",
    dialogTitle: "文件夹结构管理器",
    searchPlaceholder: "搜索文件夹名称或路径",
    emptyLabel: "没有匹配的文件夹",
    loadingLabel: "正在读取文件夹结构...",
    unnamedCollectionLabel: "未命名文件夹",
    unknownLibraryLabel: "未知文库",
    userLibraryLabel: "我的文库",
    rootTargetLabel: "根目录",
    noSelectionLabel: "请选择一个文件夹",
    mergePreviewEmptyLabel: "选择源文件夹和目标文件夹后，可预览合并影响。",
    favoritePrefKey: "collectionQuickJumper.favoriteCollectionIDs",
    recentPrefKey: "collectionQuickJumper.recentCollectionIDs",
    copyPathLabel: "复制路径",
    copiedPathLabel: "已复制",
    favoriteTitle: "收藏",
    unfavoriteTitle: "取消收藏",
    layoutPrefKey: "collectionStructureManager.layout",
    fontScalePrefKey: "collectionStructureManager.fontScale",
    operationLogPrefKey: "collectionStructureManager.operationLog",
    pathSeparator: " / ",
    recentLimit: 10,
    operationLogLimit: 12
  },

  init({ id, version, rootURI }) {
    if (this.initialized) {
      return;
    }
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.initialized = true;
  },

  log(message) {
    Zotero.debug(`Collection Structure Manager: ${message}`);
  },

  addToAllWindows() {
    for (const window of Zotero.getMainWindows()) {
      if (!window.ZoteroPane) {
        continue;
      }
      this.addToWindow(window);
    }
  },

  removeFromAllWindows() {
    for (const window of Zotero.getMainWindows()) {
      if (!window.ZoteroPane) {
        continue;
      }
      this.removeFromWindow(window);
    }
  },

  addToWindow(window) {
    if (this.windowStates.has(window)) {
      return;
    }

    const document = window.document;
    const state = {
      menuItem: null,
      separator: null,
      keyboardHandler: null,
      style: this.injectStyles(document),
      overlay: null,
      panel: null,
      contextMenu: null,
      dragCleanup: null,
      fontScale: 1,
      input: null,
      summary: null,
      results: null,
      body: null,
      detail: null,
      sourceTargetSummary: null,
      operationLogPanel: null,
      operationLogList: null,
      undoMoveButton: null,
      targetSelect: null,
      modeButtons: {},
      viewMode: "all",
      setSourceButton: null,
      setTargetButton: null,
      clearSourceTargetButton: null,
      jumpButton: null,
      copyButton: null,
      favoriteButton: null,
      mergePreview: null,
      mergeButton: null,
      records: [],
      filteredRecords: [],
      visibleRows: [],
      collapsedIDs: new Set(),
      highlightTokens: [],
      selectedID: null,
      selectedIDs: new Set(),
      anchorSelectedID: null,
      sourceIDs: new Set(),
      targetID: null,
      targetIsSet: false,
      operationLog: [],
      undoMovePlan: null,
      currentMergePlan: null
    };

    this.addToolsMenuItem(window, state);
    this.addKeyboardShortcut(window, state);
    this.windowStates.set(window, state);
  },

  removeFromWindow(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    this.closeManager(window);
    if (state.menuItem) {
      state.menuItem.remove();
    }
    if (state.separator) {
      state.separator.remove();
    }
    if (state.style) {
      state.style.remove();
    }
    if (state.keyboardHandler) {
      window.document.removeEventListener("keydown", state.keyboardHandler, true);
      state.keyboardHandler = null;
    }

    this.windowStates.delete(window);
  },

  addToolsMenuItem(window, state) {
    const document = window.document;
    const toolsPopup = document.querySelector("#menu_ToolsPopup");
    if (!toolsPopup) {
      this.log("Tools menu popup was not found");
      return;
    }

    const separator = this.createXULElement(document, "menuseparator");
    separator.setAttribute("id", this.config.menuSeparatorID);

    const menuItem = this.createXULElement(document, "menuitem");
    menuItem.setAttribute("id", this.config.menuItemID);
    menuItem.setAttribute("label", this.config.menuLabel);
    menuItem.setAttribute("acceltext", this.config.shortcutLabel);
    menuItem.addEventListener("command", () => this.openManager(window));

    toolsPopup.appendChild(separator);
    toolsPopup.appendChild(menuItem);

    state.separator = separator;
    state.menuItem = menuItem;
  },

  addKeyboardShortcut(window, state) {
    const handler = (event) => {
      if (this.handleFontShortcut(window, state, event)) {
        return;
      }
      if (!this.isOpenShortcutEvent(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.openManager(window);
    };

    window.document.addEventListener("keydown", handler, true);
    state.keyboardHandler = handler;
  },

  handleFontShortcut(window, state, event) {
    if (!state || !state.overlay || state.overlay.hidden || !(event.metaKey || event.ctrlKey) || event.altKey) {
      return false;
    }

    const key = String(event.key || "").toLowerCase();
    const code = String(event.code || "");
    const isMinus = key === "-" || key === "_" || code === "Minus";
    const isPlus = key === "+" || key === "=" || code === "Equal";
    const isReset = key === "0" || code === "Digit0";
    if (!isMinus && !isPlus && !isReset) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    if (isReset) {
      this.setManagerFontScale(window, 1);
    } else {
      this.setManagerFontScale(window, (state.fontScale || 1) + (isPlus ? 0.08 : -0.08));
    }
    return true;
  },

  setManagerFontScale(window, value) {
    const state = this.windowStates.get(window);
    if (!state || !state.panel) {
      return;
    }

    const scale = Math.max(0.82, Math.min(1.45, Number(value) || 1));
    state.fontScale = scale;
    this.applyManagerFontScale(state.panel, scale);
    this.savePrefJSON(this.config.fontScalePrefKey, scale);
  },

  applyManagerFontScale(panel, scale) {
    if (!panel) {
      return;
    }
    panel.style.setProperty("--csm-font-scale", String(scale || 1));
  },

  isOpenShortcutEvent(event) {
    const key = String(event.key || "").toLowerCase();
    const isM = key === "m" || event.code === "KeyM";
    if (!isM || !event.shiftKey || event.altKey) {
      return false;
    }

    if (this.isMacPlatform(event)) {
      return Boolean(event.metaKey && !event.ctrlKey);
    }
    return Boolean(event.ctrlKey && !event.metaKey);
  },

  isMacPlatform(event) {
    if (typeof Zotero !== "undefined" && typeof Zotero.isMac === "boolean") {
      return Zotero.isMac;
    }
    const navigator = event && event.view && event.view.navigator;
    const platform = String((navigator && (navigator.platform || navigator.userAgent)) || "");
    return /Mac|iPhone|iPad|iPod/.test(platform);
  },

  async openManager(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    if (!state.overlay) {
      this.createDialog(window, state);
    }

    state.overlay.hidden = false;
    state.input.value = "";
    state.input.focus();
    state.summary.textContent = this.config.loadingLabel;
    state.selectedID = null;
    state.selectedIDs.clear();
    state.anchorSelectedID = null;
    state.sourceIDs.clear();
    state.targetID = null;
    state.targetIsSet = false;
    state.operationLog = this.getOperationLog();
    this.clearElement(state.results);
    this.setDetail(window, null);
    this.refreshSourceTargetSummary(window);
    this.renderOperationLog(window);
    this.setMergePreview(window, null);

    const loading = this.createHTMLElement(window.document, "div");
    loading.className = "collection-structure-manager-empty";
    loading.textContent = this.config.loadingLabel;
    state.results.appendChild(loading);

    await this.reloadRecords(window);
  },

  closeManager(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.overlay) {
      return;
    }

    this.saveWindowLayout(window, state);
    if (state.dragCleanup) {
      state.dragCleanup();
      state.dragCleanup = null;
    }
    this.closeContextMenu(window);
    state.overlay.remove();
    state.overlay = null;
    state.panel = null;
    state.contextMenu = null;
    state.input = null;
    state.summary = null;
    state.results = null;
    state.body = null;
    state.detail = null;
    state.sourceTargetSummary = null;
    state.operationLogPanel = null;
    state.operationLogList = null;
    state.undoMoveButton = null;
    state.targetSelect = null;
    state.modeButtons = {};
    state.viewMode = "all";
    state.setSourceButton = null;
    state.setTargetButton = null;
    state.clearSourceTargetButton = null;
    state.jumpButton = null;
    state.copyButton = null;
    state.favoriteButton = null;
    state.mergePreview = null;
    state.mergeButton = null;
    state.records = [];
    state.filteredRecords = [];
    state.visibleRows = [];
    state.collapsedIDs = new Set();
    state.highlightTokens = [];
    state.selectedID = null;
    state.selectedIDs = new Set();
    state.anchorSelectedID = null;
    state.sourceIDs = new Set();
    state.targetID = null;
    state.targetIsSet = false;
    state.currentMergePlan = null;
  },

  startPanelDrag(window, state, panel, event) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target && target.closest && target.closest("button,input,select,textarea")) {
      return;
    }

    event.preventDefault();
    const document = window.document;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const width = rect.width;
    const height = rect.height;
    const margin = 8;

    panel.classList.add("dragging");
    panel.style.position = "absolute";
    panel.style.margin = "0";
    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;

    const onMouseMove = (moveEvent) => {
      const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
      const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
      const nextLeft = Math.max(margin, Math.min(maxLeft, startLeft + moveEvent.clientX - startX));
      const nextTop = Math.max(margin, Math.min(maxTop, startTop + moveEvent.clientY - startY));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", cleanup, true);
      panel.classList.remove("dragging");
      this.saveWindowLayout(window, state);
      if (state.dragCleanup === cleanup) {
        state.dragCleanup = null;
      }
    };

    if (state.dragCleanup) {
      state.dragCleanup();
    }
    state.dragCleanup = cleanup;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", cleanup, true);
  },

  startPanelResize(window, state, panel, direction, event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const document = window.document;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const startWidth = rect.width;
    const startHeight = rect.height;
    const margin = 8;
    const maxPanelWidth = Math.max(320, window.innerWidth - margin * 2);
    const maxPanelHeight = Math.max(320, window.innerHeight - margin * 2);
    const minWidth = Math.min(760, maxPanelWidth);
    const minHeight = Math.min(520, maxPanelHeight);
    const resizeLeft = direction.includes("left");
    const resizeRight = direction.includes("right");
    const resizeTop = direction.includes("top");
    const resizeBottom = direction.includes("bottom");

    panel.classList.add("resizing");
    panel.style.position = "absolute";
    panel.style.margin = "0";
    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;
    panel.style.width = `${startWidth}px`;
    panel.style.height = `${startHeight}px`;

    const onMouseMove = (moveEvent) => {
      let nextLeft = startLeft;
      let nextTop = startTop;
      let nextWidth = startWidth;
      let nextHeight = startHeight;

      if (resizeRight) {
        nextWidth = startWidth + moveEvent.clientX - startX;
      }
      if (resizeBottom) {
        nextHeight = startHeight + moveEvent.clientY - startY;
      }
      if (resizeLeft) {
        nextWidth = startWidth + startX - moveEvent.clientX;
        nextLeft = startLeft + moveEvent.clientX - startX;
      }
      if (resizeTop) {
        nextHeight = startHeight + startY - moveEvent.clientY;
        nextTop = startTop + moveEvent.clientY - startY;
      }

      nextWidth = Math.max(minWidth, Math.min(nextWidth, maxPanelWidth));
      nextHeight = Math.max(minHeight, Math.min(nextHeight, maxPanelHeight));
      if (resizeLeft) {
        nextLeft = Math.max(margin, Math.min(startLeft + startWidth - nextWidth, window.innerWidth - nextWidth - margin));
      }
      if (resizeTop) {
        nextTop = Math.max(margin, Math.min(startTop + startHeight - nextHeight, window.innerHeight - nextHeight - margin));
      }
      if (!resizeLeft) {
        nextLeft = Math.max(margin, Math.min(nextLeft, window.innerWidth - nextWidth - margin));
      }
      if (!resizeTop) {
        nextTop = Math.max(margin, Math.min(nextTop, window.innerHeight - nextHeight - margin));
      }

      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.width = `${nextWidth}px`;
      panel.style.height = `${nextHeight}px`;
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", cleanup, true);
      panel.classList.remove("resizing");
      this.saveWindowLayout(window, state);
      if (state.dragCleanup === cleanup) {
        state.dragCleanup = null;
      }
    };

    if (state.dragCleanup) {
      state.dragCleanup();
    }
    state.dragCleanup = cleanup;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", cleanup, true);
  },

  startSplitterDrag(window, state, body, event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const document = window.document;
    const bodyRect = body.getBoundingClientRect();
    const startX = event.clientX;
    const currentSideWidth = Number.parseFloat(body.style.getPropertyValue("--side-width")) || 360;
    const minSideWidth = 260;
    const maxSideWidth = Math.max(minSideWidth, bodyRect.width - 340);

    body.classList.add("resizing-columns");

    const onMouseMove = (moveEvent) => {
      const nextWidth = Math.max(
        minSideWidth,
        Math.min(maxSideWidth, currentSideWidth + startX - moveEvent.clientX)
      );
      body.style.setProperty("--side-width", `${nextWidth}px`);
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", cleanup, true);
      body.classList.remove("resizing-columns");
      this.saveWindowLayout(window, state);
      if (state.dragCleanup === cleanup) {
        state.dragCleanup = null;
      }
    };

    if (state.dragCleanup) {
      state.dragCleanup();
    }
    state.dragCleanup = cleanup;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", cleanup, true);
  },

  applySavedLayout(window, panel, body) {
    const layout = this.getPrefJSON(this.config.layoutPrefKey, null);
    if (!layout || typeof layout !== "object") {
      return;
    }

    const margin = 8;
    const maxWidth = Math.max(320, window.innerWidth - margin * 2);
    const maxHeight = Math.max(320, window.innerHeight - margin * 2);
    const width = Math.max(420, Math.min(Number(layout.width) || 0, maxWidth));
    const height = Math.max(360, Math.min(Number(layout.height) || 0, maxHeight));
    const left = Math.max(margin, Math.min(Number(layout.left) || margin, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(Number(layout.top) || margin, window.innerHeight - height - margin));

    if (width && height) {
      panel.style.position = "absolute";
      panel.style.margin = "0";
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    }

    const sideWidth = Math.max(260, Math.min(Number(layout.sideWidth) || 360, Math.max(260, width - 340)));
    body.style.setProperty("--side-width", `${sideWidth}px`);
  },

  saveWindowLayout(window, state) {
    if (!state || !state.panel || !state.body) {
      return;
    }

    try {
      const rect = state.panel.getBoundingClientRect();
      const sideWidth = Number.parseFloat(state.body.style.getPropertyValue("--side-width")) || 360;
      this.savePrefJSON(this.config.layoutPrefKey, {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        sideWidth: Math.round(sideWidth)
      });
    } catch (error) {
      this.log(`Unable to save layout: ${error}`);
    }
  },

  createDialog(window, state) {
    const document = window.document;
    const overlay = this.createHTMLElement(document, "div");
    overlay.id = this.config.overlayID;

    const panel = this.createHTMLElement(document, "div");
    panel.className = "collection-structure-manager-panel";
    state.fontScale = Number(this.getPrefJSON(this.config.fontScalePrefKey, 1)) || 1;
    this.applyManagerFontScale(panel, state.fontScale);
    overlay.appendChild(panel);

    for (const direction of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const handle = this.createHTMLElement(document, "div");
      handle.className = `collection-structure-manager-resize-handle ${direction}`;
      handle.addEventListener("mousedown", (event) => this.startPanelResize(window, state, panel, direction, event));
      panel.appendChild(handle);
    }

    const header = this.createHTMLElement(document, "div");
    header.className = "collection-structure-manager-header";
    header.addEventListener("mousedown", (event) => this.startPanelDrag(window, state, panel, event));
    panel.appendChild(header);

    const title = this.createHTMLElement(document, "div");
    title.className = "collection-structure-manager-title";
    title.textContent = this.config.dialogTitle;
    header.appendChild(title);

    const closeButton = this.createHTMLElement(document, "button");
    closeButton.className = "collection-structure-manager-button";
    closeButton.type = "button";
    closeButton.textContent = "关闭";
    closeButton.addEventListener("click", () => this.closeManager(window));
    header.appendChild(closeButton);

    const toolbar = this.createHTMLElement(document, "div");
    toolbar.className = "collection-structure-manager-toolbar";
    panel.appendChild(toolbar);

    const newRootButton = this.createHTMLElement(document, "button");
    newRootButton.className = "collection-structure-manager-button primary";
    newRootButton.type = "button";
    newRootButton.textContent = "新建根文件夹";
    newRootButton.addEventListener("click", () => this.createRootCollection(window));
    toolbar.appendChild(newRootButton);

    const newChildButton = this.createHTMLElement(document, "button");
    newChildButton.className = "collection-structure-manager-button";
    newChildButton.type = "button";
    newChildButton.textContent = "新建子文件夹";
    newChildButton.addEventListener("click", () => this.createChildCollection(window));
    toolbar.appendChild(newChildButton);

    const refreshButton = this.createHTMLElement(document, "button");
    refreshButton.className = "collection-structure-manager-button";
    refreshButton.type = "button";
    refreshButton.textContent = "刷新";
    refreshButton.addEventListener("click", () => this.reloadRecords(window));
    toolbar.appendChild(refreshButton);

    const expandAllButton = this.createHTMLElement(document, "button");
    expandAllButton.className = "collection-structure-manager-button";
    expandAllButton.type = "button";
    expandAllButton.textContent = "全部展开";
    expandAllButton.addEventListener("click", () => this.expandAllCollections(window));
    toolbar.appendChild(expandAllButton);

    const collapseAllButton = this.createHTMLElement(document, "button");
    collapseAllButton.className = "collection-structure-manager-button";
    collapseAllButton.type = "button";
    collapseAllButton.textContent = "全部折叠";
    collapseAllButton.addEventListener("click", () => this.collapseAllCollections(window));
    toolbar.appendChild(collapseAllButton);

    const input = this.createHTMLElement(document, "input");
    input.className = "collection-structure-manager-input";
    input.type = "search";
    input.placeholder = this.config.searchPlaceholder;
    input.addEventListener("input", () => this.filterRecords(window));
    input.addEventListener("keydown", (event) => this.handleManagerKeyDown(window, event));
    panel.appendChild(input);

    const modeBar = this.createHTMLElement(document, "div");
    modeBar.className = "collection-structure-manager-modebar";
    panel.appendChild(modeBar);

    state.modeButtons = {};
    for (const mode of [
      { id: "all", label: "全部文件夹" },
      { id: "favorite", label: "收藏" },
      { id: "recent", label: "最近访问" },
      { id: "empty", label: "空文件夹" }
    ]) {
      const modeButton = this.createHTMLElement(document, "button");
      modeButton.className = "collection-structure-manager-mode";
      modeButton.type = "button";
      modeButton.textContent = mode.label;
      modeButton.addEventListener("click", () => this.setViewMode(window, mode.id));
      modeBar.appendChild(modeButton);
      state.modeButtons[mode.id] = modeButton;
    }

    const summary = this.createHTMLElement(document, "div");
    summary.className = "collection-structure-manager-summary";
    panel.appendChild(summary);

    const body = this.createHTMLElement(document, "div");
    body.className = "collection-structure-manager-body";
    body.style.setProperty("--side-width", "360px");
    panel.appendChild(body);
    this.applySavedLayout(window, panel, body);

    const results = this.createHTMLElement(document, "div");
    results.className = "collection-structure-manager-results";
    body.appendChild(results);

    const splitter = this.createHTMLElement(document, "div");
    splitter.className = "collection-structure-manager-splitter";
    splitter.title = "拖动调整左右宽度";
    splitter.addEventListener("mousedown", (event) => this.startSplitterDrag(window, state, body, event));
    body.appendChild(splitter);

    const side = this.createHTMLElement(document, "div");
    side.className = "collection-structure-manager-side";
    body.appendChild(side);

    const detail = this.createHTMLElement(document, "div");
    detail.className = "collection-structure-manager-detail";
    side.appendChild(detail);

    const sourceTargetSummary = this.createHTMLElement(document, "div");
    sourceTargetSummary.className = "collection-structure-manager-source-target";
    side.appendChild(sourceTargetSummary);

    const operationLogPanel = this.createHTMLElement(document, "div");
    operationLogPanel.className = "collection-structure-manager-log";
    side.appendChild(operationLogPanel);

    const operationLogHeader = this.createHTMLElement(document, "div");
    operationLogHeader.className = "collection-structure-manager-log-header";
    operationLogPanel.appendChild(operationLogHeader);

    const operationLogTitle = this.createHTMLElement(document, "div");
    operationLogTitle.className = "collection-structure-manager-log-title";
    operationLogTitle.textContent = "最近操作";
    operationLogHeader.appendChild(operationLogTitle);

    const undoMoveButton = this.createHTMLElement(document, "button");
    undoMoveButton.className = "collection-structure-manager-button";
    undoMoveButton.type = "button";
    undoMoveButton.textContent = "撤销上次移动";
    undoMoveButton.disabled = true;
    undoMoveButton.addEventListener("click", () => this.undoLastMove(window));
    operationLogHeader.appendChild(undoMoveButton);

    const operationLogList = this.createHTMLElement(document, "div");
    operationLogList.className = "collection-structure-manager-log-list";
    operationLogPanel.appendChild(operationLogList);

    const targetLabel = this.createHTMLElement(document, "label");
    targetLabel.className = "collection-structure-manager-label";
    targetLabel.textContent = "目标位置（下拉选择或点“设为目标文件夹”）";
    side.appendChild(targetLabel);

    const targetSelect = this.createHTMLElement(document, "select");
    targetSelect.className = "collection-structure-manager-select";
    targetSelect.addEventListener("change", () => {
      this.applyTargetSelect(window);
      this.setMergePreview(window, null);
    });
    side.appendChild(targetSelect);

    const actionGrid = this.createHTMLElement(document, "div");
    actionGrid.className = "collection-structure-manager-actions";
    side.appendChild(actionGrid);

    const selectionGroup = this.createActionGroup(document, actionGrid, "选择");
    const navigationGroup = this.createActionGroup(document, actionGrid, "跳转");
    const reportGroup = this.createActionGroup(document, actionGrid, "结构");
    const modifyGroup = this.createActionGroup(document, actionGrid, "修改");

    const setSourceButton = this.createHTMLElement(document, "button");
    setSourceButton.className = "collection-structure-manager-button primary";
    setSourceButton.type = "button";
    setSourceButton.textContent = "设为源文件夹";
    setSourceButton.addEventListener("click", () => this.setSourceFromSelection(window));
    selectionGroup.appendChild(setSourceButton);

    const setTargetButton = this.createHTMLElement(document, "button");
    setTargetButton.className = "collection-structure-manager-button primary";
    setTargetButton.type = "button";
    setTargetButton.textContent = "设为目标文件夹";
    setTargetButton.addEventListener("click", () => this.setTargetFromSelection(window));
    selectionGroup.appendChild(setTargetButton);

    const clearSourceTargetButton = this.createHTMLElement(document, "button");
    clearSourceTargetButton.className = "collection-structure-manager-button";
    clearSourceTargetButton.type = "button";
    clearSourceTargetButton.textContent = "清除源/目标";
    clearSourceTargetButton.addEventListener("click", () => this.clearSourceTarget(window));
    selectionGroup.appendChild(clearSourceTargetButton);

    const jumpButton = this.createHTMLElement(document, "button");
    jumpButton.className = "collection-structure-manager-button primary";
    jumpButton.type = "button";
    jumpButton.textContent = "跳转到文件夹";
    jumpButton.disabled = true;
    jumpButton.addEventListener("click", () => this.jumpSelectedCollection(window));
    navigationGroup.appendChild(jumpButton);

    const copyButton = this.createHTMLElement(document, "button");
    copyButton.className = "collection-structure-manager-button";
    copyButton.type = "button";
    copyButton.textContent = this.config.copyPathLabel;
    copyButton.disabled = true;
    copyButton.addEventListener("click", () => this.copySelectedPath(window));
    navigationGroup.appendChild(copyButton);

    const favoriteButton = this.createHTMLElement(document, "button");
    favoriteButton.className = "collection-structure-manager-button";
    favoriteButton.type = "button";
    favoriteButton.textContent = "收藏";
    favoriteButton.disabled = true;
    favoriteButton.addEventListener("click", () => this.toggleFavoriteSelection(window));
    navigationGroup.appendChild(favoriteButton);

    const exportMarkdownButton = this.createHTMLElement(document, "button");
    exportMarkdownButton.className = "collection-structure-manager-button";
    exportMarkdownButton.type = "button";
    exportMarkdownButton.textContent = "复制结构MD";
    exportMarkdownButton.addEventListener("click", () => this.copyStructureReport(window, "markdown"));
    reportGroup.appendChild(exportMarkdownButton);

    const exportCSVButton = this.createHTMLElement(document, "button");
    exportCSVButton.className = "collection-structure-manager-button";
    exportCSVButton.type = "button";
    exportCSVButton.textContent = "复制结构CSV";
    exportCSVButton.addEventListener("click", () => this.copyStructureReport(window, "csv"));
    reportGroup.appendChild(exportCSVButton);

    const moveButton = this.createHTMLElement(document, "button");
    moveButton.className = "collection-structure-manager-button";
    moveButton.type = "button";
    moveButton.textContent = "移动到目标位置";
    moveButton.addEventListener("click", () => this.moveSelectedCollection(window));
    modifyGroup.appendChild(moveButton);

    const previewButton = this.createHTMLElement(document, "button");
    previewButton.className = "collection-structure-manager-button";
    previewButton.type = "button";
    previewButton.textContent = "预览合并";
    previewButton.addEventListener("click", () => this.previewMerge(window));
    modifyGroup.appendChild(previewButton);

    const mergePreview = this.createHTMLElement(document, "div");
    mergePreview.className = "collection-structure-manager-preview";
    mergePreview.textContent = this.config.mergePreviewEmptyLabel;
    side.appendChild(mergePreview);

    const mergeButton = this.createHTMLElement(document, "button");
    mergeButton.className = "collection-structure-manager-button danger";
    mergeButton.type = "button";
    mergeButton.textContent = "确认合并";
    mergeButton.disabled = true;
    mergeButton.addEventListener("click", () => this.executeMerge(window));
    side.appendChild(mergeButton);

    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) {
        this.closeManager(window);
      }
    });

    document.documentElement.appendChild(overlay);

    state.overlay = overlay;
    state.panel = panel;
    state.input = input;
    state.summary = summary;
    state.results = results;
    state.body = body;
    state.detail = detail;
    state.sourceTargetSummary = sourceTargetSummary;
    state.operationLogPanel = operationLogPanel;
    state.operationLogList = operationLogList;
    state.undoMoveButton = undoMoveButton;
    state.targetSelect = targetSelect;
    state.setSourceButton = setSourceButton;
    state.setTargetButton = setTargetButton;
    state.clearSourceTargetButton = clearSourceTargetButton;
    state.jumpButton = jumpButton;
    state.copyButton = copyButton;
    state.favoriteButton = favoriteButton;
    state.mergePreview = mergePreview;
    state.mergeButton = mergeButton;
  },

  createActionGroup(document, container, label) {
    const group = this.createHTMLElement(document, "div");
    group.className = "collection-structure-manager-action-group";

    const title = this.createHTMLElement(document, "div");
    title.className = "collection-structure-manager-action-title";
    title.textContent = label;
    group.appendChild(title);

    const buttons = this.createHTMLElement(document, "div");
    buttons.className = "collection-structure-manager-action-buttons";
    group.appendChild(buttons);
    container.appendChild(group);
    return buttons;
  },

  showRowContextMenu(window, collectionID, event) {
    const state = this.windowStates.get(window);
    if (!state || !state.overlay) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.selectRecord(window, collectionID, event.metaKey || event.ctrlKey || event.shiftKey ? event : null);
    this.closeContextMenu(window);

    const record = state.records.find((entry) => Number(entry.collectionID) === Number(collectionID));
    if (!record) {
      return;
    }

    const menu = this.createHTMLElement(window.document, "div");
    menu.className = "collection-structure-manager-context-menu";
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const addItem = (label, action, options = {}) => {
      const item = this.createHTMLElement(window.document, "button");
      item.className = "collection-structure-manager-context-item";
      item.type = "button";
      item.textContent = label;
      item.disabled = Boolean(options.disabled);
      item.addEventListener("click", async (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        this.closeContextMenu(window);
        await action();
      });
      menu.appendChild(item);
    };

    const hasChildren = Number(record.childCount || 0) > 0;
    const isCollapsed = state.collapsedIDs.has(Number(record.collectionID));
    addItem("设为源文件夹", () => this.setSourceFromSelection(window));
    addItem("设为目标文件夹", () => this.setTargetFromSelection(window));
    addItem("跳转到文件夹", () => this.jumpToCollection(window, record.collectionID));
    addItem("复制路径", () => this.copyText(window, record.path));
    addItem(this.isFavoriteCollection(record.collectionID) ? "取消收藏" : "收藏", () => this.toggleFavorite(window, record.collectionID));
    addItem(isCollapsed ? "展开子文件夹" : "折叠子文件夹", () => this.toggleCollectionCollapse(window, record.collectionID), {
      disabled: !hasChildren
    });

    state.overlay.appendChild(menu);
    state.contextMenu = menu;

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    if (rect.right > window.innerWidth - margin) {
      menu.style.left = `${Math.max(margin, window.innerWidth - rect.width - margin)}px`;
    }
    if (rect.bottom > window.innerHeight - margin) {
      menu.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`;
    }

    const close = (closeEvent) => {
      if (menu.contains(closeEvent.target)) {
        return;
      }
      this.closeContextMenu(window);
      window.document.removeEventListener("mousedown", close, true);
      window.document.removeEventListener("keydown", closeOnEscape, true);
    };
    const closeOnEscape = (keyEvent) => {
      if (keyEvent.key === "Escape") {
        this.closeContextMenu(window);
        window.document.removeEventListener("mousedown", close, true);
        window.document.removeEventListener("keydown", closeOnEscape, true);
      }
    };
    window.document.addEventListener("mousedown", close, true);
    window.document.addEventListener("keydown", closeOnEscape, true);
  },

  closeContextMenu(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.contextMenu) {
      return;
    }
    state.contextMenu.remove();
    state.contextMenu = null;
  },

  async reloadRecords(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    try {
      state.records = await this.loadCollectionRecords();
      this.pruneCollapsedIDs(state);
      this.pruneOperationState(state);
      this.populateTargetSelect(window);
      this.filterRecords(window);
    } catch (error) {
      Zotero.logError(error);
      this.log(`Unable to load collection structure: ${error}`);
      state.summary.textContent = "读取文件夹结构失败";
      this.clearElement(state.results);
      const empty = this.createHTMLElement(window.document, "div");
      empty.className = "collection-structure-manager-empty";
      empty.textContent = "读取文件夹结构失败";
      state.results.appendChild(empty);
    }
  },

  filterRecords(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const tokens = this.getSearchTokens(state);
    state.highlightTokens = tokens;
    const modeFiltered = this.getModeFilteredRecords(state);

    if (!tokens.length) {
      state.filteredRecords = modeFiltered;
    } else {
      state.filteredRecords = modeFiltered.filter((record) => {
        return tokens.every((token) => record.normalizedFullPath.includes(token));
      });
    }

    this.renderList(window);
  },

  setSourceFromSelection(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const selectedRecords = this.getSelectedRecords(window);
    if (!selectedRecords.length) {
      Zotero.alert(window, "请选择源文件夹", "请先在左侧选择一个或多个文件夹，再点击“设为源文件夹”。");
      return;
    }

    state.sourceIDs = new Set(selectedRecords.map((record) => Number(record.collectionID)));
    if (state.targetID && state.sourceIDs.has(Number(state.targetID))) {
      state.targetID = null;
      state.targetIsSet = false;
    }
    this.populateTargetSelect(window);
    this.refreshSourceTargetSummary(window);
    this.setMergePreview(window, null);
    this.renderList(window);
  },

  setTargetFromSelection(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const selectedRecord = this.getSelectedRecord(window);
    if (!selectedRecord) {
      Zotero.alert(window, "请选择目标文件夹", "请先在左侧选择一个文件夹，再点击“设为目标文件夹”。");
      return;
    }

    if (state.sourceIDs.has(Number(selectedRecord.collectionID))) {
      Zotero.alert(window, "目标无效", "目标文件夹不能同时是源文件夹。");
      return;
    }

    for (const source of this.getSourceRecords(window)) {
      if (!this.validateMoveOrMergeTarget(window, source, selectedRecord, true)) {
        return;
      }
    }

    state.targetID = Number(selectedRecord.collectionID);
    state.targetIsSet = true;
    if (state.targetSelect) {
      state.targetSelect.value = String(state.targetID);
    }
    this.refreshSourceTargetSummary(window);
    this.setMergePreview(window, null);
    this.renderList(window);
  },

  clearSourceTarget(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    state.sourceIDs.clear();
    state.targetID = null;
    state.targetIsSet = false;
    if (state.targetSelect) {
      state.targetSelect.value = "";
    }
    this.populateTargetSelect(window);
    this.refreshSourceTargetSummary(window);
    this.setMergePreview(window, null);
    this.renderList(window);
  },

  applyTargetSelect(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.targetSelect) {
      return;
    }

    const value = state.targetSelect.value;
    if (!value) {
      state.targetID = null;
      state.targetIsSet = false;
    } else if (value === "__root__") {
      state.targetID = null;
      state.targetIsSet = true;
    } else {
      state.targetID = Number(value);
      state.targetIsSet = Boolean(state.targetID);
    }

    this.refreshSourceTargetSummary(window);
    this.renderList(window);
  },

  refreshSourceTargetSummary(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.sourceTargetSummary) {
      return;
    }

    this.clearElement(state.sourceTargetSummary);
    this.appendSourceTargetLine(
      window.document,
      state.sourceTargetSummary,
      "源",
      this.createSourceLabel(window)
    );
    this.appendSourceTargetLine(
      window.document,
      state.sourceTargetSummary,
      "目标",
      this.createTargetLabel(window)
    );
  },

  appendSourceTargetLine(document, container, label, value) {
    const row = this.createHTMLElement(document, "div");
    row.className = "collection-structure-manager-source-target-line";

    const labelNode = this.createHTMLElement(document, "span");
    labelNode.className = "collection-structure-manager-source-target-label";
    labelNode.textContent = `${label}:`;
    row.appendChild(labelNode);

    const valueNode = this.createHTMLElement(document, "span");
    valueNode.className = "collection-structure-manager-source-target-value";
    valueNode.textContent = value;
    valueNode.title = value;
    row.appendChild(valueNode);

    container.appendChild(row);
  },

  createSourceLabel(window) {
    const sources = this.getSourceRecords(window);
    if (!sources.length) {
      return "未设置，请先选择左侧文件夹并点击“设为源文件夹”";
    }
    if (sources.length === 1) {
      return sources[0].path;
    }
    return `${sources.length} 个源文件夹`;
  },

  createTargetLabel(window) {
    const targetInfo = this.getTargetInfo(window);
    if (!targetInfo.isSet) {
      return "未设置，可从下拉框选择，或选择左侧文件夹并点击“设为目标文件夹”";
    }
    return targetInfo.label;
  },

  getModeFilteredRecords(state) {
    if (!state || state.viewMode === "all") {
      return state ? [...state.records] : [];
    }

    if (state.viewMode === "favorite") {
      const favoriteIDs = this.getFavoriteIDSet();
      return state.records.filter((record) => favoriteIDs.has(String(record.collectionID)));
    }

    if (state.viewMode === "recent") {
      const recentIDs = new Set(this.getRecentIDs());
      return state.records.filter((record) => recentIDs.has(String(record.collectionID)));
    }

    if (state.viewMode === "empty") {
      return state.records.filter((record) => {
        return Number(record.itemCount || 0) === 0
          && Number(record.recursiveItemCount || 0) === 0
          && Number(record.childCount || 0) === 0;
      });
    }

    return [...state.records];
  },

  setViewMode(window, mode) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    state.viewMode = mode || "all";
    this.filterRecords(window);
  },

  syncModeButtons(state) {
    for (const [mode, button] of Object.entries(state.modeButtons || {})) {
      button.classList.toggle("active", mode === state.viewMode);
    }
  },

  getViewModeLabel(mode) {
    if (mode === "favorite") {
      return "收藏";
    }
    if (mode === "recent") {
      return "最近访问";
    }
    if (mode === "empty") {
      return "空文件夹";
    }
    return "全部文件夹";
  },

  handleManagerKeyDown(window, event) {
    if (event.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.closeManager(window);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectVisibleOffset(window, 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectVisibleOffset(window, -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.jumpSelectedCollection(window);
    }
  },

  selectVisibleOffset(window, offset) {
    const state = this.windowStates.get(window);
    if (!state || !state.visibleRows.length) {
      return;
    }

    const currentIndex = Math.max(0, state.visibleRows.findIndex((row) => {
      return Number(row.record.collectionID) === Number(state.selectedID);
    }));
    const nextIndex = Math.max(0, Math.min(currentIndex + offset, state.visibleRows.length - 1));
    this.selectRecord(window, state.visibleRows[nextIndex].record.collectionID);

    const selectedRow = state.results.querySelector(`.collection-structure-manager-row[data-collection-id="${state.selectedID}"]`);
    if (selectedRow) {
      selectedRow.scrollIntoView({ block: "nearest" });
    }
  },

  renderList(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.results) {
      return;
    }

    const tokens = this.getSearchTokens(state);
    const isFiltered = Boolean(tokens.length || state.viewMode !== "all");
    const visibleRows = this.createVisibleTreeRows(state.records, state.filteredRecords, state.collapsedIDs, isFiltered);
    state.visibleRows = visibleRows;

    this.clearElement(state.results);
    this.syncModeButtons(state);

    if (isFiltered) {
      state.summary.textContent = `${this.getViewModeLabel(state.viewMode)} · 匹配 ${state.filteredRecords.length} / ${state.records.length} 个文件夹，显示 ${visibleRows.length} 行（含上级）`;
    } else {
      const collapsedCount = this.countActiveCollapsedIDs(state);
      state.summary.textContent = `${state.records.length} 个文件夹 · 收藏 ${this.getFavoriteIDSet().size} · 最近 ${this.getRecentIDs().length}，显示 ${visibleRows.length} 行${collapsedCount ? `，已折叠 ${collapsedCount} 个` : ""}`;
    }

    if (!visibleRows.length) {
      const empty = this.createHTMLElement(window.document, "div");
      empty.className = "collection-structure-manager-empty";
      empty.textContent = this.config.emptyLabel;
      state.results.appendChild(empty);
      state.selectedID = null;
      state.selectedIDs.clear();
      this.setDetail(window, null);
      return;
    }

    this.pruneSelectionToVisible(state, visibleRows);
    if (!state.selectedID || !visibleRows.some((row) => Number(row.record.collectionID) === Number(state.selectedID))) {
      const firstMatch = visibleRows.find((row) => row.isMatch) || visibleRows[0];
      state.selectedID = firstMatch ? Number(firstMatch.record.collectionID) : null;
    }
    if (state.selectedID && !state.selectedIDs.size) {
      state.selectedIDs.add(Number(state.selectedID));
      state.anchorSelectedID = Number(state.selectedID);
    }

    for (const rowInfo of visibleRows) {
      const record = rowInfo.record;
      const row = this.createHTMLElement(window.document, "div");
      row.className = "collection-structure-manager-row";
      row.dataset.collectionId = String(record.collectionID);
      row.classList.toggle("selected", state.selectedIDs.has(Number(record.collectionID)));
      row.classList.toggle("primary-selected", Number(record.collectionID) === Number(state.selectedID));
      row.classList.toggle("source-marked", state.sourceIDs.has(Number(record.collectionID)));
      row.classList.toggle("target-marked", state.targetIsSet && Number(state.targetID) === Number(record.collectionID));
      row.classList.toggle("search-ancestor", Boolean(rowInfo.isSearchAncestor));

      const main = this.createHTMLElement(window.document, "div");
      main.className = "collection-structure-manager-row-main";
      main.style.paddingLeft = `${rowInfo.depth * 18}px`;
      row.appendChild(main);

      const toggle = this.createHTMLElement(window.document, "button");
      toggle.className = "collection-structure-manager-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-label", isFiltered ? "筛选时自动展开" : (record.childCount ? "展开或折叠子文件夹" : "没有子文件夹"));
      toggle.disabled = !record.childCount || isFiltered;
      toggle.textContent = record.childCount ? (rowInfo.isCollapsed ? "▶" : "▼") : "";
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleCollectionCollapse(window, record.collectionID);
      });
      main.appendChild(toggle);

      const path = this.createHTMLElement(window.document, "div");
      path.className = "collection-structure-manager-row-path";
      path.title = record.path;
      this.appendHighlightedText(window.document, path, record.name, state.highlightTokens);
      main.appendChild(path);

      if (record.duplicateNameCount > 1) {
        const duplicate = this.createHTMLElement(window.document, "div");
        duplicate.className = "collection-structure-manager-badge warning";
        duplicate.textContent = `重名 ${record.duplicateNameCount}`;
        duplicate.title = `当前文库中有 ${record.duplicateNameCount} 个同名文件夹`;
        main.appendChild(duplicate);
      }

      if (this.isRecentCollection(record.collectionID)) {
        const recent = this.createHTMLElement(window.document, "div");
        recent.className = "collection-structure-manager-badge";
        recent.textContent = "最近";
        main.appendChild(recent);
      }

      const count = this.createHTMLElement(window.document, "div");
      count.className = "collection-structure-manager-count";
      count.textContent = this.formatItemCount(record);
      count.title = this.formatItemCountTitle(record);
      main.appendChild(count);

      const favorite = this.createHTMLElement(window.document, "button");
      const isFavorite = this.isFavoriteCollection(record.collectionID);
      favorite.className = `collection-structure-manager-favorite${isFavorite ? " active" : ""}`;
      favorite.type = "button";
      favorite.textContent = isFavorite ? "★" : "☆";
      favorite.title = isFavorite ? this.config.unfavoriteTitle : this.config.favoriteTitle;
      favorite.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleFavorite(window, record.collectionID);
      });
      main.appendChild(favorite);

      row.addEventListener("click", (event) => this.selectRecord(window, record.collectionID, event));
      row.addEventListener("dblclick", () => this.jumpToCollection(window, record.collectionID));
      row.addEventListener("contextmenu", (event) => this.showRowContextMenu(window, record.collectionID, event));
      state.results.appendChild(row);
    }

    this.populateTargetSelect(window);
    this.refreshSourceTargetSummary(window);
    this.setDetail(window, this.getSelectedRecord(window));
  },

  getSearchTokens(state) {
    const query = this.normalizeText(state.input ? state.input.value : "");
    return query.split(/\s+/).filter(Boolean);
  },

  createVisibleTreeRows(records, matchedRecords, collapsedIDs, forceExpanded) {
    const recordsByID = new Map(records.map((record) => [Number(record.collectionID), record]));
    const childrenByParentID = this.createChildrenByParentID(records, recordsByID);
    const rootRecords = this.sortTreeRecords(records.filter((record) => {
      return !record.parentID || !recordsByID.has(Number(record.parentID));
    }));

    const matchedIDs = new Set((matchedRecords || records).map((record) => Number(record.collectionID)));
    const includedIDs = new Set();
    const hasFilter = matchedIDs.size !== records.length;

    if (hasFilter) {
      for (const record of matchedRecords || []) {
        this.addRecordAndAncestors(record, recordsByID, includedIDs);
      }
    }

    const rows = [];
    const visit = (record, depth) => {
      const collectionID = Number(record.collectionID);
      if (hasFilter && !includedIDs.has(collectionID)) {
        return;
      }

      const children = childrenByParentID.get(collectionID) || [];
      const isCollapsed = !forceExpanded && collapsedIDs.has(collectionID);
      rows.push({
        record,
        depth,
        isCollapsed,
        isMatch: !hasFilter || matchedIDs.has(collectionID),
        isSearchAncestor: hasFilter && !matchedIDs.has(collectionID)
      });

      if (isCollapsed) {
        return;
      }
      for (const child of children) {
        visit(child, depth + 1);
      }
    };

    for (const root of rootRecords) {
      visit(root, 0);
    }

    return rows;
  },

  pruneSelectionToVisible(state, visibleRows) {
    const visibleIDs = new Set(visibleRows.map((row) => Number(row.record.collectionID)));
    state.selectedIDs = new Set([...state.selectedIDs].filter((collectionID) => visibleIDs.has(Number(collectionID))));
    if (state.selectedID && !visibleIDs.has(Number(state.selectedID))) {
      state.selectedID = null;
    }
    if (state.anchorSelectedID && !visibleIDs.has(Number(state.anchorSelectedID))) {
      state.anchorSelectedID = state.selectedID;
    }
  },

  createChildrenByParentID(records, recordsByID) {
    const childrenByParentID = new Map();
    for (const record of records) {
      if (!record.parentID || !recordsByID.has(Number(record.parentID))) {
        continue;
      }
      const parentID = Number(record.parentID);
      if (!childrenByParentID.has(parentID)) {
        childrenByParentID.set(parentID, []);
      }
      childrenByParentID.get(parentID).push(record);
    }

    for (const [parentID, children] of childrenByParentID.entries()) {
      childrenByParentID.set(parentID, this.sortTreeRecords(children));
    }

    return childrenByParentID;
  },

  sortTreeRecords(records) {
    return [...records].sort((left, right) => {
      const libraryCompare = String(left.libraryName || "").localeCompare(String(right.libraryName || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      });
      if (libraryCompare) {
        return libraryCompare;
      }
      const nameCompare = String(left.name || "").localeCompare(String(right.name || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      });
      if (nameCompare) {
        return nameCompare;
      }
      return Number(left.collectionID) - Number(right.collectionID);
    });
  },

  addRecordAndAncestors(record, recordsByID, includedIDs) {
    let current = record;
    const seen = new Set();
    while (current && !seen.has(Number(current.collectionID))) {
      const collectionID = Number(current.collectionID);
      seen.add(collectionID);
      includedIDs.add(collectionID);
      if (!current.parentID) {
        break;
      }
      current = recordsByID.get(Number(current.parentID));
    }
  },

  expandAncestorsForSelection(state, collectionID) {
    const recordsByID = new Map(state.records.map((record) => [Number(record.collectionID), record]));
    let current = recordsByID.get(Number(collectionID));
    const seen = new Set();
    let changed = false;

    while (current && current.parentID && !seen.has(Number(current.collectionID))) {
      seen.add(Number(current.collectionID));
      const parentID = Number(current.parentID);
      if (state.collapsedIDs.delete(parentID)) {
        changed = true;
      }
      current = recordsByID.get(parentID);
    }

    return changed;
  },

  toggleCollectionCollapse(window, collectionID) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const id = Number(collectionID);
    if (state.collapsedIDs.has(id)) {
      state.collapsedIDs.delete(id);
    } else {
      state.collapsedIDs.add(id);
    }
    this.renderList(window);
  },

  expandAllCollections(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }
    state.collapsedIDs.clear();
    this.renderList(window);
  },

  collapseAllCollections(window) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }
    state.collapsedIDs = new Set(
      state.records
        .filter((record) => record.childCount > 0)
        .map((record) => Number(record.collectionID))
    );
    this.renderList(window);
  },

  pruneCollapsedIDs(state) {
    const collectionIDs = new Set(state.records.map((record) => Number(record.collectionID)));
    state.collapsedIDs = new Set([...state.collapsedIDs].filter((collectionID) => collectionIDs.has(Number(collectionID))));
  },

  pruneOperationState(state) {
    const collectionIDs = new Set(state.records.map((record) => Number(record.collectionID)));
    state.sourceIDs = new Set([...state.sourceIDs].filter((collectionID) => collectionIDs.has(Number(collectionID))));
    if (state.targetID && !collectionIDs.has(Number(state.targetID))) {
      state.targetID = null;
      state.targetIsSet = false;
    }
  },

  countActiveCollapsedIDs(state) {
    const expandableIDs = new Set(
      state.records
        .filter((record) => record.childCount > 0)
        .map((record) => Number(record.collectionID))
    );
    return [...state.collapsedIDs].filter((collectionID) => expandableIDs.has(Number(collectionID))).length;
  },

  appendHighlightedText(document, container, text, tokens) {
    this.clearElement(container);
    const value = String(text || "");
    if (!tokens || !tokens.length) {
      container.textContent = value;
      return;
    }

    const lowerValue = value.toLowerCase();
    const lowerTokens = tokens.map((token) => token.toLowerCase()).filter(Boolean);
    let cursor = 0;

    while (cursor < value.length) {
      let nextMatch = null;
      for (const token of lowerTokens) {
        const index = lowerValue.indexOf(token, cursor);
        if (index === -1) {
          continue;
        }
        if (!nextMatch || index < nextMatch.index || (index === nextMatch.index && token.length > nextMatch.token.length)) {
          nextMatch = { index, token };
        }
      }

      if (!nextMatch) {
        container.appendChild(document.createTextNode(value.slice(cursor)));
        break;
      }

      if (nextMatch.index > cursor) {
        container.appendChild(document.createTextNode(value.slice(cursor, nextMatch.index)));
      }

      const mark = this.createHTMLElement(document, "span");
      mark.className = "collection-structure-manager-highlight";
      mark.textContent = value.slice(nextMatch.index, nextMatch.index + nextMatch.token.length);
      container.appendChild(mark);
      cursor = nextMatch.index + nextMatch.token.length;
    }
  },

  formatItemCount(record) {
    const direct = Number(record.itemCount || 0);
    const recursive = Number(record.recursiveItemCount || direct);
    if (recursive > direct) {
      return `${direct}/${recursive} 项`;
    }
    return `${direct} 项`;
  },

  formatItemCountTitle(record) {
    const direct = Number(record.itemCount || 0);
    const recursive = Number(record.recursiveItemCount || direct);
    if (recursive > direct) {
      return `直接包含 ${direct} 项，含子文件夹共 ${recursive} 项`;
    }
    return `直接包含 ${direct} 项`;
  },

  async copySelectedPath(window) {
    const records = this.getSelectedRecords(window);
    if (!records.length) {
      return;
    }

    try {
      await this.copyText(window, records.map((record) => record.path).join("\n"));
      const state = this.windowStates.get(window);
      if (state && state.copyButton) {
        state.copyButton.textContent = this.config.copiedPathLabel;
        window.setTimeout(() => {
          if (state.copyButton) {
            state.copyButton.textContent = records.length > 1 ? "复制所选路径" : this.config.copyPathLabel;
          }
        }, 1200);
      }
    } catch (error) {
      Zotero.logError(error);
      this.log(`Unable to copy path: ${error}`);
      Zotero.alert(window, "无法复制路径", "无法复制路径到剪贴板。");
    }
  },

  async copyStructureReport(window, format) {
    const state = this.windowStates.get(window);
    if (!state || !state.records.length) {
      Zotero.alert(window, "无法复制结构", "当前没有可导出的文件夹结构。");
      return;
    }

    const text = format === "csv"
      ? this.createCSVStructureReport(state.records)
      : this.createMarkdownStructureReport(state.records);

    try {
      await this.copyText(window, text);
      this.addOperationLog(window, `已复制文件夹结构${format === "csv" ? "CSV" : "Markdown"}报告`);
      Zotero.alert(window, "已复制结构报告", "文件夹结构报告已复制到剪贴板。");
    } catch (error) {
      Zotero.logError(error);
      this.log(`Unable to copy structure report: ${error}`);
      Zotero.alert(window, "无法复制结构报告", "无法复制结构报告到剪贴板。");
    }
  },

  createMarkdownStructureReport(records) {
    const rows = this.createVisibleTreeRows(records, records, new Set(), true);
    const lines = [
      "# Zotero 文件夹结构报告",
      "",
      `生成时间: ${new Date().toLocaleString()}`,
      `文件夹数量: ${records.length}`,
      "",
      "## 文件夹树",
      ""
    ];

    for (const row of rows) {
      const record = row.record;
      const indent = "  ".repeat(row.depth);
      const count = this.formatItemCount(record);
      const duplicate = record.duplicateNameCount > 1 ? `，重名 ${record.duplicateNameCount}` : "";
      lines.push(`${indent}- ${record.name}（${count}，子文件夹 ${record.childCount}${duplicate}）`);
    }

    return lines.join("\n");
  },

  createCSVStructureReport(records) {
    const headers = [
      "library",
      "path",
      "name",
      "direct_items",
      "recursive_items",
      "child_count",
      "duplicate_name_count"
    ];
    const lines = [headers.map((value) => this.csvEscape(value)).join(",")];

    for (const record of records) {
      lines.push([
        record.libraryName,
        record.path,
        record.name,
        record.itemCount,
        record.recursiveItemCount,
        record.childCount,
        record.duplicateNameCount
      ].map((value) => this.csvEscape(value)).join(","));
    }

    return lines.join("\n");
  },

  csvEscape(value) {
    const text = String(value ?? "");
    if (!/[",\n\r]/.test(text)) {
      return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
  },

  async copyText(window, text) {
    if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
      await window.navigator.clipboard.writeText(text);
      return;
    }

    if (typeof Components !== "undefined" && Components.classes) {
      const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
      clipboardHelper.copyString(text);
      return;
    }

    throw new Error("Clipboard API is unavailable");
  },

  getPrefArray(prefKey) {
    try {
      if (typeof Zotero.Prefs.prefHasUserValue === "function"
        && !Zotero.Prefs.prefHasUserValue(prefKey)) {
        return [];
      }

      const raw = Zotero.Prefs.get(prefKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value)).filter(Boolean);
      }
    } catch (error) {
      this.log(`Unable to read preference ${prefKey}: ${error}`);
    }
    return [];
  },

  savePrefArray(prefKey, values) {
    const uniqueValues = [...new Set(values.map((value) => String(value)).filter(Boolean))];
    Zotero.Prefs.set(prefKey, JSON.stringify(uniqueValues));
  },

  getPrefJSON(prefKey, fallbackValue) {
    try {
      if (typeof Zotero.Prefs.prefHasUserValue === "function"
        && !Zotero.Prefs.prefHasUserValue(prefKey)) {
        return fallbackValue;
      }

      const raw = Zotero.Prefs.get(prefKey);
      if (!raw) {
        return fallbackValue;
      }

      return JSON.parse(raw);
    } catch (error) {
      this.log(`Unable to read JSON preference ${prefKey}: ${error}`);
      return fallbackValue;
    }
  },

  savePrefJSON(prefKey, value) {
    try {
      Zotero.Prefs.set(prefKey, JSON.stringify(value));
    } catch (error) {
      this.log(`Unable to save JSON preference ${prefKey}: ${error}`);
    }
  },

  getOperationLog() {
    const log = this.getPrefJSON(this.config.operationLogPrefKey, []);
    if (!Array.isArray(log)) {
      return [];
    }
    return log
      .filter((entry) => entry && entry.message)
      .slice(0, this.config.operationLogLimit);
  },

  saveOperationLog(log) {
    this.savePrefJSON(this.config.operationLogPrefKey, log.slice(0, this.config.operationLogLimit));
  },

  addOperationLog(window, message, undoMovePlan = null) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const entry = {
      time: new Date().toLocaleString(),
      message
    };
    state.operationLog = [entry, ...(state.operationLog || [])].slice(0, this.config.operationLogLimit);
    this.saveOperationLog(state.operationLog);
    if (undoMovePlan) {
      state.undoMovePlan = undoMovePlan;
    }
    this.renderOperationLog(window);
  },

  renderOperationLog(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.operationLogList) {
      return;
    }

    this.clearElement(state.operationLogList);
    const log = state.operationLog && state.operationLog.length
      ? state.operationLog
      : this.getOperationLog();
    state.operationLog = log;

    if (state.undoMoveButton) {
      state.undoMoveButton.disabled = !state.undoMovePlan;
    }

    if (!log.length) {
      const empty = this.createHTMLElement(window.document, "div");
      empty.className = "collection-structure-manager-log-empty";
      empty.textContent = "暂无操作记录";
      state.operationLogList.appendChild(empty);
      return;
    }

    for (const entry of log.slice(0, 5)) {
      const row = this.createHTMLElement(window.document, "div");
      row.className = "collection-structure-manager-log-row";
      row.textContent = `${entry.time} · ${entry.message}`;
      row.title = row.textContent;
      state.operationLogList.appendChild(row);
    }
  },

  getFavoriteIDs() {
    return this.getPrefArray(this.config.favoritePrefKey);
  },

  getFavoriteIDSet() {
    return new Set(this.getFavoriteIDs());
  },

  isFavoriteCollection(collectionID) {
    return this.getFavoriteIDSet().has(String(collectionID));
  },

  toggleFavorite(window, collectionID) {
    const id = String(collectionID);
    const favoriteIDs = this.getFavoriteIDs();
    const index = favoriteIDs.indexOf(id);

    if (index === -1) {
      favoriteIDs.unshift(id);
    } else {
      favoriteIDs.splice(index, 1);
    }

    this.savePrefArray(this.config.favoritePrefKey, favoriteIDs);
    this.filterRecords(window);
  },

  toggleFavoriteSelection(window) {
    const selectedRecords = this.getSelectedRecords(window);
    if (!selectedRecords.length) {
      return;
    }

    const selectedIDs = selectedRecords.map((record) => String(record.collectionID));
    const favoriteIDSet = this.getFavoriteIDSet();
    const shouldRemove = selectedIDs.every((id) => favoriteIDSet.has(id));

    if (shouldRemove) {
      for (const id of selectedIDs) {
        favoriteIDSet.delete(id);
      }
    } else {
      for (const id of selectedIDs) {
        favoriteIDSet.add(id);
      }
    }

    this.savePrefArray(this.config.favoritePrefKey, [...favoriteIDSet]);
    this.filterRecords(window);
  },

  getRecentIDs() {
    return this.getPrefArray(this.config.recentPrefKey).slice(0, this.config.recentLimit);
  },

  isRecentCollection(collectionID) {
    return this.getRecentIDs().includes(String(collectionID));
  },

  addRecentCollection(collectionID) {
    const id = String(collectionID);
    const recentIDs = this.getRecentIDs().filter((value) => value !== id);
    recentIDs.unshift(id);
    this.savePrefArray(this.config.recentPrefKey, recentIDs.slice(0, this.config.recentLimit));
  },

  async jumpSelectedCollection(window) {
    const record = this.getSelectedRecord(window);
    if (!record) {
      return;
    }
    await this.jumpToCollection(window, record.collectionID);
  },

  async jumpToCollection(window, collectionID) {
    try {
      const collection = Zotero.Collections && Zotero.Collections.get
        ? Zotero.Collections.get(collectionID)
        : null;
      if (collection && collection.deleted) {
        throw new Error(`Collection ${collectionID} is deleted`);
      }

      if (!window.ZoteroPane || !window.ZoteroPane.collectionsView) {
        throw new Error("ZoteroPane collections view is unavailable");
      }

      const selected = await window.ZoteroPane.collectionsView.selectCollection(collectionID);
      if (selected === false) {
        throw new Error(`Could not select collection ${collectionID}`);
      }

      if (window.ZoteroPane.itemsView && typeof window.ZoteroPane.itemsView.waitForLoad === "function") {
        await window.ZoteroPane.itemsView.waitForLoad();
      }

      this.addRecentCollection(collectionID);
      this.closeManager(window);
    } catch (error) {
      Zotero.logError(error);
      this.log(`Failed to jump to collection ${collectionID}: ${error}`);
      Zotero.alert(
        window,
        "无法跳转到该文件夹",
        "无法跳转到该文件夹，可能已被删除或当前视图尚未加载。"
      );
    }
  },

  createRowMeta(record) {
    const parts = [
      `直接 ${record.itemCount} 项`,
      `含子 ${record.recursiveItemCount} 项`,
      `子文件夹 ${record.childCount}`
    ];
    if (record.duplicateNameCount > 1) {
      parts.push(`重名 ${record.duplicateNameCount}`);
    }
    return parts.join(" · ");
  },

  selectRecord(window, collectionID, event = null) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const id = Number(collectionID);
    const isRangeSelection = Boolean(event && event.shiftKey && state.anchorSelectedID);
    const isToggleSelection = Boolean(event && (event.metaKey || event.ctrlKey));

    if (isRangeSelection) {
      const visibleIDs = state.visibleRows.map((row) => Number(row.record.collectionID));
      const startIndex = visibleIDs.indexOf(Number(state.anchorSelectedID));
      const endIndex = visibleIDs.indexOf(id);
      if (startIndex !== -1 && endIndex !== -1) {
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        state.selectedIDs = new Set(visibleIDs.slice(from, to + 1));
      } else {
        state.selectedIDs = new Set([id]);
        state.anchorSelectedID = id;
      }
    } else if (isToggleSelection) {
      if (state.selectedIDs.has(id)) {
        state.selectedIDs.delete(id);
      } else {
        state.selectedIDs.add(id);
      }
      if (!state.selectedIDs.size) {
        state.selectedIDs.add(id);
      }
      state.anchorSelectedID = id;
    } else {
      state.selectedIDs = new Set([id]);
      state.anchorSelectedID = id;
    }

    state.selectedID = id;
    const expandedAncestors = this.expandAncestorsForSelection(state, state.selectedID);
    const isVisible = state.visibleRows.some((row) => Number(row.record.collectionID) === state.selectedID);
    if (expandedAncestors || !isVisible) {
      this.renderList(window);
      return;
    }

    for (const row of state.results.querySelectorAll(".collection-structure-manager-row")) {
      const rowID = Number(row.dataset.collectionId);
      row.classList.toggle("selected", state.selectedIDs.has(rowID));
      row.classList.toggle("primary-selected", rowID === state.selectedID);
    }
    this.populateTargetSelect(window);
    this.refreshSourceTargetSummary(window);
    this.setDetail(window, this.getSelectedRecord(window));
    this.setMergePreview(window, null);
  },

  setDetail(window, record) {
    const state = this.windowStates.get(window);
    if (!state || !state.detail) {
      return;
    }

    this.clearElement(state.detail);
    const selectedRecords = this.getSelectedRecords(window);
    this.syncSelectionActions(window, selectedRecords);
    if (selectedRecords.length > 1) {
      this.appendDetailLine(window.document, state.detail, "已选择", `${selectedRecords.length} 个文件夹`);
      this.appendDetailLine(window.document, state.detail, "主文件夹", record ? record.path : "无");
      this.appendDetailLine(
        window.document,
        state.detail,
        "条目",
        `直接 ${selectedRecords.reduce((total, entry) => total + Number(entry.itemCount || 0), 0)} 项，含子文件夹 ${selectedRecords.reduce((total, entry) => total + Number(entry.recursiveItemCount || 0), 0)} 项`
      );
      const note = this.createHTMLElement(window.document, "div");
      note.className = "collection-structure-manager-warning subtle";
      note.textContent = "多选可批量移动、收藏/取消收藏、复制路径；合并仍需要单选一个源文件夹。";
      state.detail.appendChild(note);
      return;
    }

    if (!record) {
      const empty = this.createHTMLElement(window.document, "div");
      empty.className = "collection-structure-manager-detail-empty";
      empty.textContent = this.config.noSelectionLabel;
      state.detail.appendChild(empty);
      return;
    }

    this.appendDetailLine(window.document, state.detail, "路径", record.path);
    this.appendDetailLine(window.document, state.detail, "文库", record.libraryName);
    this.appendDetailLine(window.document, state.detail, "条目", `直接 ${record.itemCount} 项，含子文件夹 ${record.recursiveItemCount} 项`);
    this.appendDetailLine(window.document, state.detail, "子文件夹", `${record.childCount} 个`);
    if (record.duplicateNameCount > 1) {
      this.appendDetailLine(window.document, state.detail, "重名", `同一文库中有 ${record.duplicateNameCount} 个同名文件夹`);
    }
  },

  syncSelectionActions(window, selectedRecords) {
    const state = this.windowStates.get(window);
    if (!state) {
      return;
    }

    const records = Array.isArray(selectedRecords) ? selectedRecords : [];
    const hasRecord = Boolean(records.length);
    const hasMultiple = records.length > 1;
    if (state.jumpButton) {
      state.jumpButton.disabled = !hasRecord;
      state.jumpButton.textContent = hasMultiple ? "跳转到主选中" : "跳转到文件夹";
    }
    if (state.copyButton) {
      state.copyButton.disabled = !hasRecord;
      state.copyButton.textContent = hasMultiple ? "复制所选路径" : this.config.copyPathLabel;
    }
    if (state.favoriteButton) {
      state.favoriteButton.disabled = !hasRecord;
      const allFavorite = hasRecord && records.every((entry) => this.isFavoriteCollection(entry.collectionID));
      if (hasMultiple) {
        state.favoriteButton.textContent = allFavorite ? "取消收藏所选" : "收藏所选";
      } else if (allFavorite) {
        state.favoriteButton.textContent = "取消收藏";
      } else {
        state.favoriteButton.textContent = "收藏";
      }
    }
  },

  appendDetailLine(document, container, label, value) {
    const line = this.createHTMLElement(document, "div");
    line.className = "collection-structure-manager-detail-line";

    const labelNode = this.createHTMLElement(document, "span");
    labelNode.className = "collection-structure-manager-detail-label";
    labelNode.textContent = `${label}:`;
    line.appendChild(labelNode);

    const valueNode = this.createHTMLElement(document, "span");
    valueNode.className = "collection-structure-manager-detail-value";
    valueNode.textContent = value;
    line.appendChild(valueNode);

    container.appendChild(line);
  },

  populateTargetSelect(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.targetSelect) {
      return;
    }

    const sourceRecords = this.getSourceRecords(window);
    const targetSelect = state.targetSelect;
    this.clearElement(targetSelect);

    const unsetOption = this.createHTMLElement(window.document, "option");
    unsetOption.value = "";
    unsetOption.textContent = "请选择目标位置";
    targetSelect.appendChild(unsetOption);

    const rootOption = this.createHTMLElement(window.document, "option");
    rootOption.value = "__root__";
    rootOption.textContent = this.config.rootTargetLabel;
    targetSelect.appendChild(rootOption);

    for (const record of state.records) {
      const option = this.createHTMLElement(window.document, "option");
      option.value = String(record.collectionID);
      option.textContent = record.path;
      if (sourceRecords.some((sourceRecord) => this.isInvalidTarget(sourceRecord.collectionID, record.collectionID))) {
        option.disabled = true;
      }
      targetSelect.appendChild(option);
    }

    if (!state.targetIsSet) {
      targetSelect.value = "";
    } else if (!state.targetID) {
      targetSelect.value = "__root__";
    } else {
      targetSelect.value = String(state.targetID);
      if (targetSelect.value !== String(state.targetID)) {
        state.targetID = null;
        state.targetIsSet = false;
        targetSelect.value = "";
      }
    }
  },

  getSelectedRecord(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.selectedID) {
      return null;
    }
    return state.records.find((record) => Number(record.collectionID) === Number(state.selectedID)) || null;
  },

  getSelectedRecords(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.selectedIDs || !state.selectedIDs.size) {
      const record = this.getSelectedRecord(window);
      return record ? [record] : [];
    }

    const byID = new Map(state.records.map((record) => [Number(record.collectionID), record]));
    return [...state.selectedIDs]
      .map((collectionID) => byID.get(Number(collectionID)))
      .filter(Boolean);
  },

  getSourceRecords(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.sourceIDs || !state.sourceIDs.size) {
      return [];
    }

    const byID = new Map(state.records.map((record) => [Number(record.collectionID), record]));
    return [...state.sourceIDs]
      .map((collectionID) => byID.get(Number(collectionID)))
      .filter(Boolean);
  },

  getTargetInfo(window) {
    const state = this.windowStates.get(window);
    if (!state || !state.targetIsSet) {
      return {
        isSet: false,
        isRoot: false,
        record: null,
        parentID: null,
        label: "未设置"
      };
    }

    if (!state.targetID) {
      return {
        isSet: true,
        isRoot: true,
        record: null,
        parentID: null,
        label: this.config.rootTargetLabel
      };
    }

    const record = state.records.find((entry) => Number(entry.collectionID) === Number(state.targetID)) || null;
    return {
      isSet: Boolean(record),
      isRoot: false,
      record,
      parentID: record ? record.collectionID : null,
      label: record ? record.path : "未设置"
    };
  },

  getTargetRecord(window) {
    return this.getTargetInfo(window).record;
  },

  async createRootCollection(window) {
    const name = this.promptCollectionName(window, "新建根文件夹", "请输入新根文件夹名称:");
    if (!name) {
      return;
    }

    const libraryID = this.getCurrentLibraryID(window);
    if (!libraryID) {
      Zotero.alert(window, "无法新建文件夹", "无法确定当前文库。");
      return;
    }

    if (!window.confirm(`将在当前文库中新建根文件夹:\n\n${name}`)) {
      return;
    }

    await this.createCollection(window, { name, libraryID, parentID: null });
  },

  async createChildCollection(window) {
    const selectedRecords = this.getSelectedRecords(window);
    if (selectedRecords.length > 1) {
      Zotero.alert(window, "请只选择一个父文件夹", "新建子文件夹需要单选一个父文件夹。");
      return;
    }

    const parent = this.getSelectedRecord(window);
    if (!parent) {
      Zotero.alert(window, "请选择父文件夹", "请先在列表中选择一个父文件夹。");
      return;
    }

    const name = this.promptCollectionName(window, "新建子文件夹", "请输入新子文件夹名称:");
    if (!name) {
      return;
    }

    if (!window.confirm(`将在以下文件夹下新建子文件夹:\n\n${parent.path}\n\n新文件夹: ${name}`)) {
      return;
    }

    await this.createCollection(window, {
      name,
      libraryID: parent.libraryID,
      parentID: parent.collectionID
    });
  },

  promptCollectionName(window, title, message) {
    const name = window.prompt(message, "");
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.includes("/")) {
      Zotero.alert(window, title, "文件夹名称不能包含 /。");
      return "";
    }
    return trimmed;
  },

  async createCollection(window, { name, libraryID, parentID }) {
    try {
      const collection = new Zotero.Collection();
      collection.libraryID = libraryID;
      collection.name = name;
      if (parentID) {
        collection.parentID = parentID;
      }
      const collectionID = await collection.saveTx();
      this.addOperationLog(window, `新建文件夹: ${name}`);
      await this.reloadRecords(window);
      this.selectRecord(window, collectionID);
    } catch (error) {
      Zotero.logError(error);
      this.log(`Failed to create collection: ${error}`);
      Zotero.alert(window, "新建文件夹失败", String(error));
    }
  },

  async moveSelectedCollection(window) {
    const sources = this.getSourceRecords(window);
    if (!sources.length) {
      Zotero.alert(window, "请设置源文件夹", "请先在左侧选择一个或多个文件夹，然后点击“设为源文件夹”。");
      return;
    }

    const targetInfo = this.getTargetInfo(window);
    if (!targetInfo.isSet) {
      Zotero.alert(window, "请设置目标位置", "请先从目标下拉框选择目标位置，或在左侧选择一个文件夹后点击“设为目标文件夹”。");
      return;
    }

    const target = targetInfo.record;
    const targetParentID = targetInfo.parentID;
    const targetLabel = targetInfo.label;

    for (const source of sources) {
      if (!this.validateMoveOrMergeTarget(window, source, target, true)) {
        return;
      }
    }

    const sourceLabel = sources.length === 1
      ? sources[0].path
      : `${sources.length} 个文件夹:\n${sources.map((source) => source.path).join("\n")}`;
    if (!window.confirm(`确认移动文件夹?\n\n源文件夹:\n${sourceLabel}\n\n目标位置:\n${targetLabel}`)) {
      return;
    }

    try {
      const undoMovePlan = {
        type: "move",
        label: `移动 ${sources.length} 个文件夹到 ${targetLabel}`,
        items: sources.map((source) => ({
          collectionID: Number(source.collectionID),
          oldParentID: source.parentID ? Number(source.parentID) : null,
          path: source.path
        }))
      };

      for (const source of sources) {
        const collection = Zotero.Collections.get(source.collectionID);
        if (!collection || collection.deleted) {
          throw new Error(`源文件夹不存在或已删除: ${source.path}`);
        }
        collection.parentID = targetParentID || false;
        await collection.saveTx();
      }
      const selectedIDs = sources.map((source) => Number(source.collectionID));
      this.addOperationLog(window, `移动 ${sources.length} 个文件夹到 ${targetLabel}`, undoMovePlan);
      await this.reloadRecords(window);
      const newState = this.windowStates.get(window);
      if (newState) {
        newState.selectedIDs = new Set(selectedIDs);
        newState.selectedID = selectedIDs[0] || null;
        newState.anchorSelectedID = newState.selectedID;
        newState.sourceIDs = new Set(selectedIDs);
        this.renderList(window);
      }
    } catch (error) {
      Zotero.logError(error);
      this.log(`Failed to move selected collections: ${error}`);
      Zotero.alert(window, "移动文件夹失败", String(error));
    }
  },

  async undoLastMove(window) {
    const state = this.windowStates.get(window);
    const plan = state && state.undoMovePlan;
    if (!plan || plan.type !== "move" || !Array.isArray(plan.items) || !plan.items.length) {
      Zotero.alert(window, "没有可撤销的移动", "当前没有可撤销的上一次移动操作。");
      return;
    }

    if (!window.confirm(`确认撤销上次移动?\n\n${plan.label}`)) {
      return;
    }

    try {
      for (const item of plan.items) {
        const collection = Zotero.Collections.get(item.collectionID);
        if (!collection || collection.deleted) {
          continue;
        }
        collection.parentID = item.oldParentID || false;
        await collection.saveTx();
      }

      state.undoMovePlan = null;
      this.addOperationLog(window, `撤销移动 ${plan.items.length} 个文件夹`);
      await this.reloadRecords(window);
    } catch (error) {
      Zotero.logError(error);
      this.log(`Failed to undo move: ${error}`);
      Zotero.alert(window, "撤销移动失败", String(error));
    }
  },

  async previewMerge(window) {
    const sourceRecords = this.getSourceRecords(window);
    if (sourceRecords.length > 1) {
      Zotero.alert(window, "请只选择一个源文件夹", "合并操作需要单选一个源文件夹，再选择目标文件夹。");
      return;
    }

    const source = sourceRecords[0] || null;
    const targetInfo = this.getTargetInfo(window);
    const target = targetInfo.record;
    if (!source || !targetInfo.isSet || !target) {
      Zotero.alert(window, "请设置源和目标", "请先点击“设为源文件夹”，并设置一个具体目标文件夹；合并不能以根目录为目标。");
      return;
    }

    if (!this.validateMoveOrMergeTarget(window, source, target, false)) {
      return;
    }

    try {
      const plan = await this.createMergePlan(source, target);
      this.setMergePreview(window, plan);
    } catch (error) {
      Zotero.logError(error);
      this.log(`Failed to preview merge: ${error}`);
      Zotero.alert(window, "合并预览失败", String(error));
    }
  },

  async createMergePlan(source, target) {
    const sourceCollection = Zotero.Collections.get(source.collectionID);
    if (!sourceCollection || sourceCollection.deleted) {
      throw new Error("源文件夹不存在或已删除");
    }
    if (!this.canEraseCollection(sourceCollection)) {
      throw new Error("当前 Zotero API 不支持安全删除源文件夹，已取消合并。");
    }

    const directItemIDs = await this.getDirectCollectionItemIDs(source.collectionID);
    const childRecords = this.getChildRecords(source.collectionID);

    return {
      source,
      target,
      directItemIDs,
      childRecords
    };
  },

  setMergePreview(window, plan) {
    const state = this.windowStates.get(window);
    if (!state || !state.mergePreview || !state.mergeButton) {
      return;
    }

    this.clearElement(state.mergePreview);
    state.currentMergePlan = plan;
    state.mergeButton.disabled = !plan;

    if (!plan) {
      state.mergePreview.textContent = this.config.mergePreviewEmptyLabel;
      return;
    }

    this.appendDetailLine(window.document, state.mergePreview, "源文件夹", plan.source.path);
    this.appendDetailLine(
      window.document,
      state.mergePreview,
      "源文件夹资料",
      `直接 ${plan.source.itemCount} 项，含子文件夹 ${plan.source.recursiveItemCount} 项，直接子文件夹 ${plan.source.childCount} 个`
    );
    this.appendDetailLine(window.document, state.mergePreview, "目标文件夹", plan.target.path);
    this.appendDetailLine(
      window.document,
      state.mergePreview,
      "目标文件夹资料",
      `直接 ${plan.target.itemCount} 项，含子文件夹 ${plan.target.recursiveItemCount} 项，直接子文件夹 ${plan.target.childCount} 个`
    );
    this.appendDetailLine(window.document, state.mergePreview, "将加入目标的直接条目", `${plan.directItemIDs.length} 项`);
    this.appendDetailLine(window.document, state.mergePreview, "将移动的直接子文件夹", `${plan.childRecords.length} 个`);
    if (plan.childRecords.length) {
      const childPreview = plan.childRecords.slice(0, 8).map((record) => record.name).join(" / ");
      const suffix = plan.childRecords.length > 8 ? ` / 另有 ${plan.childRecords.length - 8} 个` : "";
      this.appendDetailLine(window.document, state.mergePreview, "子文件夹预览", `${childPreview}${suffix}`);
    }

    const note = this.createHTMLElement(window.document, "div");
    note.className = "collection-structure-manager-warning";
    note.textContent = `确认合并后，源文件夹会被删除；文献条目、附件和笔记不会被删除。执行前需要输入源文件夹名称: ${plan.source.name}`;
    state.mergePreview.appendChild(note);
  },

  async executeMerge(window) {
    const state = this.windowStates.get(window);
    const plan = state && state.currentMergePlan;
    if (!plan) {
      return;
    }

    if (!window.confirm(
      `确认合并文件夹?\n\n源文件夹:\n${plan.source.path}\n\n目标文件夹:\n${plan.target.path}\n\n`
      + `将加入目标的直接条目: ${plan.directItemIDs.length} 项\n`
      + `将移动的直接子文件夹: ${plan.childRecords.length} 个\n\n`
      + "源文件夹最后会被删除。"
    )) {
      return;
    }

    const typedName = window.prompt(
      `为避免误合并，请输入源文件夹名称确认:\n\n${plan.source.name}`,
      ""
    );
    if (String(typedName || "").trim() !== String(plan.source.name || "").trim()) {
      Zotero.alert(window, "合并已取消", "输入的源文件夹名称不一致。");
      return;
    }

    try {
      const sourceCollection = Zotero.Collections.get(plan.source.collectionID);
      const targetCollection = Zotero.Collections.get(plan.target.collectionID);
      if (!sourceCollection || sourceCollection.deleted || !targetCollection || targetCollection.deleted) {
        throw new Error("源或目标文件夹不存在或已删除");
      }
      if (!this.canEraseCollection(sourceCollection)) {
        throw new Error("当前 Zotero API 不支持安全删除源文件夹，已取消合并。");
      }

      for (const itemID of plan.directItemIDs) {
        const item = Zotero.Items.get(itemID);
        if (!item || item.deleted) {
          continue;
        }
        item.addToCollection(plan.target.collectionID);
        await item.saveTx();
      }

      for (const child of plan.childRecords) {
        const childCollection = Zotero.Collections.get(child.collectionID);
        if (!childCollection || childCollection.deleted) {
          continue;
        }
        childCollection.parentID = plan.target.collectionID;
        await childCollection.saveTx();
      }

      await this.eraseCollection(sourceCollection);
      state.selectedID = plan.target.collectionID;
      this.addOperationLog(window, `合并 ${plan.source.path} 到 ${plan.target.path}`);
      this.setMergePreview(window, null);
      await this.reloadRecords(window);
      this.selectRecord(window, plan.target.collectionID);
    } catch (error) {
      Zotero.logError(error);
      this.log(`Failed to merge collection ${plan.source.collectionID}: ${error}`);
      Zotero.alert(window, "合并文件夹失败", String(error));
    }
  },

  validateMoveOrMergeTarget(window, source, target, allowRoot) {
    if (!source) {
      Zotero.alert(window, "请选择源文件夹", "请先选择源文件夹。");
      return false;
    }

    if (!target) {
      if (allowRoot) {
        return true;
      }
      Zotero.alert(window, "请选择目标文件夹", "合并需要选择一个目标文件夹。");
      return false;
    }

    if (Number(source.collectionID) === Number(target.collectionID)) {
      Zotero.alert(window, "目标无效", "不能选择自身作为目标。");
      return false;
    }

    if (Number(source.libraryID) !== Number(target.libraryID)) {
      Zotero.alert(window, "目标无效", "第一版不支持跨文库移动或合并文件夹。");
      return false;
    }

    if (this.isDescendant(target.collectionID, source.collectionID)) {
      Zotero.alert(window, "目标无效", "不能把文件夹移动或合并到自己的子文件夹中。");
      return false;
    }

    return true;
  },

  isInvalidTarget(sourceID, targetID) {
    if (!sourceID || !targetID) {
      return false;
    }
    return Number(sourceID) === Number(targetID) || this.isDescendant(targetID, sourceID);
  },

  isDescendant(candidateID, ancestorID) {
    let current = this.getRecordByID(candidateID);
    const seen = new Set();
    while (current && current.parentID && !seen.has(Number(current.collectionID))) {
      seen.add(Number(current.collectionID));
      if (Number(current.parentID) === Number(ancestorID)) {
        return true;
      }
      current = this.getRecordByID(current.parentID);
    }
    return false;
  },

  getRecordByID(collectionID) {
    for (const state of this.getAllStates()) {
      const record = state.records.find((entry) => Number(entry.collectionID) === Number(collectionID));
      if (record) {
        return record;
      }
    }
    return null;
  },

  getAllStates() {
    const states = [];
    for (const window of Zotero.getMainWindows()) {
      const state = this.windowStates.get(window);
      if (state) {
        states.push(state);
      }
    }
    return states;
  },

  getChildRecords(collectionID) {
    const parentID = Number(collectionID);
    for (const state of this.getAllStates()) {
      if (state.records.length) {
        return state.records.filter((record) => Number(record.parentID) === parentID);
      }
    }
    return [];
  },

  async loadCollectionRecords() {
    const rows = await this.loadCollectionRows();
    const byID = new Map();

    for (const row of rows) {
      const collectionID = Number(row.collectionID);
      if (!collectionID) {
        continue;
      }
      const collection = Zotero.Collections.get(collectionID);
      if (collection && collection.deleted) {
        continue;
      }
      byID.set(collectionID, {
        collectionID,
        libraryID: Number(row.libraryID),
        name: row.collectionName || this.config.unnamedCollectionLabel,
        parentID: row.parentCollectionID ? Number(row.parentCollectionID) : null
      });
    }

    const itemCounts = await this.loadCollectionItemCounts();
    const childCounts = this.createChildCounts(byID);
    const duplicateCounts = this.createDuplicateNameCounts(byID);
    const recursiveCounts = this.createRecursiveItemCounts(byID, itemCounts);

    return [...byID.values()].map((record) => {
      const path = this.createPath(record, byID);
      const libraryName = this.getLibraryName(record.libraryID);
      const fullPath = `${libraryName}${this.config.pathSeparator}${path}`;
      const key = this.createDuplicateNameKey(record);
      return {
        ...record,
        path,
        libraryName,
        fullPath,
        itemCount: itemCounts.get(Number(record.collectionID)) || 0,
        recursiveItemCount: recursiveCounts.get(Number(record.collectionID)) || 0,
        childCount: childCounts.get(Number(record.collectionID)) || 0,
        duplicateNameCount: duplicateCounts.get(key) || 1,
        normalizedFullPath: this.normalizeText(fullPath)
      };
    }).sort((left, right) => left.fullPath.localeCompare(right.fullPath));
  },

  async loadCollectionRows() {
    if (!Zotero.DB || typeof Zotero.DB.queryAsync !== "function") {
      throw new Error("Zotero 数据库接口不可用");
    }
    return Zotero.DB.queryAsync(
      "SELECT collectionID, libraryID, collectionName, parentCollectionID FROM collections"
    );
  },

  async loadCollectionItemCounts() {
    const counts = new Map();
    let rows = [];
    try {
      rows = await Zotero.DB.queryAsync(
        "SELECT ci.collectionID AS collectionID, COUNT(ci.itemID) AS itemCount "
        + "FROM collectionItems ci "
        + "LEFT JOIN deletedItems di ON ci.itemID = di.itemID "
        + "WHERE di.itemID IS NULL "
        + "GROUP BY ci.collectionID"
      );
    } catch (error) {
      this.log(`Filtered item count query failed: ${error}`);
      rows = await Zotero.DB.queryAsync(
        "SELECT collectionID, COUNT(itemID) AS itemCount FROM collectionItems GROUP BY collectionID"
      );
    }

    for (const row of rows || []) {
      counts.set(Number(row.collectionID), Number(row.itemCount || 0));
    }
    return counts;
  },

  async getDirectCollectionItemIDs(collectionID) {
    const rows = await Zotero.DB.queryAsync(
      "SELECT ci.itemID AS itemID "
      + "FROM collectionItems ci "
      + "LEFT JOIN deletedItems di ON ci.itemID = di.itemID "
      + "WHERE ci.collectionID = ? AND di.itemID IS NULL",
      [collectionID]
    );
    return (rows || []).map((row) => Number(row.itemID)).filter(Boolean);
  },

  createChildCounts(byID) {
    const counts = new Map();
    for (const record of byID.values()) {
      if (!record.parentID || !byID.has(Number(record.parentID))) {
        continue;
      }
      counts.set(Number(record.parentID), (counts.get(Number(record.parentID)) || 0) + 1);
    }
    return counts;
  },

  createDuplicateNameCounts(byID) {
    const counts = new Map();
    for (const record of byID.values()) {
      const key = this.createDuplicateNameKey(record);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  },

  createDuplicateNameKey(record) {
    return `${record.libraryID || ""}:${this.normalizeText(record.name)}`;
  },

  createRecursiveItemCounts(byID, directCounts) {
    const childrenByParentID = new Map();
    for (const record of byID.values()) {
      if (!record.parentID || !byID.has(Number(record.parentID))) {
        continue;
      }
      if (!childrenByParentID.has(Number(record.parentID))) {
        childrenByParentID.set(Number(record.parentID), []);
      }
      childrenByParentID.get(Number(record.parentID)).push(Number(record.collectionID));
    }

    const recursiveCounts = new Map();
    const getTotal = (collectionID, seen = new Set()) => {
      const id = Number(collectionID);
      if (recursiveCounts.has(id)) {
        return recursiveCounts.get(id);
      }
      if (seen.has(id)) {
        return directCounts.get(id) || 0;
      }
      seen.add(id);
      let total = directCounts.get(id) || 0;
      for (const childID of childrenByParentID.get(id) || []) {
        total += getTotal(childID, seen);
      }
      seen.delete(id);
      recursiveCounts.set(id, total);
      return total;
    };

    for (const record of byID.values()) {
      getTotal(record.collectionID);
    }
    return recursiveCounts;
  },

  createPath(record, byID) {
    const names = [];
    const seen = new Set();
    let current = record;
    while (current && !seen.has(Number(current.collectionID))) {
      seen.add(Number(current.collectionID));
      names.unshift(current.name || this.config.unnamedCollectionLabel);
      if (!current.parentID) {
        break;
      }
      current = byID.get(Number(current.parentID));
    }
    return names.join(this.config.pathSeparator);
  },

  getCurrentLibraryID(window) {
    try {
      if (window.ZoteroPane && typeof window.ZoteroPane.getSelectedLibraryID === "function") {
        const libraryID = window.ZoteroPane.getSelectedLibraryID();
        if (libraryID) {
          return libraryID;
        }
      }
      if (window.ZoteroPane && typeof window.ZoteroPane.getCollectionTreeRow === "function") {
        const row = window.ZoteroPane.getCollectionTreeRow();
        if (row && row.ref && row.ref.libraryID) {
          return row.ref.libraryID;
        }
      }
    } catch (error) {
      this.log(`Unable to read current library: ${error}`);
    }
    return Zotero.Libraries && Zotero.Libraries.userLibraryID;
  },

  getLibraryName(libraryID) {
    try {
      if (Zotero.Libraries && Zotero.Libraries.get) {
        const library = Zotero.Libraries.get(libraryID);
        if (library && library.name) {
          return library.name;
        }
      }
      if (Zotero.Libraries && libraryID === Zotero.Libraries.userLibraryID) {
        return this.config.userLibraryLabel;
      }
    } catch (error) {
      this.log(`Unable to read library ${libraryID}: ${error}`);
    }
    return `${this.config.unknownLibraryLabel} ${libraryID || ""}`.trim();
  },

  canEraseCollection(collection) {
    return collection && (typeof collection.eraseTx === "function" || typeof collection.deleteTx === "function");
  },

  async eraseCollection(collection) {
    if (typeof collection.eraseTx === "function") {
      await collection.eraseTx();
      return;
    }
    if (typeof collection.deleteTx === "function") {
      await collection.deleteTx();
      return;
    }
    throw new Error("当前 Zotero API 不支持删除源文件夹");
  },

  normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  },

  createXULElement(document, tagName) {
    if (typeof document.createXULElement === "function") {
      return document.createXULElement(tagName);
    }
    return document.createElement(tagName);
  },

  createHTMLElement(document, tagName) {
    return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
  },

  clearElement(element) {
    while (element.firstChild) {
      element.firstChild.remove();
    }
  },

  injectStyles(document) {
    const existing = document.querySelector(`#${this.config.styleID}`);
    if (existing) {
      return existing;
    }

    const style = this.createHTMLElement(document, "style");
    style.id = this.config.styleID;
    style.textContent = `
      #${this.config.overlayID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 0;
        background: rgba(18, 24, 32, 0.34);
      }

      #${this.config.overlayID}[hidden] {
        display: none;
      }

      .collection-structure-manager-panel {
        box-sizing: border-box;
        position: relative;
        --csm-font-scale: 1;
        width: min(1180px, calc(100vw - 48px));
        height: min(820px, calc(100vh - 72px));
        min-width: min(760px, calc(100vw - 24px));
        min-height: min(520px, calc(100vh - 24px));
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
        margin-top: 6vh;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 18px;
        resize: none;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.18);
        border-radius: 8px;
        background: var(--material-background, #ffffff);
        color: var(--fill-primary, #1f2328);
        font-size: calc(13px * var(--csm-font-scale));
        box-shadow: 0 18px 56px rgba(0, 0, 0, 0.28);
      }

      .collection-structure-manager-panel.dragging {
        user-select: none;
      }

      .collection-structure-manager-panel.resizing {
        user-select: none;
      }

      .collection-structure-manager-resize-handle {
        position: absolute;
        z-index: 2;
        width: 16px;
        height: 16px;
        background: transparent;
      }

      .collection-structure-manager-resize-handle.top-left {
        top: 0;
        left: 0;
        cursor: nwse-resize;
      }

      .collection-structure-manager-resize-handle.top-right {
        top: 0;
        right: 0;
        cursor: nesw-resize;
      }

      .collection-structure-manager-resize-handle.bottom-left {
        bottom: 0;
        left: 0;
        cursor: nesw-resize;
      }

      .collection-structure-manager-resize-handle.bottom-right {
        right: 0;
        bottom: 0;
        cursor: nwse-resize;
      }

      .collection-structure-manager-header,
      .collection-structure-manager-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .collection-structure-manager-header {
        cursor: move;
      }

      .collection-structure-manager-toolbar {
        justify-content: flex-start;
        flex-wrap: wrap;
      }

      .collection-structure-manager-title {
        font-size: calc(18px * var(--csm-font-scale));
        font-weight: 700;
        line-height: 1.3;
      }

      .collection-structure-manager-button {
        min-height: 30px;
        padding: 4px 12px;
        border: 1px solid rgba(0, 0, 0, 0.16);
        border-radius: 6px;
        background: var(--material-background, #ffffff);
        color: inherit;
        font-size: calc(12px * var(--csm-font-scale));
      }

      .collection-structure-manager-button.primary {
        border-color: rgba(26, 115, 232, 0.36);
        background: rgba(26, 115, 232, 0.10);
      }

      .collection-structure-manager-button.danger {
        border-color: rgba(217, 48, 37, 0.36);
        background: rgba(217, 48, 37, 0.10);
      }

      .collection-structure-manager-button:disabled {
        opacity: 0.55;
      }

      .collection-structure-manager-input,
      .collection-structure-manager-select {
        box-sizing: border-box;
        width: 100%;
        min-height: 38px;
        padding: 7px 10px;
        border: 1px solid rgba(0, 0, 0, 0.22);
        border-radius: 6px;
        background: var(--material-background, #ffffff);
        color: inherit;
        font-size: calc(14px * var(--csm-font-scale));
      }

      .collection-structure-manager-summary {
        min-height: 18px;
        color: var(--fill-secondary, #697386);
        font-size: calc(12px * var(--csm-font-scale));
      }

      .collection-structure-manager-modebar {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .collection-structure-manager-mode {
        min-height: 28px;
        padding: 3px 10px;
        border: 1px solid rgba(0, 0, 0, 0.14);
        border-radius: 6px;
        background: transparent;
        color: var(--fill-secondary, #697386);
        font-size: calc(12px * var(--csm-font-scale));
      }

      .collection-structure-manager-mode.active {
        border-color: rgba(26, 115, 232, 0.36);
        background: rgba(26, 115, 232, 0.10);
        color: var(--fill-primary, #1f2328);
        font-weight: 700;
      }

      .collection-structure-manager-body {
        min-height: 0;
        flex: 1 1 auto;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 8px var(--side-width, 360px);
        gap: 0;
      }

      .collection-structure-manager-results {
        min-height: 0;
        overflow-y: auto;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 6px;
        background: rgba(248, 250, 252, 0.72);
      }

      .collection-structure-manager-splitter {
        cursor: col-resize;
        position: relative;
      }

      .collection-structure-manager-splitter::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 3px;
        width: 2px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.12);
      }

      .collection-structure-manager-splitter:hover::before,
      .collection-structure-manager-body.resizing-columns .collection-structure-manager-splitter::before {
        background: rgba(26, 115, 232, 0.48);
      }

      .collection-structure-manager-row {
        padding: 1px 6px 1px 8px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        cursor: default;
      }

      .collection-structure-manager-row.selected {
        background: rgba(26, 115, 232, 0.13);
      }

      .collection-structure-manager-row.primary-selected {
        box-shadow: inset 3px 0 0 #1a73e8;
      }

      .collection-structure-manager-row.source-marked .collection-structure-manager-row-path::before {
        content: "源 ";
        color: #188038;
        font-weight: 800;
      }

      .collection-structure-manager-row.target-marked .collection-structure-manager-row-path::before {
        content: "目标 ";
        color: #d93025;
        font-weight: 800;
      }

      .collection-structure-manager-row.source-marked.target-marked .collection-structure-manager-row-path::before {
        content: "源/目标 ";
      }

      .collection-structure-manager-row.search-ancestor {
        color: var(--fill-secondary, #697386);
      }

      .collection-structure-manager-row-main {
        min-width: 0;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 4px;
      }

      .collection-structure-manager-toggle {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid rgba(26, 115, 232, 0.26);
        border-radius: 5px;
        background: rgba(26, 115, 232, 0.10);
        color: #174ea6;
        font-size: calc(12px * var(--csm-font-scale));
        font-weight: 900;
        line-height: 1;
      }

      .collection-structure-manager-toggle:not(:disabled):hover {
        background: rgba(0, 0, 0, 0.06);
      }

      .collection-structure-manager-toggle:disabled {
        border-color: transparent;
        background: transparent;
        opacity: 0.28;
      }

      .collection-structure-manager-row-path {
        min-width: 0;
        flex: 0 1 auto;
        max-width: min(56%, calc(100% - 148px));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: calc(12px * var(--csm-font-scale));
        font-weight: 700;
        line-height: 1.12;
      }

      .collection-structure-manager-highlight {
        border-radius: 3px;
        background: rgba(249, 171, 0, 0.34);
      }

      .collection-structure-manager-badge {
        flex: 0 0 auto;
        padding: 0 4px;
        border-radius: 999px;
        background: rgba(26, 115, 232, 0.10);
        color: #174ea6;
        font-size: calc(10px * var(--csm-font-scale));
        font-weight: 700;
        line-height: 1.16;
        white-space: nowrap;
      }

      .collection-structure-manager-badge.warning {
        background: rgba(249, 171, 0, 0.20);
        color: #8a5a00;
      }

      .collection-structure-manager-count {
        flex: 0 0 auto;
        min-width: auto;
        margin-left: 1px;
        color: var(--fill-secondary, #697386);
        font-size: calc(10px * var(--csm-font-scale));
        font-variant-numeric: tabular-nums;
        line-height: 1.12;
        text-align: left;
        white-space: nowrap;
      }

      .collection-structure-manager-favorite {
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--fill-secondary, #697386);
        font-size: calc(13px * var(--csm-font-scale));
        line-height: 18px;
        text-align: center;
      }

      .collection-structure-manager-favorite:hover,
      .collection-structure-manager-favorite.active {
        color: #f9ab00;
      }

      .collection-structure-manager-row-meta {
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--fill-secondary, #697386);
        font-size: 12px;
        line-height: 1.3;
      }

      .collection-structure-manager-side {
        min-width: 0;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .collection-structure-manager-detail,
      .collection-structure-manager-source-target,
      .collection-structure-manager-log,
      .collection-structure-manager-preview {
        min-height: 98px;
        padding: 10px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 6px;
        background: rgba(248, 250, 252, 0.72);
        overflow-wrap: anywhere;
      }

      .collection-structure-manager-source-target {
        min-height: 62px;
      }

      .collection-structure-manager-log {
        min-height: 86px;
      }

      .collection-structure-manager-log-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }

      .collection-structure-manager-log-title {
        color: var(--fill-secondary, #697386);
        font-size: 12px;
        font-weight: 800;
      }

      .collection-structure-manager-log-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .collection-structure-manager-log-row,
      .collection-structure-manager-log-empty {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--fill-secondary, #697386);
        font-size: 11px;
        line-height: 1.35;
      }

      .collection-structure-manager-source-target-line {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
        font-size: 12px;
        line-height: 1.35;
      }

      .collection-structure-manager-source-target-label {
        flex: 0 0 auto;
        color: var(--fill-secondary, #697386);
        font-weight: 800;
      }

      .collection-structure-manager-source-target-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .collection-structure-manager-detail-empty,
      .collection-structure-manager-empty {
        padding: 18px 12px;
        color: var(--fill-secondary, #697386);
        font-size: 13px;
      }

      .collection-structure-manager-detail-line {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
        font-size: 12px;
        line-height: 1.35;
      }

      .collection-structure-manager-detail-label {
        flex: 0 0 auto;
        color: var(--fill-secondary, #697386);
        font-weight: 700;
      }

      .collection-structure-manager-detail-value {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .collection-structure-manager-label {
        color: var(--fill-secondary, #697386);
        font-size: 12px;
        font-weight: 700;
      }

      .collection-structure-manager-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .collection-structure-manager-action-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        border: 1px solid rgba(0, 0, 0, 0.10);
        border-radius: 6px;
        background: rgba(248, 250, 252, 0.58);
      }

      .collection-structure-manager-action-title {
        color: var(--fill-secondary, #697386);
        font-size: calc(11px * var(--csm-font-scale));
        font-weight: 800;
        line-height: 1.25;
      }

      .collection-structure-manager-action-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .collection-structure-manager-warning {
        margin-top: 8px;
        padding: 8px;
        border-radius: 6px;
        background: rgba(217, 48, 37, 0.10);
        color: #8b1a10;
        font-size: 12px;
        line-height: 1.35;
      }

      .collection-structure-manager-warning.subtle {
        background: rgba(26, 115, 232, 0.08);
        color: #174ea6;
      }

      .collection-structure-manager-context-menu {
        position: fixed;
        z-index: 2147483647;
        min-width: 180px;
        padding: 5px;
        border: 1px solid rgba(0, 0, 0, 0.16);
        border-radius: 7px;
        background: var(--material-background, #ffffff);
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
      }

      .collection-structure-manager-context-item {
        width: 100%;
        min-height: 28px;
        display: block;
        padding: 5px 9px;
        border: 0;
        border-radius: 5px;
        background: transparent;
        color: inherit;
        font-size: calc(12px * var(--csm-font-scale));
        line-height: 1.25;
        text-align: left;
      }

      .collection-structure-manager-context-item:hover:not(:disabled) {
        background: rgba(26, 115, 232, 0.12);
      }

      .collection-structure-manager-context-item:disabled {
        color: var(--fill-secondary, #697386);
        opacity: 0.55;
      }
    `;
    document.documentElement.appendChild(style);
    return style;
  }
};
