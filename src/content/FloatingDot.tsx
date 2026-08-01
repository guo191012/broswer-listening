import { findSiteForHost } from '../shared/matcher';
import type { AppConfig } from '../shared/types';

const ICON_URL = (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) ? chrome.runtime.getURL('icon.png') : '';
const FLASH_URL = (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) ? chrome.runtime.getURL('flash.png') : '';

interface Props {
  currentHost: string | null;
  config: AppConfig;
  onClick: () => void;
  isPending: boolean;
}

export function FloatingDot({ currentHost, config, onClick, isPending }: Props) {
  const site = currentHost ? findSiteForHost(config.sites, currentHost) : null;
  const disabled = !site;
  const ruleCount = site?.interfaces?.length ?? 0;

  const cls = ['dot', disabled ? 'disabled' : '', isPending ? 'pending' : ''].filter(Boolean).join(' ');
  const title = disabled
    ? '当前网站未配置监控规则\u2014\u2014点击打开面板'
    : `已配置 ${ruleCount} 条规则\u2014\u2014点击打开面板`;

  // pending 时显示 flash.png, 否则显示正常 icon.png
  const imgSrc = isPending && FLASH_URL ? FLASH_URL : ICON_URL;

  return (
    <div className="dot-wrap">
      <div className={cls} title={title} onClick={onClick} role="button" aria-label="Vibcoding 监控面板">
        {imgSrc ? (
          <img src={imgSrc} alt="Vibcoding" />
        ) : (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </div>
    </div>
  );
}