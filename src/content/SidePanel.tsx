import { useMemo } from 'react';
import { CloseOutlined, RadarChartOutlined, PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Tabs, Tooltip, Badge } from 'antd';
import { ConfigForm } from './ConfigForm';
import { LogList } from './LogList';
import type { AppConfig, LogEntry } from '../shared/types';

interface Props {
  open: boolean;
  currentHost: string | null;
  config: AppConfig;
  logs: LogEntry[];
  onClose: () => void;
  onConfigChange: (next: AppConfig) => void;
  onClearLogs: () => void;
  onTogglePaused: (paused: boolean) => void;
  onRemoveLogs: (siteId: string) => void;
}

const panelVariants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 36,
      mass: 0.8,
    },
  },
  exit: {
    x: '100%',
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 38,
      mass: 0.6,
    },
  },
};

export function SidePanel({
  open,
  currentHost,
  config,
  logs,
  onClose,
  onConfigChange,
  onClearLogs,
  onTogglePaused,
  onRemoveLogs,
}: Props) {
  const hitCount = useMemo(() => logs.length, [logs]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="panel"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="panel-header">
            <div className="panel-header-left">
              <div className="panel-title">
                <div className="panel-title-icon">
                  <RadarChartOutlined />
                </div>
                Vibcoding 监控
              </div>
              {currentHost && <div className="panel-host">{currentHost}</div>}
            </div>
            <button className="panel-close-btn" onClick={onClose} aria-label="关闭面板">
              <CloseOutlined />
            </button>
          </div>

          <div className="panel-body">
            <Tabs
              defaultActiveKey="config"
              size="middle"
              tabBarStyle={{
                padding: '0 24px',
                margin: 0,
                borderBottom: '1px solid #f0f0f0',
              }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
              items={[
                {
                  key: 'config',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      配置
                      {currentHost && config.sites.find((s) =>
                        s.host.trim().toLowerCase() === currentHost.toLowerCase() ||
                        (s.host.startsWith('*.') && currentHost.endsWith(s.host.slice(1)))
                      )?.enabled && (
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#52c41a', display: 'inline-block',
                        }} />
                      )}
                    </span>
                  ),
                  children: (
                    <ConfigForm
                      config={config}
                      currentHost={currentHost}
                      onChange={onConfigChange}
                      onRemoveLogs={onRemoveLogs}
                    />
                  ),
                },
                {
                  key: 'logs',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      日志
                      {hitCount > 0 && (
                        <Badge
                          count={hitCount}
                          size="small"
                          style={{ backgroundColor: '#1677ff' }}
                          overflowCount={999}
                        />
                      )}
                    </span>
                  ),
                  children: (
                    <>
                      <div className="toolbar">
                        <div className="toolbar-left">
                          <Tooltip title={config.paused ? '恢复监控' : '暂停监控'}>
                            <Button
                              type="text"
                              size="small"
                              icon={config.paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                              onClick={() => onTogglePaused(!config.paused)}
                              style={{ color: config.paused ? '#52c41a' : '#faad14' }}
                            />
                          </Tooltip>
                          {hitCount > 0 && (
                            <span className="toolbar-badge">{hitCount} 条命中</span>
                          )}
                        </div>
                        <Tooltip title="清空日志">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={onClearLogs}
                            disabled={hitCount === 0}
                          />
                        </Tooltip>
                      </div>
                      <LogList logs={logs} />
                    </>
                  ),
                },
              ]}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}