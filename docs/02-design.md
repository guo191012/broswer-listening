# Vibcoding Browser Extension — Design Spec

## 1. 视觉与交互

### 1.1 浮动圆点 (FloatingDot)
- 位置: 固定右下, 距视口右下角 `24px`。
- 尺寸: 48 × 48 px, 圆形。
- 颜色: antd `@primary-color` (#1677ff), 阴影 `0 6px 16px rgba(0,0,0,.18)`。
- 图标: `<ApiOutlined />` 或 `<RadarChartOutlined />`, 18px 居中。
- Hover: 放大 1.08, 阴影加深, 200ms ease。
- 状态指示:
  - 蓝点: 当前站点已有规则配置。
  - 灰点: 当前站点无规则。
  - 红点 (闪): 最近 1s 内命中过 (呼吸 1.5s, 然后回到 蓝/灰)。
- Click: 切换面板开合。

### 1.2 侧边面板 (SidePanel)
- 宽度: 400px, 高度 100vh, 顶部 24px, 右侧 0。
- 进入方向: 自右向左, 250ms ease, framer-motion `x: 100%` → `x: 0`.
- 头部: 应用名 + 当前站点 (只读) + 关闭图标。
- 主体: 三段 (Tabs 或折叠区, 选 Tabs):
  1. **配置**: 当前站点规则编辑 + 全局站点列表。
  2. **日志**: 最近 200 条命中 (倒序), 每条可点开看 URL/Method。
  3. **关于**: 版本、仓库链接。

### 1.3 配置表单 (ConfigForm)
- 顶部卡片: 当前站点 host + 启用开关。
- 接口规则列表 (Table + Edit Modal):
  - 列: 名称 / 匹配方式 / Pattern / Method / 启用 / 操作
  - 新建/编辑弹窗: 表单, regex 失败给红色提示。
- 底部 "+ 新增接口规则" 按钮。
- 跨站点管理: 顶部按钮 "管理所有站点" → 打开 Modal 列出全部 SiteConfig。

### 1.4 日志列表 (LogList)
- 实时倒序滚动。
- 每条: 时间戳 (HH:mm:ss) + 接口名 + method + 截断 URL (hover 显示全文)。
- 空状态: 灰图标 + 提示文字。
- 顶部 "清空" 按钮 + "暂停" 开关 (暂停后不再追加, 但命中仍然打印 console)。

## 2. 交互时序

### 2.1 用户首次访问某站点
1. content script 注入, 创建 Shadow DOM host.
2. 读 storage 配置, 默认空 → 当前站点无规则 → 灰点。
3. 用户点开面板 → 配置 tab → 看到当前站点 host, 添加规则 → 保存 → 蓝点。

### 2.2 站点发起匹配请求
1. background `webRequest.onBeforeRequest` 触发.
2. 匹配 host → 启用 site → 遍历 interfaces, 命中其一 → 构造 `LogEntry`.
3. 通过 `chrome.tabs.sendMessage(tabId, { type: 'REQUEST_HIT', payload })` 推给 content script.
4. content script:
   - `console.info(\`[vibcoding-ext] 监听到 ${payload.interfaceName} 接口发送请求了: ${payload.url}\`)`
   - 面板若打开 → 追加到 LogList 顶部 (若未暂停).
   - 通知 dot 闪一次红。

## 3. 文案与文案默认

- console 输出前缀: `[vibcoding-ext]`.
- 空配置引导: "当前网站还没有监控规则, 点这里添加一条吧."
- regex 错误提示: "正则表达式不合法: ${error.message}"

## 4. 错误与边界

- 跨域 iframe 请求 (frameId !== 0) 也需要监控, 用 `chrome.webRequest.onBeforeRequest` 默认行为即可 (主 frame + 子 frame 都收到).
- host 包含端口: 不剥离, 用完整 host (含端口) 作为匹配键。
- 单条日志去重: 1s 内同 URL 不重复插入, 避免刷屏.
- 存储上限: chrome.storage.local 10MB, 日志超过 200 自动截断.

## 5. 主题与暗色模式

- 默认浅色, 不主动适配暗色 (避免与宿主页面双倍暗色).
- 未来可加.
