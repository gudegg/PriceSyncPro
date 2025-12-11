// PriceSyncPro Extension - Popup Script
// 这个脚本运行在插件的弹出窗口中

console.log('🚀 PriceSyncPro Popup Script 已加载');

// 不再缓存结果，确保每次都重新获取
let currentResults = null;
let currentApiUrl = '';

// 监听来自content script的进度消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncProgress') {
    showStatus(request.message, 'info');
  }
});

// ========================================
// 全局键盘快捷键
// ========================================
document.addEventListener('keydown', (e) => {
  // Esc 键：关闭所有打开的对话框
  // 注意：modelSelectionModal由其专用的ESC处理器管理，不在此处理
  if (e.key === 'Escape') {
    if (confirmModal.classList.contains('show')) {
      confirmModal.classList.remove('show');
    }
    if (inputModal.classList.contains('show')) {
      inputModal.classList.remove('show');
    }
    if (listModal.classList.contains('show')) {
      listModal.classList.remove('show');
    }
    // modelSelectionModal的ESC由bindModelSelectionEvents处理，避免冲突
  }
});

// DOM 元素
const syncModelsOnlyBtn = document.getElementById('syncModelsOnlyBtn');

// 快速同步模式的URL相关元素
const upstreamBaseUrlInput = document.getElementById('upstreamBaseUrl');
const apiPathSelect = document.getElementById('apiPathSelect');
const modelPrefixInput = document.getElementById('modelPrefix');
const tokenGroupSelect = document.getElementById('tokenGroupSelect');
const channelSelect = document.getElementById('channelSelect');


// 向后兼容：创建虚拟的 upstreamUrlInput 对象
const upstreamUrlInput = {
  get value() {
    return getFullUpstreamUrl();
  },
  set value(val) {
    setFullUpstreamUrl(val);
  },
  addEventListener: function(event, handler) {
    if (upstreamBaseUrlInput) upstreamBaseUrlInput.addEventListener(event, handler);
    if (apiPathSelect) apiPathSelect.addEventListener(event, handler);
  },
  parentElement: upstreamBaseUrlInput?.parentElement,
  focus: function() {
    if (upstreamBaseUrlInput) upstreamBaseUrlInput.focus();
  },
  style: upstreamBaseUrlInput?.style || {}
};


// ========================================
// URL和前缀处理辅助函数
// ========================================

/**
 * 获取完整的上游URL（快速同步模式）
 * @returns {string} 完整的URL
 */
function getFullUpstreamUrl() {
  if (!upstreamBaseUrlInput) return '';
  
  // 自动去除尾部斜杠，提升用户体验
  const baseUrl = upstreamBaseUrlInput.value.trim().replace(/\/+$/, '');
  if (!baseUrl) return '';
  
  const apiPath = apiPathSelect?.value || 'api/pricing';
  
  // 使用预设路径
  return `${baseUrl}/${apiPath}`;
}

/**
 * 设置完整的上游URL（快速同步模式）
 * @param {string} fullUrl - 完整的URL
 */
function setFullUpstreamUrl(fullUrl) {
  if (!upstreamBaseUrlInput || !fullUrl) return;
  
  try {
    const urlObj = new URL(fullUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const path = urlObj.pathname.replace(/^\//, ''); // 去掉开头的 /
    
    upstreamBaseUrlInput.value = baseUrl;
    
    // 尝试匹配预设路径
    if (path === 'api/pricing') {
      apiPathSelect.value = 'api/pricing';
    } else if (path === 'api/available_model') {
      apiPathSelect.value = 'api/available_model';
    }
  } catch (e) {
    // 如果不是有效的URL，直接设置到基础URL
    upstreamBaseUrlInput.value = fullUrl;
  }
}


/**
 * 获取规范化的渠道前缀（自动添加末尾的 /）
 * @returns {string} 带有末尾斜杠的前缀
 */
function getNormalizedPrefix() {
  const prefix = modelPrefixInput?.value.trim() || '';
  if (!prefix) return '';
  // 如果用户输入的前缀末尾没有 /，自动添加
  return prefix.endsWith('/') ? prefix : prefix + '/';
}

/**
 * 设置渠道前缀（自动去掉末尾的 /）
 * @param {string} prefix - 前缀
 */
function setPrefix(prefix) {
  if (!modelPrefixInput) return;
  // 显示时去掉末尾的 /，让UI更友好
  modelPrefixInput.value = prefix.replace(/\/+$/, '');
}

// 触发字段高亮动画的辅助函数
function triggerFieldHighlight(fieldElement) {
  if (!fieldElement) return;

  // 移除之前的动画类（如果存在）
  fieldElement.classList.remove('auto-filled');

  // 强制重绘以重新触发动画
  void fieldElement.offsetWidth;

  // 添加动画类
  fieldElement.classList.add('auto-filled');

  // 动画结束后移除类，以便下次可以再次触发
  setTimeout(() => {
    fieldElement.classList.remove('auto-filled');
  }, 600); // 与动画时长一致
}
const refreshChannelsBtn = document.getElementById('refreshChannelsBtn');
const channelHint = document.getElementById('channelHint');
const advancedToggle = document.getElementById('advancedToggle');
const advancedToggleIcon = document.getElementById('advancedToggleIcon');
const advancedOptions = document.getElementById('advancedOptions');
const tableSearchInput = document.getElementById('tableSearchInput');
const tableSearchClearBtn = document.getElementById('tableSearchClearBtn');
const prefixSuggestions = document.getElementById('prefixSuggestions');
const prefixSuggestionButtons = document.getElementById('prefixSuggestionButtons');

// 渠道列表（不再使用缓存，每次都重新获取）
let channelsList = [];

// URL 验证相关元素（稍后动态创建）
let urlValidationHint = null;
const statusDiv = document.getElementById('status');
const resultsSection = document.getElementById('resultsSection');
const resultsStats = document.getElementById('resultsStats');
const resultsTableBody = document.getElementById('resultsTableBody');
const loginStatus = document.getElementById('loginStatus');

// 右上角功能按钮
const refreshBtn = document.querySelector('.header-actions button[title="刷新"]');
const settingsBtn = document.querySelector('.header-actions button[title="设置"]');

// 模态对话框元素
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalInfoBox = document.getElementById('modalInfoBox');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

// 输入对话框元素
const inputModal = document.getElementById('inputModal');
const inputModalTitle = document.getElementById('inputModalTitle');
const inputModalMessage = document.getElementById('inputModalMessage');
const inputModalField = document.getElementById('inputModalField');
const inputModalCancelBtn = document.getElementById('inputModalCancelBtn');
const inputModalConfirmBtn = document.getElementById('inputModalConfirmBtn');

// 列表管理对话框元素
const listModal = document.getElementById('listModal');
const listModalTitle = document.getElementById('listModalTitle');
const listModalMessage = document.getElementById('listModalMessage');
const presetListContainer = document.getElementById('presetListContainer');
const listModalCancelBtn = document.getElementById('listModalCancelBtn');

// 模型选择弹窗元素
const modelSelectionModal = document.getElementById('modelSelectionModal');
const modelSearchInput = document.getElementById('modelSearchInput');
const modelSearchClearBtn = document.getElementById('modelSearchClearBtn');
const selectAllModelsBtn = document.getElementById('selectAllModelsBtn');
const invertSelectionBtn = document.getElementById('invertSelectionBtn');
const deselectAllModelsBtn = document.getElementById('deselectAllModelsBtn');
const modelSelectionStats = document.getElementById('modelSelectionStats');
const modelSelectionList = document.getElementById('modelSelectionList');
const modelSelectionCancelBtn = document.getElementById('modelSelectionCancelBtn');
const modelSelectionConfirmBtn = document.getElementById('modelSelectionConfirmBtn');

// 多字段编辑对话框元素（延迟获取，因为DOM可能还未完全加载）
let multiFieldModal, editNameField, editUrlField, editPrefixField;

// 模型选择相关全局变量（不再使用缓存）
let availableModels = []; // 当前渠道的可用模型列表
let selectedModels = new Set(); // 用户选择的模型
let initialPreselectedModels = new Set(); // 初始从渠道预选的模型（用于置顶显示）
let currentChannelId = ''; // 当前渠道ID
let currentChannelSelectedModels = []; // 当前渠道选择的模型列表（用于同步）

// 已选择模型显示相关元素
const selectedModelsDisplay = document.getElementById('selectedModelsDisplay');
const selectedModelsCount = document.getElementById('selectedModelsCount');
const selectedModelsList = document.getElementById('selectedModelsList');
const editModelsBtn = document.getElementById('editModelsBtn');

// 确保DOM加载后获取元素
document.addEventListener('DOMContentLoaded', () => {
  multiFieldModal = document.getElementById('multiFieldModal');
  editNameField = document.getElementById('editNameField');
  editUrlField = document.getElementById('editUrlField');
  editPrefixField = document.getElementById('editPrefixField');
  
  console.log('多字段编辑对话框元素:', {
    multiFieldModal: !!multiFieldModal,
    editNameField: !!editNameField,
    editUrlField: !!editUrlField,
    editPrefixField: !!editPrefixField
  });
});

// ========================================
// 自定义确认对话框
// ========================================

/**
 * 显示自定义确认对话框
 * @param {Object} options - 对话框配置选项
 * @param {string} [options.title='确认操作'] - 对话框标题
 * @param {string} [options.message='确认要执行此操作吗？'] - 提示消息
 * @param {Array<{label: string, value: string}>} [options.info] - 信息列表
 * @param {string} [options.confirmText='确认'] - 确认按钮文本
 * @param {string} [options.cancelText='取消'] - 取消按钮文本
 * @returns {Promise<boolean>} 用户是否确认（true=确认，false=取消）
 */
function showConfirmDialog(options) {
  return new Promise((resolve) => {
    // 获取当前的按钮元素（可能已经被替换过）
    const currentCancelBtn = document.getElementById('modalCancelBtn');
    const currentConfirmBtn = document.getElementById('modalConfirmBtn');
    
    // 设置标题和消息
    modalTitle.textContent = options.title || '确认操作';
    modalMessage.textContent = options.message || '确认要执行此操作吗？';
    
    // 设置信息框内容
    if (options.info && options.info.length > 0) {
      modalInfoBox.innerHTML = '';
      options.info.forEach(item => {
        const infoItem = document.createElement('div');
        infoItem.className = 'modal-info-item';
        infoItem.innerHTML = `
          <span class="modal-info-label">${item.label}</span>
          <span class="modal-info-value">${item.value}</span>
        `;
        modalInfoBox.appendChild(infoItem);
      });
      modalInfoBox.style.display = 'block';
    } else {
      modalInfoBox.style.display = 'none';
    }
    
    // 设置按钮文本
    currentCancelBtn.textContent = options.cancelText || '取消';
    currentConfirmBtn.textContent = options.confirmText || '确认';
    
    // 显示模态框
    confirmModal.classList.add('show');
    
    // 绑定事件（先移除旧事件）
    const newCancelBtn = currentCancelBtn.cloneNode(true);
    const newConfirmBtn = currentConfirmBtn.cloneNode(true);
    currentCancelBtn.parentNode.replaceChild(newCancelBtn, currentCancelBtn);
    currentConfirmBtn.parentNode.replaceChild(newConfirmBtn, currentConfirmBtn);
    
    // 取消按钮
    const handleCancel = () => {
      confirmModal.classList.remove('show');
      confirmModal.removeEventListener('click', handleOverlayClick);
      resolve(false);
    };
    
    newCancelBtn.addEventListener('click', handleCancel);
    
    // 确认按钮
    const handleConfirm = () => {
      confirmModal.classList.remove('show');
      confirmModal.removeEventListener('click', handleOverlayClick);
      resolve(true);
    };
    
    newConfirmBtn.addEventListener('click', handleConfirm);
    
    // 点击遮罩层关闭
    const handleOverlayClick = (e) => {
      if (e.target === confirmModal) {
        confirmModal.classList.remove('show');
        confirmModal.removeEventListener('click', handleOverlayClick);
        resolve(false);
      }
    };
    
    confirmModal.addEventListener('click', handleOverlayClick);
  });
}

// ========================================
// 自定义输入对话框
// ========================================

/**
 * 显示自定义输入对话框
 * @param {Object} options - 对话框配置选项
 * @param {string} [options.title='输入信息'] - 对话框标题
 * @param {string} [options.message='请输入内容'] - 提示消息
 * @param {string} [options.placeholder='请输入...'] - 输入框占位符
 * @param {string} [options.defaultValue=''] - 默认值
 * @returns {Promise<string|null>} 用户输入的内容（null=取消）
 */
function showInputDialog(options) {
  return new Promise((resolve) => {
    // 获取当前的按钮元素
    const currentCancelBtn = document.getElementById('inputModalCancelBtn');
    const currentConfirmBtn = document.getElementById('inputModalConfirmBtn');
    
    // 设置标题和消息
    inputModalTitle.textContent = options.title || '输入信息';
    inputModalMessage.textContent = options.message || '请输入内容';
    
    // 设置输入框
    inputModalField.value = options.defaultValue || '';
    inputModalField.placeholder = options.placeholder || '请输入...';
    
    // 显示模态框
    inputModal.classList.add('show');
    
    // 聚焦到输入框
    setTimeout(() => {
      inputModalField.focus();
      inputModalField.select();
    }, 100);
    
    // 绑定事件（先移除旧事件）
    const newCancelBtn = currentCancelBtn.cloneNode(true);
    const newConfirmBtn = currentConfirmBtn.cloneNode(true);
    currentCancelBtn.parentNode.replaceChild(newCancelBtn, currentCancelBtn);
    currentConfirmBtn.parentNode.replaceChild(newConfirmBtn, currentConfirmBtn);
    
    // 取消按钮
    const handleCancel = () => {
      inputModal.classList.remove('show');
      inputModal.removeEventListener('click', handleOverlayClick);
      resolve(null);
    };
    
    newCancelBtn.addEventListener('click', handleCancel);
    
    // 确认按钮
    const handleConfirm = () => {
      const value = inputModalField.value.trim();
      if (value) {
        inputModal.classList.remove('show');
        inputModal.removeEventListener('click', handleOverlayClick);
        resolve(value);
      } else {
        inputModalField.focus();
      }
    };
    
    newConfirmBtn.addEventListener('click', handleConfirm);
    
    // 回车键确认
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleConfirm();
      }
    };
    
    inputModalField.addEventListener('keypress', handleKeyPress);
    
    // 点击遮罩层关闭
    const handleOverlayClick = (e) => {
      if (e.target === inputModal) {
        inputModal.classList.remove('show');
        inputModal.removeEventListener('click', handleOverlayClick);
        inputModalField.removeEventListener('keypress', handleKeyPress);
        resolve(null);
      }
    };
    
    inputModal.addEventListener('click', handleOverlayClick);
  });
}

