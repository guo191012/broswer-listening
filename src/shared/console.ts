/**
 * 统一格式化 console 输出
 * background 与 content 各打印一份 (background 看不到页面 console, content 看得到).
 */

import type { LogEntry } from './types';

export function formatConsoleMessage(entry: LogEntry): string {
  return `监听到 ${entry.interfaceName} 接口发送请求了: ${entry.method} ${entry.url}`;
}
