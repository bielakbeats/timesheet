const STORAGE_KEY = "timesheet_v1";

const jobForm = document.getElementById("jobForm");
const jobNameInput = document.getElementById("jobName");
const jobRateInput = document.getElementById("jobRate");
const jobsEl = document.getElementById("jobs");
const sessionsEl = document.getElementById("sessions");
const weekStartInput = document.getElementById("weekStart");
const weekStartWrap = document.getElementById("weekStartWrap");
const installBtn = document.getElementById("installBtn");

const jobTemplate = document.getElementById("jobTemplate");
const sessionTemplate = document.getElementById("sessionTemplate");
const sessionDialog = document.getElementById("sessionDialog");
const sessionForm = document.getElementById("sessionForm");
const sessionJobSelect = document.getElementById("sessionJob");
const sessionStartInput = document.getElementById("sessionStart");
const sessionEndInput = document.getElementById("sessionEnd");
const cancelSessionBtn = document.getElementById("cancelSession");
const runningWidget = document.getElementById("runningWidget");
const runningDetails = document.getElementById("runningDetails");
const runningStop = document.getElementById("runningStop");

let deferredInstallPrompt = null;
let editSessionId = null;

const state = loadState();

initWeekStart();
render();
registerServiceWorker();
setInterval(renderRunningWidget, 1000);

jobForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = jobNameInput.value.trim();
  if (!name) return;
  const rate = Number.parseFloat(jobRateInput.value);
  state.jobs.push({
    id: crypto.randomUUID(),
    name,
    rate: Number.isFinite(rate) ? rate : 0,
    activeSessionId: null,
    rangeMode: "pay_period",
    payPeriodStart: new Date().toISOString().slice(0, 10),
    payPeriodLength: 14,
  });
  jobNameInput.value = "";
  jobRateInput.value = "";
  saveState();
  render();
});

weekStartInput.addEventListener("change", () => {
  saveState({ weekStart: weekStartInput.value });
  render();
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

cancelSessionBtn.addEventListener("click", () => {
  sessionDialog.close();
  editSessionId = null;
});

sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editSessionId) return;
  const session = state.sessions.find((item) => item.id === editSessionId);
  if (!session) return;

  const startValue = new Date(sessionStartInput.value);
  const endValue = new Date(sessionEndInput.value);

  if (Number.isNaN(startValue.valueOf()) || Number.isNaN(endValue.valueOf())) {
    alert("Please enter valid start and end times.");
    return;
  }

  if (endValue <= startValue) {
    alert("End time must be after start time.");
    return;
  }

  const jobId = sessionJobSelect.value;
  session.jobId = jobId;
  session.start = startValue.toISOString();
  session.end = endValue.toISOString();

  const job = state.jobs.find((item) => item.id === jobId);
  if (job) {
    job.activeSessionId = job.activeSessionId === session.id ? null : job.activeSessionId;
  }

  saveState();
  sessionDialog.close();
  editSessionId = null;
  render();
});

