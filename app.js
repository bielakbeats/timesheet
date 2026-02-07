const STORAGE_KEY = "timesheet_v1";

const jobForm = document.getElementById("jobForm");
const jobNameInput = document.getElementById("jobName");
const jobsEl = document.getElementById("jobs");
const sessionsEl = document.getElementById("sessions");
const weekStartInput = document.getElementById("weekStart");
const exportBtn = document.getElementById("exportBtn");
const installBtn = document.getElementById("installBtn");

const jobTemplate = document.getElementById("jobTemplate");
const sessionTemplate = document.getElementById("sessionTemplate");

let deferredInstallPrompt = null;

const state = loadState();

initWeekStart();
render();
registerServiceWorker();

jobForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = jobNameInput.value.trim();
  if (!name) return;
  state.jobs.push({
    id: crypto.randomUUID(),
    name,
    activeSessionId: null,
  });
  jobNameInput.value = "";
  saveState();
  render();
});

weekStartInput.addEventListener("change", () => {
  saveState({ weekStart: weekStartInput.value });
  render();
});

exportBtn.addEventListener("click", () => {
  const csv = buildWeeklyExport();
  const fileName = `timesheet_${weekStartInput.value || "week"}.csv`;
  downloadFile(csv, fileName);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

function initWeekStart() {
  if (!state.weekStart) {
    state.weekStart = startOfWeek(new Date()).toISOString().slice(0, 10);
    saveState();
  }
  weekStartInput.value = state.weekStart;
}

function render() {
  renderJobs();
  renderSessions();
}

function renderJobs() {
  jobsEl.innerHTML = "";
  if (state.jobs.length === 0) {
    jobsEl.innerHTML = "<p class=\"sub\">No jobs yet. Add one above.</p>";
    return;
  }

  const week = getWeekRange();

  state.jobs.forEach((job) => {
    const node = jobTemplate.content.cloneNode(true);
    const name = node.querySelector(".job-name");
    const meta = node.querySelector(".job-meta");
    const punchBtn = node.querySelector(".punch");
    const removeBtn = node.querySelector(".remove");
    const weekEl = node.querySelector(".job-week");
    const totalsEl = node.querySelector(".totals");

    name.textContent = job.name;
    meta.textContent = job.activeSessionId ? "Currently punched in" : "Not on the clock";
    punchBtn.textContent = job.activeSessionId ? "Punch Out" : "Punch In";
    punchBtn.classList.toggle("ghost", !!job.activeSessionId);

    const weeklyTotals = calcJobTotals(job.id, week.start, week.end);

    weekEl.textContent = `Week ${formatDate(week.start)} - ${formatDate(week.end)}`;
    totalsEl.textContent = `Weekly hours: ${formatHours(weeklyTotals.totalHours)} (Sessions: ${weeklyTotals.sessions})`;

    punchBtn.addEventListener("click", () => togglePunch(job.id));
    removeBtn.addEventListener("click", () => removeJob(job.id));

    jobsEl.appendChild(node);
  });
}

function renderSessions() {
  sessionsEl.innerHTML = "";
  const recent = [...state.sessions]
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .slice(0, 12);

  if (recent.length === 0) {
    sessionsEl.innerHTML = "<p class=\"sub\">No sessions recorded yet.</p>";
    return;
  }

  recent.forEach((session) => {
    const node = sessionTemplate.content.cloneNode(true);
    const title = node.querySelector(".session-title");
    const time = node.querySelector(".session-time");
    const duration = node.querySelector(".session-duration");

    const job = state.jobs.find((item) => item.id === session.jobId);
    title.textContent = job ? job.name : "Unknown job";
    time.textContent = `${formatDateTime(session.start)} → ${session.end ? formatDateTime(session.end) : "In progress"}`;

    const hours = session.end ? durationHours(session.start, session.end) : 0;
    duration.textContent = session.end ? `${formatHours(hours)} hours` : "Running";

    sessionsEl.appendChild(node);
  });
}

function togglePunch(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;

  if (job.activeSessionId) {
    const session = state.sessions.find((item) => item.id === job.activeSessionId);
    if (session && !session.end) {
      session.end = new Date().toISOString();
    }
    job.activeSessionId = null;
  } else {
    const sessionId = crypto.randomUUID();
    state.sessions.push({
      id: sessionId,
      jobId: job.id,
      start: new Date().toISOString(),
      end: null,
    });
    job.activeSessionId = sessionId;
  }

  saveState();
  render();
}

function removeJob(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;

  if (job.activeSessionId) {
    alert("Punch out before removing this job.");
    return;
  }

  state.jobs = state.jobs.filter((item) => item.id !== jobId);
  state.sessions = state.sessions.filter((item) => item.jobId !== jobId);
  saveState();
  render();
}

function buildWeeklyExport() {
  const week = getWeekRange();
  const headers = ["Job", "Week Start", "Week End", "Sessions", "Hours"];
  const rows = state.jobs.map((job) => {
    const totals = calcJobTotals(job.id, week.start, week.end);
    return [
      job.name,
      formatDate(week.start),
      formatDate(week.end),
      totals.sessions.toString(),
      totals.totalHours.toFixed(2),
    ];
  });

  const lines = [headers, ...rows].map((row) =>
    row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
  );

  return lines.join("\n");
}

function calcJobTotals(jobId, start, end) {
  const sessions = state.sessions.filter((session) => {
    if (session.jobId !== jobId) return false;
    if (!session.end) return false;
    const startTime = new Date(session.start);
    return startTime >= start && startTime <= end;
  });

  const totalHours = sessions.reduce((sum, session) => {
    return sum + durationHours(session.start, session.end);
  }, 0);

  return { totalHours, sessions: sessions.length };
}

function durationHours(start, end) {
  return (new Date(end) - new Date(start)) / 36e5;
}

function formatHours(value) {
  return value.toFixed(2);
}

function getWeekRange() {
  const start = new Date(weekStartInput.value);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = date.getDate() - day;
  const start = new Date(date);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadFile(contents, name) {
  const blob = new Blob([contents], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { jobs: [], sessions: [], weekStart: null };
  }
  try {
    const data = JSON.parse(raw);
    return {
      jobs: data.jobs || [],
      sessions: data.sessions || [],
      weekStart: data.weekStart || null,
    };
  } catch {
    return { jobs: [], sessions: [], weekStart: null };
  }
}

function saveState(overrides = {}) {
  Object.assign(state, overrides);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
