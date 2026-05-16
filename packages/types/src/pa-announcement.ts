/**
 * BR-N — PA announcement auto-draft (Phase 5.22).
 *
 * Pure, deterministic generator shared by api + mobile + dashboard so the
 * auto-drafted text is identical everywhere:
 *   - api stores it in incident_evacuation_triggers.pa_text_generated
 *     (the immutable "what the system suggested" audit baseline)
 *   - mobile + dashboard prefill the editable PA field with it so the SH
 *     edits BEFORE broadcast; the edited text becomes pa_text_broadcast
 *
 * Design decisions (flagged):
 *   - The PA text is a CALM PUBLIC DIRECTIVE. The operational `reason` is
 *     deliberately NOT injected into the public announcement — it stays in
 *     the audit row. A panic-inducing reason read over a PA system is a
 *     life-safety hazard. SH may add context manually if appropriate.
 *   - English now (EC-15 i18n key emitted for every variant). Venue
 *     regional-language rendering is Phase B per mig 014 schema comment
 *     (`pa_language` column; translation table is Phase B). The i18nKey is
 *     emitted today so the regional layer is a drop-in later.
 *   - Wording follows NFPA 101 / NDMA guidance: clear, short, no jargon,
 *     "this is not a drill", "do not use lifts", named assembly behaviour.
 */

export type PaTriggerType =
  | 'ZONE_SELECTIVE'
  | 'FLOOR_SELECTIVE'
  | 'FULL_VENUE'
  | 'STAFF_TRIGGERED';

export interface PaAnnouncementInput {
  triggerType: PaTriggerType;
  /** Human zone names for selective/staff-triggered (NOT raw UUIDs). */
  zoneNames?: string[];
  /** Optional venue display name for the opening line. */
  venueName?: string;
}

export interface PaAnnouncementDraft {
  /** English fallback text (used now). */
  en: string;
  /** i18n key for the regional-language layer (Phase B). */
  i18nKey: string;
}

const NOT_A_DRILL = 'This is not a drill.';
const NO_LIFTS = 'Do not use the lifts.';

function zoneList(zoneNames?: string[]): string {
  const zs = (zoneNames ?? []).filter((z) => z && z.trim().length > 0);
  if (zs.length === 0) return 'the affected area';
  if (zs.length === 1) return zs[0]!;
  if (zs.length === 2) return `${zs[0]} and ${zs[1]}`;
  return `${zs.slice(0, -1).join(', ')}, and ${zs[zs.length - 1]}`;
}

/**
 * Build the auto-drafted PA announcement for an evacuation trigger.
 * Deterministic — same input always yields the same text.
 */
export function draftPaAnnouncement(input: PaAnnouncementInput): PaAnnouncementDraft {
  const open = input.venueName ? `Attention, ${input.venueName}. ` : 'Attention please. ';

  switch (input.triggerType) {
    case 'FULL_VENUE':
      return {
        i18nKey: 'sire.pa.full_venue',
        en:
          `${open}This is an emergency announcement. All occupants must evacuate the ` +
          `building now using the nearest marked exit. ${NO_LIFTS} Proceed calmly to ` +
          `the assembly point and follow staff instructions. ${NOT_A_DRILL}`,
      };

    case 'FLOOR_SELECTIVE':
      return {
        i18nKey: 'sire.pa.floor_selective',
        en:
          `${open}This is an emergency announcement. Occupants of ${zoneList(input.zoneNames)} ` +
          `must evacuate now using the nearest marked exit. ${NO_LIFTS} Proceed calmly to ` +
          `the assembly point. Staff will direct you. All other areas, please stand by ` +
          `for instructions. ${NOT_A_DRILL}`,
      };

    case 'ZONE_SELECTIVE':
    case 'STAFF_TRIGGERED':
    default:
      return {
        i18nKey: 'sire.pa.zone_selective',
        en:
          `${open}This is an emergency announcement. Occupants of ${zoneList(input.zoneNames)} ` +
          `must move now to a safe area using the nearest marked exit. ${NO_LIFTS} ` +
          `Follow staff directions to the assembly point. All other areas, please remain ` +
          `calm and stand by. ${NOT_A_DRILL}`,
      };
  }
}
