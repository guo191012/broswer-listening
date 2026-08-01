import { useState } from 'react';
import { Tag } from 'antd';
import { CodeOutlined, RightOutlined, ExpandOutlined } from '@ant-design/icons';
import { ResponseViewer } from './ResponseViewer';
import type { LogEntry } from '../shared/types';

interface Props {
  logs: LogEntry[];
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatResponseBody(body: string | null | undefined): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

function LogItem({ log, onView }: { log: LogEntry; onView: (l: LogEntry) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = !!log.responseBody;

  return (
    <div>
      <div className="log-item">
        <div className="log-item-row">
          <span className="log-time">{fmtTime(log.ts)}</span>
          <span className={`log-method ${log.method}`}>{log.method}</span>
          <span className="log-name">{log.interfaceName}</span>
          {log.responseStatus && (
            <Tag
              color={log.responseStatus < 400 ? 'success' : 'error'}
              style={{ borderRadius: 6, margin: 0, fontSize: 11, lineHeight: '18px' }}
            >
              {log.responseStatus}
            </Tag>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }}>
            {hasBody && (
              <span
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                style={{ color: '#8c8c8c', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                title="展开/收起"
              >
                {expanded ? <RightOutlined style={{ transform: 'rotate(90deg)' }} /> : <RightOutlined />}
                <CodeOutlined />
              </span>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); onView(log); }}
              style={{ color: '#1677ff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
              title="查看完整响应"
            >
              <ExpandOutlined />
              查看响应
            </span>
          </span>
        </div>
        <div className="log-url">{log.url}</div>
      </div>
      {expanded && hasBody && (
        <div style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
          fontSize: 11,
          padding: '12px 24px',
          borderBottom: '1px solid #333',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 300,
          overflow: 'auto',
          lineHeight: 1.5,
        }}>
          {formatResponseBody(log.responseBody ?? '')}
        </div>
      )}
    </div>
  );
}

export function LogList({ logs }: Props) {
  const [viewingLog, setViewingLog] = useState<LogEntry | null>(null);

  return (
    <>
      <div className="log-list">
        {logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <CodeOutlined />
            </div>
            <div className="empty-state-text">暂无命中记录</div>
          </div>
        ) : (
          logs.map((l) => <LogItem key={l.id} log={l} onView={setViewingLog} />)
        )}
      </div>
      <ResponseViewer log={viewingLog} onClose={() => setViewingLog(null)} />
    </>
  );
}