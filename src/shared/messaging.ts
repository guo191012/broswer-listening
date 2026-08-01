/**
 * 类型化消息总线
 * background <-> content 之间, 统一走这条管道.
 */

import type { AppConfig, LogEntry } from './types';

export const MessageType = {
  REQUEST_HIT: 'REQUEST_HIT',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  GET_CONFIG: 'GET_CONFIG',
  LOG_PAUSED: 'LOG_PAUSED',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export interface RequestHitMessage {
  type: typeof MessageType.REQUEST_HIT;
  payload: LogEntry;
}

export interface ConfigUpdatedMessage {
  type: typeof MessageType.CONFIG_UPDATED;
  payload: AppConfig;
}

export interface GetConfigMessage {
  type: typeof MessageType.GET_CONFIG;
}

export interface LogPausedMessage {
  type: typeof MessageType.LOG_PAUSED;
  payload: { paused: boolean };
}

export type ExtensionMessage =
  | RequestHitMessage
  | ConfigUpdatedMessage
  | GetConfigMessage
  | LogPausedMessage;

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === MessageType.REQUEST_HIT ||
    t === MessageType.CONFIG_UPDATED ||
    t === MessageType.GET_CONFIG ||
    t === MessageType.LOG_PAUSED
  );
}
