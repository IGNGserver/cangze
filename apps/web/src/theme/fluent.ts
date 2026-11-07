import type { ThemeConfig } from 'antd';

/**
 * Fluent 2 design tokens mapped onto antd. Values follow the Fluent 2 web palette
 * (brand ramp around #0F6CBD, neutral greys, 4/8/12 px corner radii, layered shadows).
 */
const FONT =
  '"Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", Roboto, "Helvetica Neue", sans-serif';

export const BRAND = {
  light: '#0F6CBD',
  lightHover: '#115EA3',
  lightActive: '#0F548C',
  dark: '#479EF5',
  darkHover: '#62ABF5',
  darkActive: '#2886DE',
};

export const LAYOUT = {
  railWidth: 80,
  siderWidth: 280,
  agentSiderWidth: 300,
  settingsMenuWidth: 220,
  headerHeight: 60,
  contentMaxWidth: 840,
  wideContentMaxWidth: 960,
  paddingXS: 8,
  paddingSM: 12,
  paddingMD: 16,
  paddingLG: 24,
  gapXS: 6,
  gapSM: 8,
  gapMD: 12,
  gapLG: 16,
  gapXL: 24,
};

const shared: ThemeConfig['token'] = {
  fontFamily: FONT,
  fontSize: 14,
  borderRadius: 6,
  borderRadiusLG: 10,
  borderRadiusSM: 6,
  borderRadiusXS: 4,
  controlHeight: 32,
  wireframe: false,
  motionDurationFast: '0.1s',
  motionDurationMid: '0.15s',
  motionDurationSlow: '0.25s',
  motionEaseInOut: 'cubic-bezier(0.33, 0, 0.67, 1)',
  motionEaseOut: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
  colorSuccess: '#107C10',
  colorWarning: '#DA3B01',
  colorError: '#C50F1F',
};

export function fluentTheme(mode: 'light' | 'dark'): ThemeConfig {
  const dark = mode === 'dark';
  return {
    cssVar: { key: 'cz' },
    token: {
      ...shared,
      colorPrimary: dark ? BRAND.dark : BRAND.light,
      colorInfo: dark ? BRAND.dark : BRAND.light,
      colorLink: dark ? BRAND.dark : BRAND.light,
      colorText: dark ? '#FFFFFF' : '#242424',
      colorTextSecondary: dark ? '#D6D6D6' : '#5C5C5C',
      colorTextTertiary: dark ? '#A6A6A6' : '#707070',
      colorBgLayout: dark ? '#181818' : '#F3F3F3',
      colorFillAlter: dark ? '#202020' : '#FAFAFA',
      colorBgContainer: dark ? '#262626' : '#FFFFFF',
      colorBgElevated: dark ? '#2E2E2E' : '#FFFFFF',
      colorBorder: dark ? '#454545' : '#D6D6D6',
      colorBorderSecondary: dark ? '#333333' : '#E6E6E6',
      colorFillSecondary: dark ? '#333333' : '#EFEFEF',
      colorFillTertiary: dark ? '#2C2C2C' : '#F5F5F5',
      boxShadow: '0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
      boxShadowSecondary: '0 4px 8px rgba(0,0,0,0.12), 0 0 2px rgba(0,0,0,0.1)',
      boxShadowTertiary: '0 2px 4px rgba(0,0,0,0.08), 0 0 2px rgba(0,0,0,0.08)',
    },
    components: {
      Layout: {
        siderBg: dark ? '#181818' : '#F3F3F3',
        headerBg: dark ? '#181818' : '#F3F3F3',
        bodyBg: dark ? '#181818' : '#F3F3F3',
      },
      Card: { borderRadiusLG: 10, paddingLG: 20 },
      Button: {
        fontWeight: 500,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        borderRadius: 6,
        borderRadiusSM: 6,
      },
      Input: {
        borderRadius: 6,
        borderRadiusSM: 6,
        borderRadiusLG: 8,
      },
      Select: {
        borderRadius: 6,
        borderRadiusSM: 6,
        borderRadiusLG: 8,
      },
      Menu: {
        itemBorderRadius: 6,
        itemHeight: 36,
        itemMarginBlock: 2,
        itemMarginInline: 4,
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: dark ? '#333333' : '#EAEAEA',
        itemSelectedColor: dark ? '#FFFFFF' : '#242424',
      },
      Modal: { borderRadiusLG: 12 },
      Drawer: { paddingLG: 20 },
      Tabs: { inkBarColor: dark ? BRAND.dark : BRAND.light },
      Segmented: {
        trackBg: dark ? '#1A1A1A' : '#EDEDED',
        itemSelectedBg: dark ? '#333333' : '#FFFFFF',
        borderRadius: 6,
        borderRadiusSM: 6,
        borderRadiusXS: 5,
      },
      Tag: { borderRadiusSM: 5 },
      Table: {
        borderRadius: 8,
        headerBg: dark ? '#202020' : '#FAFAFA',
        borderColor: dark ? '#333333' : '#EBEBEB',
      },
      Switch: { colorPrimary: dark ? BRAND.dark : BRAND.light },
    },
  };
}
