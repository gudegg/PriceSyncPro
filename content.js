// PriceSyncPro Extension - Content Script
// 这个脚本注入到页面中，可以访问页面的 Cookie 和发起同源请求

// 防止重复注入
if (window.priceSyncProLoaded) {
  console.log('⚠️ PriceSyncPro Content Script 已加载，跳过重复注入');
} else {
  window.priceSyncProLoaded = true;
  console.log('✅ PriceSyncPro Extension 开始加载 Content Script');

/**
 * 记录错误日志到 storage
 * @param {string} action - 操作名称
 * @param {Error} error - 错误对象
 * @param {object} context - 额外上下文信息
 */
async function logError(action, error, context = {}) {
  const errorLog = {
    action,
    message: error.message,
    stack: error.stack,
    context,
    timestamp: Date.now(),
    url: window.location.href
  };
  
  console.error(`❌ [${action}] 错误:`, errorLog);
  
  try {
    const { errorLogs = [] } = await chrome.storage.local.get('errorLogs');
    errorLogs.push(errorLog);
    // 保留最近 50 条错误日志
    await chrome.storage.local.set({
      errorLogs: errorLogs.slice(-50)
    });
  } catch (storageError) {
    console.error('保存错误日志失败:', storageError);
  }
}

/**
 * 转换 One Hub API 格式到标准格式
 * 支持两种格式：
 * 1. 数组格式: [{ model, type, channel_type, input, output }, ...]
 * 2. 对象格式: { data: { "model-name": { groups, owned_by, price: {...} }, ... } }
 * 标准格式: { model_name, quota_type, model_ratio, completion_ratio, model_price }
 */
function convertOneHubFormat(data) {
  // 格式 1: 数组格式（官方价格 API）
  if (Array.isArray(data) && data.length > 0 && data[0].model && data[0].type && data[0].input !== undefined) {
    console.log('🔄 检测到 One Hub 官方价格 API 格式（数组），开始转换...');
    
    const converted = data.map(item => {
      // One Hub 使用 "tokens" 表示按量计费
      const isTokenBased = item.type === 'tokens';
      
      // 转换为标准格式
      const standardItem = {
        model_name: item.model,
        quota_type: isTokenBased ? 0 : 1, // 0=按量, 1=按次
        model_ratio: item.input || 0,
        completion_ratio: item.output && item.input ? (item.output / item.input) : 1,
        model_price: isTokenBased ? 0 : item.input || 0
      };
      
      return standardItem;
    });
    
    console.log(`✅ One Hub 官方格式转换完成: ${converted.length} 个模型`);
    console.log('📊 转换示例:', converted.slice(0, 2));
    
    return converted;
  }
  
  // 格式 2: 对象格式（实例 available_model API）
  if (data && typeof data === 'object' && data.data && typeof data.data === 'object') {
    console.log('🔄 检测到 One Hub 实例 API 格式（对象），开始转换...');
    
    const converted = [];
    const modelsData = data.data;
    
    for (const [modelName, modelInfo] of Object.entries(modelsData)) {
      if (!modelInfo || !modelInfo.price) continue;
      
      const priceInfo = modelInfo.price;
      const modelType = priceInfo.model || modelName;
      const type = priceInfo.type || 'times';
      
      // 判断计费类型
      // One Hub 使用 "times" 表示按次计费，"tokens" 表示按量计费
      const isPerUse = type === 'times';
      
      // 提取价格（One Hub 的价格单位需要转换）
      // One Hub 存储的是内部单位，需要除以 500 转换为美元
      // 特殊处理：0 或负数表示免费
      const ONE_HUB_PRICE_DIVISOR = 500;
      const rawInput = priceInfo.input || 0;
      const rawOutput = priceInfo.output || 0;
      
      // 检查是否为免费模型（价格为 0 或负数）
      const isFree = rawInput <= 0 && rawOutput <= 0;
      
      let inputPrice = 0;
      let outputPrice = 0;
      
      if (!isFree) {
        inputPrice = rawInput / ONE_HUB_PRICE_DIVISOR;
        outputPrice = rawOutput / ONE_HUB_PRICE_DIVISOR;
        
        // 🔧 关键修复：New API 的 ModelRatio 是倍率，不是价格
        // 我们需要除以 2 来得到正确的倍率（New API 内部会乘以 2）
        if (!isPerUse) {
          // 按量计费：从 $/1K 转换为倍率
          // 步骤1: inputPrice 已经是 $/1K（例如 0.012）
          // 步骤2: 乘以 1000 转换为 $/1M（例如 12）
          // 步骤3: 除以 2 得到 New API 的倍率（例如 6）
          inputPrice = (inputPrice * 1000) / 2;
          outputPrice = (outputPrice * 1000) / 2;
          console.log(`  🔧 ${modelType} (按量): 原始 ${rawInput}/${ONE_HUB_PRICE_DIVISOR} = $${rawInput / ONE_HUB_PRICE_DIVISOR}/1K → $/1M=${(rawInput / ONE_HUB_PRICE_DIVISOR) * 1000} → 倍率=${inputPrice}`);
        } else {
          console.log(`  🔧 ${modelType} (按次): 原始 input=${rawInput}, output=${rawOutput} → 转换后 $${inputPrice}, $${outputPrice}`);
        }
      } else {
        console.log(`  🆓 ${modelType} (免费): input=${rawInput}, output=${rawOutput} → Free`);
      }
      
      // 转换为标准格式
      const standardItem = {
        model_name: modelType,
        quota_type: isPerUse ? 1 : 0, // 0=按量, 1=按次
        // 对于按次计费：直接使用转换后的价格
        // 对于按量计费：这是倍率（会被 New API 乘以内部基础价 2）
        model_ratio: inputPrice,
        completion_ratio: inputPrice > 0 ? (outputPrice / inputPrice) : 1,
        model_price: isPerUse ? inputPrice : 0,
        // 标记这是 One Hub 直接价格格式
        _isOneHubDirectPrice: true
      };
      
      converted.push(standardItem);
    }
    
    console.log(`✅ One Hub 实例格式转换完成: ${converted.length} 个模型`);
    console.log('📊 转换示例:', converted.slice(0, 2));
    
    return converted;
  }
  
  // 不是 One Hub 格式，返回原数据
  return data;
}

// 获取当前页面的 API 基础 URL
function getCurrentApiUrl() {
  // 从当前页面 URL 提取基础域名
  const url = new URL(window.location.href);
  return `${url.protocol}//${url.host}`;
}

// 获取现有配置
async function fetchExistingConfig(apiUrl) {
  const config = {
    ModelPrice: {},
    ModelRatio: {},
    CompletionRatio: {}
  };

  try {
    // 获取 Cookie（包括 New-API-User）
    const cookieData = await getCookiesFromAPI(apiUrl);
    if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
      // 静默处理：这是预期的情况（用户未登录或不在正确页面）
      return config;
    }
    
    const headers = {
      'New-API-User': cookieData.newApiUser
    };
    
    console.log('📖 读取现有配置，使用 New-API-User:', cookieData.newApiUser);
    
    // ModelPrice
    const priceRes = await fetch(`${apiUrl}/api/option/?key=ModelPrice`, {
      credentials: 'include',
      headers: headers
    });
    if (priceRes.ok) {
      const data = await priceRes.json();
      if (data.success && data.data) {
        config.ModelPrice = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
        console.log('✓ 读取到 ModelPrice:', Object.keys(config.ModelPrice).length, '个模型');
      }
    } else if (priceRes.status !== 401 && priceRes.status !== 403) {
      // 只输出非认证错误（401/403 是预期的）
      console.warn(`⚠️ 读取 ModelPrice 失败: HTTP ${priceRes.status}`);
    }

    // ModelRatio
    const ratioRes = await fetch(`${apiUrl}/api/option/?key=ModelRatio`, {
      credentials: 'include',
      headers: headers
    });
    if (ratioRes.ok) {
      const data = await ratioRes.json();
      if (data.success && data.data) {
        config.ModelRatio = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
        console.log('✓ 读取到 ModelRatio:', Object.keys(config.ModelRatio).length, '个模型');
      }
    } else if (ratioRes.status !== 401 && ratioRes.status !== 403) {
      console.warn(`⚠️ 读取 ModelRatio 失败: HTTP ${ratioRes.status}`);
    }

    // CompletionRatio
    const completionRes = await fetch(`${apiUrl}/api/option/?key=CompletionRatio`, {
      credentials: 'include',
      headers: headers
    });
    if (completionRes.ok) {
      const data = await completionRes.json();
      if (data.success && data.data) {
        config.CompletionRatio = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
        console.log('✓ 读取到 CompletionRatio:', Object.keys(config.CompletionRatio).length, '个模型');
      }
    } else if (completionRes.status !== 401 && completionRes.status !== 403) {
      console.warn(`⚠️ 读取 CompletionRatio 失败: HTTP ${completionRes.status}`);
    }
  } catch (error) {
    // 静默处理：这些错误是预期的（用户未登录或不在正确页面）
    // 只在开发模式下输出详细信息
    if (chrome.runtime.getManifest().version_name?.includes('dev')) {
      console.debug('获取现有配置失败（预期行为）:', error.message);
    }
  }

  return config;
}