// ========================================
// 自定义列表管理对话框
// ========================================

let selectedPresetIndex = null;

/**
 * 显示列表管理对话框
 * @param {Object} options - 对话框配置选项
 * @param {string} [options.title='管理列表'] - 对话框标题
 * @param {string} [options.message='选择一个项目'] - 提示消息
 * @param {Array<Object>} options.items - 列表项数组
 * @returns {Promise<{action: string, index: number}|null>} 用户操作结果（null=取消）
 */
function showListManagerDialog(options) {
  return new Promise((resolve) => {
    selectedPresetIndex = null;
    
    // 设置标题和消息
    listModalTitle.textContent = options.title || '管理列表';
    listModalMessage.textContent = options.message || '选择一个项目';
    
    // 渲染列表
    presetListContainer.innerHTML = '';
    
    if (!options.items || options.items.length === 0) {
      presetListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">暂无数据</div>
        </div>
      `;
    } else {
      options.items.forEach((item, index) => {
        // 提取URL域名用于显示
        let urlDomain = '';
        try {
          const urlObj = new URL(item.url);
          urlDomain = urlObj.hostname;
        } catch (e) {
          urlDomain = item.url.substring(0, 30) + '...';
        }
        
        const presetItem = document.createElement('div');
        presetItem.className = 'preset-item';
        presetItem.innerHTML = `
          <div class="preset-item-header">
            <span class="preset-item-name">${item.prefix || '(无前缀)'}</span>
            <span class="preset-item-url" style="font-size: 11px; color: var(--color-text-secondary); margin-left: 8px;">📍 ${urlDomain}</span>
          </div>
          <div class="preset-item-actions">
            <button class="preset-action-btn preset-edit-btn" data-index="${index}" title="编辑">✏️</button>
            <button class="preset-action-btn preset-delete-btn" data-index="${index}" title="删除">🗑️</button>
          </div>
        `;
        
        // 点击整个项目选中
        presetItem.addEventListener('click', (e) => {
          // 如果点击的是按钮，不触发选中
          if (e.target.classList.contains('preset-action-btn')) {
            return;
          }
          
          // 移除其他选中状态
          presetListContainer.querySelectorAll('.preset-item').forEach(el => {
            el.classList.remove('selected');
          });
          
          // 添加选中状态
          presetItem.classList.add('selected');
          selectedPresetIndex = index;
        });
        
        // 编辑按钮
        const editBtn = presetItem.querySelector('.preset-edit-btn');
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          listModal.classList.remove('show');
          resolve({ action: 'edit', index: index });
        });
        
        // 删除按钮
        const deleteBtn = presetItem.querySelector('.preset-delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          listModal.classList.remove('show');
          resolve({ action: 'delete', index: index });
        });
        
        presetListContainer.appendChild(presetItem);
      });
    }
    
    // 显示模态框
    listModal.classList.add('show');
    
    // 获取当前的按钮元素
    const currentCancelBtn = document.getElementById('listModalCancelBtn');
    
    // 绑定事件（先移除旧事件）
    const newCancelBtn = currentCancelBtn.cloneNode(true);
    currentCancelBtn.parentNode.replaceChild(newCancelBtn, currentCancelBtn);
    
    // 取消按钮事件
    const handleCancel = () => {
      listModal.classList.remove('show');
      listModal.removeEventListener('click', handleOverlayClick);
      resolve(null);
    };
    
    newCancelBtn.addEventListener('click', handleCancel);
    
    // 点击遮罩层关闭 - 使用命名函数避免重复绑定
    const handleOverlayClick = (e) => {
      if (e.target === listModal) {
        listModal.classList.remove('show');
        listModal.removeEventListener('click', handleOverlayClick);
        resolve(null);
      }
    };
    
    listModal.addEventListener('click', handleOverlayClick);
  });
}

/**
 * 检测用户登录状态
 * 通过检查 Cookie 判断用户是否已登录 New API 后台
 * @returns {Promise<void>}
 */
async function checkLoginStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;

    loginStatus.textContent = '正在检测...';
    loginStatus.className = '';

    if (!url || (!url.includes('localhost') && !url.includes('127.0.0.1') && !url.match(/https?:\/\/[^\/]+/))) {
      loginStatus.textContent = '请在New API后台使用';
      loginStatus.className = 'status-error';
      return;
    }

    chrome.runtime.sendMessage({
      action: 'getCookies',
      url: url
    }, (response) => {
      if (response && response.success && response.newApiUser) {
        loginStatus.innerHTML = `已连接: <strong>${response.newApiUser.username || '未知'}</strong>`;
        loginStatus.className = 'status-success';
      } else {
        loginStatus.textContent = '未登录, 请登录后刷新';
        loginStatus.className = 'status-error';
      }
    });
  } catch (error) {
    console.error('检测登录状态失败:', error);
    loginStatus.textContent = '检测失败';
    loginStatus.className = 'status-error';
  }
}


// 监听输入框变化
upstreamUrlInput.addEventListener('input', () => {
  // 不再自动匹配渠道，确保用户主动选择
  /*
  clearTimeout(window._matchTimeout);
  window._matchTimeout = setTimeout(() => {
    autoMatchChannelFromUrl();
  }, 500);
  */
});
// modelPrefixInput 的事件监听已在上面处理

// 高级选项折叠功能
if (advancedToggle) {
  advancedToggle.addEventListener('click', () => {
    const isHidden = advancedOptions.style.display === 'none';
    advancedOptions.style.display = isHidden ? 'block' : 'none';
    advancedToggleIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  });
}

// 表格搜索功能
if (tableSearchInput) {
  tableSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const rows = resultsTableBody.querySelectorAll('tr');

    // 显示/隐藏清除按钮
    if (tableSearchClearBtn) {
      tableSearchClearBtn.style.display = searchTerm ? 'flex' : 'none';
    }

    let visibleCount = 0;
    let totalCount = rows.length;

    rows.forEach(row => {
      const modelName = row.querySelector('.model-name')?.textContent.toLowerCase() || '';
      if (modelName.includes(searchTerm)) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });

    // 更新统计信息
    if (searchTerm) {
      resultsStats.textContent = `找到 ${visibleCount} 个匹配项`;
    } else {
      // 恢复原始统计信息
      if (currentResults && currentResults.length > 0) {
        const perUseCount = currentResults.filter(r => r.quotaType === 1).length;
        const usageBasedCount = currentResults.filter(r => r.quotaType === 0).length;
        resultsStats.textContent = `共 ${currentResults.length} 个模型 (按次: ${perUseCount}, 按量: ${usageBasedCount})`;
      } else {
        resultsStats.textContent = `共 ${totalCount} 个模型`;
      }
    }
  });
}

// 表格搜索清除按钮
if (tableSearchClearBtn) {
  tableSearchClearBtn.addEventListener('click', () => {
    tableSearchInput.value = '';
    tableSearchInput.dispatchEvent(new Event('input')); // 触发input事件
    tableSearchInput.focus();
  });
}


// ========================================
// 仅同步模型按钮
// ========================================
if (syncModelsOnlyBtn) {
  syncModelsOnlyBtn.addEventListener('click', async () => {
    await performModelsOnlySyncLogic();
  });
}

// 仅同步模型逻辑（不同步价格）
async function performModelsOnlySyncLogic() {
  const upstreamUrl = getFullUpstreamUrl();
  const prefix = getNormalizedPrefix();
  const channelId = channelSelect.value.trim();
  
  if (!channelId) {
    showStatus('⚠️ 请先选择渠道', 'error');
    channelSelect.focus();
    return;
  }
  
  // ✅ 防止重复执行
  if (syncModelsOnlyBtn.disabled) {
    return;
  }
  
  const channelIdNum = parseInt(channelId);
  if (isNaN(channelIdNum) || channelIdNum <= 0) {
    showStatus('❌ 渠道 ID 格式错误', 'error');
    return;
  }
  
  // 显示确认对话框
  const confirmed = await showConfirmDialog({
    title: '📋 确认仅同步模型',
    message: '将执行以下操作：\n1. 同步上游模型列表到渠道\n2. 不更新价格配置',
    info: [
      { label: '渠道 ID', value: channelIdNum.toString() },
      { label: '上游 URL', value: upstreamUrl.substring(0, 40) + '...' },
      { label: '模型前缀', value: prefix || '(无前缀)' }
    ],
    confirmText: '开始同步模型',
    cancelText: '取消'
  });
  
  if (!confirmed) {
    return;
  }
  
  saveConfig();
  
  // 禁用按钮并显示加载状态
  syncModelsOnlyBtn.disabled = true;
  const originalButtonHTML = syncModelsOnlyBtn.innerHTML;
  syncModelsOnlyBtn.innerHTML = '<span class="spinner"></span>同步模型中...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 确保 content script 已加载
    const scriptReady = await ensureContentScript(tab.id);
    if (!scriptReady) {
      showStatus(
        '❌ 无法连接到页面脚本\n\n' +
        '💡 解决方法：\n' +
        '1. 刷新当前页面（F5）\n' +
        '2. 重新打开此插件',
        'error'
      );
      return;
    }
    
    // 步骤1: 同步模型列表
    showProgress(30, '正在同步模型列表');
    showStatus('🔄 正在同步上游模型列表...', 'info');
    
    const syncModelsResult = await sendMessageWithRetry(tab.id, {
      action: 'syncChannelModels',
      channelId: channelIdNum,
      prefix: prefix,
      tokenGroup: tokenGroupSelect.value,
      upstreamUrl: upstreamUrl,
      customModels: currentChannelSelectedModels.length > 0 ? currentChannelSelectedModels : null
    });
    
    if (!syncModelsResult.success) {
      showStatus(`❌ 同步模型列表失败：${syncModelsResult.error}`, 'error');
      return;
    }
    
    const syncModelsResponse = syncModelsResult.response;
    
    if (!syncModelsResponse.success) {
      showStatus(`❌ 同步模型列表失败：${syncModelsResponse.error}`, 'error');
      return;
    }
    
    const modelCount = syncModelsResponse.stats.totalModels;
    const originalCount = syncModelsResponse.stats.originalModels || modelCount;
    const customSelection = syncModelsResponse.stats.customSelection;
    
    let statusMessage = `✅ 模型同步完成：已同步 ${modelCount} 个模型`;
    if (customSelection && modelCount < originalCount) {
      statusMessage += ` (从 ${originalCount} 个中选择)`;
    }
    
    showProgress(100, '✅ 模型同步完成');
    showStatus(statusMessage, 'success');
    
    // 显示详细统计信息
    let detailedMsg = `🎉 模型同步成功！\n\n` +
      `📊 同步统计：\n` +
      `• 总模型数：${modelCount} 个\n`;
    
    if (customSelection && modelCount < originalCount) {
      detailedMsg += `• 原始模型数：${originalCount} 个\n` +
        `• 自定义选择：是\n`;
    } else {
      detailedMsg += `• 自定义选择：否\n`;
    }
    
    detailedMsg += `• 渠道ID：${channelIdNum}\n` +
      `• 模型前缀：${prefix || '(无前缀)'}`;
    
    showStatus(detailedMsg, 'success');
    
  } catch (error) {
    showStatus(`❌ 错误：${error.message}`, 'error');
  } finally {
    hideProgress();
    // 恢复按钮状态
    syncModelsOnlyBtn.disabled = false;
    syncModelsOnlyBtn.innerHTML = originalButtonHTML;
  }
}

// 根据 URL 自动匹配渠道（已禁用，确保用户主动选择）
async function autoMatchChannelFromUrl() {
  // 不再自动匹配渠道，确保用户主动选择
  console.log('🔍 自动匹配渠道功能已禁用，需要用户主动选择');
  return;
  
  /*
  const upstreamUrl = getFullUpstreamUrl();
  
  if (!upstreamUrl || channelsList.length === 0) return;
  
  try {
    // 提取上游 URL 的域名
    const urlObj = new URL(upstreamUrl);
    const upstreamHost = urlObj.hostname;
    
    console.log('🔍 智能匹配渠道：上游域名 =', upstreamHost);
    
    // 查找匹配的渠道
    let bestMatch = null;
    let bestMatchScore = 0;
    
    for (const channel of channelsList) {
      if (!channel.baseUrl) continue;
      
      try {
        const channelUrlObj = new URL(channel.baseUrl);
        const channelHost = channelUrlObj.hostname;
        
        // 计算匹配度
        let score = 0;
        
        // 完全匹配
        if (channelHost === upstreamHost) {
          score = 100;
        }
        // 包含匹配
        else if (upstreamHost.includes(channelHost) || channelHost.includes(upstreamHost)) {
          score = 80;
        }
        // 去掉子域名后匹配
        else {
          const upstreamDomain = upstreamHost.split('.').slice(-2).join('.');
          const channelDomain = channelHost.split('.').slice(-2).join('.');
          if (upstreamDomain === channelDomain) {
            score = 60;
          }
        }
        
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = channel;
        }
      } catch (e) {
        // 跳过无效的 base_url
        continue;
      }
    }
    
    // 如果找到匹配且置信度够高，自动选择
    if (bestMatch && bestMatchScore >= 60) {
      console.log(`✅ 找到匹配渠道: ${bestMatch.name} (ID: ${bestMatch.id}, 匹配度: ${bestMatchScore}%)`);
      
      // 自动选择渠道（但不保存到缓存）
      channelSelect.value = bestMatch.id;
      // chrome.storage.local.set({ channelId: bestMatch.id });
      
      // 显示提示
      channelHint.innerHTML = `🎯 已自动匹配渠道: ${bestMatch.name} (匹配度: ${bestMatchScore}%)`;
      channelHint.style.color = 'var(--color-success)';
      
      setTimeout(() => {
        channelHint.innerHTML = '💡 选择要同步模型列表的渠道';
        channelHint.style.color = 'var(--color-text-secondary)';
      }, 4000);
      
      // 更新按钮状态

    }
  } catch (e) {
    // URL 格式错误，忽略
    console.debug('URL 格式暂不完整，跳过自动匹配');
  }
  */
}

// 根据前缀自动匹配渠道（已禁用，确保用户主动选择）
function autoMatchChannelFromPrefix() {
  // 不再自动匹配渠道，确保用户主动选择
  console.log('🔍 根据前缀自动匹配渠道功能已禁用，需要用户主动选择');
  return;
  
  /*
  const prefix = modelPrefixInput?.value.trim() || '';
  
  if (!prefix || channelsList.length === 0) return;
  
  console.log('🔍 根据前缀匹配渠道:', prefix);
  
  // 查找渠道名称包含前缀的渠道
  const matchedChannel = channelsList.find(ch => {
    const channelName = ch.name.toLowerCase();
    const prefixLower = prefix.toLowerCase().replace(/\/$/, ''); // 移除末尾斜杠
    return channelName.includes(prefixLower);
  });
  
  if (matchedChannel) {
    console.log(`✅ 找到匹配渠道: ${matchedChannel.name} (ID: ${matchedChannel.id})`);
    channelSelect.value = matchedChannel.id;
    // chrome.storage.local.set({ channelId: matchedChannel.id });
    
    channelHint.innerHTML = `🎯 已根据前缀自动选择渠道: ${matchedChannel.name}`;
    channelHint.style.color = 'var(--color-success)';
    
    setTimeout(() => {
      channelHint.innerHTML = '💡 选择要同步模型列表的渠道';
      channelHint.style.color = 'var(--color-text-secondary)';
    }, 3000);
    

  }
  */
}

// 从 storage 加载保存的配置（无缓存模式，所有配置都默认为空）
chrome.storage.local.get([
  'upstreamUrl', 'upstreamBaseUrl', 'apiPath',
  'modelPrefix', 'tokenGroup', 'channelId',
  'autoConfigBaseUrl', 'autoConfigApiPath', 'autoConfigApiPathCustom',
  'autoConfigPrefix', 'autoConfigApiKey', 'autoConfigChannelTag'
], (result) => {
  // 不再恢复任何配置，确保第一次打开插件时所有配置都为空
  // 用户需要手动填写所有配置项
  
  
  // 确保所有输入框都为空
  if (upstreamBaseUrlInput) upstreamBaseUrlInput.value = '';
  if (apiPathSelect) apiPathSelect.value = 'api/pricing'; // 保持默认值
  if (modelPrefixInput) modelPrefixInput.value = '';
  if (tokenGroupSelect) tokenGroupSelect.value = 'default'; // 保持默认值
  

  
  // 加载完配置后检测登录状态
  checkLoginStatus();
  
  // 初始化 URL 验证
  initUrlValidation();
  
  // 自动加载渠道列表
  loadChannelList();
  
  // 不再恢复渠道选择，确保每次都重新选择
  // 注释掉缓存恢复逻辑，确保用户每次打开插件都需要重新选择渠道
  /*
  if (result.channelId) {
    setTimeout(() => {
      channelSelect.value = result.channelId;
      // 触发渠道选择变化事件，以加载已选择的模型显示
      channelSelect.dispatchEvent(new Event('change'));
    }, 500);
  }
  */
});

// ========================================
// 渠道列表管理
// ========================================

/**
 * 加载渠道列表（无缓存模式，每次都重新获取）
 */
async function loadChannelList() {
  try {
    channelSelect.disabled = true;
    channelSelect.innerHTML = '<option value="">-- 加载中... --</option>';
    channelHint.innerHTML = '⏳ 正在加载渠道列表...';
    channelHint.style.color = 'var(--color-text-secondary)';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 确保 content script 已加载
    const scriptReady = await ensureContentScript(tab.id);
    if (!scriptReady) {
      channelSelect.innerHTML = '<option value="">-- 请刷新页面 --</option>';
      channelHint.innerHTML = '❌ 无法连接到页面，请刷新后重试';
      channelHint.style.color = 'var(--color-danger)';
      return;
    }
    
    // 获取渠道列表（每次都重新获取，不使用缓存）
    const result = await sendMessageWithRetry(tab.id, {
      action: 'getChannelList'
    });
    
    if (!result.success) {
      channelSelect.innerHTML = '<option value="">-- 加载失败 --</option>';
      channelHint.innerHTML = '❌ 获取渠道列表失败，请检查登录状态';
      channelHint.style.color = 'var(--color-danger)';
      return;
    }
    
    const response = result.response;
    
    if (response.success && response.channels) {
      // 每次都重新获取渠道列表，不使用缓存
      channelsList = response.channels;
      renderChannelSelect(response.channels);
      channelHint.innerHTML = `✅ 已加载 ${response.channels.length} 个渠道`;
      channelHint.style.color = 'var(--color-success)';
      
      // 渠道列表加载完成后，不再自动匹配渠道，确保用户主动选择
      // autoMatchChannelFromPrefix();
      
      // 2秒后隐藏成功提示
      setTimeout(() => {
        channelHint.innerHTML = '💡 选择要同步模型列表的渠道';
        channelHint.style.color = 'var(--color-text-secondary)';
      }, 2000);
    } else {
      channelSelect.innerHTML = '<option value="">-- 无可用渠道 --</option>';
      channelHint.innerHTML = '⚠️ 未找到可用渠道';
      channelHint.style.color = 'var(--color-warning)';
    }
  } catch (error) {
    console.error('加载渠道列表失败:', error);
    channelSelect.innerHTML = '<option value="">-- 加载失败 --</option>';
    channelHint.innerHTML = '❌ 加载失败，请点击刷新按钮重试';
    channelHint.style.color = 'var(--color-danger)';
  } finally {
    channelSelect.disabled = false;
  }
}

/**
 * 渲染渠道下拉列表
 */
function renderChannelSelect(channels) {
  channelSelect.innerHTML = '<option value="">-- 请选择渠道 --</option>';
  
  channels.forEach(channel => {
    const option = document.createElement('option');
    option.value = channel.id;
    // 简化显示：渠道名称 (模型数)
    option.textContent = `${channel.name} (${channel.models}个)`;
    option.dataset.baseUrl = channel.baseUrl;
    option.dataset.tag = channel.tag || '';
    channelSelect.appendChild(option);
  });
}

// 刷新渠道列表按钮
if (refreshChannelsBtn) {
  refreshChannelsBtn.addEventListener('click', async () => {
    refreshChannelsBtn.style.transform = 'rotate(360deg)';
    refreshChannelsBtn.style.transition = 'transform 0.5s ease';
    
    await loadChannelList();
    
    setTimeout(() => {
      refreshChannelsBtn.style.transform = '';
    }, 500);
  });
}

// 渠道选择变化时触发智能匹配（不再保存到缓存）
// 添加防抖和互斥锁，防止快速切换渠道导致的竞态条件
let isChannelChanging = false;
let channelChangeTimeout = null;

channelSelect.addEventListener('change', async () => {
  const channelId = channelSelect.value;
  
  // 如果没有选择渠道，清空模型选择并隐藏显示区域
  if (!channelId) {
    currentChannelSelectedModels = [];
    updateSelectedModelsDisplay();
    return;
  }
  
  // 防抖：清除之前的定时器
  if (channelChangeTimeout) {
    clearTimeout(channelChangeTimeout);
  }
  
  // 互斥锁：如果正在处理中，取消本次操作
  if (isChannelChanging) {
    console.log('⚠️ 渠道切换正在进行中，忽略重复操作');
    return;
  }
  
  // 设置防抖延迟（300ms）
  channelChangeTimeout = setTimeout(async () => {
    if (channelId) {
      // 设置互斥锁
      isChannelChanging = true;
      
      try {
        // 不再保存到本地存储，确保每次都重新选择
        // chrome.storage.local.set({ channelId: channelId });
        
        // 智能填充：从选中的渠道自动获取URL和前缀
        const selectedChannel = channelsList.find(ch => ch.id == channelId);
        if (selectedChannel && selectedChannel.baseUrl) {
          // 自动填充基础URL并设为只读
          if (upstreamBaseUrlInput) {
            upstreamBaseUrlInput.value = selectedChannel.baseUrl;
            upstreamBaseUrlInput.readOnly = true;
            upstreamBaseUrlInput.style.background = 'var(--color-bg)';
            upstreamBaseUrlInput.style.cursor = 'not-allowed';
            triggerFieldHighlight(upstreamBaseUrlInput); // 触发高亮动画
          }

          // 自动填充前缀并设为只读
          if (modelPrefixInput && selectedChannel.name) {
            modelPrefixInput.value = selectedChannel.name.replace(/\/+$/, '');
            modelPrefixInput.readOnly = true;
            modelPrefixInput.style.background = 'var(--color-bg)';
            modelPrefixInput.style.cursor = 'not-allowed';
            triggerFieldHighlight(modelPrefixInput); // 触发高亮动画
          }

          // 显示提示
          showStatus(`✅ 已自动填充渠道"${selectedChannel.name}"的配置`, 'success');
          setTimeout(() => {
            statusDiv.classList.remove('show');
          }, 2000);
        }
        
        performIntelligentChannelMatch();
        
        // 修复Bug 2: 每次切换渠道都显示模型选择弹窗
        // 修复Bug 1: 确保即使没有新选择，也能正确显示已选择的模型
        console.log(`🔍 渠道选择变化，准备显示模型选择弹窗，渠道ID: ${channelId}`);
        
        try {
          // 每次都重新显示模型选择弹窗，不使用缓存
          console.log(`🔍 调用 showModelSelectionModal`);
          const selectedModelsList = await showModelSelectionModal(channelId);
          console.log(`🔍 showModelSelectionModal 返回，选择了 ${selectedModelsList.length} 个模型`);
          
          currentChannelSelectedModels = selectedModelsList; // 保存选择的模型列表
          
          if (selectedModelsList.length === 0) {
            showStatus('⚠️ 未选择任何模型，将同步所有可用模型', 'warning');
          } else {
            showStatus(`✅ 已选择 ${selectedModelsList.length} 个模型进行同步`, 'success');
            setTimeout(() => {
              statusDiv.classList.remove('show');
            }, 2000);
          }
          
          // 修复Bug 1: 确保更新已选择模型的显示
          console.log(`🔍 更新已选择模型显示`);
          updateSelectedModelsDisplay();
        } catch (error) {
          console.error('显示模型选择弹窗失败:', error);
          showStatus('⚠️ 模型选择弹窗显示失败，将同步所有模型', 'warning');
          currentChannelSelectedModels = []; // 清空选择
          updateSelectedModelsDisplay();
        }
      } catch (error) {
        console.error('❌ 渠道切换处理失败:', error);
        showStatus('❌ 渠道切换失败，请重试', 'error');
      } finally {
        // 释放互斥锁
        isChannelChanging = false;
      }
    }
  }, 300); // 300ms防抖延迟
  
  // 更新智能同步按钮状态

});

// 点击只读输入框时启用编辑（CSS自动处理样式变化）
if (upstreamBaseUrlInput) {
  upstreamBaseUrlInput.addEventListener('click', () => {
    if (upstreamBaseUrlInput.readOnly) {
      upstreamBaseUrlInput.readOnly = false;
      upstreamBaseUrlInput.focus();
      showStatus('✏️ 已启用手动编辑模式', 'info');
      setTimeout(() => {
        statusDiv.classList.remove('show');
      }, 1500);
    }
  });
}

if (modelPrefixInput) {
  modelPrefixInput.addEventListener('click', () => {
    if (modelPrefixInput.readOnly) {
      modelPrefixInput.readOnly = false;
      modelPrefixInput.focus();
      showStatus('✏️ 已启用手动编辑模式', 'info');
      setTimeout(() => {
        statusDiv.classList.remove('show');
      }, 1500);
    }
  });
}

// 智能渠道匹配函数（已禁用自动匹配，确保用户主动选择）
function performIntelligentChannelMatch() {
  const selectedOption = channelSelect.options[channelSelect.selectedIndex];
  if (!selectedOption || selectedOption.value === '') return;
  
  const baseUrl = selectedOption.dataset.baseUrl;
  const upstreamUrl = upstreamUrlInput.value.trim();
  
  if (!baseUrl || !upstreamUrl) return;
  
  // 提取域名进行匹配
  const cleanBaseUrl = baseUrl.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  const cleanUpstreamUrl = upstreamUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '');
  
  if (cleanUpstreamUrl.includes(cleanBaseUrl) || cleanBaseUrl.includes(cleanUpstreamUrl)) {
    // 只显示匹配提示，不自动选择
    channelHint.innerHTML = '✅ 检测到渠道 URL 与上游 URL 匹配';
    channelHint.style.color = 'var(--color-success)';
    
    setTimeout(() => {
      channelHint.innerHTML = '💡 选择要同步模型列表的渠道';
      channelHint.style.color = 'var(--color-text-secondary)';
    }, 3000);
  }
}

// ========================================
// URL 输入实时验证
// ========================================

/**
 * 验证 URL 格式
 * @param {string} url - 要验证的 URL
 * @returns {Object} 验证结果 { valid: boolean, error: string, suggestion: string }
 */
function validateUrl(url) {
  if (!url || url.trim() === '') {
    return { valid: false, error: '', suggestion: '' };
  }
  
  url = url.trim();
  
  // 检查协议
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return {
      valid: false,
      error: '❌ 缺少协议',
      suggestion: `💡 建议：https://${url}`
    };
  }
  
  // 检查是否是有效的 URL
  try {
    const urlObj = new URL(url);
    
    // 检查主机名
    if (!urlObj.hostname || urlObj.hostname === '') {
      return {
        valid: false,
        error: '❌ 无效的主机名',
        suggestion: ''
      };
    }
    
    // 检查路径（建议包含路径）
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return {
        valid: true,
        error: '',
        suggestion: '💡 提示：URL 通常应包含 API 路径（如 /api/pricing）'
      };
    }
    
    // 一切正常
    return { valid: true, error: '', suggestion: '' };
    
  } catch (e) {
    return {
      valid: false,
      error: '❌ URL 格式错误',
      suggestion: '💡 示例：https://api.example.com/api/pricing'
    };
  }
}