runningStop.addEventListener("click", () => {
  const activeJob = state.jobs.find((job) => job.activeSessionId);
  if (activeJob) {
    togglePunch(activeJob.id);
  }
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
  renderRunningWidget();
}

function renderJobs() {
  jobsEl.innerHTML = "";
  if (state.jobs.length === 0) {
    jobsEl.innerHTML = "<p class=\"sub\">No jobs yet. Add one above.</p>";
    return;
  }

    const week = getRange(job);

  state.jobs.forEach((job) => {
    const node = jobTemplate.content.cloneNode(true);
    const name = node.querySelector(".job-name");
    const meta = node.querySelector(".job-meta");
    const punchBtn = node.querySelector(".punch");
    const exportBtn = node.querySelector(".export");
    const removeBtn = node.querySelector(".remove");
    const weekEl = node.querySelector(".job-week");
    const totalsEl = node.querySelector(".totals");
    const jobBody = node.querySelector(".job-body");

    name.textContent = job.name;
    meta.textContent = job.activeSessionId ? "Currently punched in" : "Not on the clock";
    punchBtn.textContent = job.activeSessionId ? "Punch Out" : "Punch In";
    punchBtn.classList.toggle("ghost", !!job.activeSessionId);

    const weeklyTotals = calcJobTotals(job.id, week.start, week.end);
    const weeklyPay = weeklyTotals.totalHours * (job.rate || 0);

    weekEl.textContent = `${week.label} ${formatDate(week.start)} - ${formatDate(week.end)}`;
    totalsEl.textContent = `Period hours: ${formatHours(weeklyTotals.totalHours)} (Sessions: ${weeklyTotals.sessions}) • Earnings: $${formatMoney(weeklyPay)}`;

    const rateRow = document.createElement("label");
    rateRow.className = "inline";
    rateRow.textContent = "Hourly rate";
    const rateInput = document.createElement("input");
    rateInput.type = "number";
    rateInput.min = "0";
    rateInput.step = "0.01";
    rateInput.value = job.rate ?? 0;
    rateInput.addEventListener("change", () => {
      const nextRate = Number.parseFloat(rateInput.value);
      job.rate = Number.isFinite(nextRate) ? nextRate : 0;
      saveState();
      render();
    });
    rateRow.appendChild(rateInput);
    jobBody.appendChild(rateRow);

    const rangeRow = document.createElement("label");
    rangeRow.className = "inline";
    rangeRow.textContent = "Range (fixed)";
    const rangeSelect = document.createElement("select");
    rangeSelect.innerHTML = "<option value=\"pay_period\">Pay period</option>";
    rangeSelect.value = "pay_period";
    rangeSelect.addEventListener("change", () => {
      job.rangeMode = "pay_period";
      saveState();
      render();
    });
    rangeRow.appendChild(rangeSelect);
    jobBody.appendChild(rangeRow);

    const payRow = document.createElement("label");
    payRow.className = "inline";
    payRow.textContent = "Pay period start (first day of a period)";
    const payStartInput = document.createElement("input");
    payStartInput.type = "date";
    payStartInput.value = job.payPeriodStart || new Date().toISOString().slice(0, 10);
    payStartInput.addEventListener("change", () => {
      job.payPeriodStart = payStartInput.value;
      saveState();
      render();
    });
    payRow.appendChild(payStartInput);
    jobBody.appendChild(payRow);

    const lengthRow = document.createElement("label");
    lengthRow.className = "inline";
    lengthRow.textContent = "Length (days, e.g. 14)";
    const lengthInput = document.createElement("input");
    lengthInput.type = "number";
    lengthInput.min = "1";
    lengthInput.step = "1";
    lengthInput.value = job.payPeriodLength ?? 14;
    lengthInput.addEventListener("change", () => {
      const next = Number.parseInt(lengthInput.value, 10);
      job.payPeriodLength = Number.isFinite(next) && next > 0 ? next : 14;
      saveState();
      render();
    });
    lengthRow.appendChild(lengthInput);
    jobBody.appendChild(lengthRow);

    const periodRange = getPayPeriodRange(job);
    const periodLabel = document.createElement("p");
    periodLabel.className = "sub";
    periodLabel.textContent = `Current pay period: ${formatDate(periodRange.start)} - ${formatDate(periodRange.end)}`;
    jobBody.appendChild(periodLabel);

    punchBtn.addEventListener("click", () => togglePunch(job.id));
    exportBtn.addEventListener("click", () => exportJobWeek(job.id));
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
    const editBtn = node.querySelector(".edit-session");

    const job = state.jobs.find((item) => item.id === session.jobId);
    title.textContent = job ? job.name : "Unknown job";
    time.textContent = `${formatDateTime(session.start)} → ${session.end ? formatDateTime(session.end) : "In progress"}`;

    const hours = session.end ? durationHours(session.start, session.end) : 0;
    duration.textContent = session.end ? `${formatHours(hours)} hours` : "Running";

    editBtn.addEventListener("click", () => openSessionEditor(session.id));

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

function buildJobExport(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return "";
  const week = getRange(job);
  const headers = ["Job", "Range Start", "Range End", "Sessions", "Hours", "Rate", "Earnings"];
  const totals = calcJobTotals(job.id, week.start, week.end);
  const earnings = totals.totalHours * (job.rate || 0);
  const rows = [[
    job.name,
    formatDate(week.start),
    formatDate(week.end),
    totals.sessions.toString(),
    totals.totalHours.toFixed(2),
    (job.rate || 0).toFixed(2),
    earnings.toFixed(2),
  ]];

  const lines = [headers, ...rows].map((row) =>
    row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
  );

  return lines.join("\n");
}

function exportJobWeek(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;
  const csv = buildJobExport(jobId);
  const safeName = job.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const range = getRange(job);
  const rangeStamp = (job.rangeMode || "week") === "pay_period" ? formatISODate(range.start) : (weekStartInput.value || "week");
  const fileName = `timesheet_${safeName || "job"}_${rangeStamp}.csv`;
  downloadFile(csv, fileName);
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

function formatMoney(value) {
  return value.toFixed(2);
}

function getWeekRange() {
  const start = new Date(weekStartInput.value);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: "Week" };
}

function getPayPeriodRange(job) {
  const lengthDays = Math.max(1, Number.parseInt(job.payPeriodLength, 10) || 14);
  const baseStart = new Date(job.payPeriodStart);
  baseStart.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - baseStart) / 86400000);
  const periodsPassed = diffDays >= 0 ? Math.floor(diffDays / lengthDays) : 0;
  const start = new Date(baseStart);
  start.setDate(baseStart.getDate() + periodsPassed * lengthDays);
  const end = new Date(start);
  end.setDate(start.getDate() + (lengthDays - 1));
  end.setHours(23, 59, 59, 999);

  return { start, end, label: "Pay period" };
}

function getRange(job) {
  if ((job.rangeMode || "week") === "pay_period") {
    return getPayPeriodRange(job);
  }
  return getWeekRange();
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

function formatISODate(value) {
  return new Date(value).toISOString().slice(0, 10);
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
      jobs: (data.jobs || []).map((job) => ({
        ...job,
        rate: job.rate ?? 0,
        rangeMode: job.rangeMode || "pay_period",
        payPeriodStart: job.payPeriodStart || new Date().toISOString().slice(0, 10),
        payPeriodLength: job.payPeriodLength || 14,
      })),
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

function openSessionEditor(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  editSessionId = sessionId;
  sessionJobSelect.innerHTML = "";
  state.jobs.forEach((job) => {
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = job.name;
    sessionJobSelect.appendChild(option);
  });

  sessionJobSelect.value = session.jobId;
  sessionStartInput.value = toInputValue(session.start);
  sessionEndInput.value = session.end ? toInputValue(session.end) : toInputValue(new Date().toISOString());

  sessionDialog.showModal();
}

function toInputValue(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function renderRunningWidget() {
  const activeJobs = state.jobs.filter((job) => job.activeSessionId);
  if (activeJobs.length === 0) {
    runningWidget.hidden = true;
    return;
  }

  const summaries = activeJobs
    .map((job) => {
      const session = state.sessions.find((item) => item.id === job.activeSessionId);
      if (!session) return null;
      const elapsed = elapsedDuration(session.start, new Date().toISOString());
      return `${job.name}: ${elapsed}`;
    })
    .filter(Boolean);

  runningDetails.textContent = summaries.join(" • ");
  runningWidget.hidden = false;
}

function elapsedDuration(start, end) {
  const totalSeconds = Math.max(0, Math.floor((new Date(end) - new Date(start)) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
