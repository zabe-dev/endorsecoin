export type AdminTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

export type AdminSummary = {
  users: number;
  coins: number;
  activeBoosts: number;
  promotedCoins: number;
  visibilityCoins: number;
  activeBanners: number;
  scheduledBanners: number;
  pendingSubmissions: number;
  pendingAirdrops: number;
  changeRequests: number;
};

export type AdminSubmissionRow = {
  id: string;
  submissionKind: 'coin' | 'airdrop';
  logoUrl: string | null;
  name: string;
  symbol: string;
  chain: string;
  submittedBy: string;
  contactEmail: string;
  contactTelegram: string;
  submittedAt: string;
  status: string;
  flag: string;
  details: AdminSubmissionDetailSection[];
  rawData: string;
};

export type AdminSubmissionDetailSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export type AdminCoinRow = {
  id: number;
  logoUrl: string | null;
  name: string;
  symbol: string;
  chain: string;
  submittedBy: string;
  contactEmail: string;
  contactTelegram: string;
  submittedAt: string;
  status: string;
  category: string;
  boost: {
    tier: number;
    status: string;
    startDate: string;
    startsAt: string;
    expiresAt: string;
    remaining: string;
  } | null;
  promotion: {
    status: string;
    priority: number;
    startDate: string;
    startsAt: string;
    durationDays: number;
    expiresAt: string;
    remaining: string;
  } | null;
};

export type AdminBannerRow = {
  id: string;
  placement: string;
  placementLabel: string;
  title: string;
  subtitle: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  status: string;
  priority: number;
  startDate: string;
  startsAt: string;
  endsAt: string;
  durationDays: number;
  schedule: string;
  notes: string;
};

export type AdminChangeRequestRow = {
  id: string;
  coinId: number;
  coinName: string;
  coinSymbol: string;
  requesterEmail: string;
  requesterTelegram: string;
  requestedChanges: string;
  evidenceUrl: string;
  status: string;
  submittedAt: string;
};

export type AdminUserRow = {
  id: string;
  avatar: string;
  avatarTone: number;
  name: string;
  email: string;
  role: string;
  status: string;
  projectsSubmitted: number;
  joinedAt: string;
  lastActive: string;
  lastIp: string;
};

export type AdminDashboardClientProps = {
  summary: AdminSummary;
  pendingSubmissions: AdminSubmissionRow[];
  pendingAirdropSubmissions: AdminSubmissionRow[];
  changeRequests: AdminChangeRequestRow[];
  listedCoins: AdminCoinRow[];
  bannerAds: AdminBannerRow[];
  users: AdminUserRow[];
  initialTab?: string;
  searchQuery?: string;
  pagination?: AdminTablePagination | null;
};

export const adminTabIds = [
  'overview',
  'submissions',
  'airdrops',
  'coins',
  'promotions',
  'banners',
  'users',
  'reports',
] as const;

export type AdminTab = (typeof adminTabIds)[number];

export type PopoverController = {
  activePopoverId: string | null;
  setActivePopoverId: (id: string | null) => void;
};