/**
 * 初始化 URL 验证功能
 */
function initUrlValidation() {
  // 创建验证提示元素
  urlValidationHint = document.createElement('div');
  urlValidationHint.className = 'input-hint';
  urlValidationHint.style.marginTop = '6px';
  urlValidationHint.style.fontSize = '12px';
  urlValidationHint.style.lineHeight = '1.3';
  urlValidationHint.style.display = 'none';
  
  // 插入到 URL 输入框后面
  const urlInputWrapper = upstreamUrlInput.parentElement;
  urlInputWrapper.parentElement.appendChild(urlValidationHint);
  
  // 监听输入事件（实时验证）
  upstreamUrlInput.addEventListener('input', () => {
    const url = upstreamUrlInput.value.trim();
    const result = validateUrl(url);
    
    if (url === '') {
      // 空输入，隐藏提示
      urlValidationHint.style.display = 'none';
      upstreamUrlInput.style.borderColor = '';
      return;
    }
    
    if (!result.valid) {
      // 无效 URL
      urlValidationHint.style.display = 'block';
      urlValidationHint.style.color = 'var(--color-danger)';
      urlValidationHint.innerHTML = result.error + (result.suggestion ? '<br>' + result.suggestion : '');
      upstreamUrlInput.style.borderColor = 'var(--color-danger)';
    } else if (result.suggestion) {
      // 有效但有建议
      urlValidationHint.style.display = 'block';
      urlValidationHint.style.color = 'var(--color-warning)';
      urlValidationHint.innerHTML = result.suggestion;
      upstreamUrlInput.style.borderColor = 'var(--color-success)';
    } else {
      // 完全有效
      urlValidationHint.style.display = 'block';
      urlValidationHint.style.color = 'var(--color-success)';
      urlValidationHint.innerHTML = '✅ URL 格式正确';
      upstreamUrlInput.style.borderColor = 'var(--color-success)';
      
      // 2秒后自动隐藏成功提示
      setTimeout(() => {
        if (upstreamUrlInput.value.trim() === url) {
          urlValidationHint.style.display = 'none';
          upstreamUrlInput.style.borderColor = '';
        }
      }, 2000);
    }
  });
  
  // 失去焦点时的处理
  upstreamUrlInput.addEventListener('blur', () => {
    const url = upstreamUrlInput.value.trim();
    const result = validateUrl(url);
    
    // 如果有错误，保持显示；如果只是建议或成功，隐藏
    if (result.valid) {
      setTimeout(() => {
        urlValidationHint.style.display = 'none';
        upstreamUrlInput.style.borderColor = '';
      }, 300);
    }
  });
  
  // 获得焦点时重新验证
  upstreamUrlInput.addEventListener('focus', () => {
    const url = upstreamUrlInput.value.trim();
    if (url) {
      const result = validateUrl(url);
      if (!result.valid) {
        urlValidationHint.style.display = 'block';
      }
    }
  });
}

