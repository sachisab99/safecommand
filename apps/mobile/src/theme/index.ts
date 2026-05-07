/**
 * Theme barrel — single import surface for screens.
 *
 * Usage in any screen / component:
 *   import { useColours, useBrand, useLabel, Screen, Stack, Row, spacing, fontSize, radius } from '@/theme';
 *
 * EC-17 / Rule 19: every consumer reaches for theme tokens via this barrel.
 * Components should NOT import directly from 'react-native' StyleSheet for
 * colours, spacing, fontSize, etc. — always go through the theme.
 */

// Tokens (design-system layer — brand-agnostic)
export {
  spacing,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  radius,
  borderWidth,
  shadow,
  touch,
  breakpoint,
  zIndex,
  duration,
  opacity,
  tokens,
  type SpacingToken,
  type FontSizeToken,
  type FontWeightToken,
  type RadiusToken,
  type ShadowToken,
  type BreakpointToken,
  type ZIndexToken,
  type DurationToken,
  type Tokens,
} from './tokens';

// Brand layer (resolved at runtime)
export {
  ThemeProvider,
  SAFECOMMAND_DEFAULT,
  useBrand,
  useLabel,
  useRoleLabel,
  useIsEnterpriseBrand,
  type BrandConfig,
  type RoleOverrides,
  type ThemeProviderProps,
} from './ThemeProvider';

// Colours (semantic + WCAG)
export {
  slate,
  severity,
  status,
  zoneStatus,
  useColours,
  luminance,
  contrastRatio,
  pickContrast,
  passesWcagAA,
  passesWcagAALarge,
  type Colours,
} from './colours';

// Layout primitives
export {
  Screen,
  Container,
  Stack,
  Row,
  Spacer,
  Divider,
  useBreakpoint,
  useIsTabletOrLarger,
  type ScreenProps,
  type ContainerProps,
  type StackProps,
  type RowProps,
  type DividerProps,
} from './layout';

// Drawer
export {
  Drawer,
  DrawerTrigger,
  type DrawerProps,
  type DrawerTriggerProps,
  type DrawerItem,
  type DrawerGroup,
  type DrawerGroupKey,
  type DrawerHeaderInfo,
  type DrawerBanner,
} from './Drawer';
