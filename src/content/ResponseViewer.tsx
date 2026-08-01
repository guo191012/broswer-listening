import { useMemo } from 'react';
import { Modal, Button, Typography, Tag, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { LogEntry } from '../shared/types';

interface Props {
  log: LogEntry | null;
  onClose: () => void;
}

/**
 * 超大响应查看器:
 *  - JSON 语法高亮: key 蓝色, string 绿色, number 橙色, boolean/null 紫色
 *  - SSE 流式数据: 逐行显示
 *  - 复制按钮
 *  - 80% 宽度全屏 Modal
 */

function syntaxHighlight(text: string): string {
  if (!text.trim()) return '';
  // 尝试 JSON 解析: 纯 JSON 或 SSE 每行独立 JSON
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // 不是合法 JSON, 保留原始文本
    return text;
  }
}

function renderHighlighted(raw: string): string {
  if (!raw) return '';
  const formatted = syntaxHighlight(raw);
  return formatted.replace(
    /("(?:[^"\\]|\\.)*")\s*:|(\btrue\b|\bfalse\b|\bnull\b)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, key, bool, str, num) => {
      if (key) return `<span class="json-key">${key}</span>:`;
      if (bool) return `<span class="json-bool">${bool}</span>`;
      if (str) return `<span class="json-string">${str}</span>`;
      if (num) return `<span class="json-number">${num}</span>`;
      return match;
    },
  );
}

function formatResponseBody(body: string | null | undefined): string {
  if (!body) return '';
  return syntaxHighlight(body);
}

export function ResponseViewer({ log, onClose }: Props) {
  const highlightedHtml = useMemo(() => {
    if (!log?.responseBody) return '';
    return renderHighlighted(log.responseBody);
  }, [log?.responseBody]);

  if (!log) return null;

  const bodyText = formatResponseBody(log.responseBody);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bodyText);
      void message.success('已复制到剪贴板');
    } catch {
      void message.warning('复制失败');
    }
  };

  const statusColor = log.responseStatus
    ? log.responseStatus < 400 ? 'success' : 'error'
    : 'default';

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {log.interfaceName}
          </Typography.Text>
          <Tag color="blue">{log.method}</Tag>
          {log.responseStatus && <Tag color={statusColor}>{log.responseStatus}</Tag>}
        </div>
      }
      open={!!log}
      onCancel={onClose}
      width="80%"
      style={{ top: 24 }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {log.url}
          </Typography.Text>
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
        </div>
      }
      destroyOnClose
    >
      <div style={{
        background: '#1e1e1e',
        borderRadius: 8,
        padding: '16px 20px',
        maxHeight: 'calc(100vh - 280px)',
        overflow: 'auto',
        fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', 'Monaco', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        color: '#d4d4d4',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {log.responseBody ? (
          <div
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            style={{ margin: 0 }}
          />
        ) : (
          <Typography.Text style={{ color: '#6a6a6a', fontStyle: 'italic' }}>
            暂无响应内容
          </Typography.Text>
        )}
      </div>

      {/* JSON 语法高亮样式 */}
      <style>{`
        .json-key { color: #9cdcfe; }
        .json-string { color: #ce9178; }
        .json-number { color: #b5cea8; }
        .json-bool { color: #c586c0; }
      `}</style>
    </Modal>
  );
}