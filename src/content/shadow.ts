/**
 * Shadow DOM host 工具
 * 在 content script 内创建隔离容器, 避免与宿主页面 CSS 冲突.
 */

import cssText from './styles.css?inline';

const HOST_ID = 'vibcoding-monitor-root';

/**
 * 注入 MAIN world 脚本 (已废弃, 改用 manifest.json content_scripts world:MAIN 静态注入)
 */
export function injectMainWorldScript(): void {
  // 不再需要动态注入, 留空保持兼容
}

export interface ShadowHandle {
  host: HTMLElement;
  root: ShadowRoot;
  reactMount: HTMLDivElement;
  styleEl: HTMLStyleElement;
}

export function mountShadowRoot(): ShadowHandle | null {
  if (document.getElementById(HOST_ID)) {
    // 已存在则返回旧的 (frame 内重复注入场景)
    const existing = document.getElementById(HOST_ID)!;
    const root = existing.shadowRoot;
    if (root) {
      return {
        host: existing,
        root,
        reactMount: root.querySelector<HTMLDivElement>('#react-mount')!,
        styleEl: root.querySelector<HTMLStyleElement>('style')!,
      };
    }
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-vibcoding-ext', '1');
  host.setAttribute('aria-hidden', 'false');
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';

  const root = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = cssText;
  root.appendChild(styleEl);

  const reactMount = document.createElement('div');
  reactMount.id = 'react-mount';
  root.appendChild(reactMount);

  (document.body || document.documentElement).appendChild(host);
  return { host, root, reactMount, styleEl };
}
