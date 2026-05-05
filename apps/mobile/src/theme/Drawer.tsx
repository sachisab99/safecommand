/**
 * Drawer — slide-over navigation, mobile.
 *
 * Per UX-DESIGN-DECISIONS.md responsive Phase 1: 5-group categorization
 * (PRIMARY / OPERATIONS / COMPLIANCE / PEOPLE / SETTINGS), familiar consumer
 * mental model, scales to 30+ items.
 *
 * Mobile-specific shape:
 *   - Triggered by ☰ icon in screen header (consumer wires this in retrofit)
 *   - Slide-in from left, semi-transparent backdrop
 *   - Tap backdrop OR tap nav item → close + navigate
 *   - Swipe-from-edge support deferred (requires gesture-handler in Phase B)
 *
 * Theme-aware: uses useColours() + tokens. WCAG 2.1 AA compliant on
 * SafeCommand default + Apollo override (validated via colours.ts helpers).
 *
 * Drawer composition is data-driven — consumer passes a `groups` prop.
 * This keeps the drawer route-agnostic so it works for SH, GS, GM screens
 * with different feature subsets visible per role.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  spacing,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  zIndex,
  duration,
  touch,
  shadow,
} from './tokens';
import { useColours } from './colours';
import { useBrand } from './ThemeProvider';

// ──────────────────────────────────────────────────────────────────────────
// Types

export type DrawerGroupKey =
  | 'PRIMARY'
  | 'OPERATIONS'
  | 'COMPLIANCE'
  | 'PEOPLE'
  | 'SETTINGS';

export interface DrawerItem {
  /** Stable key for the item — used as React key + analytics id */
  key: string;
  /** Visible label — pass through useLabel() at the call site if branded */
  label: string;
  /** Optional emoji or single-character glyph (real icons in Phase B) */
  icon?: string;
  /** Optional small badge (e.g. unread count, NEW pill) */
  badge?: string;
  /** Disabled state — renders muted, ignores press */
  disabled?: boolean;
  /** Selected state — renders highlighted */
  selected?: boolean;
  /** Tap handler — drawer auto-closes after if onItemPress provided */
  onPress: () => void;
}

export interface DrawerGroup {
  key: DrawerGroupKey;
  /** Group section title — capitalised in render */
  title: string;
  items: DrawerItem[];
}

export interface DrawerHeaderInfo {
  /** Initials for avatar circle (max 2 chars) */
  initials: string;
  /** Primary line — usually staff name */
  primaryText: string;
  /** Secondary line — usually role + venue */
  secondaryText?: string;
}

export interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Header context block */
  header: DrawerHeaderInfo;
  /** Up to 5 groups in display order */
  groups: DrawerGroup[];
  /** Footer terminal action — typically logout */
  footerAction?: {
    label: string;
    onPress: () => void;
    /** 'danger' adds red emphasis (used for logout) */
    tone?: 'default' | 'danger';
  };
  /** Drawer width as fraction of screen (default: 0.82 = ~330dp on phone) */
  widthFraction?: number;
  style?: StyleProp<ViewStyle>;
}

// ──────────────────────────────────────────────────────────────────────────
// Component

