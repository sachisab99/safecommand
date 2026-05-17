/**
 * FestivalBanner — BR-23 read-only "elevated posture" indicator for the
 * mobile home. Self-contained + FAIL-SAFE: fetches venue independently,
 * renders nothing on loading / error / inactive, never throws (sibling of
 * the task list — cannot affect it). Self-refreshes every 30s (matches the
 * active-drill poll cadence) so it reflects a command toggle without
 * coupling to TasksScreen's load path.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fetchVenue } from '../services/venue';
import { useColours, spacing, fontSize, fontWeight, radius, type Colours } from '../theme';

export function FestivalBanner(): React.JSX.Element | null {
  const c = useColours();
  const s = makeStyles(c);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      void fetchVenue()
        .then(({ data }) => {
          if (alive && data) setActive(data.festival_mode === true);
        })
        .catch(() => {
          /* fail-safe — stay inactive */
        });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!active) return null;

  return (
    <View style={s.banner}>
      <Text style={s.icon}>⚡</Text>
      <Text style={s.text}>
        <Text style={s.bold}>Festival / Event Mode active</Text> — elevated safety posture.
        Heightened vigilance across all zones.
      </Text>
    </View>
  );
}

function makeStyles(c: Colours) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: '#f59e0b',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    icon: { fontSize: fontSize.h6 },
    text: { flex: 1, color: '#451a03', fontSize: fontSize.small },
    bold: { fontWeight: fontWeight.bold, color: '#451a03' },
  });
}
