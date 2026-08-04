import { useMemo, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Tag,
  Tooltip,
  message,
  Empty,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  GlobalOutlined,
  ApiOutlined,
  LinkOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type {
  AppConfig,
  HttpMethod,
  InterfaceConfig,
  MatchType,
  SiteConfig,
} from '../shared/types';
import { isValidRegex } from '../shared/matcher';

interface Props {
  config: AppConfig;
  currentHost: string | null;
  onChange: (next: AppConfig) => void;
  onRemoveLogs: (siteId: string) => void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'substring', label: '子串匹配' },
  { value: 'exact', label: '精确匹配' },
  { value: 'regex', label: '正则表达式' },
];

const METHOD_OPTIONS: { value: HttpMethod; label: string }[] = [
  { value: 'ANY', label: '任意方法' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'PATCH', label: 'PATCH' },
];

interface InterfaceFormValues {
  name: string;
  pattern: string;
  matchType: MatchType;
  method: HttpMethod;
  enabled: boolean;
}

export function ConfigForm({ config, currentHost, onChange, onRemoveLogs }: Props) {
  const [editing, setEditing] = useState<InterfaceConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [sitesModalOpen, setSitesModalOpen] = useState(false);
  const [hostInput, setHostInput] = useState('');
  const [form] = Form.useForm<InterfaceFormValues>();

  // 自定义确认弹窗状态 (不用 antd Popconfirm, 避免其在 Shadow DOM 内 onConfirm 不触发)
  type ConfirmTarget =
    | { kind: 'iface'; id: string; label: string }
    | { kind: 'site'; id: string; label: string }
    | null;
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);

  function handleConfirmOk(): void {
    if (!confirmTarget) return;
    if (confirmTarget.kind === 'iface') {
      handleDelete(confirmTarget.id);
    } else {
      handleRemoveSite(confirmTarget.id);
    }
    setConfirmTarget(null);
  }

  const currentSite = useMemo<SiteConfig | null>(() => {
    if (!currentHost) return null;
    return config.sites.find((s) => s.enabled && siteMatches(s.host, currentHost)) ?? null;
  }, [config.sites, currentHost]);

  function siteMatches(siteHost: string, tabHost: string): boolean {
    const s = siteHost.trim().toLowerCase();
    const t = tabHost.toLowerCase();
    if (s === t) return true;
    if (s.startsWith('*.')) {
      const base = s.slice(2);
      return t === base || t.endsWith(`.${base}`);
    }
    return false;
  }

  function upsertSite(host: string): SiteConfig {
    const found = config.sites.find((s) => s.host === host);
    if (found) return found;
    return {
      id: newId('site'),
      host,
      enabled: true,
      interfaces: [],
    };
  }

  function patchCurrentSite(mutator: (s: SiteConfig) => SiteConfig): void {
    if (!currentHost) return;
    const host = hostInput.trim() || currentHost;
    // 优先基于已通配匹配到的站点操作 (如 *.doubao.com 与当前 www.doubao.com 匹配)
    // 而不是按 host 精确重新查找, 否则会把删除/编辑作用到新建的错误站点上.
    const baseSite = currentSite ?? upsertSite(host);
    const updated = mutator(baseSite);
    const existed = config.sites.some((s) => s.id === baseSite.id);
    const next: AppConfig = {
      ...config,
      sites: existed
        ? config.sites.map((s) => (s.id === baseSite.id ? updated : s))
        : [...config.sites, updated],
    };
    onChange(next);
  }

  function handleStartCreate(): void {
    if (!currentHost) {
      void message.warning('当前页面无法识别 host, 请通过"管理所有站点"添加');
      return;
    }
    setHostInput(currentHost);
    form.resetFields();
    form.setFieldsValue({
      name: '',
      pattern: '',
      matchType: 'substring',
      method: 'ANY',
      enabled: true,
    });
    setCreating(true);
  }

  function handleStartEdit(iface: InterfaceConfig): void {
    form.resetFields();
    form.setFieldsValue({
      name: iface.name,
      pattern: iface.pattern,
      matchType: iface.matchType,
      method: iface.method,
      enabled: iface.enabled,
    });
    setEditing(iface);
  }

  function handleSubmitForm(): void {
    form
      .validateFields()
      .then((values) => {
        if (values.matchType === 'regex' && !isValidRegex(values.pattern)) {
          void message.error('正则表达式不合法');
          return;
        }
        patchCurrentSite((site) => {
          if (editing) {
            return {
              ...site,
              interfaces: site.interfaces.map((i) =>
                i.id === editing.id
                  ? {
                      ...i,
                      name: values.name.trim(),
                      pattern: values.pattern,
                      matchType: values.matchType,
                      method: values.method,
                      enabled: values.enabled,
                    }
                  : i,
              ),
            };
          }
          const created: InterfaceConfig = {
            id: newId('iface'),
            name: values.name.trim(),
            pattern: values.pattern,
            matchType: values.matchType,
            method: values.method,
            enabled: values.enabled,
          };
          return { ...site, interfaces: [...site.interfaces, created] };
        });
        setEditing(null);
        setCreating(false);
        void message.success('已保存');
      })
      .catch(() => {
        /* 表单校验失败 */
      });
  }

  function handleDelete(id: string): void {
    console.info('[vibcoding-ext] 删除规则, id=', id, 'currentSite=', currentSite?.id, 'host=', currentSite?.host, 'configSites=', config.sites.map((s) => `${s.id}:${s.host}:${s.interfaces.length}条`));
    // 直接在所有站点里按接口 id 全局过滤, 不依赖"当前站点"匹配, 保证一定能删掉
    const next: AppConfig = {
      ...config,
      sites: config.sites.map((site) =>
        site.interfaces.some((i) => i.id === id)
          ? { ...site, interfaces: site.interfaces.filter((i) => i.id !== id) }
          : site,
      ),
    };
    onChange(next);
  }

  function handleToggleSite(enabled: boolean): void {
    if (!currentSite) {
      patchCurrentSite((s) => ({ ...s, enabled }));
      return;
    }
    const next: AppConfig = {
      ...config,
      sites: config.sites.map((s) =>
        s.id === currentSite.id ? { ...s, enabled } : s,
      ),
    };
    onChange(next);
  }

  function handleRemoveSite(siteId: string): void {
    console.info('[vibcoding-ext] 删除站点, siteId=', siteId, '当前sites=', config.sites.map((s) => `${s.id}:${s.host}`));
    const next: AppConfig = {
      ...config,
      sites: config.sites.filter((s) => s.id !== siteId),
    };
    onChange(next);
    // 清理该站点相关的日志
    onRemoveLogs(siteId);
    void message.success('站点已删除');
  }

  const methodColorMap: Record<string, string> = {
    GET: 'blue',
    POST: 'green',
    PUT: 'orange',
    DELETE: 'red',
    PATCH: 'purple',
    ANY: 'default',
  };

  return (
    <div className="config-section">
      {/* 当前网站卡片 */}
      <div className="config-card">
        <div className="config-card-header">
          <div className="config-card-title">
            <GlobalOutlined className="config-card-title-icon" />
            当前网站
          </div>
          <Switch
            checked={currentSite?.enabled ?? false}
            onChange={handleToggleSite}
            checkedChildren="启用"
            unCheckedChildren="停用"
          />
        </div>
        <div className="config-card-body">
          <Input
            className="config-input"
            value={hostInput || currentHost || ''}
            onChange={(e) => setHostInput(e.target.value)}
            placeholder="输入 host 或子域通配 (例如 *.example.com)"
            prefix={<LinkOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
          />
        </div>
      </div>

      {/* 接口规则列表 */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApiOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#595959' }}>
              接口规则
            </span>
            {currentSite && currentSite.interfaces.length > 0 && (
              <Tag color="blue" style={{ marginLeft: 4, borderRadius: 10, fontSize: 11 }}>
                {currentSite.interfaces.length}
              </Tag>
            )}
          </div>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleStartCreate}
            style={{ borderRadius: 8 }}
          >
            新增规则
          </Button>
        </div>

        {currentSite && currentSite.interfaces.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentSite.interfaces.map((iface) => (
              <div
                key={iface.id}
                style={{
                  background: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'box-shadow 0.2s ease',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Tag color={iface.enabled ? 'blue' : 'default'} style={{ borderRadius: 6, margin: 0 }}>
                      {iface.name}
                    </Tag>
                    <Tag
                      color={methodColorMap[iface.method] ?? 'default'}
                      style={{ borderRadius: 6, margin: 0, fontSize: 11 }}
                    >
                      {iface.method}
                    </Tag>
                    {iface.matchType !== 'substring' && (
                      <Tag
                        style={{ borderRadius: 6, margin: 0, fontSize: 11, color: '#8c8c8c', border: '1px solid #f0f0f0', background: 'transparent' }}
                      >
                        {iface.matchType === 'exact' ? '精确' : '正则'}
                      </Tag>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: '#8c8c8c',
                    fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {iface.pattern}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 12 }}>
                  <Tooltip title="编辑规则">
                    <Button
                      type="text"
                      size="small"
                      style={{ color: '#8c8c8c' }}
                      icon={<EditOutlined />}
                      onClick={() => handleStartEdit(iface)}
                    />
                  </Tooltip>
                  <Tooltip title="删除规则">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setConfirmTarget({
                          kind: 'iface',
                          id: iface.id,
                          label: iface.name,
                        })
                      }
                    />
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="config-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ color: '#bfbfbf', fontSize: 13 }}>
                  当前网站还没有监控规则
                  <br />
                  点击「新增规则」开始监听接口
                </span>
              }
            />
          </div>
        )}
      </div>

      {/* 管理所有站点 */}
      <div style={{ padding: '16px' }}>
        <Button
          type="dashed"
          block
          icon={<SettingOutlined />}
          onClick={() => setSitesModalOpen(true)}
          style={{ borderRadius: 10, height: 40 }}
        >
          管理所有站点 ({config.sites.length})
        </Button>
      </div>

      {/* 新增/编辑规则 Modal */}
      <Modal
        title={
          <span style={{ fontSize: 16, fontWeight: 700 }}>
            {editing ? '编辑规则' : '新增规则'}
          </span>
        }
        open={creating || editing !== null}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onOk={handleSubmitForm}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={440}
      >
        <Form form={form} layout="vertical" preserve={false} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="规则名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="例: 获取用户信息" prefix={<ApiOutlined style={{ color: '#bfbfbf' }} />} />
          </Form.Item>
          <Form.Item
            name="pattern"
            label="匹配规则"
            rules={[{ required: true, message: '请输入 pattern' }]}
            extra={
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const v = form.getFieldValue('pattern') as string | undefined;
                  const t = form.getFieldValue('matchType') as MatchType | undefined;
                  if (t === 'regex' && v && !isValidRegex(v)) {
                    return <span style={{ color: '#ff4d4f', fontSize: 12 }}>正则表达式不合法</span>;
                  }
                  return null;
                }}
              </Form.Item>
            }
          >
            <Input placeholder="例: /api/user/info" prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} />
          </Form.Item>
          <Form.Item name="matchType" label="匹配方式">
            <Select options={MATCH_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="method" label="HTTP 方法">
            <Select options={METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 所有站点 Modal */}
      <Modal
        title={<span style={{ fontSize: 16, fontWeight: 700 }}>所有站点</span>}
        open={sitesModalOpen}
        footer={null}
        onCancel={() => setSitesModalOpen(false)}
        width={500}
      >
        {config.sites.length === 0 ? (
          <Empty
            style={{ padding: '32px 0' }}
            description="暂无站点, 在目标网站打开面板添加"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {config.sites.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  background: '#fafbfd',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                    {s.host}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {s.interfaces.length} 条规则
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Switch
                    size="small"
                    checked={s.enabled}
                    onChange={(v) => {
                      const next: AppConfig = {
                        ...config,
                        sites: config.sites.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)),
                      };
                      onChange(next);
                    }}
                  />
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setConfirmTarget({ kind: 'site', id: s.id, label: s.host })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 删除确认 Modal (替代 Popconfirm, 避免 Shadow DOM 内 onConfirm 不触发) */}
      <Modal
        title={confirmTarget?.kind === 'site' ? '删除整站配置?' : '删除此规则?'}
        open={confirmTarget !== null}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onOk={handleConfirmOk}
        onCancel={() => setConfirmTarget(null)}
        destroyOnClose
      >
        {confirmTarget ? (
          <span>
            确定要删除「<b>{confirmTarget.label}</b>」吗？此操作不可恢复。
          </span>
        ) : null}
      </Modal>
    </div>
  );
}