// ========================================
// 右上角按钮功能
// ========================================

// 刷新按钮 - 重新检测登录状态和重置表单
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    // 重新检测登录状态
    checkLoginStatus();
    
    // 清空结果
    resultsSection.classList.remove('show');
    currentResults = null;
    currentApiUrl = '';
    
    // 显示刷新提示
    showStatus('🔄 已刷新页面状态', 'info');
    
    // 按钮动画
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s ease';
    setTimeout(() => {
      refreshBtn.style.transform = '';
    }, 500);
  });
}

// 设置按钮 - 显示设置菜单
if (settingsBtn) {
  settingsBtn.addEventListener('click', async () => {
    // 直接显示关于对话框
    await showAboutDialog();
  });
}

// 显示关于对话框
async function showAboutDialog() {
  return new Promise((resolve) => {
    // 获取当前的按钮元素和modal body
    const currentCancelBtn = document.getElementById('modalCancelBtn');
    const currentConfirmBtn = document.getElementById('modalConfirmBtn');
    const modalBody = document.querySelector('#confirmModal .modal-body');
    
    // 设置标题
    modalTitle.textContent = 'PriceSyncPro';
    
    // 保存原始内容以便恢复
    const originalContent = modalBody.innerHTML;
    
    // 创建关于内容
    const aboutHTML = `
      <div class="about-content">
        <div class="about-logo">🚀</div>
        <div class="about-version">版本 1.0.0</div>
        <div class="about-description">
          New API 定价同步助手<br>
          一键同步上游模型定价配置
        </div>
        <div class="about-links">
          <a href="https://github.com/sycg767/PriceSyncPro" target="_blank" class="about-link-btn" id="githubLink">
            <span class="about-link-icon">
              <svg class="github-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </span>
            <span>GitHub 仓库</span>
          </a>
          
          <a href="https://github.com/sycg767/PriceSyncPro/issues" target="_blank" class="about-link-btn" id="issuesLink">
            <span class="about-link-icon">🐛</span>
            <span>问题反馈</span>
          </a>
          
          <a href="https://github.com/sycg767/PriceSyncPro/blob/main/README.md" target="_blank" class="about-link-btn" id="docsLink">
            <span class="about-link-icon">📖</span>
            <span>完整文档</span>
          </a>
        </div>
      </div>
    `;
    
    // 替换modal body内容
    modalBody.innerHTML = aboutHTML;
    
    // 设置按钮文本
    currentCancelBtn.style.display = 'none';
    currentConfirmBtn.textContent = '关闭';
    
    // 显示模态框
    confirmModal.classList.add('show');
    
    // 链接点击事件
    setTimeout(() => {
      const githubLink = document.getElementById('githubLink');
      const issuesLink = document.getElementById('issuesLink');
      const docsLink = document.getElementById('docsLink');
      
      if (githubLink) {
        githubLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: 'https://github.com/sycg767/PriceSyncPro' });
        });
      }
      
      if (issuesLink) {
        issuesLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: 'https://github.com/sycg767/PriceSyncPro/issues' });
        });
      }
      
      if (docsLink) {
        docsLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: 'https://github.com/sycg767/PriceSyncPro/blob/main/README.md' });
        });
      }
    }, 100);
    
    // 绑定事件（先移除旧事件）
    const newConfirmBtn = currentConfirmBtn.cloneNode(true);
    currentConfirmBtn.parentNode.replaceChild(newConfirmBtn, currentConfirmBtn);
    
    // 关闭按钮
    const handleClose = () => {
      confirmModal.classList.remove('show');
      confirmModal.removeEventListener('click', handleOverlayClick);
      
      // 恢复原始内容
      modalBody.innerHTML = originalContent;
      currentCancelBtn.style.display = '';
      
      resolve(true);
    };
    
    newConfirmBtn.addEventListener('click', handleClose);
    
    // 点击遮罩层关闭
    const handleOverlayClick = (e) => {
      if (e.target === confirmModal) {
        handleClose();
      }
    };
    
    confirmModal.addEventListener('click', handleOverlayClick);
  });
}


