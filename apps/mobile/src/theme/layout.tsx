/**
 * Layout primitives — phone-first responsive Phase 1.
 *
 * Per UX-DESIGN-DECISIONS.md responsive Phase 1 (deferred from May 2026,
 * bundled with ThemeProvider scaffold per Q3 decision). All primitives use
 * design-system tokens (spacing, colours) — never hardcoded values.
 *
 * Components:
 *   <Screen>     — top-level wrapper: SafeAreaView + StatusBar + theme bg
 *   <Container>  — horizontal padding + max-width (responsive Phase 1)
 *   <Stack>      — vertical flex with gap
 *   <Row>        — horizontal flex with gap
 *   <Spacer>     — flex-1 to push content apart
 *   <Divider>    — horizontal divider line using theme border colour
 *
 * SafeAreaView note: currently imports from 'react-native' (built-in,
 * deprecated). Migration to `react-native-safe-area-context` queued as a
 * Phase B work item (requires package.json change + lockfile bump). The
 * built-in works for our 4-platform target (iOS, Android with notch, no
 * notch).
 */

import React, { type ReactNode } from 'react';
import {
  View,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
  type ScrollViewProps,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { spacing, breakpoint, type SpacingToken } from './tokens';
import { useColours } from './colours';
import { useBrand } from './ThemeProvider';

// ──────────────────────────────────────────────────────────────────────────
// Screen — top-level wrapper

export interface ScreenProps {
  children: ReactNode;
  /** Override background colour (defaults to theme surface) */
  background?: string;
  /** Render scrollable content; passes through to ScrollView */
  scroll?: boolean;
  /** Apply horizontal padding (uses Container internally) */
  padded?: boolean;
  /** StatusBar bar style: 'light' for dark backgrounds, 'dark' for light */
  statusBarStyle?: 'light-content' | 'dark-content' | 'default';
  /** Additional style on the root SafeAreaView */
  style?: StyleProp<ViewStyle>;
  /** Forwarded to ScrollView when scroll=true */
  scrollProps?: Omit<ScrollViewProps, 'children' | 'style'>;
}

/**
 * Screen — every screen's outermost wrapper.
 *
 * Handles: safe area insets (notches), status bar styling, theme background.
 * Use <Container> inside for horizontal padding when needed.
 *
 * Usage:
 *   <Screen padded>
 *     <Stack gap="lg">
 *       <Text>...</Text>
 *     </Stack>
 *   </Screen>
 */
export function Screen({
  children,
  background,
  scroll = false,
  padded = false,
  statusBarStyle = 'dark-content',
  style,
  scrollProps,
}: ScreenProps): React.JSX.Element {
  const c = useColours();
  const bg = background ?? c.surface;
  const content = padded ? <Container>{children}</Container> : children;

  // SafeAreaView from 'react-native' applies inset padding only on iOS. On
  // Android it does NOT push content below the status bar, so headers can
  // overlap the time/battery/signal area. Compensate with explicit
  // paddingTop = StatusBar.currentHeight on Android (translucent statusbar
  // is the platform default for Expo apps).
  const androidStatusBarInset =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  return (
    <SafeAreaView
      style={[
        styles.screen,
        { backgroundColor: bg, paddingTop: androidStatusBarInset },
        style,
      ]}
    >
      <StatusBar barStyle={statusBarStyle} backgroundColor={bg} translucent />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Container — horizontal padding + responsive max-width

export interface ContainerProps {
  children: ReactNode;
  /** Horizontal padding token (default: 'lg' = 16) */
  paddingX?: SpacingToken;
  /** Vertical padding token (default: 'none') */
  paddingY?: SpacingToken;
  /** Max width breakpoint key — content centres on wider screens */
  maxWidth?: 'phone' | 'tablet' | 'desktop' | 'none';
  style?: StyleProp<ViewStyle>;
}

const MAX_WIDTH_PX: Record<NonNullable<ContainerProps['maxWidth']>, number | undefined> = {
  phone: breakpoint.phoneLarge,
  tablet: breakpoint.tablet,
  desktop: breakpoint.desktop,
  none: undefined,
};

export function Container({
  children,
  paddingX = 'lg',
  paddingY = 'none',
  maxWidth = 'phone',
  style,
}: ContainerProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const maxW = MAX_WIDTH_PX[maxWidth];
  const shouldCap = maxW !== undefined && width > maxW;

  return (
    <View
      style={[
        styles.containerBase,
        { paddingHorizontal: spacing[paddingX], paddingVertical: spacing[paddingY] },
        shouldCap && { maxWidth: maxW, alignSelf: 'center', width: '100%' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Stack — vertical flex with gap

export interface StackProps {
  children: ReactNode;
  /** Gap between children (default: 'md' = 12) */
  gap?: SpacingToken;
  /** Cross-axis alignment */
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  /** Main-axis distribution */
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  /** Make stack fill available height */
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Stack({
  children,
  gap = 'md',
  align,
  justify,
  flex,
  style,
}: StackProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.stackBase,
        { gap: spacing[gap] },
        align !== undefined && { alignItems: align },
        justify !== undefined && { justifyContent: justify },
        flex && styles.flex1,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Row — horizontal flex with gap

export interface RowProps extends Omit<StackProps, 'children'> {
  children: ReactNode;
  /** Allow wrapping to next line when content overflows */
  wrap?: boolean;
}

export function Row({
  children,
  gap = 'md',
  align = 'center',
  justify,
  flex,
  wrap,
  style,
}: RowProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.rowBase,
        { gap: spacing[gap] },
        { alignItems: align },
        justify !== undefined && { justifyContent: justify },
        flex && styles.flex1,
        wrap && styles.wrap,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Spacer — flex-1 push helper

/** Pushes adjacent siblings to opposite ends. Use inside Row/Stack. */
export function Spacer(): React.JSX.Element {
  return <View style={styles.flex1} />;
}

// ──────────────────────────────────────────────────────────────────────────
// Divider — horizontal divider line

export interface DividerProps {
  /** Vertical orientation (default: horizontal) */
  vertical?: boolean;
  /** Margin token applied to the divider */
  spacing?: SpacingToken;
}

export function Divider({ vertical, spacing: marginToken }: DividerProps = {}): React.JSX.Element {
  const c = useColours();
  const margin = marginToken ? spacing[marginToken] : 0;
  return (
    <View
      style={[
        vertical
          ? { width: 1, alignSelf: 'stretch', marginHorizontal: margin }
          : { height: 1, alignSelf: 'stretch', marginVertical: margin },
        { backgroundColor: c.divider },
      ]}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Hooks — responsive helpers

/**
 * useBreakpoint — returns the current matched breakpoint name.
 * Convenient for conditional rendering on tablet/desktop layouts.
 */
export function useBreakpoint(): keyof typeof breakpoint {
  const { width } = useWindowDimensions();
  if (width >= breakpoint.desktopLarge) return 'desktopLarge';
  if (width >= breakpoint.desktop) return 'desktop';
  if (width >= breakpoint.tabletLarge) return 'tabletLarge';
  if (width >= breakpoint.tablet) return 'tablet';
  if (width >= breakpoint.phoneLarge) return 'phoneLarge';
  return 'phone';
}

/** useIsTabletOrLarger — convenience boolean for layout swaps */
export function useIsTabletOrLarger(): boolean {
  const { width } = useWindowDimensions();
  return width >= breakpoint.tablet;
}

// ──────────────────────────────────────────────────────────────────────────
// Internal styles

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  containerBase: { width: '100%' },
  stackBase: { flexDirection: 'column' },
  rowBase: { flexDirection: 'row' },
  flex1: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
});

// ──────────────────────────────────────────────────────────────────────────
// Brand-aware re-exports for ergonomic single import in screens

export { useBrand } from './ThemeProvider';
export { useColours } from './colours';
