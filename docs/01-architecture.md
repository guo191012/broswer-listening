# Vibcoding Browser Extension — Architecture

## 1. 目标

一个 Chrome / Edge 浏览器插件 (Manifest V3),运行工程化项目。核心能力:

- 在任意被访问的网页右下角注入一个浮动小圆点。
- 点击圆点 → 右侧滑出配置 + 日志面板(Shadow DOM 隔离)。
- 用户在面板中配置: "站点列表" 与 "接口匹配规则"。
- 当被监控站点发起匹配规则命中的请求时,在浏览器 console 打印 `监听到 <接口名> 接口发送请求了`,并在面板日志区追加一条记录。

## 2. 技术栈

| 维度 | 选型 | 理由 |
|---|---|---|
| 视图 | React 18 + TypeScript strict | 与既有栈一致 |
| 构建 | Vite 5 + 多入口 IIFE | 不依赖 `@crxjs/vite-plugin`,可控、稳定 |
| UI 库 | antd v5 + @ant-design/icons | 用户指定 |
| 动效 | framer-motion | 侧滑面板 |
| 持久化 | chrome.storage.sync (配置) / chrome.storage.local (日志) | 同步 vs 大容量分工 |
| 样式隔离 | Shadow DOM | 不污染宿主页面,不被打扰 |
| 通讯 | chrome.runtime / chrome.tabs (typed) | MV3 标准 |

## 3. 模块划分

```
src/
├── background/
│   └── index.ts             # service worker,监听 webRequest
├── content/
│   ├── index.tsx            # 入口: 创建 Shadow DOM host, 挂载 React
│   ├── App.tsx              # FloatingDot + SidePanel 状态管理
│   ├── FloatingDot.tsx      # 右下角小圆点
│   ├── SidePanel.tsx        # 抽屉容器,framer-motion 控制开合
│   ├── ConfigForm.tsx       # 站点 + 接口规则编辑
│   ├── LogList.tsx          # 实时日志流
│   ├── shadow.ts            # Shadow host 工具
│   └── styles.css           # Shadow 内部样式
├── shared/
│   ├── types.ts             # Site / Interface / LogEntry / 消息类型
│   ├── storage.ts           # chrome.storage 包装, 类型化
│   ├── matcher.ts           # host + interface 匹配 (exact / substring / regex)
│   ├── messaging.ts         # 消息常量 + 守卫
│   └── console.ts           # 格式化 console.log
└── manifest.json            # MV3 manifest
```

## 4. 数据模型

```ts
interface SiteConfig {
  id: string;
  host: string;                      // 例如 "example.com", 匹配方式见下
  enabled: boolean;
  interfaces: InterfaceConfig[];
}

interface InterfaceConfig {
  id: string;
  name: string;                      // 用户起的可读名,用于 console 打印
  pattern: string;                   // 匹配字符串
  matchType: 'exact' | 'substring' | 'regex';
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ANY';
  enabled: boolean;
}

interface LogEntry {
  id: string;
  ts: number;
  siteId: string;
  siteHost: string;
  interfaceId: string;
  interfaceName: string;
  url: string;
  method: string;
}
```

- host 匹配: 子域名通配 `*.example.com` 支持 (`.endsWith('example.com')` 且不等同于 `example.com` 时要求 `xxx.example.com`)。
- interface pattern 匹配: 按 `matchType` 分支, regex 编译失败则该规则静默失活。

## 5. 消息总线

| 方向 | type | payload |
|---|---|---|
| background → content | `REQUEST_HIT` | `LogEntry` |
| content → background | `GET_CONFIG` | — |
| background → content | `CONFIG_UPDATED` | `AppConfig` |

## 6. 构建

- `vite.config.ts` 多入口: `background` (service worker, IIFE) + `content` (IIFE, 加载 CSS as `?inline`).
- `npm run dev`:
  - `vite build --watch --mode development --minify=false --sourcemap`
  - 监听源码变更, 未压缩产物输出到 `dist/`.
  - 用户在 `chrome://extensions` 加载 `dist/`, 改源码 → 重打包 → 刷新扩展即可.
- `npm run build`:
  - `vite build --mode production` (esbuild minify, chunk 拆分, file name 带 hash).
- 入口资源命名固定: `background.js` / `content.js` / `content.css` (走 manifest `web_accessible_resources` 备援), 便于 MV3 直接引用。

## 7. 安全与隔离

- Shadow DOM (`mode: 'open'`) 隔离 DOM/CSS, 避免破坏宿主页面。
- 注入节点使用 `position: fixed` + 高 `z-index`, 但同时给 Shadow root 加 `pointer-events` 控制, 不阻挡宿主点击 (圆点除外)。
- 配置数据不外发, 只用本地 chrome.storage。

## 8. 已知折中

- 不做扩展自动重载 (chrome.runtime.reload 在 service worker 内部有限制)。开发期用户需在 `chrome://extensions` 点刷新按钮, 这在 README 中说明, 不影响"产物自动重打包"。
- HMR 在 content script 内不可用 (受沙箱限制), 用 watch 重打包 + 刷新页面达到类 HMR 体验。