// 保存配置
function saveConfig() {
  const config = {
    upstreamUrl: getFullUpstreamUrl(),
    upstreamBaseUrl: upstreamBaseUrlInput?.value.trim() || '',
    apiPath: apiPathSelect?.value || 'api/pricing',
    modelPrefix: getNormalizedPrefix(),
    tokenGroup: tokenGroupSelect?.value || ''
  };
  
  chrome.storage.local.set(config);
}

// 显示状态消息
function showStatus(message, type = 'info') {
  statusDiv.className = `status-card show status-${type}`;
  // 将换行符转换为 <br> 标签以支持多行显示
  statusDiv.innerHTML = message.replace(/\n/g, '<br>');
}

// 进度条控制
const progressBar = document.getElementById('progressBar');
const progressBarFill = progressBar?.querySelector('.progress-bar-fill');
const progressBarText = progressBar?.querySelector('.progress-bar-text');

function showProgress(percent, text) {
  if (!progressBar) return;
  progressBar.style.display = 'block';
  if (progressBarFill) progressBarFill.style.width = `${percent}%`;
  if (progressBarText) progressBarText.textContent = text || `${percent}%`;
}

function hideProgress() {
  if (progressBar) progressBar.style.display = 'none';
}

// ========================================
// Content Script 通信增强
// ========================================

// 带重试的消息发送
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return { success: true, response };
    } catch (error) {
      
      if (i < maxRetries - 1) {
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 尝试重新注入 content script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          });
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (injectError) {
        }
      } else {
        // 最后一次失败
        return {
          success: false,
          error: '无法连接到页面脚本',
          needRefresh: true
        };
      }
    }
  }
}

/**
 * 确保 Content Script 已加载（按需注入）
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<boolean>} 是否成功加载
 */
async function ensureContentScript(tabId) {
  try {
    // 先尝试发送一个测试消息
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    console.log('✓ Content Script 已存在');
    return true;
  } catch (error) {
    // 如果失败，尝试注入
    console.log('🔧 首次使用，正在注入 Content Script...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      // 等待脚本初始化
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 验证注入成功
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        console.log('✓ Content Script 注入成功');
        return true;
      } catch (verifyError) {
        console.error('❌ Content Script 注入后验证失败');
        return false;
      }
    } catch (injectError) {
      console.error('❌ Content Script 注入失败:', injectError);
      return false;
    }
  }
}

// 渲染结果表格（性能优化版：使用 DocumentFragment 批量插入）
function renderResultsTable(results, prefix = '') {
  // 清空表格
  resultsTableBody.innerHTML = '';
  
  // 统计
  const perUseCount = results.filter(r => r.quotaType === 1).length;
  const usageBasedCount = results.filter(r => r.quotaType === 0).length;
  
  // 显示统计信息
  resultsStats.textContent = `共 ${results.length} 个模型 (按次: ${perUseCount}, 按量: ${usageBasedCount})`;
  
  // 🚀 性能优化：使用 DocumentFragment 批量插入
  const fragment = document.createDocumentFragment();
  
  // 生成表格行
  results.forEach((result, index) => {
    // ✅ 修复：确保使用正确的模型名称逻辑
    const finalModelName = prefix ? prefix + result.smartName : result.smartName;
    
    // ✅ 安全获取数值，处理 null/undefined
    const safeInputPrice = (result.inputPrice != null) ? result.inputPrice : 0;
    const safeOutputPrice = (result.outputPrice != null) ? result.outputPrice : 0;
    const safeModelRatio = (result.modelRatio != null) ? result.modelRatio : 0;
    const safeCompletionRatio = (result.completionRatio != null) ? result.completionRatio : 0;
    
    const row = document.createElement('tr');
    
    // 模型名称
    const nameCell = document.createElement('td');
    nameCell.className = 'model-name';
    nameCell.textContent = finalModelName;
    nameCell.title = finalModelName; // 悬停显示完整名称
    row.appendChild(nameCell);
    
    // 计费方式
    const modeCell = document.createElement('td');
    const modeBadge = document.createElement('span');
    modeBadge.className = result.quotaType === 1 ? 'mode-badge mode-per-use' : 'mode-badge mode-usage';
    modeBadge.textContent = result.pricingMode;
    modeCell.appendChild(modeBadge);
    row.appendChild(modeCell);
    
    // ✅ 智能价格精度显示
    const formatPrice = (price) => {
      if (price === 0) return '$0';
      if (price >= 1) return `$${price.toFixed(2)}`;
      if (price >= 0.01) return `$${price.toFixed(4)}`;
      return `$${price.toFixed(6)}`;
    };
    
    const inputPriceCell = document.createElement('td');
    inputPriceCell.className = 'price-cell';
    inputPriceCell.textContent = formatPrice(safeInputPrice);
    inputPriceCell.title = `精确值: $${safeInputPrice}\n倍率: ${safeModelRatio.toFixed(4)}`;
    row.appendChild(inputPriceCell);
    
    const outputPriceCell = document.createElement('td');
    outputPriceCell.className = 'price-cell';
    outputPriceCell.textContent = formatPrice(safeOutputPrice);
    outputPriceCell.title = `精确值: $${safeOutputPrice}\n倍率: ${safeCompletionRatio.toFixed(4)}`;
    row.appendChild(outputPriceCell);
    
    // 🚀 添加到 fragment 而不是直接添加到 DOM
    fragment.appendChild(row);
  });
  
  // 🚀 一次性批量插入所有行（触发一次重排）
  resultsTableBody.appendChild(fragment);
  
  // 显示结果区域
  resultsSection.classList.add('show');
}


// ========================================
// 模型选择弹窗功能
// ========================================

/**
 * 显示模型选择弹窗（无缓存模式）
 * @param {string} channelId - 渠道ID
 * @returns {Promise<Array<string>>} 用户选择的模型列表
 */
