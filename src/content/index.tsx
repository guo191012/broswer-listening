/**
 * Content Script 入口
 *  - 创建 Shadow DOM host (样式隔离)
 *  - 在 Shadow 内挂载 React 应用
 *  - antd v5 CSS-in-JS 注入到 Shadow, 而非 document.head
 */

import { createRoot } from 'react-dom/client';
import { StyleProvider } from '@ant-design/cssinjs';
import { ConfigProvider } from 'antd';
import { App } from './App';
import { mountShadowRoot, injectMainWorldScript } from './shadow';

// 注入 MAIN world 脚本 (拦截 fetch/XHR 获取响应体)
injectMainWorldScript();

const handle = mountShadowRoot();
if (handle) {
  const { reactMount, root: shadowRoot } = handle;

  const root = createRoot(reactMount);
  root.render(
    <StyleProvider container={shadowRoot}>
      <ConfigProvider
        getPopupContainer={() => reactMount}
        theme={{
          token: {
            fontFamily: [
              '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
              'Roboto', '"Helvetica Neue"', 'Arial',
              '"PingFang SC"', '"Hiragino Sans GB"',
              '"Microsoft YaHei"', 'sans-serif',
            ].join(','),
            zIndexPopupBase: 1000,
          },
        }}
      >
        <App />
      </ConfigProvider>
    </StyleProvider>,
  );
} else {
  console.warn('[vibcoding-ext] 无法挂载 Shadow DOM, content script 退出');
}