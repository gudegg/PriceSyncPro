# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**PriceSyncPro** 是一个为 New API 和 One Hub 平台设计的 Chrome 浏览器扩展 (Manifest V3),提供智能价格同步功能。

### 核心特性
- 🚀 **一键自动配置**: 自动创建渠道、供货商和模型配置
- ⚡ **智能同步**: 无需手动 SQL,自动判断同步策略
- 🔄 **批量更新**: 支持批量更新所有渠道价格
- 🛡️ **安全认证**: 通过浏览器 Cookie 认证,无需暴露 API Token

### 技术栈
- **纯原生技术**: JavaScript (ES6+) + CSS3 + HTML5
- **零外部依赖**: 无 npm 包,完全自包含
- **Manifest V3**: 最新的 Chrome 扩展标准
- **代码规模**: 约 6,000 行

### 架构优势
- ✅ **轻量级**: 零依赖,扩展体积小
- ✅ **高性能**: 原生实现,无框架开销
- ✅ **易维护**: 代码直观,调试简单
- ✅ **安全性**: Cookie 认证,避免 Token 泄露

## 开发环境设置

### 加载扩展 (无需构建)
```bash
1. 打开 chrome://extensions/
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录 (e:\code_go\PriceSyncPro)
```

### 重新加载扩展
```bash
chrome://extensions/ → 找到 PriceSyncPro → 点击刷新按钮 (或 Ctrl+R)
```

### 调试技巧

**查看不同层级的日志**:
```javascript
// Popup 日志: 右键扩展图标 → "检查弹出窗口" → Console
console.log('Popup:', data);

// Content Script 日志: 在目标页面按 F12 → Console
console.log('Content:', data);

// Background 日志: chrome://extensions/ → Service Worker → "检查视图"
console.log('Background:', data);
```

## 核心架构

### 三层分离架构

```
┌─────────────────────────────────────────────────────┐
│  Popup UI Layer                                     │
│  - popup.html (1,535 行)                            │
│  - popup.js (2,571 行)                              │
│  ├─ 双模式切换 (快速同步 / 自动配置)                    │
│  ├─ 表单验证和状态管理                                 │
│  └─ 渲染同步结果表格                                   │
└──────────────────┬──────────────────────────────────┘
                   │ chrome.runtime.sendMessage
                   │ chrome.tabs.executeScript
                   ↓
┌─────────────────────────────────────────────────────┐
│  Content Script Layer                               │
│  - content.js (1,541 行)                            │
│  ├─ 价格推断引擎 (众数投票算法)                         │
│  ├─ API 数据格式转换 (New API / One Hub)              │
│  ├─ 配置更新逻辑 (ModelPrice/ModelRatio)              │
│  └─ SQL 生成器 (智能合并策略)                          │
└──────────────────┬──────────────────────────────────┘
                   │ chrome.runtime.sendMessage
                   ↓
┌─────────────────────────────────────────────────────┐
│  Background Service Worker                          │
│  - background.js (324 行)                           │
│  ├─ Cookie 管理 (支持多域名和父域名)                    │
│  ├─ CORS 请求代理 (绕过跨域限制)                        │
│  └─ Cloudflare 验证绕过 (标签页脚本注入)                │
└─────────────────────────────────────────────────────┘
```

## 关键模块位置

