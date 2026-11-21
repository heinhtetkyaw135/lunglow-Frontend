import React, { useState, useEffect } from 'react';
import {
  UsersGroupIcon,
  FlameIcon,
  FlagReportIcon,
  NavBlogIcon,
  NavAdminShieldIcon,
  NavCalendarIcon,
  TrophyIcon,
  InboxIcon,
  MegaphoneIcon,
  ArrowUpRightIcon,
} from '../../components/common/Icons';
import { CountUp, MiniLineChart, MiniBarChart, DonutChart } from '../../components/common/Charts';
import { ASSETS } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { useLunglowData } from '../../hooks/useLunglowData';

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const toDateStr = (d) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
};

const extractYmd = (item) => {
  if (!item) return null;
  if (item.createdDate) return item.createdDate;
  if (item.joinedAt) return item.joinedAt;
  if (item.createdAt && /^\d{4}-\d{2}-\d{2}/.test(item.createdAt)) return item.createdAt.slice(0, 10);
  if (item.createdAt) {
    const parsed = new Date(item.createdAt);
    if (!Number.isNaN(parsed.getTime())) return toDateStr(parsed);
  }
  return null;
};

export function AdminPage() {
  const { t, isLight, themeTokens, lang } = useTheme();
  const {
    blogs,
    posts,
    reports,
    managedUsers,
    adminAnalytics,
    refreshAdminAnalytics,
    challenges,
    userRequests,
    broadcast,
    handlePublishBroadcast,
    handleClearBroadcast,
    handleAdminToggleUserStatus,
    handleAdminResetUserAvatar,
    setPage,
  } = useLunglowData();

  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loadingRange, setLoadingRange] = useState(false);

  const hasDateRange = Boolean(startDate || endDate);
  const effStart = startDate && endDate && startDate > endDate ? endDate : startDate;
  const effEnd = startDate && endDate && startDate > endDate ? startDate : endDate;

  useEffect(() => {
    let active = true;
    setLoadingRange(true);
    refreshAdminAnalytics({ startDate: effStart || undefined, endDate: effEnd || undefined })
      .finally(() => {
        if (active) setLoadingRange(false);
      });
    return () => {
      active = false;
    };
  }, [effStart, effEnd, refreshAdminAnalytics]);

  const inDateRange = (ymd) => {
    if (!hasDateRange) return true;
    if (!ymd) return true;
    if (effStart && ymd < effStart) return false;
    if (effEnd && ymd > effEnd) return false;
    return true;
  };

  const applyPresetDays = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(toDateStr(start));
    setEndDate(toDateStr(end));
  };

  const clearDateRange = () => {
    setStartDate('');
    setEndDate('');
  };

  const a = adminAnalytics || {};
  // Member counts come from the live user list (filtered by date range when active) so suspend/activate reflects instantly.
  const allMembers = managedUsers.filter((u) => u.role !== 'admin');
  const members = hasDateRange ? allMembers.filter((u) => inDateRange(u.joinedAt)) : allMembers;
  const totalRegisteredUsers = members.length;
  const activeUsersCount = members.filter((u) => u.status === 'active').length;
  const suspendedUsersCount = totalRegisteredUsers - activeUsersCount;
  const newThisWeek = hasDateRange ? totalRegisteredUsers : (a.new_users_this_week ?? 0);
  const newLastWeek = a.new_users_last_week ?? 0;

  const rangeReports = hasDateRange ? reports.filter((r) => inDateRange(extractYmd(r))) : reports;
  const rangeBlogs = hasDateRange ? blogs.filter((b) => inDateRange(extractYmd(b))) : blogs;
  const rangePosts = hasDateRange ? posts.filter((p) => inDateRange(extractYmd(p))) : posts;
  const rangeRequests = hasDateRange ? userRequests.filter((r) => inDateRange(extractYmd(r))) : userRequests;

  const pendingReportsCount = rangeReports.length;
  const totalPublishedItems = rangeBlogs.length + rangePosts.length;
  const liveChallenges = challenges.filter((c) => c.active).length;
  const openRequests = rangeRequests.filter((r) => r.status !== 'resolved').length;
  const signupsWeekly = a.signups_weekly?.length ? a.signups_weekly : new Array(12).fill(0);
  const signupChange = hasDateRange
    ? `${effStart || '…'} → ${effEnd || '…'} (${totalRegisteredUsers} signups)`
    : newLastWeek > 0
    ? `${newThisWeek >= newLastWeek ? '+' : ''}${pct(newThisWeek - newLastWeek, newLastWeek)}% WoW`
    : `+${newThisWeek} this week`;

  const filteredUsers = managedUsers
    .filter((u) => !hasDateRange || u.role === 'admin' || inDateRange(u.joinedAt))
    .filter(
      (u) =>
        u.name.toLowerCase().includes(userQuery.trim().toLowerCase()) ||
        u.email.toLowerCase().includes(userQuery.trim().toLowerCase())
    );

  const kpis = [
    {
      icon: UsersGroupIcon,
      value: totalRegisteredUsers,
      label: t.admin.kpiTotalUsers,
      color: 'text-white',
      delta: hasDateRange ? 'registered in range' : `+${newThisWeek} this week`,
      iconCls: themeTokens.iconBadge,
    },
    {
      icon: FlameIcon,
      value: activeUsersCount,
      label: t.admin.kpiActiveUsers,
      color: 'text-[#5FB032]',
      delta: `${pct(activeUsersCount, totalRegisteredUsers)}% of members`,
      iconCls: themeTokens.iconBadge,
    },
    {
      icon: FlagReportIcon,
      value: pendingReportsCount,
      label: t.admin.kpiPendingReports,
      color: 'text-[#FF3B30]',
      delta: pendingReportsCount > 0 ? 'action needed' : 'clear',
      iconCls:
        'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FF3B30]/15 border border-[#FF3B30]/35 text-[#FF3B30] flex items-center justify-center shrink-0',
      page: 'admin-reports',
    },
    {
      icon: NavBlogIcon,
      value: totalPublishedItems,
      label: t.admin.kpiTotalContent,
      color: 'text-[#CABA3A]',
      delta: `${a.total_comments ?? 0} comments`,
      iconCls:
        'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#CABA3A]/15 border border-[#CABA3A]/35 text-[#CABA3A] flex items-center justify-center shrink-0',
      page: 'admin-blog',
    },
  ];

  const seg = a.segments || {};
  const segTotal = (seg.clean || 0) + (seg.reducing || 0) + (seg.struggling || 0) + (seg.inactive || 0);
  const engagementSegments = [
    { value: pct(seg.clean || 0, segTotal), color: '#5FB032', label: 'Clean streaks' },
    { value: pct(seg.reducing || 0, segTotal), color: '#CABA3A', label: 'Reducing' },
    { value: pct(seg.struggling || 0, segTotal), color: '#FF3B30', label: 'Over limit' },
    { value: pct(seg.inactive || 0, segTotal), color: '#7dd3fc', label: 'Not tracking' },
  ];

  const userBars = [
    { label: 'Active', value: activeUsersCount },
    { label: 'Suspended', value: suspendedUsersCount },
    { label: hasDateRange ? 'In range' : 'New wk', value: newThisWeek },
    { label: hasDateRange ? 'Active log' : 'Idle 7d', value: hasDateRange ? (a.active_in_period ?? 0) : Math.max(0, totalRegisteredUsers - (a.active_last_7_days ?? 0)) },
  ];

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#CABA3A]/20 border border-[#CABA3A] text-[#CABA3A] px-4 py-1 text-xs font-bold mb-2">
            <NavAdminShieldIcon className="w-4 h-4" />
            <span>{t.admin.navLabel}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-1.5">
            {t.admin.overview.title}
          </h1>
          <p className={`text-xs sm:text-base ${themeTokens.mutedText} max-w-3xl`}>{t.admin.subtitle}</p>
        </div>
        <div className="relative shrink-0 hidden md:block">
          <img
            src={ASSETS.breathing}
            alt="Breathing animation"
            className="w-24 h-24 lg:w-28 lg:h-28 rounded-3xl object-cover border border-[#5FB032]/40 shadow-lg animate-float-slow"
          />
        </div>
      </div>

      {/* Date Range Filter Bar */}
      <div className={`rounded-3xl border ${themeTokens.cardSurface} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <div className={themeTokens.iconBadge}>
            <NavCalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm sm:text-base font-bold flex items-center gap-2">
              <span>{lang === 'my' ? 'ရက်စွဲအလိုက် ဒေတာစစ်ဆေးရန်' : 'Check Data by Date Range'}</span>
              {loadingRange && (
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#CABA3A] border-t-transparent animate-spin" />
              )}
            </div>
            <p className={`text-xs ${themeTokens.mutedText}`}>
              {hasDateRange
                ? lang === 'my'
                  ? `${effStart || 'အစ'} မှ ${effEnd || 'ယနေ့'} အတွင်း ဒေတာများကို ပြသနေပါသည်`
                  : `Showing platform data from ${effStart || 'start'} to ${effEnd || 'today'}`
                : lang === 'my'
                ? 'အချိန်ကာလအားလုံး၏ ဒေတာများကို ပြသနေပါသည် (Start date နှင့် End date ရွေးချယ်ပါ)'
                : 'Showing all-time platform data — select a start date and end date to filter'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <label htmlFor="admin-start-date" className={`text-xs font-bold ${themeTokens.mutedText}`}>
              {lang === 'my' ? 'မှ' : 'Start'}
            </label>
            <input
              id="admin-start-date"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className={`h-10 rounded-full border ${themeTokens.inputSurface} px-3.5 text-xs sm:text-sm font-semibold focus:outline-none`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="admin-end-date" className={`text-xs font-bold ${themeTokens.mutedText}`}>
              {lang === 'my' ? 'အထိ' : 'End'}
            </label>
            <input
              id="admin-end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={`h-10 rounded-full border ${themeTokens.inputSurface} px-3.5 text-xs sm:text-sm font-semibold focus:outline-none`}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: lang === 'my' ? 'ယနေ့' : 'Today', days: 1 },
              { label: '7D', days: 7 },
              { label: '30D', days: 30 },
              { label: '90D', days: 90 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPresetDays(preset.days)}
                className={`h-9 px-3.5 rounded-full text-xs font-bold transition lunglow-btn-spring ${
                  isLight
                    ? 'border border-[#2E5A1C]/20 bg-[#F2F7EF] hover:bg-[#5FB032]/20 text-[#132211]'
                    : 'border border-white/20 bg-white/5 hover:bg-white/15 text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
            {hasDateRange && (
              <button
                type="button"
                onClick={clearDateRange}
                className="h-9 px-4 rounded-full text-xs font-bold bg-[#CABA3A] text-black shadow hover:brightness-110 transition lunglow-btn-spring"
              >
                {lang === 'my' ? 'အားလုံးပြန်ပြရန်' : 'Reset'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <button
              key={i}
              type="button"
              onClick={() => kpi.page && setPage(kpi.page)}
              className={`rounded-3xl border ${themeTokens.cardSurface} px-6 py-5 flex items-center gap-4 text-left animate-stagger-${i + 1} ${kpi.page ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className={kpi.iconCls}>
                <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <div className={`text-2xl sm:text-3xl font-extrabold ${kpi.color}`}>
                  <CountUp value={kpi.value} />
                </div>
                <div className={`text-xs sm:text-sm ${themeTokens.mutedText} font-semibold truncate`}>
                  {kpi.label}
                </div>
                <div className="text-[10px] font-bold text-[#5FB032]">{kpi.delta}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className={`lg:col-span-2 rounded-3xl border ${themeTokens.cardSurface} p-5 sm:p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-bold">
              {hasDateRange
                ? lang === 'my'
                  ? `အကောင့်သစ်များ (${effStart || '…'} – ${effEnd || '…'})`
                  : `Signups (${effStart || '…'} – ${effEnd || '…'})`
                : t.admin.overview.signupTrend}
            </h2>
            <span className="rounded-full bg-[#5FB032]/15 border border-[#5FB032]/40 text-[#5FB032] px-3 py-1 text-[10px] sm:text-xs font-bold">
              {signupChange}
            </span>
          </div>
          <MiniLineChart data={signupsWeekly} height={170} />
        </div>

        <div className={`rounded-3xl border ${themeTokens.cardSurface} p-5 sm:p-6 flex flex-col items-center justify-center gap-3`}>
          <h2 className="text-base sm:text-lg font-bold self-start">{t.admin.overview.engagementSplit}</h2>
          <DonutChart
            segments={engagementSegments}
            centerValue={`${activeUsersCount.toLocaleString()}`}
            centerLabel={t.admin.kpiActiveUsers}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full mt-1">
            {engagementSegments.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className={themeTokens.mutedText}>{s.label}</span>
                <span className="ml-auto tabular-nums">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Broadcast + quick stats + latest reports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Broadcast manager */}
        <div className={`rounded-3xl border ${themeTokens.cardSurface} p-5 sm:p-6 flex flex-col gap-4`}>
          <div className="flex items-center gap-3">
            <div className={themeTokens.iconBadge}>
              <MegaphoneIcon className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg font-bold">{t.admin.tabBroadcast}</h2>
          </div>
          <textarea
            rows={3}
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder={lang === 'my' ? 'ကြေညာချက် ရေးပါ...' : 'Type a global announcement…'}
            className={`w-full rounded-2xl border ${themeTokens.inputSurface} p-4 text-sm focus:outline-none resize-none`}
          />
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                handlePublishBroadcast(broadcastMessage);
                setBroadcastMessage('');
              }}
              disabled={!broadcastMessage.trim()}
              className={`px-5 py-2.5 text-sm ${themeTokens.primaryBtn} disabled:opacity-50`}
            >
              {t.admin.tabBroadcast}
            </button>
            {broadcast && (
              <button
                type="button"
                onClick={handleClearBroadcast}
                className={`px-5 py-2.5 text-sm ${themeTokens.secondaryBtn}`}
              >
                {lang === 'my' ? 'ရပ်မည်' : 'Clear'}
              </button>
            )}
          </div>
          {broadcast && (
            <div className={`rounded-2xl border ${themeTokens.subCardSurface} p-3.5 flex items-center gap-2.5`}>
              <span className="w-2.5 h-2.5 rounded-full bg-[#5FB032] animate-pulse shrink-0" />
              <span className="text-sm font-medium">{broadcast.message}</span>
            </div>
          )}
        </div>

        {/* User status mix */}
        <div className={`rounded-3xl border ${themeTokens.cardSurface} p-5 sm:p-6`}>
          <h2 className="text-base sm:text-lg font-bold mb-4">{t.admin.overview.usersByStatus}</h2>
          <MiniBarChart data={userBars} height={170} />
        </div>

        {/* Latest reports preview */}
        <div className={`rounded-3xl border ${themeTokens.cardSurface} p-5 sm:p-6 flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold">{t.admin.overview.recentReports}</h2>
            <button
              type="button"
              onClick={() => setPage('admin-reports')}
              className="text-xs font-bold text-[#CABA3A] inline-flex items-center gap-1 hover:gap-2 transition-all"
            >
              {t.admin.overview.viewAll}
              <ArrowUpRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          {rangeReports.slice(0, 3).map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setPage('admin-reports')}
              className={`rounded-2xl border ${themeTokens.subCardSurface} p-3.5 text-left flex items-start gap-3 w-full`}
            >
              <FlagReportIcon className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{rep.targetAuthor}</div>
                <div className={`text-xs ${themeTokens.mutedText} truncate`}>{rep.excerpt}</div>
              </div>
            </button>
          ))}
          {rangeReports.length === 0 && (
            <div className={`rounded-2xl border ${themeTokens.subCardSurface} p-6 text-center text-sm font-semibold text-[#5FB032]`}>
              {t.admin.noReports}
            </div>
          )}
          <div className="flex gap-2.5 mt-auto pt-2">
            <button
              type="button"
              onClick={() => setPage('admin-challenges')}
              className={`flex-1 rounded-2xl border ${themeTokens.subCardSurface} p-3 flex items-center gap-2.5 text-left lunglow-btn-spring`}
            >
              <TrophyIcon className="w-5 h-5 text-[#CABA3A] shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-extrabold tabular-nums">{liveChallenges}</div>
                <div className={`text-[10px] ${themeTokens.mutedText} font-semibold leading-tight`}>{t.admin.overview.activeChallenges}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPage('admin-requests')}
              className={`flex-1 rounded-2xl border ${themeTokens.subCardSurface} p-3 flex items-center gap-2.5 text-left lunglow-btn-spring`}
            >
              <InboxIcon className="w-5 h-5 text-[#5FB032] shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-extrabold tabular-nums">{openRequests}</div>
                <div className={`text-[10px] ${themeTokens.mutedText} font-semibold leading-tight`}>{t.admin.overview.openRequests}</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* User management table */}
      <div className={`rounded-3xl sm:rounded-[38px] border ${themeTokens.cardSurface} p-5 sm:p-8 flex flex-col gap-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold">{t.admin.tabUsers}</h2>
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Search users…"
            className={`h-10 rounded-full border ${themeTokens.inputSurface} px-4 text-sm w-56 focus:outline-none`}
          />
        </div>

        <div className="flex flex-col gap-3.5">
          {filteredUsers.map((u) => {
            const isActive = u.status === 'active';
            return (
              <div
                key={u.id}
                className={`rounded-2xl sm:rounded-3xl border ${themeTokens.subCardSurface} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={u.avatar || ASSETS.avatar}
                    alt={u.name}
                    className="w-12 h-12 rounded-full object-cover border border-[#5FB032]/40 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base sm:text-lg font-bold">{u.name}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          u.role === 'admin' ? 'bg-[#CABA3A]/25 text-[#CABA3A]' : 'bg-[#5FB032]/20 text-[#5FB032]'
                        }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isActive ? 'bg-[#5FB032]/20 text-[#5FB032]' : 'bg-[#FF3B30]/20 text-[#FF3B30]'
                        }`}
                      >
                        {isActive ? t.admin.userStatusActive : t.admin.userStatusSuspended}
                      </span>
                    </div>
                    <div className={`text-xs ${themeTokens.mutedText}`}>
                      {u.email} • Streak: {u.streak} days • Saved: ${Number(u.savedMoney || 0).toLocaleString()}
                      {u.joinedAt ? ` • Joined ${u.joinedAt}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleAdminResetUserAvatar(u.id, u.name)}
                    className={`px-4 py-2 text-xs ${themeTokens.secondaryBtn}`}
                  >
                    {t.admin.resetUserPhotoBtn}
                  </button>
                  {u.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => handleAdminToggleUserStatus(u.id)}
                    className={`rounded-full px-5 py-2 text-xs font-bold transition shadow lunglow-btn-spring ${
                      isActive ? 'bg-[#FF3B30] text-white hover:brightness-110' : 'bg-[#5FB032] text-black hover:brightness-110'
                    }`}
                  >
                    {isActive ? t.admin.suspendBtn : t.admin.activateBtn}
                  </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className={`rounded-2xl border ${themeTokens.subCardSurface} p-8 text-center text-sm ${themeTokens.mutedText}`}>
              No users match "{userQuery}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