export function Drawer({
  visible,
  onClose,
  header,
  groups,
  footerAction,
  widthFraction = 0.82,
  style,
}: DrawerProps): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const slide = useRef(new Animated.Value(-1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  // shouldRender controls Modal mount; lags `visible=false` until close
  // animation completes so the modal isn't unmounted mid-flight (which
  // strands Animated.Values and breaks subsequent opens).
  const [shouldRender, setShouldRender] = useState<boolean>(visible);

  useEffect(() => {
    if (visible) {
      // Reset to closed state explicitly so a stale value from an
      // interrupted previous animation cannot persist across opens.
      slide.setValue(-1);
      fade.setValue(0);
      setShouldRender(true);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: duration.normal,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: duration.normal,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (shouldRender) {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: -1,
          duration: duration.normal,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: duration.normal,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        // Only unmount the Modal once the close animation is done.
        // If a new open() raced in during animation, `visible` is now
        // true and we leave shouldRender alone.
        if (finished) setShouldRender(false);
      });
    }
  }, [visible, slide, fade, shouldRender]);

  return (
    <Modal
      visible={shouldRender}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: c.background,
            width: `${widthFraction * 100}%`,
            transform: [
              {
                translateX: slide.interpolate({
                  inputRange: [-1, 0],
                  outputRange: ['-100%', '0%'],
                }),
              },
            ],
          },
          shadow.xl,
          style,
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: brand.primary_colour }]}>
          <View style={[styles.avatar, { backgroundColor: c.textInverse }]}>
            <Text style={[styles.avatarText, { color: brand.primary_colour }]}>
              {header.initials.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.headerPrimary, { color: c.textInverse }]} numberOfLines={1}>
            {header.primaryText}
          </Text>
          {header.secondaryText !== undefined && (
            <Text
              style={[styles.headerSecondary, { color: c.textInverse, opacity: 0.85 }]}
              numberOfLines={1}
            >
              {header.secondaryText}
            </Text>
          )}
        </View>

        {/* Scrolling group list */}
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {groups.map((group, idx) => (
            <View key={group.key} style={idx > 0 ? styles.groupSpaced : undefined}>
              <Text style={[styles.groupTitle, { color: c.textMuted }]}>
                {group.title.toUpperCase()}
              </Text>
              {group.items.map((item) => (
                <DrawerRow
                  key={item.key}
                  item={item}
                  onClose={onClose}
                  primaryColour={brand.primary_colour}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        {/* Footer */}
        {footerAction !== undefined && (
          <View style={[styles.footer, { borderTopColor: c.divider }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                footerAction.onPress();
              }}
              style={({ pressed }) => [
                styles.footerButton,
                { backgroundColor: pressed ? c.surfaceMuted : 'transparent' },
              ]}
              hitSlop={touch.hitSlop}
            >
              <Text
                style={[
                  styles.footerLabel,
                  {
                    color:
                      footerAction.tone === 'danger' ? c.severity.SEV1 : c.textPrimary,
                  },
                ]}
              >
                {footerAction.label}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Internal — drawer row

interface DrawerRowProps {
  item: DrawerItem;
  onClose: () => void;
  primaryColour: string;
}

function DrawerRow({ item, onClose, primaryColour }: DrawerRowProps): React.JSX.Element {
  const c = useColours();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled: item.disabled, selected: item.selected }}
      disabled={item.disabled}
      onPress={() => {
        onClose();
        item.onPress();
      }}
      style={({ pressed }) => [
        styles.rowBase,
        {
          backgroundColor: item.selected
            ? primaryColour + '14' // ~8% opacity tint
            : pressed
              ? c.surfaceMuted
              : 'transparent',
          opacity: item.disabled ? 0.4 : 1,
          borderLeftColor: item.selected ? primaryColour : 'transparent',
        },
      ]}
      hitSlop={touch.hitSlop}
    >
      <View style={styles.rowLeading}>
        {item.icon !== undefined && (
          <Text style={styles.rowIcon} accessibilityElementsHidden>
            {item.icon}
          </Text>
        )}
        <Text
          style={[
            styles.rowLabel,
            {
              color: item.selected ? primaryColour : c.textPrimary,
              fontWeight: item.selected ? fontWeight.semibold : fontWeight.medium,
            },
          ]}
        >
          {item.label}
        </Text>
      </View>
      {item.badge !== undefined && (
        <View style={[styles.badge, { backgroundColor: primaryColour }]}>
          <Text style={[styles.badgeText, { color: c.textInverse }]}>{item.badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Trigger — exported for screens to render the ☰ button

export interface DrawerTriggerProps {
  onPress: () => void;
  /** Override the icon glyph (default: '☰') */
  icon?: string;
  /** Accessibility label (default: 'Open menu') */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function DrawerTrigger({
  onPress,
  icon = '☰',
  label = 'Open menu',
  style,
}: DrawerTriggerProps): React.JSX.Element {
  const c = useColours();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={touch.hitSlop}
      style={({ pressed }) => [
        styles.trigger,
        { backgroundColor: pressed ? c.surfaceMuted : 'transparent' },
        style,
      ]}
    >
      <Text style={[styles.triggerIcon, { color: c.textPrimary }]}>{icon}</Text>
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Styles

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: zIndex.overlay,
  },
  backdropTouch: {
    flex: 1,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: zIndex.drawer,
  },
  header: {
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.bold,
  },
  headerPrimary: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.bold,
  },
  headerSecondary: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    marginTop: spacing.xs,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingVertical: spacing.lg,
  },
  groupSpaced: {
    marginTop: spacing.lg,
  },
  groupTitle: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.widest,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  rowBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: touch.minTarget,
    borderLeftWidth: 3,
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowIcon: {
    fontSize: fontSize.h6,
    width: 24,
    textAlign: 'center',
  },
  rowLabel: {
    fontSize: fontSize.bodyLarge,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  footerButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: touch.minTarget,
    justifyContent: 'center',
  },
  footerLabel: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.semibold,
  },
  trigger: {
    width: touch.minTarget,
    height: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  triggerIcon: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.bold,
  },
});
