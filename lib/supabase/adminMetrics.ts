import { getSupabaseBrowserClient } from './client';

export type FounderDailyMetric = {
  date: string;
  dau: number;
  signups: number;
  posts: number;
  responses: number;
  connections: number;
  payments: number;
  processedVolumeCents: number;
  uniqueSessions: number;
  pageViews: number;
  clicks: number;
  ctrBps: number;
  signupViews: number;
  signupStarts: number;
  signupCompletions: number;
  signupRateBps: number;
};

export type FounderCampusMetric = {
  campusId: string | null;
  campus: string;
  shortName: string;
  dau: number;
};

export type FounderActivityMetrics = {
  generatedAt: string;
  timezone: string;
  todayDau: number;
  yesterdayDau: number;
  wau: number;
  mau: number;
  newUsersToday: number;
  totalUsers: number;
  verifiedStudents: number;
  postsToday: number;
  responsesToday: number;
  connectionsToday: number;
  paymentsToday: number;
  successfulTransactionsToday: number;
  processedVolumeCentsToday: number;
  gmvCentsToday: number;
  platformFeeRevenueCentsToday: number;
  takeRateBpsToday: number;
  payoutsReleasedToday: number;
  uniqueSessionsToday: number;
  pageViewsToday: number;
  trackedClicksToday: number;
  uniqueClickSessionsToday: number;
  clickThroughRateBpsToday: number;
  signupViewsToday: number;
  signupStartsToday: number;
  signupCompletionsToday: number;
  signupRateBpsToday: number;
  daily: FounderDailyMetric[];
  campusesToday: FounderCampusMetric[];
};

export async function fetchFounderActivityMetrics(days = 30) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('admin_activity_metrics', { p_days: days });
  if (error) throw error;
  return data as FounderActivityMetrics;
}


export type FounderLaunchReadinessMetrics = {
  generatedAt: string;
  schoolVerified: number;
  schoolPending: number;
  phoneVerified: number;
  livePayoutAccounts: number;
  sandboxPayoutAccounts: number;
  livePayments: number;
  sandboxPayments: number;
  pendingPosts: number;
  openSafetyReports: number;
  openResolutionCases: number;
  openSupportItems: number;
  emailAttention24h: number;
};

export async function fetchFounderLaunchReadinessMetrics() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('admin_launch_readiness_metrics');
  if (error) throw error;
  return data as FounderLaunchReadinessMetrics;
}
