// Drawer navigation configuration — 5 semantic groups per UX-DESIGN-DECISIONS.md §4.4.
// Items marked `enabled: false` render disabled (placeholder for upcoming BRs).
// Add new items to the right group based on mental-model fit.

export interface NavItem {
  id: string;
  label: string;
  icon: string;       // emoji or unicode symbol — keep simple in Phase 1
  href: string;
  enabled: boolean;
  newBadge?: boolean; // shows "NEW" pill until first opened
}

export interface NavGroup {
  id: 'primary' | 'operations' | 'compliance' | 'people' | 'settings';
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'primary',
    label: 'Primary',
    items: [
      { id: 'dashboard',      label: 'Dashboard',           icon: '▦',  href: '/dashboard',      enabled: true },
      { id: 'zones',          label: 'Zone Status',         icon: '🚦', href: '/zones',          enabled: true },
      { id: 'accountability', label: 'Zone Accountability', icon: '🗺',  href: '/accountability', enabled: true },
      { id: 'incidents',      label: 'Incidents',           icon: '⚡',  href: '/incidents',      enabled: true },
      { id: 'broadcast',      label: 'Broadcast',           icon: '📢', href: '/broadcast',      enabled: false, newBadge: true },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'tasks',     label: 'Tasks',           icon: '✓', href: '/tasks',     enabled: false },
      { id: 'handovers', label: 'Shift Handovers', icon: '⇄', href: '/handovers', enabled: false },
      { id: 'briefings', label: 'Briefings',       icon: '🎙', href: '/briefings', enabled: false },
      { id: 'visitors',  label: 'Visitors',        icon: '🪪', href: '/visitors',  enabled: false },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      { id: 'equipment',       label: 'Equipment',       icon: '🛠', href: '/equipment',       enabled: true },
      { id: 'drills',          label: 'Drills',          icon: '🔥', href: '/drills',          enabled: true },
      { id: 'certifications',  label: 'Certifications',  icon: '📜', href: '/certifications',  enabled: true },
      { id: 'audit',           label: 'Audit Logs',      icon: '🔍', href: '/audit',           enabled: false },
      { id: 'compliance-exports', label: 'Compliance Exports', icon: '📄', href: '/compliance/exports', enabled: false },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'staff',       label: 'Staff',                icon: '◉', href: '/staff',       enabled: true },
      { id: 'permissions', label: 'Roles & Permissions',  icon: '🔐', href: '/permissions', enabled: false },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { id: 'venue-profile', label: 'Venue Profile',   icon: '🏢', href: '/settings/venue',     enabled: false },
      { id: 'notifications', label: 'Notifications',   icon: '🔔', href: '/settings/notifications', enabled: false },
      { id: 'help',          label: 'FAQ & Help',      icon: '❓', href: '/help',               enabled: false },
      { id: 'support',       label: 'Contact Support', icon: '💬', href: '/support',            enabled: false },
    ],
  },
];

export const STAFF_ROLE_AVATAR_BG: Record<string, string> = {
  SH:               'bg-red-700',
  DSH:              'bg-orange-700',
  GM:               'bg-purple-700',
  SHIFT_COMMANDER:  'bg-blue-700',
  FLOOR_SUPERVISOR: 'bg-sky-700',
  FM:               'bg-teal-700',
  AUDITOR:          'bg-slate-600',
  GROUND_STAFF:     'bg-slate-600',
};
