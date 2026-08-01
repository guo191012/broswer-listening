# Vibcoding Request Monitor

一个 Manifest V3 浏览器插件, 用 React + Vite + TypeScript + antd 构建。

## 能力

- 在任意被访问的网页右下角嵌入一个浮动小圆点 (Shadow DOM 隔离, 不污染宿主页面)。
- 点击圆点 → 右侧滑出配置 + 日志面板。
- 在面板里配置 "网站 host + 接口匹配规则" (子串 / 精确 / 正则; 可指定 HTTP 方法)。
- 当被监控的网站发起匹配规则命中的请求时:
  - 在浏览器 DevTools Console 打印: `[vibcoding-ext] 监听到 <接口名> 接口发送请求了: <METHOD> <URL>`
  - 在面板 "日志" Tab 追加一条记录。
  - 浮动圆点闪一次红 (1.5s)。
- 配置跨设备同步 (chrome.storage.sync), 日志本地存储 (chrome.storage.local, 最近 200 条)。

## 工程化

| 命令 | 说明 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | `vite build --watch --mode development` — 监听源码变更, 未压缩 + sourcemap 产物输出到 `dist/`. 编辑源文件秒级重打包. |
| `npm run build` | `tsc --noEmit` 类型检查 + `vite build --mode production` — esbuild 压缩, 分包. 产物落 `dist/`. |
| `npm run typecheck` | 仅类型检查 |
| `npm run preview` | 本地预览产物 (http://localhost:5174) |
| `npm run clean` | 删除 `dist/` |

## 开发流程

1. `npm install`
2. `npm run dev` (后台运行, watch 模式)
3. 打开 `chrome://extensions/` → 打开 "开发者模式" → "加载已解压的扩展程序" → 选择 `dist/` 目录
4. 首次加载:
   - 第一次进入时, `dist/` 里只有 `manifest.json` / `background.js` / `content.js` / `icon.png`, 直接可加载
5. 编辑源码 → vite 自动重新打包到 `dist/` → 在 `chrome://extensions/` 页面点击刷新按钮 → 刷新目标页面即可看到效果
6. 准备发布时, `npm run build` 生成压缩产物

> 提示: Chrome 不允许内容脚本 HMR (沙箱限制), `npm run dev` 的 watch 模式提供 "类 HMR" 体验: 改源码 → 秒级重打包 → 手动刷新扩展 + 页面. 这是扩展开发的现实约束, 详见 `docs/01-architecture.md` §8.

## 项目结构

```
.
├── docs/
│   ├── 01-architecture.md        # 架构文档
│   └── 02-design.md              # 视觉与交互设计
├── public/
│   ├── manifest.json             # MV3 manifest (构建时会被复制到 dist/)
│   └── icon.png                  # 占位图标
├── src/
│   ├── background/
│   │   └── index.ts              # Service Worker: 监听 webRequest
│   ├── content/
│   │   ├── index.tsx             # Content Script 入口
│   │   ├── App.tsx               # 顶层组件 + 状态机
│   │   ├── FloatingDot.tsx       # 右下角小圆点
│   │   ├── SidePanel.tsx         # 右侧滑出面板
│   │   ├── ConfigForm.tsx        # 站点 / 规则编辑
│   │   ├── LogList.tsx           # 命中日志列表
│   │   ├── shadow.ts             # Shadow DOM 工具
│   │   └── styles.css            # Shadow 内部样式
│   └── shared/
│       ├── types.ts              # 类型定义
│       ├── storage.ts            # chrome.storage 包装
│       ├── matcher.ts            # URL / host 匹配
│       ├── messaging.ts          # 消息总线
│       └── console.ts            # 控制台输出格式化
├── vite.config.ts                # 多入口 MV3 构建配置
├── tsconfig.json                 # strict TS
└── package.json
```

## 调试

- 背景脚本 console: `chrome://extensions/` → 点击 "Service Worker" 链接 (蓝色 "inspect views: service worker").
- 内容脚本 console: 任意目标页面 → DevTools → Console, 过滤 `vibcoding-ext`.
- 配置存储位置: DevTools → Application → Storage → Extension storage.

## 兼容性

- Chrome / Edge 116+ (MV3 + service worker)
- Firefox 暂未验证 (manifest 需少量调整: `background.service_worker` → `background.scripts`)

## 许可

MIT