| 功能模块 | 文件路径 | 行号范围 |
|----------|----------|----------|
| 价格推断引擎 | [content.js](content.js#L165-L544) | L165-L544 |
| Cloudflare 验证绕过 | [background.js](background.js#L100-L244) | L100-L244 |
| API 格式转换 | [content.js](content.js#L44-L148) | L44-L148 |
| 双模式切换逻辑 | [popup.js](popup.js#L288-L378) | L288-L378 |
| 配置预设管理 | [popup.js](popup.js#L1775-L2120) | L1775-L2120 |
| SQL 生成器 | [content.js](content.js#L714-L835) | L714-L835 |
| 智能同步入口 | [popup.js](popup.js#L908-L1010) | L908-L1010 |

## 核心技术点

### 1. 智能价格推断引擎

**位置**: [content.js:165-544](content.js#L165-L544)

**核心算法**:
1. **模型名清理**: 去除描述性后缀,保留版本号
2. **官方价格库匹配**: 156 个主流模型的官方价格 ([official_prices.json](official_prices.json))
3. **众数投票算法**: 分析上游隐藏基础价,使用众数投票选择最可靠价格
4. **数据驱动回退**: 多层回退策略确保总能得到合理价格

**关键函数**:
- `extractOriginalModelName()`: 标准化模型名
- `extractSmartModelName()`: 智能提取带前缀的模型名
- `inferPrices()`: 价格推断核心逻辑

### 2. Cloudflare 验证绕过

**位置**: [background.js:100-244](background.js#L100-L244)

**问题**: 部分上游使用 Cloudflare 人机验证,导致 HTTP 403 错误

**解决方案**:
1. **尝试 1**: 直接 fetch (带完整浏览器请求头)
2. **尝试 2**: 标签页注入方案
   - 打开隐藏标签页访问目标 URL
   - 等待 Cloudflare 验证完成 (5-10 秒随机延迟)
   - 注入脚本发起真实浏览器请求
   - 自动关闭标签页
3. **尝试 3**: 重试机制 (最多 3 次,指数退避)

**技术亮点**: 完全自动化,用户无感知,模拟真实浏览器行为

### 3. 多格式兼容层 (适配器模式)

**位置**: [content.js:44-148](content.js#L44-L148)

**支持的 API 格式**:
1. **New API 格式**: `/api/pricing`
2. **One Hub 官方格式**: `/api/available_model` (数组格式)
3. **One Hub 实例格式**: `/panel/model_price` (对象格式)

**核心逻辑**:
- `convertOneHubFormat()`: 智能检测并转换 One Hub 格式
- 价格单位自动转换: One Hub 内部单位 / 500 = 美元
- 计费类型映射: `quota_type` (0=按量, 1=按次)

### 4. 双模式工作流

**位置**: [popup.js:288-378](popup.js#L288-L378)

**快速同步模式** (日常更新):
- 智能判断: 选择渠道 → 完整同步 (模型列表 + 价格)
- 未选择渠道 → 快速更新 (仅价格)

**自动配置模式** (首次对接):
1. 创建渠道 (`POST /api/channel/`)
2. 创建供货商 (`POST /api/provider/`)
3. 创建模型配置 (`POST /api/model/`)
4. 自动触发完整同步

**模式切换**: `switchMode()` 函数统一管理 UI 状态和输入框同步

## 代码规范

### Git 提交规范

遵循 **Conventional Commits**:
```
feat: 新增功能
fix: Bug 修复
refactor: 重构
docs: 文档更新
chore: 构建/工具链变更
perf: 性能优化
test: 测试相关
```

**示例**:
```bash
git commit -m "feat: 添加批量更新所有渠道功能"
git commit -m "fix: 修复自动配置模式前缀问题并添加 URL 记忆功能 (v2.1.2)"
```

### 分支管理

- **主分支**: `main` (稳定版本)
- **开发分支**: `feature/xxx` (新功能开发)
- **当前活跃分支**: `feature/claude`, `feature/deepseek`, `feature/glm` 等

### 版本管理

- **CHANGELOG.md**: 详细记录每个版本的变更
- **版本号格式**: `v{major}.{minor}.{patch}` (如 v2.1.2)
- **重要**: 发布新版本时需同步更新:
  - [manifest.json](manifest.json) 中的 `version` 字段
  - [README.md](README.md) 中的版本号
  - [CHANGELOG.md](CHANGELOG.md) 中的版本历史

## 已知问题与改进建议

### 高优先级

1. **版本号不一致**
   - 当前状态: manifest.json (v1.2.1), README.md (v2.1.0), CHANGELOG.md (v2.1.2)
   - 需要: 统一更新为最新版本

2. **缺少单元测试**
   - 核心算法 (价格推断引擎、格式转换) 无测试覆盖
   - 建议: 添加 Jest + Chrome Extension Testing Library

3. **代码重复**
   - [popup.js](popup.js) 中 URL 验证逻辑重复
   - 建议: 提取为 `utils/validators.js` 工具模块

### 中优先级

4. **缺少代码检查工具**
   - 建议: 添加 ESLint + Prettier 配置

5. **魔法数字**
   - 硬编码的延迟时间 (如 `sleep(5000)`)、重试次数
   - 建议: 提取为命名常量

6. **类型安全**
   - 建议: 添加 JSDoc 注解或渐进式迁移到 TypeScript

## 性能优化

### 已实施的优化

1. **DocumentFragment 批量插入** ([popup.js](popup.js))
   ```javascript
   const fragment = document.createDocumentFragment();
   results.forEach(row => fragment.appendChild(createRow(row)));
   tbody.appendChild(fragment); // 一次性插入,减少 DOM 重排
   ```

2. **防抖处理** ([popup.js](popup.js))
   ```javascript
   upstreamUrlInput.addEventListener('input', () => {
     clearTimeout(window._matchTimeout);
     window._matchTimeout = setTimeout(() => {
       autoMatchChannelFromUrl();
     }, 500); // 500ms 防抖
   });
   ```

3. **按需加载**
   - Content Script 仅在需要时通过 `chrome.scripting.executeScript` 注入
   - 官方价格数据库 ([official_prices.json](official_prices.json)) 仅在第一次使用时加载

### 可进一步优化

- **虚拟滚动**: 模型列表超过 100 项时考虑虚拟列表
- **请求缓存**: 对频繁请求的 URL 添加内存缓存 (15 分钟有效期)

## 设计模式应用

### 1. 适配器模式 (Adapter)
- **应用**: [content.js:44-148](content.js#L44-L148) 中的 API 格式转换
- **目的**: 统一 3 种不同 API 格式到标准接口
- **体现 SOLID**: 开放封闭原则 (OCP) - 新增格式无需修改核心逻辑

### 2. 策略模式 (Strategy)
- **应用**: [content.js:165-544](content.js#L165-L544) 价格推断的多层回退策略
- **目的**: 根据数据质量动态选择推断算法
- **体现 SOLID**: 单一职责原则 (SRP) - 每个策略独立实现

### 3. 单例模式 (Singleton)
- **应用**: `officialPrices` 全局缓存
- **目的**: 避免重复加载 JSON 数据库

### 4. 观察者模式 (Observer)
- **应用**: `chrome.runtime.onMessage.addListener` 跨脚本通信
- **目的**: Popup ↔ Content ↔ Background 解耦通信

## 重要文件说明

- [manifest.json](manifest.json): Chrome 扩展清单,定义权限和入口文件
- [popup.html](popup.html): 扩展弹出窗口的 UI 结构
- [popup.js](popup.js): UI 逻辑、事件处理、状态管理
- [content.js](content.js): 核心同步引擎,价格推断和 SQL 生成
- [background.js](background.js): 后台服务,Cookie 管理和 CORS 处理
- [official_prices.json](official_prices.json): 156 个主流模型的官方价格数据库
- [README.md](README.md): 用户文档
- [CHANGELOG.md](CHANGELOG.md): 版本更新日志

## 开发工作流

### 常用命令

**无构建步骤** - 项目为纯静态文件,直接加载即可

### Git 工作流

```bash
# 切换到主分支
git checkout main

# 创建新功能分支
git checkout -b feature/new-feature

# 提交变更 (遵循 Conventional Commits)
git add .
git commit -m "feat: 添加新功能描述"

# 推送到远程
git push origin feature/new-feature

# 合并到主分支 (通过 Pull Request)
```

### 发布新版本

1. 更新版本号:
   - [manifest.json](manifest.json) → `version` 字段
   - [README.md](README.md) → 版本号说明

2. 更新 [CHANGELOG.md](CHANGELOG.md):
   ```markdown
   ## [v2.1.3] - 2025-12-06
   ### Added
   - 新增功能描述

   ### Fixed
   - Bug 修复描述
   ```

3. 提交并打标签:
   ```bash
   git add .
   git commit -m "chore: 发布 v2.1.3"
   git tag v2.1.3
   git push origin main --tags
   ```

## 核心编程原则

项目遵循以下原则:

- **KISS (简单至上)**: 纯原生技术,无复杂构建流程
- **YAGNI (精益求精)**: 专注核心功能,避免过度设计
- **DRY (杜绝重复)**: 统一的工具函数和数据格式
- **SOLID**:
  - **SRP**: 每个函数单一职责 (如 `convertOneHubFormat` 只负责格式转换)
  - **OCP**: 通过 `generateNameVariants` 扩展匹配策略,无需修改核心逻辑
- **Doc Sync**: CHANGELOG.md 与代码变更同步更新

## 技术债务

当前需要关注的技术债务:

1. ✅ **优先**: 统一版本号 (manifest.json, README.md, CHANGELOG.md)
2. ✅ **优先**: 添加单元测试覆盖核心算法
3. ⚠️ **中等**: 提取重复的验证逻辑为工具函数
4. ⚠️ **中等**: 添加 ESLint/Prettier 配置
5. ⚠️ **中等**: 将魔法数字提取为命名常量
6. 💡 **低**: 添加 JSDoc 注解提升类型安全
