import { theme, type ThemeConfig } from 'antd';

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

const shared: ThemeConfig['token'] = {
  fontFamily: FONT,
  fontSize: 14,
  borderRadius: 4,
  borderRadiusLG: 8,
  borderRadiusSM: 2,
  borderRadiusXS: 2,
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
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: { key: 'cz' },
    token: {
      ...shared,
      colorPrimary: dark ? BRAND.dark : BRAND.light,
      colorInfo: dark ? BRAND.dark : BRAND.light,
      colorLink: dark ? BRAND.dark : BRAND.light,
      colorText: dark ? '#FFFFFF' : '#242424',
      colorTextSecondary: dark ? '#D6D6D6' : '#616161',
      colorTextTertiary: dark ? '#ADADAD' : '#707070',
      colorBgLayout: dark ? '#1F1F1F' : '#F5F5F5',
      colorBgContainer: dark ? '#292929' : '#FFFFFF',
      colorBgElevated: dark ? '#2E2E2E' : '#FFFFFF',
      colorBorder: dark ? '#666666' : '#D1D1D1',
      colorBorderSecondary: dark ? '#3D3D3D' : '#E0E0E0',
      colorFillSecondary: dark ? '#383838' : '#F0F0F0',
      boxShadow: '0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
      boxShadowSecondary: '0 4px 8px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
      boxShadowTertiary: '0 2px 4px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
    },
    components: {
      Layout: {
        siderBg: dark ? '#1F1F1F' : '#F5F5F5',
        headerBg: dark ? '#1F1F1F' : '#F5F5F5',
        bodyBg: dark ? '#1F1F1F' : '#F5F5F5',
      },
      Card: { borderRadiusLG: 8, paddingLG: 20 },
      Button: { fontWeight: 600, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
      Menu: {
        itemBorderRadius: 4,
        itemHeight: 36,
        itemBg: 'transparent',
        itemSelectedBg: dark ? '#333333' : '#EBEBEB',
        itemSelectedColor: dark ? '#FFFFFF' : '#242424',
      },
      Modal: { borderRadiusLG: 8 },
      Drawer: { paddingLG: 20 },
      Tabs: { inkBarColor: dark ? BRAND.dark : BRAND.light },
      Segmented: { itemSelectedBg: dark ? '#3D3D3D' : '#FFFFFF' },
      Switch: { colorPrimary: dark ? BRAND.dark : BRAND.light },
    },
  };
}
