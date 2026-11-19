import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { LunglowDataContext } from './lunglow-data-context';
import { TODAY_KEY, TODAY_YEAR, TODAY_MONTH_IDX } from '../types';
import { ASSETS } from '../types';
import {
  INITIAL_LOGS_BY_DATE,
  INITIAL_GOALS,
  INITIAL_POSTS,
  INITIAL_HEATMAP,
  INITIAL_REMINDERS,
  INITIAL_BLOGS,
  INITIAL_MANAGED_USERS,
  INITIAL_REPORTS,
  INITIAL_CHALLENGES,
  INITIAL_USER_REQUESTS,
  loadTrackerStorage,
  persistTrackerStorage,
} from '../data/trackerData';

// Load the last-hydrated snapshot (stale-while-revalidate): paint it instantly
// on refresh, then swap in fresh API data in the background.
const __cached = loadTrackerStorage() || {};
import {
  calculateMetrics,
  calculateWeekBars,
  calculateCalendarMonth,
} from '../libs/smokingAnalytics';
import api, { getToken, setToken, setCachedUser, getCachedUser, dataUrlToFile } from '../libs/api';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useExerciseTimer } from '../hooks/useExerciseTimer';

export function LunglowDataProvider({ children }) {
  const { lang, t, weekdaysList, timeBlocksList } = useTheme();
  const { userName, setUserName, userAvatar, setUserAvatar, tempName, setIsEditingProfile, role, isAdmin, authUser, resistedCount, setResistedCount, syncSession } = useAuth();

  const [page, setPageState] = useState(() => {
    if (typeof window === 'undefined') return 'landing';
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/user/register') return 'register';
    if (path === '/user/login') return 'login';
    if (path === '/user/set-limit') return 'set-limit';
    if (path === '/admin/login') return 'admin-login';
    if (path.startsWith('/admin/')) {
      const slug = path.slice('/admin/'.length);
      return !slug || slug === 'overview' ? 'admin' : `admin-${slug}`;
    }
    if (path === '/user/home' || path === '/home') return 'home';
    if (path.startsWith('/user/')) return path.slice('/user/'.length) || 'home';
    return 'landing';
  });

  const ADMIN_PAGE_IDS = ['admin', 'admin-reports', 'admin-feed', 'admin-blog', 'admin-analytics', 'admin-challenges', 'admin-requests'];

  const pagePath = useCallback((nextPage) => {
    const routes = {
      landing: '/',
      register: '/user/register',
      login: '/user/login',
      'set-limit': '/user/set-limit',
      home: '/user/home',
      admin: '/admin/overview',
      'admin-login': '/admin/login',
    };
    if (nextPage in routes) return routes[nextPage];
    if (nextPage.startsWith('admin-')) return `/admin/${nextPage.slice('admin-'.length)}`;
    if (['exercises', 'breathing', 'walking', 'memory-game', 'tictactoe-game', 'calendar', 'goal', 'profile', 'community', 'blog', 'challenges', 'requests'].includes(nextPage)) {
      return `/user/${nextPage}`;
    }
    return `/${nextPage}`;
  }, []);

  const setPage = useCallback((nextPage) => {
    setPageState(nextPage);
    if (typeof window !== 'undefined') {
      const nextPath = pagePath(nextPage);
      const prevWasAdmin = window.location.pathname.startsWith('/admin');
      const nextIsAdmin = nextPath.startsWith('/admin');
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ page: nextPage }, '', nextPath);
      }
      if (prevWasAdmin !== nextIsAdmin && typeof syncSession === 'function') {
        syncSession();
      }
    }
  }, [pagePath, syncSession]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/user/register') setPageState('register');
      else if (path === '/user/login') setPageState('login');
      else if (path === '/user/set-limit') setPageState('set-limit');
      else if (path === '/admin/login') setPageState('admin-login');
      else if (path.startsWith('/admin/')) {
        const slug = path.slice('/admin/'.length);
        setPageState(!slug || slug === 'overview' ? 'admin' : `admin-${slug}`);
      }
      else if (path.startsWith('/user/')) setPageState(path.slice('/user/'.length) || 'home');
      else setPageState('landing');
      if (typeof syncSession === 'function') syncSession();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncSession]);

  const [toastMessage, setToastMessage] = useState('');
  const [toastTone, setToastTone] = useState('success'); // 'success' | 'error'
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const showToast = useCallback((msg, tone = 'success') => {
    setToastMessage(msg);
    setToastTone(tone);
    setTimeout(() => setToastMessage(''), 3000);
  }, []);

  const [dailyLimit, setDailyLimit] = useState(() => Number(loadTrackerStorage()?.settings?.daily_limit) || 20);
  const [cigPrice, setCigPrice] = useState(() => Number(loadTrackerStorage()?.settings?.cig_price) || 0.5);
  const [limitFormCigs, setLimitFormCigs] = useState(() => Number(loadTrackerStorage()?.settings?.daily_limit) || 20);
  const [limitFormPrice, setLimitFormPrice] = useState(() => Number(loadTrackerStorage()?.settings?.cig_price) || 0.5);

  // Start empty when a saved token exists so we render real data immediately
  // instead of flashing the mock seeds before hydration lands.
  const hasSession = () => !!getToken();
  const [dataReady, setDataReady] = useState(false);
  const [staleTokenFallback, setStaleTokenFallback] = useState(false);

  const [logsByDate, setLogsByDate] = useState(() =>
    loadTrackerStorage()?.logsByDate ?? (hasSession() ? {} : INITIAL_LOGS_BY_DATE)
  );
  const smokedToday = logsByDate[TODAY_KEY] ?? 0;

  const setSmokedToday = useCallback((updater) => {
    setLogsByDate((prev) => {
      const currentVal = prev[TODAY_KEY] ?? 0;
      const nextVal = Math.max(0, typeof updater === 'function' ? updater(currentVal) : updater);
      // Persist today's cigarette count to the backend and local cache.
      const nextLogs = { ...prev, [TODAY_KEY]: nextVal };
      persistTrackerStorage({ logsByDate: nextLogs });
      api.upsertSmokeLog({ date: TODAY_KEY, count: nextVal }).catch(() => {});
      return nextLogs;
    });
  }, []);

  // Feature 2: Trigger & Mood Tagging state
  const [selectedTrigger, setSelectedTrigger] = useState('stress');
  // resistedCount + setResistedCount come from useAuth() (persisted per user).

  const handleResistTrigger = () => {
    setResistedCount((prev) => {
      const next = prev + 1;
      const cached = getCachedUser();
      if (cached) setCachedUser({ ...cached, resisted_count: next });
      return next;
    });
    api.resist()
      .then((d) => {
        if (typeof d?.resisted_count === 'number') {
          setResistedCount(d.resisted_count);
          const cached = getCachedUser();
          if (cached) setCachedUser({ ...cached, resisted_count: d.resisted_count });
        }
      })
      .catch(() => {});
    showToast(
      lang === 'my'
        ? 'ဂုဏ်ယူပါသည်! ဆေးလိပ်သောက်ချင်စိတ်ကို အောင်မြင်စွာ ထိန်းချုပ်နိုင်ခဲ့ပါသည် (+1)'
        : 'Great job! Logged +1 resisted craving.'
    );
  };

  // Feature 3: Peak Craving Heatmap state (persisted to craving_logs)
  const [heatmapData, setHeatmapData] = useState(() =>
    loadTrackerStorage()?.heatmap ?? (hasSession() ? {} : INITIAL_HEATMAP)
  );

  const handleToggleHeatmapCell = (dayIdx, slotIdx) => {
    const key = `${dayIdx}-${slotIdx}`;
    const nextLevel = ((heatmapData[key] ?? 0) + 1) % 3;
    // Optimistic UI update + local cache
    setHeatmapData((prev) => {
      const next = { ...prev, [key]: nextLevel };
      persistTrackerStorage({ heatmap: next });
      return next;
    });
    // Persist the explicit new level so the grid stays in sync.
    api.toggleHeatmap({ day_index: dayIdx, slot_index: slotIdx, intensity: nextLevel }).catch(() => {});
  };

  const handleLogCravingNow = () => {
    // Map the real current time to its cell so the log is honest.
    const now = new Date();
    const hour = now.getHours();
    const slotIdx =
      hour >= 6 && hour < 9 ? 0
      : hour >= 9 && hour < 12 ? 1
      : hour >= 12 && hour < 15 ? 2
      : hour >= 15 && hour < 18 ? 3
      : hour >= 18 && hour < 21 ? 4
      : 5;
    const dayIdx = now.getDay();
    const key = `${dayIdx}-${slotIdx}`;
    setHeatmapData((prev) => {
      const next = { ...prev, [key]: 2 };
      persistTrackerStorage({ heatmap: next });
      return next;
    });
    api.logCraving({ day_index: dayIdx, slot_index: slotIdx, intensity: 2 }).catch(() => {});
    showToast(
      lang === 'my'
        ? 'လက်ရှိအချိန်အတွက် သောက်ချင်စိတ်ပြင်းထန်မှုကို ဇယားတွင် မှတ်သားပြီးပါပြီ!'
        : 'Logged current craving intensity to your heatmap!'
    );
  };

  const peakWindowLabel = useMemo(() => {
    const slotScores = [0, 0, 0, 0, 0, 0];
    for (let d = 0; d < 7; d++) {
      for (let s = 0; s < 6; s++) {
        slotScores[s] += heatmapData[`${d}-${s}`] ?? 0;
      }
    }
    let maxIdx = 2;
    for (let s = 0; s < 6; s++) {
      if (slotScores[s] > slotScores[maxIdx]) maxIdx = s;
    }
    return timeBlocksList[maxIdx] || '12–3 PM';
  }, [heatmapData, timeBlocksList]);

  // Feature 4: Daily Check-In & Push Reminders state
  const [selectedMood, setSelectedMood] = useState('strong');
  const [checkedInToday, setCheckedInToday] = useState(
    () => loadTrackerStorage()?.checkedInDate === TODAY_KEY
  );
  const [reminders, setReminders] = useState(() =>
    loadTrackerStorage()?.reminders ?? (hasSession() ? [] : INITIAL_REMINDERS)
  );

  const handleCompleteCheckIn = () => {
    setCheckedInToday(true);
    persistTrackerStorage({ checkedInDate: TODAY_KEY });
    api.checkin({ mood: selectedMood, date: TODAY_KEY }).catch(() => {});
    showToast(
      lang === 'my'
        ? 'ယနေ့အတွက် နေ့စဉ် Check-In ကတိကဝတ်ပြုခြင်း အောင်မြင်ပါသည်!'
        : 'Daily Check-In completed! Stay strong today.'
    );
  };

  const handleToggleReminder = (id) => {
    setReminders((prev) => {
      const target = prev.find((r) => r.id === id);
      const nextEnabled = target ? !target.enabled : true;
      const next = prev.map((r) => (r.id === id ? { ...r, enabled: nextEnabled } : r));
      persistTrackerStorage({ reminders: next });
      api.updateReminder(id, { enabled: nextEnabled }).catch(() => {});
      return next;
    });
  };

  const handleUpdateReminderTime = (id, newTime) => {
    setReminders((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, time: newTime } : r));
      persistTrackerStorage({ reminders: next });
      api.updateReminder(id, { time: newTime }).catch(() => {});
      return next;
    });
  };

  const handleTestPushReminder = () => {
    showToast(t.checkIn.pushToast);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'granted') {
        new window.Notification('Lunglow', { body: t.checkIn.pushToast });
      } else if (window.Notification.permission !== 'denied') {
        window.Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new window.Notification('Lunglow', { body: t.checkIn.pushToast });
          }
        });
      }
    }
  };

  // Exercise timers
  const breathingTimer = useExerciseTimer(
    180,
    useCallback(() => {
      showToast(
        lang === 'my'
          ? '၃ မိနစ် အသက်ရှူလေ့ကျင့်ခန်း ပြီးဆုံးပါပြီ!'
          : '3-Minute Breathing Exercise completed!'
      );
    }, [lang, showToast])
  );

  const walkingTimer = useExerciseTimer(
    300,
    useCallback(() => {
      showToast(
        lang === 'my'
          ? '၅ မိနစ် လမ်းလျှောက်လေ့ကျင့်ခန်း ပြီးဆုံးပါပြီ!'
          : '5-Minute Walking Exercise completed!'
      );
    }, [lang, showToast])
  );

  const getBreathingPhase = () => {
    if (!breathingTimer.isActive) return t.exercises.inhale;
    const cycle = (180 - breathingTimer.seconds) % 12;
    if (cycle < 4) return t.exercises.inhale;
    if (cycle < 7) return t.exercises.hold;
    return t.exercises.exhale;
  };

  const isInhalePhase = !breathingTimer.isActive || (180 - breathingTimer.seconds) % 12 < 4;

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(TODAY_MONTH_IDX);
  const [selectedYear, setSelectedYear] = useState(String(TODAY_YEAR));
  const [calendarFilter, setCalendarFilter] = useState(null);

  const [goals, setGoals] = useState(() =>
    loadTrackerStorage()?.goals ?? (hasSession() ? [] : INITIAL_GOALS)
  );
  const [newGoalTitle, setNewGoalTitle] = useState('laptop');
  const [newGoalPrice, setNewGoalPrice] = useState(2000);

  const [profileTab, setProfileTab] = useState('progress');
  const [feedFilter, setFeedFilter] = useState('All');
  const [posts, setPosts] = useState(() => loadTrackerStorage()?.posts ?? (hasSession() ? [] : INITIAL_POSTS));
  const [blogs, setBlogs] = useState(() => loadTrackerStorage()?.blogs ?? (hasSession() ? [] : INITIAL_BLOGS));
  const [managedUsers, setManagedUsers] = useState(() => (hasSession() ? [] : INITIAL_MANAGED_USERS));
  // Live admin dashboard metrics from GET /admin/analytics/overview (null until loaded).
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const refreshAdminAnalytics = useCallback(
    () => api.admin.analytics().then((d) => { if (d) setAdminAnalytics(d); return d; }).catch(() => null),
    []
  );
  const [reports, setReports] = useState(() => (hasSession() ? [] : INITIAL_REPORTS));
  const [reportModalTarget, setReportModalTarget] = useState(null);
  const [reportFocusId, setReportFocusId] = useState(null);

  // Admin-provided Challenges (shared between admin dashboard & user site)
  const [challenges, setChallenges] = useState(() =>
    loadTrackerStorage()?.challenges ?? (hasSession() ? [] : INITIAL_CHALLENGES)
  );

  const handleAdminAddChallenge = ({ title, description, reward, days, cover }) => {
    const fd = new FormData();
    fd.append('title', title.trim() || 'New Challenge');
    fd.append('description', description.trim() || 'Complete this challenge to earn your reward.');
    fd.append('details', description.trim());
    fd.append('reward', reward.trim() || 'Exclusive Badge');
    fd.append('days', Math.max(1, Number(days) || 7));
    fd.append('active', '1');
    if (cover) {
      const f = dataUrlToFile(cover, 'challenge.png');
      if (f) fd.append('cover', f);
    }
    api.admin.createChallenge(fd)
      .then((d) => { if (d?.challenge) setChallenges((prev) => [d.challenge, ...prev]); })
      .catch(() => {});
    showToast(lang === 'my' ? 'စိန်ခေါ်မှုအသစ် ထုတ်ပြန်ပြီးပါပြီ!' : 'New challenge is now live for all users!');
  };

  const handleAdminToggleChallenge = (challengeId) => {
    const target = challenges.find((c) => c.id === challengeId);
    const nextActive = target ? !target.active : true;
    // Optimistic
    setChallenges((prev) =>
      prev.map((c) => (c.id === challengeId ? { ...c, active: nextActive } : c))
    );
    const fd = new FormData();
    fd.append('_method', 'PUT');
    fd.append('active', nextActive ? '1' : '0');
    api.admin.updateChallenge(challengeId, fd).catch(() => {});
  };

  const handleAdminDeleteChallenge = (challengeId) => {
    setChallenges((prev) => {
      const next = prev.filter((c) => c.id !== challengeId);
      persistTrackerStorage({ challenges: next });
      return next;
    });
    if (typeof challengeId === 'number' || /^(ch-)?\d+$/.test(String(challengeId))) {
      api.admin.deleteChallenge(challengeId).catch(() => {});
    }
    showToast(lang === 'my' ? 'စိန်ခေါ်မှု ဖျက်ပြီးပါပြီ' : 'Challenge removed');
  };

  // Replace the cover photo of an existing challenge (admin moderation).
  const handleAdminUpdateChallengeCover = (challengeId, cover) => {
    setChallenges((prev) =>
      prev.map((c) => (c.id === challengeId ? { ...c, cover: cover || null } : c))
    );
    if (cover) {
      const fd = new FormData();
      fd.append('_method', 'PUT');
      const f = dataUrlToFile(cover, 'challenge.png');
      if (f) fd.append('cover', f);
      api.admin.updateChallenge(challengeId, fd).catch(() => {});
    }
    showToast(
      lang === 'my'
        ? 'စိန်ခေါ်မှု အဖုံးပုံ မွမ်းမံပြီးပါပြီ!'
        : 'Challenge cover photo updated!'
    );
  };

  const handleJoinChallenge = (challengeId) => {
    // Optimistic toggle, then reconcile with server state.
    const target = challenges.find((c) => c.id === challengeId);
    setChallenges((prev) =>
      prev.map((c) =>
        c.id === challengeId
          ? {
              ...c,
              joined: !c.joined,
              participants: Math.max(0, c.participants + (c.joined ? -1 : 1)),
              // Keep progress on the optimistic leave — if the detach fails and
              // we revert, or the user rejoins, the earned badge isn't lost.
              progress: c.progress,
            }
          : c
      )
    );
    api.joinChallenge(challengeId)
      .then((d) => {
        if (d?.challenge) setChallenges((prev) => prev.map((c) => (c.id === challengeId ? d.challenge : c)));
      })
      .catch(() => {
        // Revert the optimistic toggle and surface the failure — otherwise the
        // UI claims "joined" while nothing was ever written to the database.
        setChallenges((prev) => prev.map((c) => (c.id === challengeId ? target ?? c : c)));
        showToast(
          lang === 'my'
            ? 'စိန်ခေါ်မှု ပါဝင်မှု မအောင်မြင်ပါ — နောက်ပိုင်း ထပ်ကြိုးစားပါ'
            : 'Could not join the challenge — please try again.'
        );
      });
    if (target && !target.joined) {
      showToast(lang === 'my' ? 'စိန်ခေါ်မှုတွင် ပါဝင်ပြီးပါပြီ! ကံကောင်းပါစေ!' : 'Joined the challenge — good luck!');
    }
  };

  const handleChallengeLogDay = (challengeId) => {
    const todayKey = new Date().toDateString();
    const target = challenges.find((c) => c.id === challengeId);
    // One log per calendar day — the button stays locked until tomorrow.
    if (target && target.lastLogDate === todayKey) {
      showToast(
        lang === 'my'
          ? 'ယနေ့အတွက် မှတ်သားပြီးပါပြီ — မနက်ဖြန်မှ ပြန်မှတ်နိုင်ပါမည်'
          : 'Already logged today — come back tomorrow!'
      );
      return;
    }
    setChallenges((prev) =>
      prev.map((c) => {
        if (c.id !== challengeId || !c.joined) return c;
        const nextProgress = Math.min(c.days, c.progress + 1);
        if (nextProgress === c.days && c.progress < c.days) {
          setTimeout(() => {
            handleResistTrigger();
            pushNotification({
              title: lang === 'my' ? 'စိန်ခေါ်မှု ပြီးမြောက်ပါပြီ!' : 'Challenge Completed!',
              body: lang === 'my' ? `"${c.title}" - ${c.reward} ရရှိပါပြီ!` : `You earned the ${c.reward} for "${c.title}"!`,
              kind: 'info',
            });
            showToast(lang === 'my' ? `စိန်ခေါ်မှု ပြီးမြောက်ပါပြီ - "${c.title}"! ${c.reward} ရရှိပါပြီ!` : `Challenge complete — "${c.title}"! You earned the ${c.reward}!`);
          }, 0);
        }
        return { ...c, progress: nextProgress, lastLogDate: todayKey };
      })
    );
    // Persist the clean day to the backend, then reconcile from the canonical
    // server record so progress/lastLogDate survive a refresh. Revert on error.
    api.logChallengeDay(challengeId)
      .then((d) => {
        if (d?.challenge) setChallenges((prev) => prev.map((c) => (c.id === challengeId ? d.challenge : c)));
      })
      .catch((err) => {
        setChallenges((prev) => prev.map((c) => (c.id === challengeId ? target ?? c : c)));
        showToast(
          err?.message ||
            (lang === 'my' ? 'မှတ်သားမှု မအောင်မြင်ပါ — ထပ်ကြိုးစားပါ' : 'Could not log this day — please try again.')
        );
      });
  };

  // User Requests inbox (user submits → admin reviews)
  const [userRequests, setUserRequests] = useState(() =>
    loadTrackerStorage()?.userRequests ?? (hasSession() ? [] : INITIAL_USER_REQUESTS)
  );

  // Returns a Promise that resolves true on success, false on failure,
  // so the form can show its "sent" state only after the API confirms.
  const handleSubmitUserRequest = ({ category, subject, message }) => {
    return api.submitRequest({ category, subject: subject.trim(), message: message.trim() })
      .then((d) => {
        if (!d?.request?.user) return false;
        setUserRequests((prev) => {
          const next = [d.request, ...prev.filter((r) => r.id !== d.request.id)];
          persistTrackerStorage({ userRequests: next });
          return next;
        });
        pushNotification({
          title: lang === 'my' ? 'တောင်းဆိုချက် အသစ်' : 'New User Request',
          body: subject.trim() || (lang === 'my' ? 'တောင်းဆိုချက် တစ်ခု ရောက်ရှိပါသည်' : 'A user sent a new request.'),
          kind: 'request',
        });
        showToast(
          lang === 'my'
            ? 'သင့်တောင်းဆိုချက်ကို Admin ထံ ပေးပို့ပြီးပါပြီ!'
            : 'Your request was sent to the Admin team!'
        );
        return true;
      })
      .catch((err) => {
        showToast(
          lang === 'my' ? 'ပေးပို့မှု မအောင်မြင်ပါ — ထပ်ကြိုးစားပါ' : 'Could not send your request — please try again.',
          'error'
        );
        console.error('submitRequest failed:', err);
        return false;
      });
  };

  const handleAdminUpdateRequestStatus = (requestId, nextStatus) => {
    setUserRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: nextStatus } : r))
    );
    api.admin.updateRequestStatus(requestId, nextStatus).catch(() => {});
    showToast(
      lang === 'my'
        ? 'တောင်းဆိုချက် အခြေအနေ မွမ်းမံးပြီးပါပြီ'
        : `Request marked as ${nextStatus}`
    );
  };

  const handleAdminDeleteRequest = (requestId) => {
    setUserRequests((prev) => {
      const next = prev.filter((r) => r.id !== requestId);
      persistTrackerStorage({ userRequests: next });
      return next;
    });
    if (typeof requestId === 'number' || /^(req-)?\d+$/.test(String(requestId))) {
      api.admin.deleteRequest(requestId).catch(() => {});
    }
    showToast(lang === 'my' ? 'တောင်းဆိုချက် ဖျက်ပြီးပါပြီ' : 'Request removed');
  };

  // Global broadcast banner (admin publishes → user dashboard shows it)
  const [broadcast, setBroadcast] = useState(null); // { message, publishedAt }

  const handlePublishBroadcast = (message) => {
    if (!message.trim()) return;
    setBroadcast({ message: message.trim(), publishedAt: 'Just now' });
    api.admin.publishBroadcast(message.trim()).catch(() => {});
    pushNotification({
      title: lang === 'my' ? 'ကြေညာချက် အသစ်' : 'New Broadcast',
      body: message.trim(),
      kind: 'broadcast',
    });
    showToast(lang === 'my' ? 'ကြေညာချက်ကို သုံးစွဲသူအားလုံးထံ ပေးပို့ပြီးပါပြီ!' : 'Broadcast pushed to all user dashboards!');
  };

  const handleClearBroadcast = () => {
    setBroadcast(null);
    api.admin.clearBroadcast().catch(() => {});
    showToast(lang === 'my' ? 'ကြေညာချက် ရပ်တန့်ပြီးပါပြီ' : 'Broadcast cleared');
  };

  // Notification center — shared for user & admin dashboards.
  // Persisted: every notification lives in the DB and is reloaded on mount,
  // so the panel always shows the full history.
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const normalizeNotification = (n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    kind: n.kind || 'info',
    read: typeof n.read === 'boolean' ? n.read : n.read_at != null,
    time: n.createdAt || n.time || 'Just now',
    createdAt: n.createdAt || null,
  });

  const loadNotifications = useCallback(() => {
    if (!getToken()) return Promise.resolve();
    return api.getNotifications()
      .then((d) => {
        if (Array.isArray(d?.notifications)) {
          setNotifications(d.notifications.map(normalizeNotification));
        }
      })
      .catch(() => {});
  }, []);

  // Cache first paint; live notifications arrive via the /bootstrap wave
  // below (or loadNotifications() when the user changes).
  useEffect(() => {
    const cached = loadTrackerStorage()?.notifications;
    if (Array.isArray(cached) && cached.length) setNotifications(cached);
  }, [authUser?.id]);

  const pushNotification = useCallback(({ title, body, kind = 'info' }) => {
    // Optimistic local entry; the server row replaces it once created.
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id: localId, title, body, kind, read: false, time: 'Just now', createdAt: null };
    setNotifications((prev) => [entry, ...prev]);

    if (getToken()) {
      api.createNotification({ title, body, kind })
        .then((d) => {
          if (!d?.notification) return;
          setNotifications((prev) =>
            prev.map((n) => (n.id === localId ? normalizeNotification(d.notification) : n))
          );
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (notifications.length) persistTrackerStorage({ notifications });
  }, [notifications]);

  // Keep joined/progress/lastLogDate in the local snapshot so a refresh paints
  // the same lock state the server will confirm — otherwise the cached copy
  // resurrects a clickable "Log Clean Day" button until the refetch lands.
  useEffect(() => {
    persistTrackerStorage({ challenges });
  }, [challenges]);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const markAllNotifsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (getToken()) api.markAllNotificationsRead().catch(() => {});
  }, []);

  const deleteNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (getToken() && /^n-\d+$/.test(id)) {
      api.deleteNotification(id).catch(() => {});
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    if (getToken()) api.clearNotifications().catch(() => {});
  }, []);

  // ---- Real-time peak-craving alerts -----------------------------------
  // Polls /notifications/due every 30s while logged in. The backend marks a
  // heatmap cell's weekly window as "armed" when it's set to Peak (2), then
  // delivers one notification the moment that window starts.
  useEffect(() => {
    const buildText = (meta) => {
      const label =
        meta && typeof meta.slot_index === 'number'
          ? timeBlocksList[meta.slot_index]
          : '12–3 PM';
      return lang === 'my'
        ? {
            title: 'နောက်ဆုံးအခြေအနေ ပြင်းထန်ဆုံး',
            body: `သင့်ရဲ့ သောက်ချင်စိတ်ပြင်းထန်ဆုံး အချိန်ပိုင်း (${label}) စတာနေပါပြီ — ခါးစောင့်ပါ!`,
          }
        : {
            title: 'Peak Craving Window',
            body: `Your peak craving window (${label}) is starting — stay strong!`,
          };
    };

    const fireBrowser = (title, body) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (window.Notification.permission === 'granted') {
        new window.Notification(title, { body });
      }
    };

    const poll = () => {
      if (!getToken()) return;
      api.getDueNotifications()
        .then((d) => {
          const due = Array.isArray(d?.notifications) ? d.notifications : [];
          if (!due.length) return;
          // A just-fetched row may already be in the history list (same id),
          // so only add ids we don't have yet.
          setNotifications((prev) => {
            const seen = new Set(prev.map((n) => n.id));
            const fresh = due
              .filter((n) => !seen.has(n.id))
              .map((n) => {
                const { title, body } =
                  n.kind === 'peak-craving' ? buildText(n.meta) : { title: n.title, body: n.body };
                fireBrowser(title, body);
                return normalizeNotification({ ...n, title, body });
              });
            return fresh.length ? [...fresh, ...prev] : prev;
          });
        })
        .catch(() => {});
    };

    // Ask for notification permission once on first poll.
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission().catch(() => {});
    }
    const interval = setInterval(poll, 30 * 1000);
    const t = setTimeout(poll, 3000); // first check shortly after mount
    return () => { clearInterval(interval); clearTimeout(t); };
  }, [isAdmin, lang, timeBlocksList]);

  // Open Report Modal for blog, post, comment, or profile-image
  const handleOpenReportModal = (targetObj) => {
    setReportModalTarget(targetObj);
  };

  const handleCloseReportModal = () => {
    setReportModalTarget(null);
  };

  const handleSubmitReport = (reason, note = '') => {
    if (!reportModalTarget) return;
    api.submitReport({
      target_type: reportModalTarget.targetType,
      target_id: String(reportModalTarget.targetId),
      parent_id: reportModalTarget.parentId ? String(reportModalTarget.parentId) : null,
      target_author: reportModalTarget.targetAuthor || 'Community User',
      reason,
      note,
      excerpt: reportModalTarget.excerpt || '',
    }).catch(() => {});
    setReportModalTarget(null);
    pushNotification({
      title: lang === 'my' ? 'တိုင်ကြားချက် အသစ်' : 'New Report Submitted',
      body: lang === 'my' ? 'သုံးစွဲသူတစ်ဦးမှ အကြောင်းအရာ တိုင်းကြားထားသည်' : `A user reported ${reportModalTarget.targetType} content.`,
      kind: 'report',
    });
    showToast(t.reportModal.submittedToast);
  };

  // Blog Actions (Create, Like, Delete, Comment)
  // Returns the create promise (or null when not signed in) so callers can
  // react to success/failure instead of assuming the publish worked.
  const handleCreateBlog = ({ title, category, content, image, images }) => {
    if (!getToken()) {
      showToast(lang === 'my' ? 'ဆောင်းပါးတင်ရန် အကောင့်ဝင်ပါ' : 'Please sign in to publish a blog');
      return null;
    }
    const photoList = Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);
    const fd = new FormData();
    fd.append('title', title.trim() || 'Untitled Lunglow Article');
    fd.append('category', category || 'Tips & Tricks');
    fd.append('content', content.trim());
    photoList.slice(0, 5).forEach((src, i) => {
      const f = dataUrlToFile(src, `blog-${i}.png`);
      if (f) fd.append('images[]', f);
    });
    return api.createBlog(fd)
      .then((d) => {
        if (d?.blog) {
          setBlogs((prev) => {
            const next = [d.blog, ...prev];
            persistTrackerStorage({ blogs: next });
            return next;
          });
          showToast(
            lang === 'my'
              ? 'ဘလော့ဂ်ဆောင်းပါးအသစ် တင်ပြီးပါပြီ!'
              : 'Published new blog article!'
          );
        }
      })
      .catch((err) => {
        // Clear a stale/expired token so the next publish re-authenticates cleanly.
        if (err?.status === 401) setToken(null);
        showToast(
          lang === 'my'
            ? 'ဆောင်းပါးတင်၍မရပါ - ထပ်ကြိုးစားပါ'
            : (err?.message || 'Could not publish blog. Please try again.')
        );
        throw err;
      });
  };

  const handleToggleBlogLike = (blogId) => {
    // Optimistic toggle, then sync the real count from the server.
    setBlogs((prev) => {
      const next = prev.map((b) => {
        if (b.id !== blogId) return b;
        const nextLiked = !b.userLiked;
        return {
          ...b,
          userLiked: nextLiked,
          likes: Math.max(0, b.likes + (nextLiked ? 1 : -1)),
        };
      });
      persistTrackerStorage({ blogs: next });
      return next;
    });
    api.likeBlog(blogId)
      .then((d) => {
        if (d?.blog) {
          setBlogs((prev) => {
            const next = prev.map((b) => (b.id === blogId ? d.blog : b));
            persistTrackerStorage({ blogs: next });
            return next;
          });
        }
      })
      .catch(() => {});
  };

  const handleDeleteBlog = (blogId) => {
    setBlogs((prev) => {
      const next = prev.filter((b) => b.id !== blogId);
      persistTrackerStorage({ blogs: next });
      return next;
    });
    setReports((prev) => prev.filter((r) => !(r.targetType === 'blog' && r.targetId === blogId)));
    if (typeof blogId === 'number' || /^(blog-)?\d+$/.test(String(blogId))) {
      api.deleteBlog(blogId).catch(() => {});
    }
    showToast(lang === 'my' ? 'ဘလော့ဂ်ကို ဖျက်ပြီးပါပြီ' : 'Blog article deleted');
  };

  const handleAddBlogComment = (blogId, text) => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    api.addComment('blog', blogId, trimmed)
      .then((d) => {
        if (d?.comment) {
          setBlogs((prev) => {
            const next = prev.map((b) =>
              b.id === blogId ? { ...b, comments: [...(b.comments || []), d.comment] } : b
            );
            persistTrackerStorage({ blogs: next });
            return next;
          });
        }
      })
      .catch(() => {});
  };

  const handleDeleteBlogComment = (blogId, commentId) => {
    setBlogs((prev) => {
      const next = prev.map((b) =>
        b.id === blogId
          ? { ...b, comments: (b.comments || []).filter((c) => c.id !== commentId) }
          : b
      );
      persistTrackerStorage({ blogs: next });
      return next;
    });
    setReports((prev) =>
      prev.filter((r) => !(r.targetType === 'comment' && r.targetId === commentId))
    );
    if (typeof commentId === 'number' || /^([a-z]+-)?\d+$/i.test(String(commentId))) {
      api.deleteComment(commentId).catch(() => {});
    }
    showToast(lang === 'my' ? 'မှတ်ချက်ကို ဖျက်ပြီးပါပြီ' : 'Comment deleted');
  };

  // Community Feed Tip Post & Comment Actions
  const handleCreateTipPost = ({ title, tipCategory, content, image }) => {
    const fd = new FormData();
    fd.append('post_type', 'tip');
    fd.append('tip_category', tipCategory || 'Tips & Tricks');
    fd.append('title', title.trim() || 'Smoke-Free Tip');
    fd.append('content', content.trim());
    if (image) {
      const f = dataUrlToFile(image, 'tip.png');
      if (f) fd.append('image', f);
    }
    api.createPost(fd)
      .then((d) => {
        if (d?.post) {
          setPosts((prev) => {
            const next = [d.post, ...prev];
            persistTrackerStorage({ posts: next });
            return next;
          });
        }
      })
      .catch(() => {});
    showToast(
      lang === 'my'
        ? 'အကြံပြုချက်ပို့စ်အသစ် တင်ပြီးပါပြီ!'
        : 'Shared your tip post to Community Feed!'
    );
  };

  const handleAddPostComment = (postId, text) => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    api.addComment('post', postId, trimmed)
      .then((d) => {
        if (d?.comment) {
          setPosts((prev) => {
            const next = prev.map((p) =>
              p.id === postId ? { ...p, comments: [...(p.comments || []), d.comment] } : p
            );
            persistTrackerStorage({ posts: next });
            return next;
          });
        }
      })
      .catch(() => {});
  };

  const handleDeletePostComment = (postId, commentId) => {
    setPosts((prev) => {
      const next = prev.map((p) =>
        p.id === postId
          ? { ...p, comments: (p.comments || []).filter((c) => c.id !== commentId) }
          : p
      );
      persistTrackerStorage({ posts: next });
      return next;
    });
    setReports((prev) =>
      prev.filter((r) => !(r.targetType === 'comment' && r.targetId === commentId))
    );
    if (typeof commentId === 'number' || /^([a-z]+-)?\d+$/i.test(String(commentId))) {
      api.deleteComment(commentId).catch(() => {});
    }
    showToast(lang === 'my' ? 'မှတ်ချက်ကို ဖျက်ပြီးပါပြီ' : 'Comment deleted');
  };

  // Admin Moderation & User Management Actions
  const handleAdminResolveReport = (report, action = 'delete') => {
    if (action === 'delete') {
      if (report.targetType === 'blog') {
        setBlogs((prev) => prev.filter((b) => b.id !== report.targetId));
      } else if (report.targetType === 'post') {
        setPosts((prev) => prev.filter((p) => p.id !== report.targetId));
      } else if (report.targetType === 'comment') {
        setBlogs((prev) =>
          prev.map((b) => ({
            ...b,
            comments: (b.comments || []).filter((c) => c.id !== report.targetId),
          }))
        );
        setPosts((prev) =>
          prev.map((p) => ({
            ...p,
            comments: (p.comments || []).filter((c) => c.id !== report.targetId),
          }))
        );
      } else if (report.targetType === 'profile-image') {
        setManagedUsers((prev) =>
          prev.map((u) =>
            u.id === report.targetId || u.name === report.targetAuthor
              ? { ...u, avatar: ASSETS.avatar }
              : u
          )
        );
        if (report.targetAuthor === userName) {
          setUserAvatar(ASSETS.avatar);
        }
      }
      showToast(
        lang === 'my'
          ? 'တိုင်ကြားထားသော အကြောင်းအရာ/ပုံကို Admin မှ ဖျက်သိမ်းပြီးပါပြီ!'
          : 'Admin action completed: Reported item removed!'
      );
    } else {
      showToast(
        lang === 'my'
          ? 'တိုင်ကြားချက်ကို ပယ်ဖျက်ပြီးပါပြီ'
          : 'Report dismissed by Admin.'
      );
    }
    setReports((prev) => prev.filter((r) => r.id !== report.id));
    if (typeof report.id === 'number' || /^(rep-)?\d+$/.test(String(report.id))) {
      api.admin.resolveReport(report.id, action).then(refreshAdminAnalytics).catch(() => {});
    }
  };

  const handleAdminToggleUserStatus = (userId) => {
    const target = managedUsers.find((u) => u.id === userId);
    if (target?.role === 'admin') {
      showToast(lang === 'my' ? 'Admin အကောင့်ကို ဆိုင်းငံ့၍ မရပါ' : 'Admin accounts cannot be suspended');
      return;
    }
    setManagedUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, status: u.status === 'active' ? 'suspended' : 'active' }
          : u
      )
    );
    api.admin.toggleUserStatus(userId).then(refreshAdminAnalytics).catch(() => {});
    showToast(lang === 'my' ? 'အသုံးပြုသူ အခြေအနေ ပြောင်းလဲပြီးပါပြီ' : 'Updated user account status');
  };

  const handleAdminResetUserAvatar = (userId, targetName) => {
    setManagedUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, avatar: ASSETS.avatar } : u))
    );
    api.admin.resetUserAvatar(userId).catch(() => {});
    if (targetName === userName) {
      setUserAvatar(ASSETS.avatar);
    }
    setReports((prev) =>
      prev.filter((r) => !(r.targetType === 'profile-image' && r.targetId === userId))
    );
    showToast(lang === 'my' ? 'ပရိုဖိုင်ပုံကို မူလပုံသို့ ပြန်ပြောင်းပြီးပါပြီ' : 'Reset user profile image to default');
  };

  // When the signed-in member changes (login/logout), reset in-memory state
  // to the current cache so stale data from a previous session never lingers.
  const prevAuthIdRef = React.useRef(authUser?.id);
  useEffect(() => {
    if (prevAuthIdRef.current !== authUser?.id) {
      prevAuthIdRef.current = authUser?.id;
      const snap = loadTrackerStorage() || {};
      const authed = !!getToken();
      setLogsByDate(snap.logsByDate ?? (authed ? {} : INITIAL_LOGS_BY_DATE));
      setGoals(snap.goals ?? (authed ? [] : INITIAL_GOALS));
      setHeatmapData(snap.heatmap ?? (authed ? {} : INITIAL_HEATMAP));
      setReminders(snap.reminders ?? (authed ? [] : INITIAL_REMINDERS));
      setCheckedInToday(snap.checkedInDate === TODAY_KEY);
      if (snap.settings) {
        setDailyLimit(Number(snap.settings.daily_limit) || 20);
        setCigPrice(Number(snap.settings.cig_price) || 0.5);
        setLimitFormCigs(Number(snap.settings.daily_limit) || 20);
        setLimitFormPrice(Number(snap.settings.cig_price) || 0.5);
      } else {
        setDailyLimit(20);
        setCigPrice(0.5);
        setLimitFormCigs(20);
        setLimitFormPrice(0.5);
      }
      if (!isAdmin) {
        setUserRequests(snap.userRequests ?? (authed ? [] : INITIAL_USER_REQUESTS));
      }
    }
  }, [authUser?.id, isAdmin]);
  // On mount (and when the signed-in user or surface changes), pull all live
  // records in a SINGLE /api/bootstrap round-trip for near-instant loading.
  useEffect(() => {
    let cancelled = false;
    const authed = !!getToken();
    const onAuthPage = ['login', 'register', 'admin-login'].includes(page);
    if (onAuthPage && !authed) {
      setDataReady(true);
      return () => { cancelled = true; };
    }

    const currentCache = loadTrackerStorage() || {};
    const hadCache = currentCache.posts || currentCache.logsByDate || currentCache.heatmap;
    if (hadCache) {
      setDataReady(true);
    }

    const readyTimeout = setTimeout(() => { if (!cancelled) setDataReady(true); }, 800);

    api.bootstrap()
      .then((d) => {
        if (cancelled || !d) return;
        const storagePatch = {};

        if (Array.isArray(d.posts)) {
          setPosts(d.posts);
          storagePatch.posts = d.posts;
        }
        if (Array.isArray(d.blogs)) {
          setBlogs(d.blogs);
          storagePatch.blogs = d.blogs;
        }
        if (Array.isArray(d.challenges)) {
          setChallenges(d.challenges);
          storagePatch.challenges = d.challenges;
        }
        if ('broadcast' in d) {
          setBroadcast(d.broadcast || null);
        }

        if (d.user) {
          const onAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
          setCachedUser(d.user, { admin: onAdmin });
          setUserName(d.user.name);
          if (d.user.avatar) setUserAvatar(d.user.avatar);
          if (typeof d.user.resisted_count === 'number') setResistedCount(d.user.resisted_count);
        } else if (authed) {
          // Had a stale/revoked token (e.g. after DB rebuild) — clear it and reset
          // member state to clean defaults so old cached records don't linger.
          const onAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
          setToken(null, { admin: onAdmin });
          setCachedUser(null, { admin: onAdmin });
        }

        if (d.logsByDate && typeof d.logsByDate === 'object') {
          setLogsByDate(d.logsByDate);
          storagePatch.logsByDate = d.logsByDate;
        }
        if (Array.isArray(d.goals)) {
          setGoals(d.goals);
          storagePatch.goals = d.goals;
        }
        if (Array.isArray(d.reminders) && d.reminders.length) {
          setReminders(d.reminders);
          storagePatch.reminders = d.reminders;
        }
        if (Array.isArray(d.checkins)) {
          const checked = d.checkins.some((c) => c.date === TODAY_KEY);
          setCheckedInToday(checked);
          storagePatch.checkedInDate = checked ? TODAY_KEY : null;
        }
        if (d.heatmap && typeof d.heatmap === 'object') {
          setHeatmapData(d.heatmap);
          storagePatch.heatmap = d.heatmap;
        }
        if (d.settings) {
          const limit = Number(d.settings.daily_limit) || 20;
          const price = Number(d.settings.cig_price) || 0.5;
          setDailyLimit(limit);
          setCigPrice(price);
          setLimitFormCigs(limit);
          setLimitFormPrice(price);
          storagePatch.settings = { daily_limit: limit, cig_price: price };
        }
        if (Array.isArray(d.notifications)) {
          const norm = d.notifications.map(normalizeNotification);
          setNotifications(norm);
          storagePatch.notifications = norm;
        }
        if (Array.isArray(d.requests)) {
          setUserRequests(d.requests);
          if (!isAdmin) storagePatch.userRequests = d.requests;
        }
        if (Array.isArray(d.users)) {
          setManagedUsers(d.users);
        }
        if (Array.isArray(d.reports)) {
          setReports(d.reports);
        }
        if (d.analytics) {
          setAdminAnalytics(d.analytics);
        }

        if (Object.keys(storagePatch).length > 0) {
          persistTrackerStorage(storagePatch);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDataReady(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, authUser?.id, ADMIN_PAGE_IDS.includes(page), ['login', 'register', 'admin-login'].includes(page)]);

  const metrics = useMemo(() => {
    const base = calculateMetrics(logsByDate, dailyLimit, cigPrice, smokedToday);
    return {
      ...base,
      currentStreak: base.currentStreak + (checkedInToday ? 1 : 0),
    };
  }, [logsByDate, dailyLimit, cigPrice, smokedToday, checkedInToday]);

  const currentWeekBars = useMemo(
    () => calculateWeekBars(logsByDate, dailyLimit, weekdaysList),
    [logsByDate, dailyLimit, weekdaysList]
  );

  const calendarData = useMemo(
    () => calculateCalendarMonth(selectedYear, selectedMonthIdx, logsByDate, dailyLimit),
    [selectedYear, selectedMonthIdx, logsByDate, dailyLimit]
  );

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Optimistic preview while the upload runs.
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUserAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
    // Persist the actual file to the backend (public/storage/avatars).
    const fd = new FormData();
    fd.append('avatar', file);
    api.uploadAvatar(fd)
      .then((d) => {
        if (d?.avatar) setUserAvatar(d.avatar);
        if (d?.user) setCachedUser(d.user);
      })
      .catch(() => {})
      .finally(() =>
        showToast(lang === 'my' ? 'ပရိုဖိုင်ပုံ ပြောင်းလဲပြီးပါပြီ!' : 'Profile photo updated!')
      );
  };

  const handleSaveProfileName = (e) => {
    e.preventDefault();
    const cleaned = tempName.trim() || 'Member';
    setUserName(cleaned);
    const cached = getCachedUser();
    if (cached) setCachedUser({ ...cached, name: cleaned });
    setPosts((prev) => prev.map((p) => (p.isYou ? { ...p, author: cleaned } : p)));
    setIsEditingProfile(false);
    // Persist the display name to the backend.
    api.updateProfile({ name: cleaned })
      .then((d) => { if (d?.user) setCachedUser(d.user); })
      .catch(() => {});
    showToast(lang === 'my' ? 'ပရိုဖိုင်အမည် ပြောင်းလဲပြီးပါပြီ!' : 'Profile updated!');
  };

  const handleSaveLimit = (isOnboarding = false) => {
    const newLimit = Math.max(1, Number(limitFormCigs) || 20);
    const newPrice = Math.max(0.05, Number(limitFormPrice) || 0.5);
    setDailyLimit(newLimit);
    setCigPrice(newPrice);
    setLimitFormCigs(newLimit);
    setLimitFormPrice(newPrice);
    persistTrackerStorage({ settings: { daily_limit: newLimit, cig_price: newPrice } });
    // Persist settings to the backend.
    api.saveSettings({ daily_limit: newLimit, cig_price: newPrice }).catch(() => {});
    showToast(
      lang === 'my'
        ? `သိမ်းဆည်းပြီးပါပြီ - တစ်နေ့ ${newLimit} လိပ် ($${newPrice}/လိပ်)`
        : `Saved: Limit ${newLimit} cigs/day at $${newPrice}/cig`
    );
    if (isOnboarding) {
      setPage('home');
    }
  };

  const handleAddGoal = (e) => {
    e.preventDefault();
    const title = newGoalTitle.trim() || 'New Goal';
    const price = Math.max(1, Number(newGoalPrice) || 100);
    // Optimistic row; replaced by the real record when the API responds.
    const tempId = `tmp-${Date.now()}`;
    setGoals((prev) => {
      const next = [...prev, { id: tempId, title, price }];
      persistTrackerStorage({ goals: next });
      return next;
    });
    api.addGoal({ title, price })
      .then((d) => {
        if (d?.goal) {
          setGoals((prev) => {
            const next = prev.map((g) => (g.id === tempId ? d.goal : g));
            persistTrackerStorage({ goals: next });
            return next;
          });
        }
      })
      .catch(() => {});
    setNewGoalTitle('');
    setNewGoalPrice(500);
    showToast(
      lang === 'my'
        ? `ပန်းတိုင်အသစ် ထည့်သွင်းပြီးပါပြီ - ${title} (${price}$)`
        : `Added goal: ${title} (${price}$)`
    );
  };

  const handleDeleteGoal = (goalId) => {
    setGoals((prev) => {
      const next = prev.filter((item) => item.id !== goalId);
      persistTrackerStorage({ goals: next });
      return next;
    });
    if (typeof goalId === 'number' || /^\d+$/.test(goalId)) {
      api.deleteGoal(goalId).catch(() => {});
    }
  };

  const handleShareProgressCard = () => {
    const tabMap = {
      progress: {
        badgeKey: 'progress',
        stats: [
          { value: `${metrics.longestStreak} ${t.profile.daysUnit}`, labelKey: 'longestStreak' },
          { value: `${metrics.currentStreak} ${t.profile.daysUnit}`, labelKey: 'currentStreak' },
          { value: `${metrics.cleanDaysThisMonth} ${t.profile.daysUnit}`, labelKey: 'cleanDaysMonth' },
        ],
      },
      vault: {
        badgeKey: 'vault',
        stats: [
          { value: `${metrics.totalSavedMoney} $`, labelKey: 'totalSavedMoney' },
          { value: `${metrics.totalAvoidedCigarettes}`, labelKey: 'avoidedCigs' },
          { value: `${metrics.totalReducedAndCleanDays} ${t.profile.daysUnit}`, labelKey: 'totalReducedCleanDays' },
        ],
      },
      'clean-weeks': {
        badgeKey: 'clean-weeks',
        stats: [
          { value: `${metrics.totalCleanWeeks}`, labelKey: 'totalCleanWeeks' },
          { value: `${metrics.slipsRecorded}`, labelKey: 'slipRecorded' },
          { value: `${metrics.capAdherence} %`, labelKey: 'capAdherence' },
        ],
      },
    };
    const chosen = tabMap[profileTab];
    // Persist the shared progress/vault/clean-weeks card to the DB.
    api.createPost({
      post_type: 'progress',
      badge_key: chosen.badgeKey,
      stats: chosen.stats,
    })
      .then((d) => {
        if (d?.post) {
          setPosts((prev) => {
            const next = [d.post, ...prev];
            persistTrackerStorage({ posts: next });
            return next;
          });
        }
      })
      .catch(() => {});
    showToast(lang === 'my' ? 'အသိုင်းအဝိုင်းသို့ မျှဝေပြီးပါပြီ!' : 'Shared to Community Feed!');
    setPage('community');
  };

  // Feature 5: Share Milestone Card to Community Feed or Download as PNG
  const handleShareMilestoneCard = (milestoneItem) => {
    // Persist the milestone card to the DB.
    api.createPost({
      post_type: 'progress',
      badge_custom: milestoneItem.badge,
      stats: [
        { value: milestoneItem.statValue, label: milestoneItem.title },
        { value: `${metrics.currentStreak} ${t.profile.daysUnit}`, labelKey: 'currentStreak' },
        { value: `${metrics.totalSavedMoney} $`, labelKey: 'totalSavedMoney' },
      ],
    })
      .then((d) => {
        if (d?.post) {
          setPosts((prev) => {
            const next = [d.post, ...prev];
            persistTrackerStorage({ posts: next });
            return next;
          });
        }
      })
      .catch(() => {});
    showToast(lang === 'my' ? 'အောင်မြင်မှုမှတ်တိုင်ကို မျှဝေပြီးပါပြီ!' : 'Shared Milestone Card to Community Feed!');
    setPage('community');
  };

  const handleDownloadMilestonePng = (milestoneItem) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 560;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark Lunglow background with emerald glow
      const grad = ctx.createLinearGradient(0, 0, 1080, 560);
      grad.addColorStop(0, '#0B130A');
      grad.addColorStop(1, '#142611');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 560);

      // Subtle border
      ctx.strokeStyle = '#5FB032';
      ctx.lineWidth = 4;
      ctx.strokeRect(24, 24, 1032, 512);

      // Brand header
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 42px Inter, sans-serif';
      ctx.fillText('Lunglow', 70, 95);

      ctx.fillStyle = '#CABA3A';
      ctx.font = 'bold 26px Inter, sans-serif';
      ctx.fillText(milestoneItem.badge.toUpperCase(), 70, 165);

      // Stat value & title
      ctx.fillStyle = '#5FB032';
      ctx.font = 'bold 86px Inter, sans-serif';
      ctx.fillText(milestoneItem.statValue, 70, 275);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 40px Inter, sans-serif';
      ctx.fillText(milestoneItem.title, 70, 345);

      ctx.fillStyle = '#CCCCCC';
      ctx.font = '24px Inter, sans-serif';
      ctx.fillText(milestoneItem.desc, 70, 400);

      ctx.fillStyle = '#CABA3A';
      ctx.font = '24px Inter, sans-serif';
      ctx.fillText(`Achieved by ${userName} • Every Clean Day Makes Your Lung Glow`, 70, 480);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `lunglow-milestone-${milestoneItem.id}.png`;
      link.href = dataUrl;
      link.click();
      showToast(lang === 'my' ? 'မှတ်တိုင်ပုံကို ဒေါင်းလုဒ်ရယူပြီးပါပြီ!' : 'Milestone badge PNG downloaded!');
    } catch {
      showToast('Milestone badge ready!');
    }
  };

  const handleReaction = (postId, type) => {
    // Optimistic toggle, then reconcile with the authoritative server count.
    setPosts((prev) => {
      const next = prev.map((post) => {
        if (post.id !== postId) return post;
        const already = !!post.userReacted?.[type];
        return {
          ...post,
          reactions: {
            ...post.reactions,
            [type]: Math.max(0, (post.reactions?.[type] ?? 0) + (already ? -1 : 1)),
          },
          userReacted: { ...post.userReacted, [type]: !already },
        };
      });
      persistTrackerStorage({ posts: next });
      return next;
    });
    api.reactPost(postId, type)
      .then((d) => {
        if (d?.post) {
          setPosts((prev) => {
            const next = prev.map((p) => (p.id === postId ? d.post : p));
            persistTrackerStorage({ posts: next });
            return next;
          });
        }
      })
      .catch(() => {});
  };

  const handleDeletePost = (postId) => {
    setPosts((prev) => {
      const next = prev.filter((p) => p.id !== postId);
      persistTrackerStorage({ posts: next });
      return next;
    });
    if (typeof postId === 'number' || /^(post-)?\d+$/.test(String(postId))) {
      api.deletePost(postId).catch(() => {});
    }
    showToast(lang === 'my' ? 'ပို့စ်ကို ဖျက်ပြီးပါပြီ' : 'Post deleted from Community Feed');
  };

  return (
    <LunglowDataContext.Provider
      value={{
        page,
        setPage,
        toastMessage,
        toastTone,
        showToast,
        logoutModalOpen,
        setLogoutModalOpen,
        dailyLimit,
        cigPrice,
        limitFormCigs,
        setLimitFormCigs,
        limitFormPrice,
        setLimitFormPrice,
        handleSaveLimit,
        smokedToday,
        setSmokedToday,
        selectedTrigger,
        setSelectedTrigger,
        resistedCount,
        handleResistTrigger,
        heatmapData,
        handleToggleHeatmapCell,
        handleLogCravingNow,
        peakWindowLabel,
        selectedMood,
        setSelectedMood,
        checkedInToday,
        handleCompleteCheckIn,
        reminders,
        handleToggleReminder,
        handleUpdateReminderTime,
        handleTestPushReminder,
        breathingTimer,
        walkingTimer,
        getBreathingPhase,
        isInhalePhase,
        selectedMonthIdx,
        setSelectedMonthIdx,
        selectedYear,
        setSelectedYear,
        calendarFilter,
        setCalendarFilter,
        goals,
        newGoalTitle,
        setNewGoalTitle,
        newGoalPrice,
        setNewGoalPrice,
        handleAddGoal,
        handleDeleteGoal,
        profileTab,
        setProfileTab,
        handleShareProgressCard,
        handleShareMilestoneCard,
        handleDownloadMilestonePng,
        feedFilter,
        setFeedFilter,
        posts,
        handleReaction,
        handleDeletePost,
        blogs,
        handleCreateBlog,
        handleToggleBlogLike,
        handleDeleteBlog,
        handleAddBlogComment,
        handleDeleteBlogComment,
        handleCreateTipPost,
        handleAddPostComment,
        handleDeletePostComment,
        reports,
        reportFocusId,
        setReportFocusId,
        reportModalTarget,
        handleOpenReportModal,
        handleCloseReportModal,
        handleSubmitReport,
        managedUsers,
        adminAnalytics,
        refreshAdminAnalytics,
        handleAdminResolveReport,
        handleAdminToggleUserStatus,
        handleAdminResetUserAvatar,
        challenges,
        handleAdminAddChallenge,
        handleAdminToggleChallenge,
        handleAdminDeleteChallenge,
        handleAdminUpdateChallengeCover,
        handleJoinChallenge,
        handleChallengeLogDay,
        userRequests,
        handleSubmitUserRequest,
        handleAdminUpdateRequestStatus,
        handleAdminDeleteRequest,
        broadcast,
        handlePublishBroadcast,
        handleClearBroadcast,
        notifications,
        notifOpen,
        setNotifOpen,
        pushNotification,
        unreadNotifCount,
        markAllNotifsRead,
        deleteNotification,
        clearNotifications,
        handlePhotoUpload,
        handleSaveProfileName,
        metrics,
        currentWeekBars,
        calendarData,
        dataReady,
      }}
    >
      {dataReady ? children : <LunglowHydrating />}
    </LunglowDataContext.Provider>
  );
}

// Branded splash shown while the first hydration wave is in flight.
function LunglowHydrating() {
  return (
    <div className="min-h-screen bg-[#0B130A] flex flex-col items-center justify-center gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-[#1C3A13] border-t-[#5FB032] animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-2xl">🫁</div>
      </div>
      <p className="text-[#9CC88A] text-sm font-semibold tracking-widest uppercase">
        Loading Lunglow…
      </p>
    </div>
  );
}