async function showModelSelectionModal(channelId) {
  return new Promise(async (resolve) => {
    // 定义错误显示 helper，同时绑定关闭事件
    const showError = (message, detail = '') => {
        modelSelectionList.innerHTML = `
          <div class="error-state">
            <div style="text-align: center; color: var(--color-danger); font-size: 14px; padding: 20px;">
              ${message}<br>
              <span style="font-size: 12px; color: var(--color-text-secondary);">${detail}</span>
            </div>
          </div>
        `;
        // 启用取消按钮以便用户关闭
        if (modelSelectionCancelBtn) modelSelectionCancelBtn.disabled = false;
        
        // 绑定事件确保取消按钮可用
        try {
            // 传递空数组作为初始选择，确保至少能绑定取消事件
            bindModelSelectionEvents(resolve, []);
        } catch (e) {
            console.error('Failed to bind events in error state:', e);
             // 降级处理：简单的点击关闭
             if (modelSelectionCancelBtn) {
                 modelSelectionCancelBtn.onclick = () => {
                     modelSelectionModal.classList.remove('show');
                     resolve([]);
                 };
             }
        }
    };

    // 临时关闭处理函数
    const tempCancelHandler = () => {
        console.log('🔍 用户取消操作（加载中）');
        modelSelectionModal.classList.remove('show');
        resolve([]);
        // 自我清理
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
    };

    try {
      // 参数验证
      if (!channelId) {
        console.error('❌ showModelSelectionModal: 渠道ID为空');
        showStatus('❌ 渠道ID无效，请重新选择渠道', 'error');
        resolve([]);
        return;
      }
      
      currentChannelId = channelId;
      
      // 显示加载状态
      modelSelectionModal.classList.add('show');
      modelSelectionList.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner" style="width: 24px; height: 24px; border: 3px solid rgba(0, 122, 255, 0.2); border-radius: 50%; border-top-color: var(--color-primary); animation: spin 1s linear infinite; margin: 20px auto;"></div>
          <div style="text-align: center; color: var(--color-text-secondary); font-size: 13px; margin-top: 12px;">正在获取模型列表...</div>
        </div>
      `;
      
      // 禁用操作按钮
      selectAllModelsBtn.disabled = true;
      deselectAllModelsBtn.disabled = true;
      modelSelectionConfirmBtn.disabled = true;
      
      // 绑定临时关闭事件（先移除旧的，防止重复绑定）
      if (modelSelectionCancelBtn._tempHandler) {
        modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
      }
      modelSelectionCancelBtn._tempHandler = tempCancelHandler;
      modelSelectionCancelBtn.addEventListener('click', tempCancelHandler);
      
      // 获取当前标签页
      let tab;
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          throw new Error('无法获取当前标签页');
        }
        tab = tabs[0];
      } catch (error) {
        console.error('❌ 获取当前标签页失败:', error);
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
        showError('❌ 无法获取当前页面', error.message);
        return;
      }
      
      // 确保 content script 已加载
      let scriptReady;
      try {
        scriptReady = await ensureContentScript(tab.id);
      } catch (error) {
        console.error('❌ 确保content script加载失败:', error);
        scriptReady = false;
      }
      
      if (!scriptReady) {
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
        showError('❌ 无法连接到页面脚本', '请刷新页面后重试');
        return;
      }
      
      // 获取渠道模型列表
      let result;
      try {
        result = await sendMessageWithRetry(tab.id, {
          action: 'fetchChannelModels',
          channelId: parseInt(channelId)
        });
      } catch (error) {
        console.error('❌ 获取模型列表请求失败:', error);
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
        showError('❌ 网络请求失败', error.message);
        return;
      }
      
      if (!result.success) {
        const errorMessage = result.error || '未知错误';
        console.error('❌ 获取模型列表接口返回失败:', errorMessage);

        // 特别处理404错误和其他常见错误
        if (errorMessage.includes('404') || (result.response && result.response.warning)) {
          console.warn('⚠️ 检测到404错误或警告，使用空模型列表继续执行');
          availableModels = []; // 设置为空数组
          // 直接跳转到空模型处理逻辑
          if (modelSelectionCancelBtn._tempHandler) {
            modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
            modelSelectionCancelBtn._tempHandler = null;
          }
          modelSelectionList.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">📭</div>
              <div class="empty-state-text">该渠道没有可用的模型</div>
            </div>
          `;
          if (modelSelectionCancelBtn) modelSelectionCancelBtn.disabled = false;
          bindModelSelectionEvents(resolve, []);
          return;
        } else {
          if (modelSelectionCancelBtn._tempHandler) {
            modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
            modelSelectionCancelBtn._tempHandler = null;
          }
          showError('❌ 获取模型列表失败', errorMessage);
          return;
        }
      }
      
      // 验证响应数据
      if (!result.response || !Array.isArray(result.response.models)) {
        console.error('❌ 模型列表数据格式错误:', result.response);
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
        showError('❌ 模型列表数据格式错误', '请稍后重试');
        return;
      }
      
      // 每次都重新获取可用模型列表，不使用缓存
      availableModels = result.response.models || [];
      console.log(`🔍 获取到可用模型列表: ${availableModels.length} 个`, availableModels);
      
      if (availableModels.length === 0) {
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
        modelSelectionList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-text">该渠道没有可用的模型</div>
          </div>
        `;
        // 即使没有模型，也要允许关闭
        if (modelSelectionCancelBtn) modelSelectionCancelBtn.disabled = false;
        bindModelSelectionEvents(resolve, []);
        return;
      }
      
      // 先清空selectedModels，然后重新获取渠道详情进行预选
      selectedModels.clear();
      console.log(`🔍 已清空selectedModels，准备重新预选`);
      
      // 获取渠道详情并预选模型
      console.log(`🔍 准备调用 restoreChannelModelSelection，渠道ID: ${channelId}`);
      try {
        await restoreChannelModelSelection(channelId);
        console.log(`🔍 restoreChannelModelSelection 调用完成`);
      } catch (error) {
        console.error('❌ 恢复渠道模型选择状态失败:', error);
        // 即使恢复失败也继续执行，只是不预选任何模型
        selectedModels.clear();
      }

      // 修复Bug 1: 在显示弹窗前，先保存当前选择状态，以便在用户没有修改时也能返回正确的选择
      const initialSelectedModels = Array.from(selectedModels);
      // 保存初始预选的模型到全局变量（用于置顶显示）
      initialPreselectedModels = new Set(selectedModels);
      console.log(`🔍 保存初始选择状态: ${initialSelectedModels.length} 个模型`, initialSelectedModels);

      // 渲染模型选择列表
      try {
        renderModelSelectionList();
      } catch (error) {
        console.error('❌ 渲染模型选择列表失败:', error);
        if (modelSelectionCancelBtn._tempHandler) {
          modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
          modelSelectionCancelBtn._tempHandler = null;
        }
        showError('❌ 渲染模型列表失败', error.message);
        return;
      }
      
      // 启用操作按钮
      selectAllModelsBtn.disabled = false;
      deselectAllModelsBtn.disabled = false;
      modelSelectionConfirmBtn.disabled = false;
      
      // 移除临时处理函数
      if (modelSelectionCancelBtn._tempHandler) {
        modelSelectionCancelBtn.removeEventListener('click', modelSelectionCancelBtn._tempHandler);
        modelSelectionCancelBtn._tempHandler = null;
      }
      
      // 绑定事件
      try {
        bindModelSelectionEvents(resolve, initialSelectedModels);
      } catch (error) {
        console.error('❌ 绑定模型选择事件失败:', error);
        showError('❌ 绑定事件失败', error.message);
        return;
      }
      
    } catch (error) {
      console.error('❌ 显示模型选择弹窗失败:', error);
      showStatus('❌ 显示模型选择弹窗失败，请重试', 'error');
      
      // 确保弹窗关闭
      try {
        modelSelectionModal.classList.remove('show');
      } catch (e) {
        console.error('❌ 关闭弹窗失败:', e);
      }
      
      resolve([]);
    }
  });
}

/**
 * 从接口实时获取渠道的模型选择状态（根据渠道的models和model_mapping预选）
 * @param {string} channelId - 渠道ID
 */
async function restoreChannelModelSelection(channelId) {
  console.log(`🚀 开始恢复渠道 ${channelId} 的模型选择状态`);
  
  try {
    // 参数验证
    if (!channelId || channelId.trim() === '') {
      console.error('❌ restoreChannelModelSelection: 渠道ID为空');
      throw new Error('渠道ID不能为空');
    }
    
    // 确保availableModels已经设置
    if (!availableModels || availableModels.length === 0) {
      console.warn('⚠️ availableModels 未设置，无法预选模型');
      selectedModels = new Set();
      return;
    }
    
    console.log(`✅ availableModels 已设置: ${availableModels.length} 个模型`, availableModels);
    
    // 获取当前标签页，增强错误处理
    let tab;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('无法获取当前标签页');
      }
      tab = tabs[0];
    } catch (error) {
      console.error('❌ 获取当前标签页失败:', error);
      throw new Error('无法获取当前标签页，请检查页面状态');
    }
    
    console.log(`🔍 准备调用 getChannelDetails 接口，渠道ID: ${channelId}`);
    
    // 调用接口获取渠道详情，增强错误处理
    let channelDetailsResult;
    try {
      channelDetailsResult = await sendMessageWithRetry(tab.id, {
        action: 'getChannelDetails',
        channelId: parseInt(channelId)
      });
    } catch (error) {
      console.error('❌ 调用 getChannelDetails 接口失败:', error);
      throw new Error(`获取渠道详情失败: ${error.message}`);
    }
    
    console.log(`🔍 getChannelDetails 接口返回:`, channelDetailsResult);
    
    // 验证响应数据结构
    if (!channelDetailsResult || !channelDetailsResult.success) {
      const errorMessage = channelDetailsResult?.error || '未知错误';
      console.warn(`⚠️ 获取渠道详情失败: ${errorMessage}`);
      selectedModels = new Set();
      return;
    }
    
    if (!channelDetailsResult.response || !channelDetailsResult.response.channel) {
      console.warn('⚠️ 渠道详情响应格式错误，缺少channel数据');
      selectedModels = new Set();
      return;
    }
    
    const channel = channelDetailsResult.response.channel;
    const currentChannelModels = channel.models || '';
    const modelMapping = channel.model_mapping || '';
    
    console.log(`🔍 渠道 ${channelId} 详情:`, {
      models: currentChannelModels,
      model_mapping: modelMapping
    });
    
    // 解析模型列表，增强错误处理
    let modelNames = [];
    try {
      if (currentChannelModels) {
        if (typeof currentChannelModels === 'string') {
          // 字符串格式：用逗号分隔
          modelNames = currentChannelModels.split(',').map(name => name.trim()).filter(name => name);
          console.log(`🔍 models字段是字符串格式，解析出 ${modelNames.length} 个模型`);
        } else if (Array.isArray(currentChannelModels)) {
          // 数组格式：直接使用
          modelNames = currentChannelModels;
          console.log(`🔍 models字段是数组格式，包含 ${modelNames.length} 个模型`);
        } else {
          console.warn(`⚠️ models字段格式未知:`, typeof currentChannelModels, currentChannelModels);
        }
      }
    } catch (error) {
      console.error('❌ 解析models字段失败:', error);
      modelNames = [];
    }
    
    console.log(`🔍 解析出的模型名称: ${modelNames.length} 个`, modelNames);
    
    // 解析模型映射，获取真正的模型名称，增强错误处理
    let realModelNames = [];
    try {
      if (modelMapping && modelNames.length > 0) {
        try {
          const mapping = JSON.parse(modelMapping);
          console.log(`🔍 模型映射对象:`, mapping);
          
          if (typeof mapping === 'object' && mapping !== null) {
            realModelNames = modelNames.map(fullName => {
              const mappedName = mapping[fullName] || fullName;
              console.log(`🔍 映射: ${fullName} → ${mappedName}`);
              return mappedName;
            });
            console.log(`🔍 使用 model_mapping 解析模型: ${modelNames.length} 个 → ${realModelNames.length} 个`);
            console.log(`🔍 解析后的模型列表:`, realModelNames);
          } else {
            console.warn('⚠️ model_mapping 不是有效的对象格式');
            realModelNames = modelNames;
          }
        } catch (e) {
          console.warn('⚠️ 解析 model_mapping 失败，使用原始模型名称:', e);
          console.warn('⚠️ model_mapping 原始内容:', modelMapping);
          realModelNames = modelNames;
        }
      } else {
        realModelNames = modelNames;
        console.log(`🔍 无 model_mapping，直接使用 models: ${realModelNames.length} 个`);
        console.log(`🔍 原始模型列表:`, realModelNames);
      }
    } catch (error) {
      console.error('❌ 处理模型映射时出错:', error);
      realModelNames = modelNames;
    }
    
    // 根据渠道当前已有的模型预选（从可用模型列表中筛选），增强错误处理
    try {
      selectedModels = new Set();
      
      // 验证availableModels是否有效
      if (!Array.isArray(availableModels)) {
        console.error('❌ availableModels 不是有效的数组');
        selectedModels = new Set();
        return;
      }
      
      // 只使用直接匹配
      availableModels.forEach(model => {
        if (typeof model === 'string' && realModelNames.includes(model)) {
          selectedModels.add(model);
          console.log(`✅ 匹配成功: ${model}`);
        }
      });
      
      console.log(`✅ 渠道 ${channelId} 当前有 ${realModelNames.length} 个模型，可用模型 ${availableModels.length} 个，预选了 ${selectedModels.size} 个匹配的模型`);
      console.log(`🔍 可用模型列表:`, availableModels);
      console.log(`🔍 渠道模型列表:`, realModelNames);
      console.log(`🔍 预选的模型:`, Array.from(selectedModels));
      
      // 如果没有匹配到任何模型，输出详细信息用于调试
      if (selectedModels.size === 0 && realModelNames.length > 0) {
        console.warn(`⚠️ 没有匹配到任何模型，渠道有 ${realModelNames.length} 个模型但都不在可用模型列表中`);
        console.warn(`⚠️ 渠道模型:`, realModelNames);
        console.warn(`⚠️ 可用模型:`, availableModels);
      }
      
      // 如果渠道没有任何模型，输出提示信息
      if (realModelNames.length === 0) {
        console.warn(`⚠️ 渠道没有任何模型`);
      }
    } catch (error) {
      console.error('❌ 预选模型时出错:', error);
      selectedModels = new Set();
    }
    
  } catch (error) {
    console.error('❌ 恢复渠道模型选择状态失败:', error);
    // 获取渠道详情失败，默认不选择任何模型
    selectedModels = new Set();
    
    // 向用户显示友好的错误信息
    if (error.message.includes('渠道ID不能为空')) {
      throw error; // 重新抛出参数错误
    } else if (error.message.includes('无法获取当前标签页')) {
      throw error; // 重新抛出标签页错误
    } else if (error.message.includes('获取渠道详情失败')) {
      throw error; // 重新抛出API错误
    } else {
      // 其他未知错误，包装后抛出
      throw new Error(`恢复渠道模型选择状态失败: ${error.message}`);
    }
  }
  
  console.log(`🏁 恢复渠道 ${channelId} 的模型选择状态完成，预选了 ${selectedModels.size} 个模型`);
}

/**
 * 不再保存渠道的模型选择状态到存储（无缓存模式）
 * @param {string} channelId - 渠道ID
 */
async function saveChannelModelSelection(channelId) {
  // 不再保存到本地存储，确保每次都重新选择
  // 这样可以避免使用缓存，确保每次都是主动选择
  console.log(`🔍 渠道 ${channelId} 的模型选择不保存到缓存（无缓存模式）: ${selectedModels.size} 个`);
  
  /*
  try {
    const result = await chrome.storage.local.get(['channelModelSelections']);
    const selections = result.channelModelSelections || {};
    
    selections[channelId] = Array.from(selectedModels);
    
    await chrome.storage.local.set({ channelModelSelections: selections });
    console.log(`✅ 保存渠道 ${channelId} 的模型选择: ${selectedModels.size} 个`);
  } catch (error) {
    console.error('保存模型选择状态失败:', error);
  }
  */
}

/**
 * 渲染模型选择列表（已选择模型置顶）
 */
function renderModelSelectionList(searchTerm = '') {
  const filteredModels = availableModels.filter(model =>
    model.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  modelSelectionList.innerHTML = '';
  
  if (filteredModels.length === 0) {
    modelSelectionList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">没有找到匹配的模型</div>
      </div>
    `;
    updateModelSelectionStats();
    return;
  }
  
  console.log(`🔍 渲染模型列表: ${filteredModels.length} 个模型，已选择 ${selectedModels.size} 个`);
  console.log(`🔍 已选择的模型:`, Array.from(selectedModels));
  console.log(`🔍 初始预选的模型:`, Array.from(initialPreselectedModels));

  // 将模型分为三组：初始预选、其他模型
  // 只有初始预选的模型会置顶显示，用户后续选择的模型保持原位置
  const initialPreselectedList = filteredModels.filter(model => initialPreselectedModels.has(model));
  const otherModelsList = filteredModels.filter(model => !initialPreselectedModels.has(model));

  // 合并列表：初始预选的在前，其他的保持原顺序
  const sortedModels = [...initialPreselectedList, ...otherModelsList];

  const fragment = document.createDocumentFragment();

  // 添加分组标题（如果有初始预选的模型）
  if (initialPreselectedList.length > 0) {
    const headerItem = document.createElement('div');
    headerItem.className = 'model-selection-header';
    headerItem.innerHTML = `
      <div style="font-size: 12px; color: var(--color-primary); font-weight: 600; padding: 8px 12px; background: rgba(0, 122, 255, 0.08); border-radius: 6px; margin-bottom: 4px;">
        ✅ 渠道已配置的模型 (${initialPreselectedList.length}个)
      </div>
    `;
    fragment.appendChild(headerItem);
  }
  
  sortedModels.forEach(model => {
    const modelItem = document.createElement('div');
    modelItem.className = 'model-selection-item';
    
    const isChecked = selectedModels.has(model);
    
    // 调试日志 - 显示每个模型的选中状态
    console.log(`🔍 模型 "${model}" 选中状态: ${isChecked}`);
    
    // 创建复选框元素
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'model-checkbox';
    checkbox.dataset.model = model;
    
    // 设置选中状态 - 确保在添加到DOM之前设置
    checkbox.checked = isChecked;
    
    // 创建模型名称元素
    const modelName = document.createElement('span');
    modelName.className = 'model-name';
    modelName.textContent = model;
    
    // 添加到模型项
    modelItem.appendChild(checkbox);
    modelItem.appendChild(modelName);
    
    // 选中状态样式
    if (isChecked) {
      modelItem.classList.add('selected');
      console.log(`✅ 应用选中样式: ${model}`);
    }
    
    fragment.appendChild(modelItem);
  });
  
  modelSelectionList.appendChild(fragment);
  updateModelSelectionStats();
  
  // 移除旧的事件监听器（如果存在）
  if (modelSelectionList._changeHandler) {
    modelSelectionList.removeEventListener('change', modelSelectionList._changeHandler);
  }
  
  // 绑定复选框事件 - 使用事件委托避免重复绑定
  const changeHandler = (e) => {
    if (e.target.classList.contains('model-checkbox')) {
      const model = e.target.dataset.model;
      const modelItem = e.target.closest('.model-selection-item');

      if (e.target.checked) {
        selectedModels.add(model);
        modelItem.classList.add('selected');
        console.log(`✅ 用户选择了模型: ${model}`);
      } else {
        selectedModels.delete(model);
        modelItem.classList.remove('selected');
        console.log(`❌ 用户取消选择了模型: ${model}`);
      }

      // 只更新统计信息，不重新渲染列表（保持用户选择的模型在原位置）
      updateModelSelectionStats();
    }
  };
  
  // 保存处理器引用以便后续移除
  modelSelectionList._changeHandler = changeHandler;
  modelSelectionList.addEventListener('change', changeHandler);
}

/**
 * 更新选择统计信息
 */
function updateModelSelectionStats() {
  const total = availableModels.length;
  const selected = selectedModels.size;
  
  modelSelectionStats.textContent = `已选择 ${selected} / ${total} 个模型`;
  
  // 更新按钮状态
  selectAllModelsBtn.disabled = selected === total;
  deselectAllModelsBtn.disabled = selected === 0;
}

// 全局变量存储当前的事件处理函数，用于解绑
let currentCancelHandler = null;
let currentConfirmHandler = null;
let currentOverlayHandler = null;
let currentEscHandler = null;

/**
 * 绑定模型选择弹窗事件
 * @param {Function} resolve - Promise resolve 函数
 * @param {Array<string>} initialSelectedModels - 初始选择的模型列表
 */
function bindModelSelectionEvents(resolve, initialSelectedModels = []) {
  try {
    // 参数验证
    if (!resolve || typeof resolve !== 'function') {
      console.error('❌ bindModelSelectionEvents: resolve参数不是有效的函数');
      throw new Error('resolve参数必须是有效的函数');
    }
    
    if (!Array.isArray(initialSelectedModels)) {
      console.error('❌ bindModelSelectionEvents: initialSelectedModels参数不是有效的数组');
      throw new Error('initialSelectedModels参数必须是有效的数组');
    }
    
    console.log(`🔍 开始绑定模型选择事件，初始选择模型: ${initialSelectedModels.length} 个`);
    
    // 验证必要的DOM元素是否存在
    if (!modelSearchInput) {
      console.error('❌ modelSearchInput 元素不存在');
      throw new Error('搜索输入框元素不存在');
    }
    
    if (!selectAllModelsBtn) {
      console.error('❌ selectAllModelsBtn 元素不存在');
      throw new Error('全选按钮元素不存在');
    }
    
    if (!deselectAllModelsBtn) {
      console.error('❌ deselectAllModelsBtn 元素不存在');
      throw new Error('全不选按钮元素不存在');
    }
    
    if (!modelSelectionModal) {
      console.error('❌ modelSelectionModal 元素不存在');
      throw new Error('模型选择弹窗元素不存在');
    }
    
    if (!modelSelectionCancelBtn) {
      console.error('❌ modelSelectionCancelBtn 元素不存在');
      throw new Error('取消按钮元素不存在');
    }
    
    if (!modelSelectionConfirmBtn) {
      console.error('❌ modelSelectionConfirmBtn 元素不存在');
      throw new Error('确认按钮元素不存在');
    }
    
    // 搜索功能
    const handleSearch = (e) => {
      try {
        if (!e || !e.target) {
          console.error('❌ 搜索事件对象无效');
          return;
        }

        const searchTerm = e.target.value || '';
        console.log(`🔍 用户搜索模型: "${searchTerm}"`);

        // 显示/隐藏清除按钮
        if (modelSearchClearBtn) {
          modelSearchClearBtn.style.display = searchTerm.trim() ? 'flex' : 'none';
        }

        // 验证availableModels是否存在
        if (!Array.isArray(availableModels)) {
          console.error('❌ availableModels 不是有效的数组');
          return;
        }

        renderModelSelectionList(searchTerm);
      } catch (error) {
        console.error('❌ 处理搜索事件时出错:', error);
        // 搜索失败时不中断用户操作，只记录错误
      }
    };
    
    modelSearchInput.addEventListener('input', handleSearch);

    // 模型搜索清除按钮
    if (modelSearchClearBtn) {
      modelSearchClearBtn.addEventListener('click', () => {
        modelSearchInput.value = '';
        modelSearchInput.dispatchEvent(new Event('input')); // 触发input事件
        modelSearchInput.focus();
      });
    }

    // 全选按钮
    const handleSelectAll = () => {
      try {
        console.log('🔍 用户点击全选按钮');
        
        // 验证availableModels是否存在
        if (!Array.isArray(availableModels)) {
          console.error('❌ availableModels 不是有效的数组，无法全选');
          showStatus('❌ 模型列表数据无效，无法全选', 'error');
          return;
        }
        
        if (availableModels.length === 0) {
          console.warn('⚠️ 没有可用的模型进行全选');
          showStatus('⚠️ 没有可用的模型', 'warning');
          return;
        }
        
        selectedModels = new Set(availableModels);
        console.log(`✅ 全选完成，选择了 ${selectedModels.size} 个模型`);
        
        renderModelSelectionList(modelSearchInput.value);
        updateModelSelectionStats();
      } catch (error) {
        console.error('❌ 处理全选事件时出错:', error);
        showStatus('❌ 全选操作失败', 'error');
      }
    };
    
    selectAllModelsBtn.addEventListener('click', handleSelectAll);
    
    // 全不选按钮
    const handleDeselectAll = () => {
      try {
        console.log('🔍 用户点击全不选按钮');
        
        selectedModels.clear();
        console.log('✅ 全不选完成');
        
        renderModelSelectionList(modelSearchInput.value);
        updateModelSelectionStats();
      } catch (error) {
        console.error('❌ 处理全不选事件时出错:', error);
        showStatus('❌ 全不选操作失败', 'error');
      }
    };
    
    deselectAllModelsBtn.addEventListener('click', handleDeselectAll);

    // 反选按钮
    const handleInvertSelection = () => {
      try {
        console.log('🔍 用户点击反选按钮');

        // 使用当前显示的模型列表进行反选（考虑搜索过滤）
        const searchTerm = modelSearchInput.value.trim().toLowerCase();
        const filteredModels = searchTerm
          ? availableModels.filter(model => model.toLowerCase().includes(searchTerm))
          : availableModels;

        // 对过滤后的模型进行反选
        filteredModels.forEach(model => {
          if (selectedModels.has(model)) {
            selectedModels.delete(model);
          } else {
            selectedModels.add(model);
          }
        });

        console.log(`✅ 反选完成，当前选择了 ${selectedModels.size} 个模型`);

        renderModelSelectionList(searchTerm);
        updateModelSelectionStats();
      } catch (error) {
        console.error('❌ 处理反选事件时出错:', error);
        showStatus('❌ 反选操作失败', 'error');
      }
    };

    invertSelectionBtn.addEventListener('click', handleInvertSelection);

    // 取消按钮
    const handleCancel = () => {
      try {
        console.log('🔍 用户点击取消按钮');
        
        // 安全地移除弹窗显示类
        if (modelSelectionModal && modelSelectionModal.classList) {
          modelSelectionModal.classList.remove('show');
        }
        
        // 清空搜索框
        if (modelSearchInput) {
          modelSearchInput.value = '';
        }
        
        // 修复Bug 1: 取消时返回空数组，表示用户取消了操作
        console.log('✅ 用户取消操作，返回空数组');
        resolve([]);
      } catch (error) {
        console.error('❌ 处理取消事件时出错:', error);
        // 即使出错也要确保resolve被调用，避免Promise挂起
        try {
          resolve([]);
        } catch (resolveError) {
          console.error('❌ 调用resolve失败:', resolveError);
        }
      }
    };
    
    // 确认按钮
    const handleConfirm = async () => {
      try {
        console.log('🔍 用户点击确认按钮');
        
        // 验证selectedModels是否有效
        if (!selectedModels) {
          console.error('❌ selectedModels 未定义');
          showStatus('❌ 模型选择数据无效', 'error');
          return;
        }
        
        const selectedModelsArray = Array.from(selectedModels);
        console.log(`✅ 用户确认选择，选择了 ${selectedModelsArray.length} 个模型`);
        
        // 不再保存到缓存，但保留函数调用以保持代码结构
        try {
          await saveChannelModelSelection(currentChannelId);
        } catch (saveError) {
          console.warn('⚠️ 保存模型选择状态失败（无缓存模式）:', saveError);
          // 保存失败不影响确认操作
        }
        
        // 安全地移除弹窗显示类
        if (modelSelectionModal && modelSelectionModal.classList) {
          modelSelectionModal.classList.remove('show');
        }
        
        // 清空搜索框
        if (modelSearchInput) {
          modelSearchInput.value = '';
        }
        
        resolve(selectedModelsArray);
      } catch (error) {
        console.error('❌ 处理确认事件时出错:', error);
        showStatus('❌ 确认操作失败', 'error');
        
        // 即使出错也要尝试resolve，避免Promise挂起
        try {
          resolve([]);
        } catch (resolveError) {
          console.error('❌ 调用resolve失败:', resolveError);
        }
      }
    };
    
    // 重新绑定按钮事件（避免重复绑定）
    try {
      // 先移除旧的事件监听器（如果存在）
      if (modelSelectionCancelBtn && currentCancelHandler) {
        modelSelectionCancelBtn.removeEventListener('click', currentCancelHandler);
      }
      if (modelSelectionConfirmBtn && currentConfirmHandler) {
        modelSelectionConfirmBtn.removeEventListener('click', currentConfirmHandler);
      }

      // 更新当前的事件处理函数引用
      currentCancelHandler = handleCancel;
      currentConfirmHandler = handleConfirm;

      // 直接在现有按钮上添加事件监听器
      if (modelSelectionCancelBtn) {
        modelSelectionCancelBtn.addEventListener('click', currentCancelHandler);
      } else {
        console.warn('⚠️ modelSelectionCancelBtn 不存在，无法绑定取消事件');
      }

      if (modelSelectionConfirmBtn) {
        modelSelectionConfirmBtn.addEventListener('click', currentConfirmHandler);
      } else {
        console.warn('⚠️ modelSelectionConfirmBtn 不存在，无法绑定确认事件');
      }

      console.log('✅ 按钮事件绑定成功');
    } catch (error) {
      console.error('❌ 绑定按钮事件时出错:', error);
      // 不抛出错误，而是记录并继续执行
      console.warn('⚠️ 按钮事件绑定失败，但继续执行:', error.message);
    }
    
    // 点击遮罩层关闭
    const handleOverlayClick = (e) => {
      try {
        if (!e || !e.target) {
          return;
        }
        
        if (e.target === modelSelectionModal) {
          console.log('🔍 用户点击遮罩层关闭弹窗');
          handleCancel();
        }
      } catch (error) {
        console.error('❌ 处理遮罩层点击事件时出错:', error);
      }
    };
    
    if (modelSelectionModal && currentOverlayHandler) {
      modelSelectionModal.removeEventListener('click', currentOverlayHandler);
    }
    currentOverlayHandler = handleOverlayClick;
    modelSelectionModal.addEventListener('click', currentOverlayHandler);
    
    // ESC 键关闭
    const handleEscKey = (e) => {
      try {
        if (!e || !e.key) {
          return;
        }
        
        if (e.key === 'Escape' && modelSelectionModal.classList.contains('show')) {
          console.log('🔍 用户按ESC键关闭弹窗');
          handleCancel();
          if (currentEscHandler) {
             document.removeEventListener('keydown', currentEscHandler);
             currentEscHandler = null;
          }
        }
      } catch (error) {
        console.error('❌ 处理ESC键事件时出错:', error);
      }
    };
    
    if (currentEscHandler) {
      document.removeEventListener('keydown', currentEscHandler);
    }
    currentEscHandler = handleEscKey;
    document.addEventListener('keydown', currentEscHandler);
    
    console.log('✅ 模型选择事件绑定完成');
    
  } catch (error) {
    console.error('❌ 绑定模型选择事件失败:', error);

    // 确保在出错时也调用resolve，避免Promise挂起
    try {
      showStatus('❌ 模型选择界面初始化失败', 'error');
      resolve([]);
    } catch (resolveError) {
      console.error('❌ 调用resolve失败:', resolveError);
    }

    // 不重新抛出错误，避免影响上层调用
    console.warn('⚠️ 模型选择事件绑定失败，但已处理Promise');
  }
}

/**
 * 更新已选择模型的显示（无缓存模式）
 */
async function updateSelectedModelsDisplay() {
  if (!selectedModelsDisplay || !selectedModelsCount || !selectedModelsList) {
    return;
  }
  
  const channelId = channelSelect.value.trim();
  
  if (!channelId) {
    selectedModelsDisplay.style.display = 'none';
    return;
  }
  
  try {
    let currentModels = [];
    
    // 只使用用户当前选择的模型列表（currentChannelSelectedModels）
    // 不再从渠道列表中获取渠道的当前状态，避免使用缓存
    if (currentChannelSelectedModels && currentChannelSelectedModels.length > 0) {
      currentModels = [...currentChannelSelectedModels];
      console.log(`🔍 使用用户当前选择的模型: ${currentModels.length} 个`);
    } else {
      // 用户没有选择模型时，显示未选择状态，不使用缓存
      currentModels = [];
      console.log(`🔍 用户未选择任何模型（无缓存模式）`);
    }
    
    selectedModelsDisplay.style.display = 'block';
    
    // 更新计数
    selectedModelsCount.textContent = `已选择 ${currentModels.length} 个模型`;
    
    // 更新模型列表
    if (currentModels.length === 0) {
      selectedModelsList.innerHTML = '<div style="color: var(--color-text-secondary); font-style: italic;">未选择任何模型</div>';
    } else {
      // 限制显示的模型数量，避免界面过长
      const maxDisplay = 10;
      const displayModels = currentModels.slice(0, maxDisplay);
      const remainingCount = currentModels.length - maxDisplay;
      
      selectedModelsList.innerHTML = displayModels.map(model =>
        `<div style="padding: 2px 0; color: var(--color-text-primary);">• ${model}</div>`
      ).join('');
      
      if (remainingCount > 0) {
        selectedModelsList.innerHTML += `<div style="padding: 4px 0; color: var(--color-text-secondary); font-style: italic;">... 还有 ${remainingCount} 个模型</div>`;
      }
    }
  } catch (error) {
    console.error('更新已选择模型显示失败:', error);
    // 获取失败时隐藏显示区域
    selectedModelsDisplay.style.display = 'none';
  }
}

/**
 * 重新打开模型选择弹窗
 */
async function reopenModelSelectionModal() {
  const channelId = channelSelect.value.trim();
  if (!channelId) {
    showStatus('⚠️ 请先选择渠道', 'warning');
    return;
  }
  
  try {
    const selectedModelsList = await showModelSelectionModal(channelId);
    currentChannelSelectedModels = selectedModelsList; // 保存选择的模型列表
    
    if (selectedModelsList.length === 0) {
      showStatus('⚠️ 未选择任何模型，将同步所有可用模型', 'warning');
    } else {
      showStatus(`✅ 已更新选择 ${selectedModelsList.length} 个模型进行同步`, 'success');
      setTimeout(() => {
        statusDiv.classList.remove('show');
      }, 2000);
    }
    
    // 更新显示
    updateSelectedModelsDisplay();
  } catch (error) {
    console.error('重新打开模型选择弹窗失败:', error);
    showStatus('⚠️ 模型选择弹窗显示失败，将同步所有模型', 'warning');
    currentChannelSelectedModels = []; // 清空选择
    updateSelectedModelsDisplay();
  }
}

// 绑定编辑按钮事件
if (editModelsBtn) {
  editModelsBtn.addEventListener('click', reopenModelSelectionModal);
}

// 初始化：DOM 加载完成后的处理
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM 加载完成，开始初始化');
});