// 使用 Chrome Cookies API 获取 Cookie
async function getCookiesFromAPI(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'getCookies',
      url: url
    }, (response) => {
      resolve(response);
    });
  });
}

// 使用 Background Script 发起跨域请求（绕过 CORS）
async function fetchCORS(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'fetchCORS',
      url: url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined
    }, (response) => {
      if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || '跨域请求失败'));
      }
    });
  });
}

// 更新单个配置项
async function updateOption(apiUrl, key, value) {
  // 使用 Chrome Cookies API 获取 Cookie
  const cookieData = await getCookiesFromAPI(apiUrl);
  console.log('🍪 Cookie 数据:', cookieData);
  
  if (!cookieData || !cookieData.success) {
    throw new Error('无法获取 Cookie，请确保：\n1. 已登录 New API 后台\n2. 刷新页面后重试');
  }
  
  const newApiUser = cookieData.newApiUser;
  if (!newApiUser) {
    throw new Error('未找到登录状态（New-API-User Cookie）。请确保已登录 New API 后台。');
  }
  
  console.log('✓ 找到 New-API-User:', newApiUser);
  
  const headers = {
    'Content-Type': 'application/json',
    'New-API-User': newApiUser
  };
  
  console.log('📤 发送请求:', {
    url: `${apiUrl}/api/option/`,
    method: 'PUT',
    headers: headers
  });
  
  const response = await fetch(`${apiUrl}/api/option/`, {
    method: 'PUT',
    headers: headers,
    credentials: 'include',
    body: JSON.stringify({
      key: key,
      value: JSON.stringify(value)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ 请求失败:', errorText);
    throw new Error(`更新 ${key} 失败 (HTTP ${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`更新 ${key} 失败: ${result.message || '未知错误'}`);
  }

  console.log(`✅ 成功更新 ${key}`);
  return result;
}

// 生成 SQL
function generateSQL(results, prefix) {
  const modelPrices = {};
  const modelRatios = {};
  const completionRatios = {};
  
  let perUseCount = 0;
  let usageBasedCount = 0;
  
  results.forEach(m => {
    // ✅ Bug #021 修复：使用 smartName 生成最终配置
    const finalModelName = prefix ? prefix + m.smartName : m.smartName;
    
    if (m.quotaType === 1) {
      modelPrices[finalModelName] = parseFloat(m.inputPrice.toFixed(4));
      perUseCount++;
    } else {
      if (m.modelRatio !== undefined && m.modelRatio !== null) {
        modelRatios[finalModelName] = m.modelRatio;
      }
      if (m.completionRatio !== undefined && m.completionRatio !== null) {
        completionRatios[finalModelName] = m.completionRatio;
      }
      usageBasedCount++;
    }
  });

  let sql = '-- ==========================================\n';
  sql += '-- New API 完整定价配置更新 SQL\n';
  sql += '-- ==========================================\n';
  sql += '-- 生成时间：' + new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}) + '\n';
  sql += `-- 模型前缀：${prefix || '(无前缀)'}\n`;
  sql += `-- 总模型数：${results.length}\n`;
  sql += `-- 按次计费：${perUseCount} | 按量计费：${usageBasedCount}\n\n`;

  if (Object.keys(modelPrices).length > 0) {
    sql += '-- ModelPrice (按次计费)\n';
    sql += 'UPDATE options SET value = \'' + JSON.stringify(modelPrices, null, 2).replace(/'/g, "''") + '\'\n';
    sql += 'WHERE `key` = \'ModelPrice\';\n\n';
  }

  if (Object.keys(modelRatios).length > 0) {
    sql += '-- ModelRatio (按量计费)\n';
    sql += 'UPDATE options SET value = \'' + JSON.stringify(modelRatios, null, 2).replace(/'/g, "''") + '\'\n';
    sql += 'WHERE `key` = \'ModelRatio\';\n\n';
  }

  if (Object.keys(completionRatios).length > 0) {
    sql += '-- CompletionRatio (按量计费)\n';
    sql += 'UPDATE options SET value = \'' + JSON.stringify(completionRatios, null, 2).replace(/'/g, "''") + '\'\n';
    sql += 'WHERE `key` = \'CompletionRatio\';\n\n';
  }

  sql += '-- ✅ SQL 生成完成！';

  return {
    sql,
    stats: {
      modelPriceCount: Object.keys(modelPrices).length,
      modelRatioCount: Object.keys(modelRatios).length,
      completionRatioCount: Object.keys(completionRatios).length
    }
  };
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      // Ping 测试（用于检测 content script 是否已加载）
      if (request.action === 'ping') {
        sendResponse({ success: true, message: 'pong' });
        return;
      }

      if (request.action === 'getChannelList') {
        // 获取渠道列表
        console.log('📋 开始获取渠道列表...');
        
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'New-API-User': cookieData.newApiUser
        };
        
        // 获取所有渠道（不分页，获取全部）
        console.log(`📡 请求渠道列表: ${apiUrl}/api/channel/?page_size=1000`);
        
        const channelsResponse = await fetch(`${apiUrl}/api/channel/?page_size=1000`, {
          method: 'GET',
          headers: headers,
          credentials: 'include'
        });
        
        if (!channelsResponse.ok) {
          throw new Error(`获取渠道列表失败 (HTTP ${channelsResponse.status})`);
        }
        
        const channelsData = await channelsResponse.json();
        console.log('📦 渠道列表数据:', channelsData);
        
        if (!channelsData.success || !channelsData.data) {
          throw new Error('渠道列表数据格式错误');
        }
        
        // 支持两种数据格式：直接数组或包含 items 的对象
        const channelList = Array.isArray(channelsData.data)
          ? channelsData.data
          : (channelsData.data.items || []);
        
        if (!Array.isArray(channelList) || channelList.length === 0) {
          throw new Error('渠道列表为空');
        }
        
        const channels = channelList.map(ch => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          baseUrl: ch.base_url,
          tag: ch.tag,
          models: ch.models ? ch.models.split(',').length : 0
        }));
        
        console.log(`✅ 获取到 ${channels.length} 个渠道`);
        
        sendResponse({
          success: true,
          channels: channels
        });
      }
      else if (request.action === 'syncChannelModels') {
        // 同步渠道模型列表
        const { channelId, prefix, tokenGroup, upstreamUrl, customModels } = request;
        
        console.log(`🔄 开始同步渠道 ${channelId} 的模型列表，前缀: ${prefix || '(无)'}，令牌组: ${tokenGroup || '(全部)'}`);
        console.log(`📡 上游 URL: ${upstreamUrl || '(未提供)'}`);
        if (customModels) {
          console.log(`🎯 自定义模型选择: ${customModels.length} 个模型`);
        }
        
        // 获取当前 API URL（后台 API）
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'New-API-User': cookieData.newApiUser
        };
        
        // 步骤1: 从上游获取模型列表
        console.log(`🔄 步骤 1: 从渠道 ${channelId} 获取模型列表...`);
        const fetchModelsUrl = `${apiUrl}/api/channel/fetch_models/${channelId}`;
        
        let upstreamModels = [];
        let usedFallback = false;
        
        try {
          const modelsResponse = await fetch(fetchModelsUrl, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          });
          
          if (!modelsResponse.ok) {
            if (modelsResponse.status === 401 || modelsResponse.status === 403) {
              console.log(`⚠️ /models 接口返回 ${modelsResponse.status}，尝试使用 /pricing 接口...`);
              throw new Error('AUTH_FALLBACK');
            }
            throw new Error(`获取模型列表失败 (HTTP ${modelsResponse.status})`);
          }
          
          const modelsData = await modelsResponse.json();
          console.log('📦 上游返回数据:', modelsData);
          console.log('📦 数据类型检查:', {
            hasSuccess: 'success' in modelsData,
            successValue: modelsData.success,
            hasData: 'data' in modelsData,
            dataType: Array.isArray(modelsData.data) ? 'array' : typeof modelsData.data,
            dataLength: Array.isArray(modelsData.data) ? modelsData.data.length : 'N/A'
          });
          
          if (!modelsData.success) {
            const errorMsg = modelsData.message || '未知错误';
            console.log('❌ 上游返回失败:', errorMsg);
            if (errorMsg.includes('401') || errorMsg.includes('403') ||
                errorMsg.includes('unauthorized') || errorMsg.includes('status code: 403')) {
              console.log('⚠️ /models 接口认证失败，尝试使用 /pricing 接口...');
              throw new Error('AUTH_FALLBACK');
            }
            throw new Error(`获取模型列表失败：${errorMsg}`);
          }
          
          if (!modelsData.data) {
            console.error('❌ modelsData.data 不存在');
            throw new Error('上游返回数据缺少 data 字段');
          }
          
          if (!Array.isArray(modelsData.data)) {
            console.error('❌ modelsData.data 不是数组，类型:', typeof modelsData.data);
            throw new Error(`上游返回数据格式错误：data 字段应为数组，实际为 ${typeof modelsData.data}`);
          }
          
          upstreamModels = modelsData.data;
          console.log(`✅ 获取到 ${upstreamModels.length} 个模型`);
          
        } catch (error) {
          if (error.message === 'AUTH_FALLBACK') {
            // 使用 /pricing 接口作为备选方案
            const pricingUrl = upstreamUrl || `${apiUrl}/api/pricing`;
            console.log(`⚠️ 认证错误（401/403），回退到 /pricing: ${pricingUrl}`);
            
            // 发送进度消息到popup
            chrome.runtime.sendMessage({
              action: 'syncProgress',
              message: '⚠️ 无法直接获取模型列表，正在从定价接口获取...'
            });
            
            // 如果是上游 URL，使用 fetchCORS；否则使用普通 fetch
            let pricingData;
            if (upstreamUrl) {
              console.log('🌐 从上游 URL 获取 pricing 数据（通过 CORS）');
              pricingData = await fetchCORS(pricingUrl);
            } else {
              console.log('🏠 从后台 API 获取 pricing 数据');
              const pricingResponse = await fetch(pricingUrl, {
                method: 'GET',
                headers: headers,
                credentials: 'include'
              });
              
              if (!pricingResponse.ok) {
                throw new Error(`/pricing 接口也失败了 (HTTP ${pricingResponse.status})`);
              }
              
              pricingData = await pricingResponse.json();
            }
            
            console.log('📦 /pricing 返回数据:', pricingData);
            
            // 🔧 OneHub格式检测和转换
            if (pricingData.success && pricingData.data && typeof pricingData.data === 'object' && !Array.isArray(pricingData.data)) {
              console.log('🔄 检测到OneHub对象格式，开始转换...');
              const converted = convertOneHubFormat(pricingData);
              if (Array.isArray(converted)) {
                pricingData.data = converted;
                console.log(`✅ OneHub格式转换成功: ${converted.length} 个模型`);
              } else {
                throw new Error('/pricing 接口返回OneHub格式但转换失败');
              }
            }
            
            if (!pricingData.success || !pricingData.data || !Array.isArray(pricingData.data)) {
              throw new Error('/pricing 接口数据格式错误');
            }
            
            // 从 pricing data 中提取模型名称，根据令牌组过滤
            let filteredData = pricingData.data;
            
            if (tokenGroup && tokenGroup.trim() !== '') {
              console.log(`🔍 应用令牌组过滤: "${tokenGroup}"`);
              filteredData = pricingData.data.filter(item => {
                // enable_groups 可能是字符串或数组
                const groups = item.enable_groups;
                if (!groups) {
                  // OneHub转换后的数据没有enable_groups，默认包含
                  console.log(`  ⚠️ 模型 ${item.model_name} 无令牌组信息，默认包含`);
                  return true;
                }
                
                if (typeof groups === 'string') {
                  return groups === tokenGroup;
                } else if (Array.isArray(groups)) {
                  return groups.includes(tokenGroup);
                }
                return false;
              });
              console.log(`✓ 过滤后剩余 ${filteredData.length} 个模型`);
            }
            
            upstreamModels = filteredData.map(item => item.model_name);
            usedFallback = true;
            console.log(`✅ 从 /pricing 提取到 ${upstreamModels.length} 个模型`);
            
          } else {
            throw error;
          }
        }
        
        // 步骤2: 如果有自定义模型选择，过滤模型列表
        let finalModels = upstreamModels;
        if (customModels && Array.isArray(customModels) && customModels.length > 0) {
          console.log(`🎯 应用自定义模型选择，从 ${upstreamModels.length} 个中筛选 ${customModels.length} 个`);
          finalModels = upstreamModels.filter(model => customModels.includes(model));
          
          if (finalModels.length === 0) {
            throw new Error('自定义模型选择与可用模型列表不匹配');
          }
          
          console.log(`✅ 筛选后剩余 ${finalModels.length} 个模型`);
        }
        
        // 步骤3: 处理模型名称（添加前缀）
        const modelsWithPrefix = finalModels.map(modelName => {
          return prefix ? `${prefix}${modelName}` : modelName;
        });
        
        console.log('📝 处理后的模型列表（前3个）:', modelsWithPrefix.slice(0, 3));
        
        // 步骤4: 生成 model_mapping（映射关系）
        const modelMapping = {};
        finalModels.forEach(originalName => {
          const nameWithPrefix = prefix ? `${prefix}${originalName}` : originalName;
          modelMapping[nameWithPrefix] = originalName;
        });
        
        console.log('🗺️ 生成的 model_mapping（前3个）:',
          Object.entries(modelMapping).slice(0, 3).reduce((obj, [k, v]) => {
            obj[k] = v;
            return obj;
          }, {})
        );
        
        // 步骤4: 获取渠道当前配置
        console.log('📖 读取渠道当前配置...');
        const channelResponse = await fetch(`${apiUrl}/api/channel/${channelId}`, {
          method: 'GET',
          headers: headers,
          credentials: 'include'
        });
        
        if (!channelResponse.ok) {
          throw new Error(`获取渠道配置失败 (HTTP ${channelResponse.status})`);
        }
        
        const channelData = await channelResponse.json();
        console.log('📦 渠道当前配置:', channelData);
        
        if (!channelData.success || !channelData.data) {
          throw new Error('获取渠道配置失败');
        }
        
        const currentChannel = channelData.data;
        
        // 步骤5: 更新渠道配置
        console.log('🔄 准备更新渠道配置...');
        
        // 更新 headers 添加 Content-Type
        const updateHeaders = {
          ...headers,
          'Content-Type': 'application/json'
        };
        
        // 构建更新数据（保留其他字段，只更新 models 和 model_mapping）
        const updateData = {
          ...currentChannel,
          models: modelsWithPrefix.join(','),
          model_mapping: JSON.stringify(modelMapping)
        };
        
        console.log('📤 发送更新请求:', {
          url: `${apiUrl}/api/channel/`,
          modelsCount: modelsWithPrefix.length,
          mappingCount: Object.keys(modelMapping).length
        });
        
        const updateResponse = await fetch(`${apiUrl}/api/channel/`, {
          method: 'PUT',
          headers: updateHeaders,
          credentials: 'include',
          body: JSON.stringify(updateData)
        });
        
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('❌ 更新失败:', errorText);
          throw new Error(`更新渠道配置失败 (HTTP ${updateResponse.status}): ${errorText}`);
        }
        
        const updateResult = await updateResponse.json();
        console.log('✅ 更新结果:', updateResult);
        
        if (!updateResult.success) {
          throw new Error(`更新渠道配置失败: ${updateResult.message || '未知错误'}`);
        }
        
        sendResponse({
          success: true,
          stats: {
            totalModels: finalModels.length,
            originalModels: upstreamModels.length,
            prefix: prefix || '(无)',
            channelId: channelId,
            usedFallback: usedFallback,
            customSelection: customModels ? true : false
          },
          message: usedFallback
            ? '无法直接获取模型列表，已从定价信息中提取'
            : (customModels ? `已应用自定义模型选择 (${finalModels.length}/${upstreamModels.length})` : undefined)
        });
      }
      else if (request.action === 'createChannel') {
        // 创建渠道
        const { channelData } = request;
        
        console.log('🔧 开始创建渠道:', channelData);
        
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'Content-Type': 'application/json',
          'New-API-User': cookieData.newApiUser
        };
        
        // 发送创建请求
        const response = await fetch(`${apiUrl}/api/channel/`, {
          method: 'POST',
          headers: headers,
          credentials: 'include',
          body: JSON.stringify({
            mode: 'single',
            channel: channelData
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ 创建渠道失败:', errorText);
          throw new Error(`创建渠道失败 (HTTP ${response.status}): ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ 渠道创建结果:', result);
        
        if (!result.success) {
          throw new Error(`创建渠道失败: ${result.message || '未知错误'}`);
        }
        
        sendResponse({
          success: true,
          data: result.data
        });
      }
      else if (request.action === 'createVendor') {
        // 创建供货商
        const { vendorData } = request;
        
        console.log('🏭 开始创建供货商:', vendorData);
        
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'Content-Type': 'application/json',
          'New-API-User': cookieData.newApiUser
        };
        
        // 发送创建请求
        const response = await fetch(`${apiUrl}/api/vendors/`, {
          method: 'POST',
          headers: headers,
          credentials: 'include',
          body: JSON.stringify(vendorData)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ 创建供货商失败:', errorText);
          throw new Error(`创建供货商失败 (HTTP ${response.status}): ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ 供货商创建结果:', result);
        
        if (!result.success) {
          throw new Error(`创建供货商失败: ${result.message || '未知错误'}`);
        }
        
        sendResponse({
          success: true,
          data: result.data
        });
      }
      else if (request.action === 'createModel') {
        // 创建模型配置
        const { modelData } = request;
        
        console.log('📦 开始创建模型配置:', modelData);
        
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'Content-Type': 'application/json',
          'New-API-User': cookieData.newApiUser
        };
        
        // 发送创建请求
        const response = await fetch(`${apiUrl}/api/models/`, {
          method: 'POST',
          headers: headers,
          credentials: 'include',
          body: JSON.stringify(modelData)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ 创建模型配置失败:', errorText);
          throw new Error(`创建模型配置失败 (HTTP ${response.status}): ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ 模型配置创建结果:', result);
        
        if (!result.success) {
          throw new Error(`创建模型配置失败: ${result.message || '未知错误'}`);
        }
        
        sendResponse({
          success: true,
          data: result.data
        });
      }
      else if (request.action === 'generateSQL') {
        // 生成 SQL
        const { results, prefix } = request;
        const { sql, stats } = generateSQL(results, prefix);
        
        sendResponse({
          success: true,
          sql: sql,
          stats: stats
        });
      }
      else if (request.action === 'fetchChannelModels') {
        // 获取渠道可用模型列表（用于模型选择弹窗）
        const { channelId } = request;
        
        console.log(`📋 开始获取渠道 ${channelId} 的可用模型列表...`);
        
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'New-API-User': cookieData.newApiUser
        };
        
        try {
          // 调用 fetch_models API 获取模型列表
          const fetchModelsUrl = `${apiUrl}/api/channel/fetch_models/${channelId}`;
          console.log(`📡 请求模型列表: ${fetchModelsUrl}`);
          
          const modelsResponse = await fetch(fetchModelsUrl, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          });

          if (!modelsResponse.ok) {
            // 特别处理404错误和其他常见错误
            if (modelsResponse.status === 404) {
              console.warn(`⚠️ 模型列表接口返回404，可能是渠道不支持或接口不存在`);
              // 返回空数组而不是抛出错误
              sendResponse({
                success: true,
                models: [],
                channelId: channelId,
                warning: '渠道不支持模型列表获取'
              });
              return;
            } else if (modelsResponse.status === 401 || modelsResponse.status === 403) {
              console.warn(`⚠️ 模型列表接口认证失败 (HTTP ${modelsResponse.status})`);
              sendResponse({
                success: false,
                error: `认证失败，请检查登录状态 (HTTP ${modelsResponse.status})`
              });
              return;
            }
            throw new Error(`获取模型列表失败 (HTTP ${modelsResponse.status})`);
          }
          
          const modelsData = await modelsResponse.json();
          console.log('📦 模型列表数据:', modelsData);
          
          if (!modelsData.success || !modelsData.data) {
            throw new Error('模型列表数据格式错误');
          }
          
          let modelList = [];
          
          // 处理不同的数据格式
          if (Array.isArray(modelsData.data)) {
            // 直接是数组格式
            modelList = modelsData.data;
          } else if (modelsData.data.models && typeof modelsData.data.models === 'string') {
            // models 字段是逗号分隔的字符串
            modelList = modelsData.data.models.split(',').map(name => name.trim()).filter(name => name);
          } else if (modelsData.data.models && Array.isArray(modelsData.data.models)) {
            // models 字段是数组
            modelList = modelsData.data.models;
          } else {
            throw new Error('无法解析模型列表数据格式');
          }
          
          console.log(`✅ 获取到 ${modelList.length} 个可用模型`);
          
          sendResponse({
            success: true,
            models: modelList,
            channelId: channelId
          });
          
        } catch (error) {
          console.error('获取渠道模型列表失败:', error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      }
      else if (request.action === 'getChannelDetails') {
        // 获取渠道详情（包括当前模型列表）
        const { channelId } = request;
        
        console.log(`📋 开始获取渠道 ${channelId} 的详情...`);
        
        const apiUrl = getCurrentApiUrl();
        
        // 获取认证信息
        const cookieData = await getCookiesFromAPI(apiUrl);
        if (!cookieData || !cookieData.success || !cookieData.newApiUser) {
          throw new Error('无法获取登录状态，请确保已登录 New API 后台');
        }
        
        const headers = {
          'New-API-User': cookieData.newApiUser
        };
        
        try {
          // 获取渠道详情
          const channelResponse = await fetch(`${apiUrl}/api/channel/${channelId}`, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          });
          
          if (!channelResponse.ok) {
            throw new Error(`获取渠道详情失败 (HTTP ${channelResponse.status})`);
          }
          
          const channelData = await channelResponse.json();
          console.log('📦 渠道详情数据:', channelData);
          
          if (!channelData.success || !channelData.data) {
            throw new Error('渠道详情数据格式错误');
          }
          
          const channel = channelData.data;
          
          // 解析模型列表
          let currentModels = [];
          if (channel.models && typeof channel.models === 'string') {
            currentModels = channel.models.split(',').map(name => name.trim()).filter(name => name);
          }
          
          console.log(`✅ 获取到渠道详情，当前有 ${currentModels.length} 个模型`);
          
          sendResponse({
            success: true,
            channel: {
              id: channel.id,
              name: channel.name,
              models: currentModels,
              model_mapping: channel.model_mapping || '',
              baseUrl: channel.base_url,
              tag: channel.tag
            }
          });
          
        } catch (error) {
          console.error('获取渠道详情失败:', error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      }
    } catch (error) {
      // 记录详细错误信息
      await logError(request.action || 'unknown', error, {
        requestData: {
          action: request.action,
          hasUpstreamUrl: !!request.upstreamUrl,
          hasResults: !!request.results,
          resultsCount: request.results?.length
        }
      });
      
      sendResponse({
        success: false,
        error: error.message,
        errorDetails: {
          name: error.name,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'), // 前3行堆栈
          timestamp: Date.now()
        }
      });
    }
  })();
  
  // 返回 true 表示异步响应
  return true;
});

  console.log('✅ PriceSyncPro Extension Content Script 加载完成');
}