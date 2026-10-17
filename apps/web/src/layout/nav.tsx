import {
  Bot24Filled,
  Bot24Regular,
  bundleIcon,
  ChatMultiple24Filled,
  ChatMultiple24Regular,
  DocumentBulletList24Filled,
  DocumentBulletList24Regular,
  Flow24Filled,
  Flow24Regular,
  Home24Filled,
  Home24Regular,
  Settings24Filled,
  Settings24Regular,
} from '@fluentui/react-icons';
import type { FluentIcon } from '@fluentui/react-icons';

export interface NavItem {
  key: string;
  path: string;
  icon: FluentIcon;
  labelKey: string;
}

export const NAV: NavItem[] = [
  {
    key: 'sessions',
    path: '/sessions',
    icon: bundleIcon(ChatMultiple24Filled, ChatMultiple24Regular),
    labelKey: 'nav.sessions',
  },
  { key: 'agents', path: '/agents', icon: bundleIcon(Bot24Filled, Bot24Regular), labelKey: 'nav.agents' },
  {
    key: 'automations',
    path: '/automations',
    icon: bundleIcon(Flow24Filled, Flow24Regular),
    labelKey: 'nav.automations',
  },
  {
    key: 'devices',
    path: '/devices',
    icon: bundleIcon(Home24Filled, Home24Regular),
    labelKey: 'nav.devices',
  },
  {
    key: 'logs',
    path: '/logs',
    icon: bundleIcon(DocumentBulletList24Filled, DocumentBulletList24Regular),
    labelKey: 'nav.logs',
  },
  {
    key: 'settings',
    path: '/settings',
    icon: bundleIcon(Settings24Filled, Settings24Regular),
    labelKey: 'nav.settings',
  },
];
