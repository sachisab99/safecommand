/**
 * ErrorBoundary — contains a render fault to its subtree so one broken
 * section never red-screens the whole app/screen.
 *
 * Wrap any non-critical section (e.g. <SireSection/>) in this. If a child
 * throws during render, the boundary shows a calm themed fallback with a
 * "Try again" affordance instead of crashing the screen — the rest of the
 * screen (timeline, mark-safe, etc.) keeps working.
 *
 * React error boundaries must be class components. Theme tokens need hooks,
 * so the fallback is a separate function component the class renders.
 *
 * Uses the shared error catalog (RENDER_CRASH) for consistent copy.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { describeError } from '@safecommand/types';
import { useColours, spacing, fontSize, fontWeight, radius, type Colours } from '../theme';

const RENDER = describeError('RENDER_CRASH');

function Fallback({ label, onRetry }: { label?: string; onRetry: () => void }) {
  const c = useColours();
  const s = makeStyles(c);
  return (
    <View style={s.box}>
      <Text style={s.title}>{RENDER.title}</Text>
      <Text style={s.msg}>
        {label ? `The ${label} hit a problem. ` : ''}
        {RENDER.message}
      </Text>
      <TouchableOpacity style={s.btn} onPress={onRetry} activeOpacity={0.8}>
        <Text style={s.btnText}>↻ Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

interface Props {
  children: React.ReactNode;
  /** Short noun phrase, e.g. "incident response view" — used in the message. */
  label?: string;
}
interface State {
  hasError: boolean;
  resetCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, resetCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }): void {
    // Structured log (RENDER_CRASH). Hook Sentry here when wired (go-live item).
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        code: RENDER.code,
        category: RENDER.category,
        label: this.props.label ?? null,
        error: error instanceof Error ? error.message : String(error),
        componentStack: info?.componentStack?.split('\n').slice(0, 6).join(' | '),
      }),
    );
  }

  private retry = (): void => {
    this.setState((p) => ({ hasError: false, resetCount: p.resetCount + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <Fallback label={this.props.label} onRetry={this.retry} />;
    }
    // key bump forces the subtree to remount cleanly on retry
    return <React.Fragment key={this.state.resetCount}>{this.props.children}</React.Fragment>;
  }
}

function makeStyles(c: Colours) {
  return StyleSheet.create({
    box: {
      margin: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.borderStrong,
      gap: spacing.sm,
    },
    title: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold, color: c.textPrimary },
    msg: { fontSize: fontSize.body, color: c.textSecondary, lineHeight: 20 },
    btn: {
      alignSelf: 'flex-start',
      marginTop: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
      backgroundColor: c.primary,
    },
    btnText: { color: c.textOnPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.body },
  });
}
