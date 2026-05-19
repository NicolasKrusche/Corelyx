// ─── Announcement config ─────────────────────────────────────────────────────
//
// Add a new object to ANNOUNCEMENTS to publish a news item to all users.
// Users can dismiss individual items — dismissal is stored in localStorage.
//
// id       — unique stable string; changing it resets dismissal for all users
// type     — controls the accent colour of the item
// badge    — short pill label ("New", "v2.0", "Beta", etc.)
// link     — optional CTA URL
// linkLabel — CTA button text (defaults to "Learn more")
//
// ─────────────────────────────────────────────────────────────────────────────

export type AnnouncementType = "release" | "feature" | "update" | "info" | "maintenance";

export type Announcement = {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  date: string;       // ISO date — displayed as "May 16 2026"
  badge?: string;
  link?: string;
  linkLabel?: string;
};

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "popular-sort-profiles-notifications",
    type: "feature",
    title: "Popular programs, public profiles & notifications",
    body: "Browse programs by popularity, visit any builder's public profile at /u/username, and get in-app notifications when tickets are assigned to you.",
    date: "2026-05-19",
    badge: "New",
    link: "/browse",
    linkLabel: "Explore popular",
  },
  // ── Uncomment to go live ──────────────────────────────────────────────────
  //
  // {
  //   id: "genesis-v2",
  //   type: "release",
  //   title: "Genesis v2 is here",
  //   body: "Smarter workflow generation, multi-step reasoning, and 3× faster builds. Available on all plans.",
  //   date: "2026-05-16",
  //   badge: "v2.0",
  //   link: "/browse",
  //   linkLabel: "Try Genesis v2",
  // },
  //
  // {
  //   id: "static-i18n",
  //   type: "feature",
  //   title: "13 languages now supported",
  //   body: "The interface is available in German, French, Spanish, Japanese, Chinese, and more. Change it in Settings → Language.",
  //   date: "2026-05-16",
  //   badge: "New",
  //   link: "/credits",
  //   linkLabel: "Explore",
  // },
  //
  // {
  //   id: "credits-page",
  //   type: "feature",
  //   title: "Credits & Usage page",
  //   body: "Track your platform AI usage, Genesis calls, and workflow runs — and top up credits without going into Settings.",
  //   date: "2026-05-16",
  //   badge: "New",
  //   link: "/credits",
  //   linkLabel: "View credits",
  // },
];
