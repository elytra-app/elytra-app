/* =========================================================
   ELYTRA — app.js
   Single source of truth for demo state, navigation, XP,
   streaks, quests, achievements, and shared UI helpers.
   Every page loads this file, then calls Elytra.boot(pageId).
   ========================================================= */

const Elytra = (() => {

  const STORAGE_KEY = "elytra_state_v1";

  /* ---------- static data ---------- */

  const NAV_ITEMS = [
    { id: "dashboard",     label: "Dashboard",     href: "dashboard.html",    icon: "🏠" },
    { id: "learn",         label: "Learn",         href: "learn.html",        icon: "📘" },
    { id: "quests",        label: "Quests",        href: "quests.html",       icon: "🎯" },
    { id: "doubts",        label: "Doubt Hub",     href: "doubts.html",       icon: "💬" },
    { id: "progress",      label: "Progress",      href: "progress.html",     icon: "📈" },
    { id: "coach",         label: "AI Coach",      href: "coach.html",        icon: "🤖" },
    { id: "achievements",  label: "Achievements",  href: "achievements.html", icon: "🏅" },
    { id: "settings",      label: "Settings",      href: "settings.html",     icon: "⚙️" },
    { id: "profile",       label: "Profile",       href: "profile.html",      icon: "🧑‍🚀" },
  ];

  const QUESTS = [
    { id: "q_first_lesson",  title: "Finish your first lesson",     xp: 30,  hint: "Complete any lesson in Learn." },
    { id: "q_quiz_80",       title: "Score 80%+ on a quiz",          xp: 40,  hint: "Take the Electricity quiz." },
    { id: "q_post_doubt",    title: "Post a doubt",                  xp: 15,  hint: "Ask something in the Doubt Hub." },
    { id: "q_help_peer",     title: "Help another student",          xp: 20,  hint: "Answer a doubt in the Doubt Hub." },
    { id: "q_streak_3",      title: "Keep a 3-day streak",           xp: 50,  hint: "Come back and learn 3 days running." },
    { id: "q_ask_coach",     title: "Ask the AI Coach a question",   xp: 15,  hint: "Visit AI Coach and ask anything." },
  ];

  const ACHIEVEMENTS = [
    { id: "a_first_step",  title: "First Step",       icon: "👣", desc: "Complete your very first lesson.",     test: s => s.completedLessons.length >= 1 },
    { id: "a_sparkler",    title: "Sparkler",         icon: "⚡", desc: "Finish the Electricity lesson.",        test: s => s.completedLessons.includes("electricity") },
    { id: "a_quiz_ace",    title: "Quiz Ace",         icon: "🎓", desc: "Score 80% or higher on any quiz.",      test: s => Object.values(s.quizScores).some(v => v >= 80) },
    { id: "a_helper",      title: "Helping Hand",     icon: "🤝", desc: "Help another student in the Doubt Hub.", test: s => s.doubtsHelped >= 1 },
    { id: "a_curious",     title: "Curious Mind",     icon: "🔍", desc: "Post 3 doubts of your own.",            test: s => s.doubtsPosted >= 3 },
    { id: "a_streaker",    title: "On a Roll",        icon: "🔥", desc: "Reach a 3-day streak.",                 test: s => s.streak >= 3 },
    { id: "a_quest_master",title: "Quest Master",     icon: "🎯", desc: "Complete every quest.",                 test: s => s.questsDone.length >= QUESTS.length },
    { id: "a_level_5",     title: "Rising Star",      icon: "🌟", desc: "Reach Level 5.",                        test: s => s.level >= 5 },
  ];

  const SAMPLE_DOUBTS = [
    { id: "d1", subject: "Electricity", text: "Why does a bulb glow dimmer when more bulbs are added in series?", author: "Riya", helped: false, replies: 2 },
    { id: "d2", subject: "Science", text: "What's the actual difference between mass and weight?", author: "Kabir", helped: false, replies: 1 },
    { id: "d3", subject: "Electricity", text: "How is a fuse different from an MCB?", author: "Sana", helped: true, replies: 3 },
  ];

  /* ---------- state ---------- */

  function defaultState() {
    return {
      loggedIn: false,
      name: "Explorer",
      level: 1,
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      completedLessons: [],      // e.g. "electricity"
      quizScores: {},            // { electricity: 85 }
      questsDone: [],            // quest ids
      unlockedAchievements: [],  // achievement ids
      doubts: SAMPLE_DOUBTS.slice(),
      doubtsPosted: 0,
      doubtsHelped: 0,
      settings: {
        theme: "dark",
        notifications: true,
      },
    };
  }

  function xpForLevel(level) { return level * 100; }

  function getState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed, {
        settings: Object.assign(defaultState().settings, parsed.settings || {}),
      });
    } catch (e) {
      return defaultState();
    }
  }

  function setState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function patchState(patch) {
    const s = getState();
    Object.assign(s, patch);
    setState(s);
    return s;
  }

  /* ---------- auth ---------- */

  function login(name) {
    const s = getState();
    s.loggedIn = true;
    s.name = (name && name.trim()) || s.name || "Explorer";
    setState(s);
    touchStreak();
  }

  function logout() {
    const s = getState();
    s.loggedIn = false;
    setState(s);
    window.location.href = "index.html";
  }

  function requireAuth() {
    const s = getState();
    if (!s.loggedIn) {
      window.location.href = "index.html";
    }
    return s;
  }

  function resetDemoData() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /* ---------- streak ---------- */

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function touchStreak() {
    const s = getState();
    const today = todayStr();
    if (s.lastActiveDate === today) return s;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.streak = s.lastActiveDate === yesterday ? s.streak + 1 : 1;
    s.lastActiveDate = today;
    setState(s);
    checkAchievements();
    return s;
  }

  /* ---------- XP / leveling ---------- */

  function addXP(amount, reason) {
    const s = getState();
    s.xp += amount;
    let leveledUp = false;
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level += 1;
      leveledUp = true;
    }
    setState(s);
    toast(`+${amount} XP${reason ? " — " + reason : ""}`);
    if (leveledUp) toast(`🎉 Level up! You're now Level ${s.level}`);
    checkAchievements();
    refreshNavStats();
    return s;
  }

  function completeQuest(questId) {
    const s = getState();
    if (s.questsDone.includes(questId)) return s;
    const quest = QUESTS.find(q => q.id === questId);
    if (!quest) return s;
    s.questsDone.push(questId);
    setState(s);
    addXP(quest.xp, quest.title);
    return getState();
  }

  function completeLesson(lessonId) {
    const s = getState();
    if (!s.completedLessons.includes(lessonId)) {
      s.completedLessons.push(lessonId);
      setState(s);
      if (s.completedLessons.length === 1) completeQuest("q_first_lesson");
    }
    return s;
  }

  function recordQuizScore(lessonId, score) {
    const s = getState();
    s.quizScores[lessonId] = Math.max(score, s.quizScores[lessonId] || 0);
    setState(s);
    if (score >= 80) completeQuest("q_quiz_80");
    checkAchievements();
    return s;
  }

  /* ---------- doubts ---------- */

  function postDoubt(subject, text) {
    const s = getState();
    s.doubts.unshift({ id: "d" + Date.now(), subject, text, author: s.name, helped: false, replies: 0 });
    s.doubtsPosted += 1;
    setState(s);
    completeQuest("q_post_doubt");
    checkAchievements();
    return s;
  }

  function helpDoubt(doubtId) {
    const s = getState();
    const d = s.doubts.find(d => d.id === doubtId);
    if (d && !d.helped) {
      d.helped = true;
      d.replies += 1;
      s.doubtsHelped += 1;
      setState(s);
      completeQuest("q_help_peer");
      checkAchievements();
    }
    return s;
  }

  /* ---------- achievements ---------- */

  function checkAchievements() {
    const s = getState();
    let unlocked = false;
    ACHIEVEMENTS.forEach(a => {
      if (!s.unlockedAchievements.includes(a.id) && a.test(s)) {
        s.unlockedAchievements.push(a.id);
        unlocked = true;
        toast(`🏅 Achievement unlocked: ${a.title}`);
      }
    });
    if (unlocked) setState(s);
  }

  /* ---------- theme ---------- */

  function applyTheme() {
    const s = getState();
    document.documentElement.setAttribute("data-theme", s.settings.theme);
  }

  function toggleTheme() {
    const s = getState();
    s.settings.theme = s.settings.theme === "dark" ? "light" : "dark";
    setState(s);
    applyTheme();
    return s.settings.theme;
  }

  /* ---------- toast ---------- */

  function toast(message) {
    let host = document.getElementById("elytra-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "elytra-toast-host";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  /* ---------- nav ---------- */

  function renderNav(activeId) {
    const mount = document.getElementById("app-nav");
    if (!mount) return;
    const s = getState();

    mount.innerHTML = `
      <div class="nav-bar">
        <a class="nav-brand" href="dashboard.html"><img src="assets/logo.png" alt="Elytra">Elytra</a>
        <button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>
        <nav class="nav-links" id="nav-links">
          ${NAV_ITEMS.map(item => `
            <a href="${item.href}" class="nav-link ${item.id === activeId ? "active" : ""}">
              <span class="nav-icon">${item.icon}</span>${item.label}
            </a>`).join("")}
          <button class="nav-link nav-logout" id="nav-logout-btn">
            <span class="nav-icon">🚪</span>Logout
          </button>
        </nav>
        <div class="nav-stats">
          <span class="pill pill-level" id="nav-level">Lv ${s.level}</span>
          <span class="pill pill-xp" id="nav-xp">${s.xp}/${xpForLevel(s.level)} XP</span>
          <span class="pill pill-streak" id="nav-streak">🔥 ${s.streak}</span>
        </div>
      </div>`;

    document.getElementById("nav-logout-btn").addEventListener("click", logout);
    document.getElementById("nav-toggle").addEventListener("click", () => {
      document.getElementById("nav-links").classList.toggle("open");
    });
  }

  function refreshNavStats() {
    const s = getState();
    const lvl = document.getElementById("nav-level");
    const xp = document.getElementById("nav-xp");
    const streak = document.getElementById("nav-streak");
    if (lvl) lvl.textContent = `Lv ${s.level}`;
    if (xp) xp.textContent = `${s.xp}/${xpForLevel(s.level)} XP`;
    if (streak) streak.textContent = `🔥 ${s.streak}`;
  }

  /* ---------- boot ---------- */

  function boot(activeId, opts = {}) {
    applyTheme();
    if (opts.public) return getState();
    const s = requireAuth();
    touchStreak();
    renderNav(activeId);
    return getState();
  }

  return {
    NAV_ITEMS, QUESTS, ACHIEVEMENTS,
    getState, patchState, xpForLevel,
    login, logout, requireAuth, resetDemoData,
    addXP, completeQuest, completeLesson, recordQuizScore,
    postDoubt, helpDoubt, checkAchievements,
    applyTheme, toggleTheme, toast,
    renderNav, refreshNavStats, boot,
  };
})();
