const PERIODS = [
  "Lun1", "Lun2", "Lun3", "Lun4", "Lun5", "Lun6",
  "Mar1", "Mar2", "Mar3", "Mar4", "Mar5", "Mar6",
  "Mer1", "Mer2", "Mer3", "Mer4", "Mer5", "Mer6",
  "Gio1", "Gio2", "Gio3", "Gio4", "Gio5", "Gio6",
  "Ven1", "Ven2", "Ven3", "Ven4", "Ven5", "Ven6",
];

const fileInput = document.getElementById("fileInput");
const downloadXlsxBtn = document.getElementById("downloadXlsxBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const teacherDetailsEl = document.getElementById("teacherDetails");
const teacherSelectEl = document.getElementById("teacherSelect");
const tableEl = document.getElementById("previewTable");
const classListPanel = document.getElementById("classListPanel");
const classListEl = document.getElementById("classList");
const classListSummaryEl = document.getElementById("classListSummary");
const teacherListPanel = document.getElementById("teacherListPanel");
const teacherListEl = document.getElementById("teacherList");
const teacherListSummaryEl = document.getElementById("teacherListSummary");
const supportPanel = document.getElementById("supportPanel");
const supportToggleEl = document.getElementById("supportToggle");
const supportTableEl = document.getElementById("supportTable");
const supportSummaryEl = document.getElementById("supportSummary");
const heroEl = document.querySelector(".hero");
const sourceDetailsEl = document.getElementById("sourceDetails");
const toggleSourceBtn = document.getElementById("toggleSourceBtn");
const previewPanel = document.getElementById("previewPanel");
const calendarPanel = document.getElementById("calendarPanel");
const classCalendarTab = document.getElementById("classCalendarTab");
const teacherCalendarTab = document.getElementById("teacherCalendarTab");
const calendarSubjectLabel = document.getElementById("calendarSubjectLabel");
const calendarSubjectSelect = document.getElementById("calendarSubjectSelect");
const calendarDescription = document.getElementById("calendarDescription");
const calendarTable = document.getElementById("calendarTable");
const calendarLegend = document.getElementById("calendarLegend");
const calendarImageBtn = document.getElementById("calendarImageBtn");
const calendarXlsxBtn = document.getElementById("calendarXlsxBtn");
const calendarPdfBtn = document.getElementById("calendarPdfBtn");
const calendarAllToggle = document.getElementById("calendarAllToggle");
const subjectsPanel = document.getElementById("subjectsPanel");
const subjectsTabBtn = document.getElementById("subjectsTabBtn");
const scheduleTabBtn = document.getElementById("scheduleTabBtn");
const subjectFileInput = document.getElementById("subjectFileInput");
const appTabs = document.getElementById("appTabs");
const subjectsTable = document.getElementById("subjectsTable");
const subjectsStatus = document.getElementById("subjectsStatus");

let sourceRows = [];
let supportRows = [];
let supportOutputRows = [];
let outputRows = [];
let outputWorkbook = null;
let sourceName = "orario";
let selectedRow = null;
let selectedColumn = null;
const hiddenClassNames = new Set();
let calendarMode = "class";
let calendarAll = false;
const teacherSubjects = new Map();

function teacherKey(value) {
  return normalizeCell(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function setStatus(message) {
  statusEl.textContent = message;
}

function splitClassAssignments(value) {
  return String(value || "")
    .split(/[\n,;\/|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.result !== undefined) return String(value.result);
    if (value.text !== undefined) return String(value.text);
  }
  return String(value).trim();
}

function isPeriodHeaderCell(value) {
  return /^(lun|mar|mer|gio|ven)\s*[1-6]$/i.test(normalizeCell(value));
}

function isBlankRow(row) {
  return row.every((value) => normalizeCell(value) === "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      if (ch === '"') {
        if (next === '"') {
          cell += '"';
          i += 1;
        } else {
          quote = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quote = true;
    } else if (ch === '\t' || ch === ';' || ch === ',') {
      row.push(cell);
      cell = "";
    } else if (ch === '\r') {
      continue;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  // Mantieni le righe vuote: delimitano le eventuali tabelle successive.
  return rows;
}

function normalizeGrid(rawRows) {
  const normalizedRows = rawRows.map((row) => row.map(normalizeCell));
  const periodHeaderIndex = normalizedRows.findIndex((row) =>
    row.filter(isPeriodHeaderCell).length >= 3,
  );
  const sourcePeriodStart = periodHeaderIndex >= 0
    ? normalizedRows[periodHeaderIndex].findIndex(isPeriodHeaderCell)
    : 1;
  const dataRows = periodHeaderIndex >= 0 ? normalizedRows.slice(periodHeaderIndex + 1) : normalizedRows;
  const classes = new Map();

  // Nel file sorgente ogni riga appartiene a un docente e le celle contengono
  // le classi. La griglia di anteprima viene quindi costruita al contrario.
  dataRows.forEach((row) => {
    const teacher = String(row[0] || "").trim();
    if (!teacher) return;

    const assignments = row.slice(sourcePeriodStart, sourcePeriodStart + PERIODS.length);
    assignments.forEach((value, periodIndex) => {
      splitClassAssignments(value).forEach((className) => {
        if (!classes.has(className)) {
          classes.set(className, Array.from({ length: PERIODS.length }, () => []));
        }
        const teachers = classes.get(className)[periodIndex];
        if (!teachers.includes(teacher)) teachers.push(teacher);
      });
    });
  });

  return [...classes.entries()]
    .sort(([first], [second]) => first.localeCompare(second, "it", { numeric: true, sensitivity: "base" }))
    .map(([className, cells]) => ({ className, cells }));
}

function firstSourceTable(rawRows) {
  const normalizedRows = rawRows.map((row) => row.map(normalizeCell));
  const headerIndexes = normalizedRows
    .map((row, index) => ({ index, count: row.filter(isPeriodHeaderCell).length }))
    .filter((entry) => entry.count >= 3)
    .map((entry) => entry.index);

  if (!headerIndexes.length) {
    // Compatibilita con file privi di una riga di intestazione riconoscibile.
    return rawRows;
  }

  const firstHeaderIndex = headerIndexes[0];
  const nextTableHeader = headerIndexes.find((headerIndex) =>
    normalizedRows.slice(firstHeaderIndex + 1, headerIndex).some(isBlankRow),
  );

  // Una riga vuota seguita dalla stessa intestazione delimita una nuova tabella.
  return rawRows.slice(firstHeaderIndex, nextTableHeader ?? rawRows.length);
}

function buildOutput() {
  outputRows = sourceRows.filter((row) => !hiddenClassNames.has(row.className)).map((row) => {
    const periods = row.cells.map((cell) => {
      if (cell.length === 0) return "";
      return cell.join(" / ");
    });
    return {
      className: row.className,
      periods,
    };
  });
  supportOutputRows = supportRows.length ? normalizeGrid(supportRows).map((row) => ({
    className: row.className,
    periods: row.cells.map((cell) => cell.join(" / ")),
  })) : [];
}

function renderSupportPreview() {
  supportPanel.hidden = !supportRows.length;
  supportToggleEl.checked = false;
  supportToggleEl.disabled = !supportRows.length;
  supportSummaryEl.textContent = supportRows.length
    ? `${supportOutputRows.length} classi individuate; esclusa dall'output principale`
    : "";
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");
  ["Classe", ...PERIODS].forEach((label, index) => {
    const th = document.createElement("th");
    th.textContent = label;
    if (index > 0 && index % 6 === 0 && index < PERIODS.length) th.classList.add("group-break");
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  supportOutputRows.forEach((row) => {
    const tr = document.createElement("tr");
    const classTd = document.createElement("td");
    classTd.textContent = row.className;
    classTd.className = "row-label";
    tr.appendChild(classTd);
    row.periods.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      td.title = value || "Nessuna assegnazione";
      if (!value) td.classList.add("violet");
      else if (value.includes(" / ")) td.classList.add("red");
      if ((index + 1) % 6 === 0 && index < PERIODS.length - 1) td.classList.add("group-break");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  supportTableEl.replaceChildren(thead, tbody);
}

function renderTeacherAssignments(cell, teacherNames, { showSubject = true } = {}) {
  cell.replaceChildren();
  teacherNames.forEach((teacherName, index) => {
    const assignment = document.createElement("div");
    assignment.className = "teacher-assignment";
    const normalizedTeacherName = teacherName.trim();
    const teacher = document.createElement("span");
    teacher.className = "teacher-cell-name";
    teacher.textContent = normalizedTeacherName;
    assignment.appendChild(teacher);
    const subject = showSubject ? teacherSubjects.get(teacherKey(normalizedTeacherName)) : "";
    if (subject) {
      const subjectEl = document.createElement("span");
      subjectEl.className = "teacher-cell-subject";
      subjectEl.textContent = subject;
      assignment.appendChild(subjectEl);
    }
    if (index < teacherNames.length - 1) assignment.classList.add("teacher-assignment-separated");
    cell.appendChild(assignment);
  });
}

function renderPreview() {
  selectedRow = null;
  selectedColumn = null;
  teacherDetailsEl.replaceChildren();
  teacherDetailsEl.hidden = true;
  teacherSelectEl.replaceChildren();
  teacherSelectEl.hidden = true;
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");
  const classTh = document.createElement("th");
  classTh.textContent = "Classe";
  headerRow.appendChild(classTh);
  PERIODS.forEach((label, index) => {
    const th = document.createElement("th");
    th.textContent = label;
    if ((index + 1) % 6 === 0 && index < PERIODS.length - 1) th.classList.add("group-break");
    th.dataset.col = String(index + 1);
    th.title = `Evidenzia colonna ${label}`;
    th.addEventListener("click", () => highlightColumn(index + 1));
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  outputRows.forEach((row) => {
    const tr = document.createElement("tr");
    const classTd = document.createElement("td");
    classTd.textContent = row.className;
    classTd.className = "row-label";
    classTd.dataset.row = String(outputRows.indexOf(row) + 1);
    classTd.title = `Evidenzia riga ${row.className}`;
    classTd.addEventListener("click", () => highlightRow(Number(classTd.dataset.row)));
    tr.appendChild(classTd);
    row.periods.forEach((value, index) => {
      const td = document.createElement("td");
      if (value) renderTeacherAssignments(td, value.split(" / "), { showSubject: false });
      td.title = value || "Nessuna assegnazione";
      td.dataset.row = String(outputRows.indexOf(row) + 1);
      td.dataset.col = String(index + 1);
      td.dataset.teachers = value;
      td.addEventListener("click", () => {
        const teacherNames = value ? value.split(" / ") : [];
        highlightTeachers(teacherNames);
        renderTeacherDetails(teacherNames);
        teacherSelectEl.value = teacherNames.length === 1 ? teacherNames[0] : "";
      });
      if (!value) td.classList.add("violet");
      else if (value.includes(" / ")) td.classList.add("red");
      if ((index + 1) % 6 === 0 && index < PERIODS.length - 1) td.classList.add("group-break");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tableEl.replaceChildren(thead, tbody);
  summaryEl.textContent = `${outputRows.length} classi, ${PERIODS.length} periodi per classe`;
  renderSupportPreview();
  renderTeacherSelect();
  renderClassList();
  renderTeacherList();
  renderSubjectsTable();
  renderCalendar();
}

function renderTeacherSelect() {
  const teacherNames = getTeacherNames();
  teacherSelectEl.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleziona insegnante";
  teacherSelectEl.appendChild(placeholder);
  teacherNames.forEach((teacherName) => {
    const option = document.createElement("option");
    option.value = teacherName;
    option.textContent = teacherName;
    teacherSelectEl.appendChild(option);
  });
  teacherSelectEl.hidden = teacherNames.length === 0;
}

function renderClassList() {
  const classNames = [...new Set(sourceRows.map((row) => row.className).filter(Boolean))];
  classListEl.replaceChildren();
  classNames.forEach((className) => {
    const item = document.createElement("li");
    const label = document.createElement("label");
    label.className = "class-list-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !hiddenClassNames.has(className);
    checkbox.setAttribute("aria-label", `Visualizza classe ${className}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) hiddenClassNames.delete(className);
      else hiddenClassNames.add(className);
      buildOutput();
      renderPreview();
      outputWorkbook = null;
      buildWorkbook().then((workbook) => {
        outputWorkbook = workbook;
      }).catch((error) => {
        console.error(error);
        setStatus(error.message || "Errore durante l’aggiornamento dell’export.");
      });
    });
    const text = document.createElement("span");
    text.textContent = className;
    label.append(checkbox, text);
    item.appendChild(label);
    classListEl.appendChild(item);
  });
  const visibleCount = classNames.filter((className) => !hiddenClassNames.has(className)).length;
  classListSummaryEl.textContent = `${visibleCount}/${classNames.length} classi visualizzate`;
  classListPanel.hidden = classNames.length === 0;
}

function getTeacherStats(teacherName) {
  const classes = outputRows
    .map((row) => ({
      className: row.className,
      hours: row.periods.filter((period) => period.split(" / ").map((name) => name.trim()).includes(teacherName)).length,
    }))
    .filter((entry) => entry.hours > 0);
  return {
    classes,
    totalHours: classes.reduce((total, entry) => total + entry.hours, 0),
  };
}

function getTeacherNames() {
  return [...new Set(outputRows.flatMap((row) => row.periods.flatMap((period) => period ? period.split(" / ") : [])))]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second, "it", { sensitivity: "base" }));
}

function renderTeacherList() {
  const teacherNames = getTeacherNames();
  teacherListEl.replaceChildren();
  teacherNames.forEach((teacherName) => {
    const stats = getTeacherStats(teacherName);
    const row = document.createElement("div");
    row.className = "teacher-list-row";
    row.addEventListener("click", () => {
      teacherSelectEl.value = teacherName;
      highlightTeachers([teacherName]);
      renderTeacherDetails([teacherName]);
    });

    const name = document.createElement("button");
    name.type = "button";
    name.className = "teacher-name-button";
    name.textContent = teacherName;
    name.title = `Evidenzia le celle di ${teacherName}`;
    name.addEventListener("click", (event) => {
      event.stopPropagation();
      teacherSelectEl.value = teacherName;
      highlightTeachers([teacherName]);
      renderTeacherDetails([teacherName]);
    });

    const total = document.createElement("span");
    total.className = "teacher-total";
    total.textContent = `Totale: ${stats.totalHours} ${stats.totalHours === 1 ? "ora" : "ore"}`;

    const classes = document.createElement("span");
    classes.className = "teacher-classes";
    classes.textContent = stats.classes.map((entry) => `${entry.className}: ${entry.hours} ${entry.hours === 1 ? "ora" : "ore"}`).join(" · ");

    row.append(name, total, classes);
    teacherListEl.appendChild(row);
  });
  teacherListSummaryEl.textContent = `${teacherNames.length} insegnanti`;
  teacherListPanel.hidden = teacherNames.length === 0;
}

function updateHighlights() {
  tableEl.querySelectorAll(".is-highlighted").forEach((el) => el.classList.remove("is-highlighted"));
  if (selectedRow !== null) {
    tableEl.querySelectorAll(`[data-row="${selectedRow}"]`).forEach((el) => el.classList.add("is-highlighted"));
  }
  if (selectedColumn !== null) {
    tableEl.querySelectorAll(`[data-col="${selectedColumn}"]`).forEach((el) => el.classList.add("is-highlighted"));
  }
}

function highlightTeachers(teacherNames) {
  const names = new Set(teacherNames.map((name) => name.trim()).filter(Boolean));
  tableEl.querySelectorAll("td[data-teachers]").forEach((cell) => {
    const cellTeachers = cell.dataset.teachers.split(" / ").map((name) => name.trim());
    if (cellTeachers.some((name) => names.has(name))) {
      cell.classList.add("teacher-highlighted");
    } else {
      cell.classList.remove("teacher-highlighted");
    }
  });
}

function renderTeacherDetails(teacherNames) {
  teacherDetailsEl.replaceChildren();
  const names = [...new Set(teacherNames.map((name) => name.trim()).filter(Boolean))];
  if (!names.length) {
    teacherDetailsEl.hidden = true;
    return;
  }

  names.forEach((teacherName) => {
    const { classes: classHours, totalHours } = getTeacherStats(teacherName);

    const line = document.createElement("div");
    line.className = "teacher-detail-row";
    const name = document.createElement("strong");
    name.textContent = teacherName;
    const classes = document.createElement("span");
    classes.textContent = classHours.map((entry) => `${entry.className}: ${entry.hours} ${entry.hours === 1 ? "ora" : "ore"}`).join(" · ");
    const total = document.createElement("span");
    total.className = "teacher-total";
    total.textContent = `Totale: ${totalHours} ${totalHours === 1 ? "ora" : "ore"}`;
    line.append(name, classes, total);
    teacherDetailsEl.appendChild(line);
  });
  teacherDetailsEl.hidden = false;
}

function highlightRow(rowNumber) {
  selectedRow = selectedRow === rowNumber ? null : rowNumber;
  updateHighlights();
}

function highlightColumn(colNumber) {
  selectedColumn = selectedColumn === colNumber ? null : colNumber;
  updateHighlights();
}

function renderSubjectsTable() {
  const tbody = subjectsTable.querySelector("tbody");
  tbody.replaceChildren();
  getTeacherNames().forEach((name) => {
    const tr = document.createElement("tr");
    const nameCell = document.createElement("td"); nameCell.textContent = name;
    const subjectCell = document.createElement("td");
    const input = document.createElement("input");
    input.className = "subject-input"; input.type = "text"; input.value = teacherSubjects.get(teacherKey(name)) || ""; input.placeholder = "Inserisci materia";
    input.addEventListener("input", () => teacherSubjects.set(teacherKey(name), input.value));
    subjectCell.appendChild(input); tr.append(nameCell, subjectCell); tbody.appendChild(tr);
  });
  const count = getTeacherNames().length;
  subjectsStatus.textContent = count ? `${count} docenti. La materia è modificabile direttamente nella tabella.` : "Carica prima un orario oppure un file con i docenti.";
}

async function handleSubjectFile(file) {
  const rows = (await parseFile(file, { updateSourceName: false })).map((row) => row.map(normalizeCell)).filter((row) => row.some(Boolean));
  if (!rows.length) throw new Error("Il file materie non contiene righe leggibili.");
  const header = rows[0].map(teacherKey);
  const nameIndex = header.findIndex((cell) => cell.includes("nome") || cell.includes("docente") || cell === "insegnante");
  const subjectIndex = header.findIndex((cell) => cell.includes("materia") || cell.includes("disciplina"));
  const ni = nameIndex >= 0 ? nameIndex : 0, si = subjectIndex >= 0 ? subjectIndex : 1;
  let count = 0;
  rows.slice(nameIndex >= 0 && subjectIndex >= 0 ? 1 : 0).forEach((row) => { const name = normalizeCell(row[ni]); if (name) { teacherSubjects.set(teacherKey(name), normalizeCell(row[si])); count += 1; } });
  renderSubjectsTable();
  if (outputRows.length) renderPreview();
  subjectsStatus.textContent = `${count} associazioni caricate. Puoi modificare le materie nella tabella.`;
}

const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];

function calendarSubjects() {
  return calendarMode === "class"
    ? outputRows.map((row) => row.className)
    : getTeacherNames();
}

function teacherCalendarCells(teacherName) {
  return PERIODS.map((_, periodIndex) => outputRows
    .filter((row) => row.periods[periodIndex].split(" / ").map((name) => name.trim()).includes(teacherName))
    .map((row) => row.className));
}

function isTeacherGap(cells, dayIndex, periodInDay) {
  const dayStart = dayIndex * 6;
  const dayCells = cells.slice(dayStart, dayStart + 6);
  const occupied = dayCells.map((value, index) => value.length ? index : -1).filter((index) => index >= 0);
  return !cells[dayStart + periodInDay].length && occupied.length > 1
    && periodInDay > occupied[0] && periodInDay < occupied[occupied.length - 1];
}

function renderCalendar() {
  const subjects = calendarSubjects();
  const previous = calendarSubjectSelect.value;
  calendarSubjectSelect.replaceChildren();
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    calendarSubjectSelect.appendChild(option);
  });
  if (subjects.includes(previous)) calendarSubjectSelect.value = previous;
  const subject = calendarSubjectSelect.value;
  calendarSubjectLabel.textContent = calendarMode === "class" ? "Classe" : "Docente";
  calendarDescription.textContent = subject
    ? calendarMode === "class" ? `Calendario della Classe ${subject}` : `Calendario del docente ${subject}`
    : "Nessun dato disponibile.";
  calendarLegend.hidden = calendarMode !== "teacher";
  classCalendarTab.classList.toggle("is-active", calendarMode === "class");
  teacherCalendarTab.classList.toggle("is-active", calendarMode === "teacher");
  classCalendarTab.setAttribute("aria-selected", String(calendarMode === "class"));
  teacherCalendarTab.setAttribute("aria-selected", String(calendarMode === "teacher"));

  const cells = calendarMode === "class"
    ? (outputRows.find((row) => row.className === subject)?.periods.map((value) => value ? value.split(" / ") : []) || [])
    : teacherCalendarCells(subject);
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  ["Periodo", ...DAYS].forEach((name) => { const th = document.createElement("th"); th.textContent = name; header.appendChild(th); });
  thead.appendChild(header);
  const tbody = document.createElement("tbody");
  for (let period = 0; period < 6; period += 1) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.className = "period-label";
    label.textContent = `${period + 1}° periodo`;
    tr.appendChild(label);
    DAYS.forEach((_, day) => {
      const index = day * 6 + period;
      const td = document.createElement("td");
      const value = cells[index] || [];
      if (value.length) { td.className = "lesson-cell"; renderTeacherAssignments(td, value); }
      else if (calendarMode === "teacher" && isTeacherGap(cells, day, period)) { td.className = "calendar-gap"; td.textContent = ""; }
      else td.textContent = "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  calendarTable.replaceChildren(thead, tbody);
  calendarPanel.hidden = !subjects.length;
  calendarSubjectSelect.disabled = calendarAll;
  calendarImageBtn.disabled = calendarAll;
  calendarXlsxBtn.disabled = calendarAll;
  calendarPdfBtn.textContent = calendarAll ? "Esporta PDF tutti" : "Esporta PDF";
}

function calendarExportRows() {
  return [...calendarTable.rows].map((row) => [...row.cells].map((cell) => (cell.innerText || cell.textContent).trim().replace(/[ \t]+/g, " ")));
}

function calendarPdfRows() {
  return [...calendarTable.rows].map((row) => [...row.cells].map((cell) => ({
    value: (cell.innerText || cell.textContent).trim().replace(/[ \t]+/g, " "),
    assignments: [...cell.querySelectorAll(".teacher-assignment")].map((assignment) => ({
      teacher: assignment.querySelector(".teacher-cell-name")?.textContent?.trim() || "",
      subject: assignment.querySelector(".teacher-cell-subject")?.textContent?.trim() || ""
    }))
  })));
}

function calendarFileName(extension) {
  const subject = calendarSubjectSelect.value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "");
  return `${sourceName}-${calendarMode === "class" ? "classe" : "docente"}-${subject}.${extension}`;
}

async function calendarCanvas() {
  const rows = calendarExportRows();
  const width = 1100, height = 90 + rows.length * 82, colWidth = (width - 150) / 5;
  const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let body = `<rect width="${width}" height="${height}" fill="#ffffff"/><text x="40" y="42" font-family="Arial" font-size="24" font-weight="700">${esc(calendarDescription.textContent)}</text>`;
  rows.forEach((row, r) => row.forEach((value, c) => {
    const x = c === 0 ? 20 : 150 + (c - 1) * colWidth, y = 60 + r * 82, w = c === 0 ? 130 : colWidth;
    const isGap = value === "Buco";
    const fill = r === 0 || c === 0 ? "#eee8f7" : "#ffffff";
    body += `<rect x="${x}" y="${y}" width="${w}" height="82" fill="${fill}" stroke="#c8cbd2"/><text x="${x + w / 2}" y="${y + 44}" text-anchor="middle" font-family="Arial" font-size="${r === 0 ? 15 : 14}" font-weight="${r === 0 || value ? 700 : 400}">${esc(value)}</text>`;
  }));
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)}`; });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}

async function exportCalendarImage() {
  const canvas = await calendarCanvas();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await downloadBlob(blob, calendarFileName("png"));
}

async function exportCalendarXlsx() {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Calendario");
  [...calendarTable.rows].forEach((domRow) => {
    const values = [...domRow.cells].map((cell) => {
      if (calendarMode === "class" && cell.classList.contains("lesson-cell")) {
        const richText = [];
        [...cell.querySelectorAll(".teacher-assignment")].forEach((assignment, index) => {
          if (index) richText.push({ text: "\n" });
          const teacher = assignment.querySelector(".teacher-cell-name")?.textContent?.trim() || "";
          const subject = assignment.querySelector(".teacher-cell-subject")?.textContent?.trim() || "";
          richText.push({ text: teacher, font: { bold: true, size: 12, color: { argb: "FF1F2430" } } });
          if (subject) richText.push({ text: `\n${subject}`, font: { size: 10, color: { argb: "FF78C98A" } } });
        });
        return { richText };
      }
      return (cell.innerText || cell.textContent || "").trim();
    });
    sheet.addRow(values);
  });
  sheet.columns = [{ width: 18 }, ...DAYS.map(() => ({ width: 23 }))]; sheet.getRow(1).font = { bold: true };
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; if (cell.value === "Buco") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9C5F4" } }; }));
  await downloadBlob(new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), calendarFileName("xlsx"));
}

async function exportCalendarPdf() {
  if (calendarAll) return exportAllCalendarsPdf();
  if (!window.jspdf) throw new Error("La libreria PDF non è disponibile.");
  const pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  drawCalendarPdfPage(pdf, calendarPdfRows(), calendarDescription.textContent);
  pdf.save(calendarFileName("pdf"));
}

function drawCalendarPdfPage(pdf, rows, title) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 22, titleY = 30, tableY = 48, rowHeight = 66;
  const firstColumn = 104, remainingWidth = pageWidth - margin * 2 - firstColumn, dayColumn = remainingWidth / 5;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.setTextColor(31, 36, 48);
  pdf.text(title, margin, titleY);
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    const x = columnIndex === 0 ? margin : margin + firstColumn + (columnIndex - 1) * dayColumn;
    const y = tableY + rowIndex * rowHeight;
    const width = columnIndex === 0 ? firstColumn : dayColumn;
    if (rowIndex === 0 || columnIndex === 0) {
      pdf.setFillColor(238, 232, 247);
      pdf.rect(x, y, width, rowHeight, "F");
    }
    pdf.setDrawColor(190, 190, 198); pdf.setLineWidth(.45); pdf.rect(x, y, width, rowHeight);
    const cell = typeof value === "string" ? { value, assignments: [] } : value;
    const lines = cell.value ? pdf.splitTextToSize(cell.value, width - 10) : [];
    pdf.setFont("helvetica", rowIndex === 0 || columnIndex === 0 || value ? "bold" : "normal");
    pdf.setFontSize(rowIndex === 0 ? 10 : 9);
    pdf.setTextColor(31, 36, 48);
    const lineHeight = 11;
    const firstY = y + rowHeight / 2 - ((lines.length - 1) * lineHeight) / 2 + 3;
    if (cell.assignments.length) {
      const assignmentLines = cell.assignments.flatMap(({ teacher, subject }) => subject ? [{ text: teacher, size: 9, color: [31, 36, 48] }, { text: subject, size: 7, color: [29, 112, 46] }] : [{ text: teacher, size: 9, color: [31, 36, 48] }]);
      const assignmentY = y + rowHeight / 2 - ((assignmentLines.length - 1) * 9) / 2 + 3;
      assignmentLines.forEach((line, lineIndex) => {
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(line.size); pdf.setTextColor(...line.color);
        pdf.text(line.text, x + width / 2, assignmentY + lineIndex * 9, { align: "center" });
      });
    } else {
      lines.forEach((line, lineIndex) => pdf.text(line, x + width / 2, firstY + lineIndex * lineHeight, { align: "center" }));
    }
  }));
}

async function exportAllCalendarsPdf() {
  const subjects = calendarSubjects();
  if (!subjects.length || !window.jspdf) throw new Error("Nessun calendario disponibile per l'esportazione PDF.");
  const originalSubject = calendarSubjectSelect.value;
  const pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  for (let index = 0; index < subjects.length; index += 1) {
    calendarSubjectSelect.value = subjects[index];
    renderCalendar();
    if (index > 0) pdf.addPage();
    drawCalendarPdfPage(pdf, calendarPdfRows(), calendarDescription.textContent);
  }
  calendarSubjectSelect.value = originalSubject;
  renderCalendar();
  pdf.save(`${sourceName}-${calendarMode === "class" ? "classi" : "docenti"}-tutti.pdf`);
}

async function parseFile(file, { updateSourceName = true } = {}) {
  if (updateSourceName) sourceName = file.name.replace(/\.[^.]+$/, "");
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    return parseCsv(text);
  }
  if (ext === "xlsx") {
    if (!window.ExcelJS) {
      throw new Error("La libreria XLSX non e disponibile. Controlla la connessione e ricarica la pagina.");
    }
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    const rows = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cell.text ?? cell.value ?? "";
      });
      rows.push(values);
    });
    return rows;
  }
  throw new Error("Formato non supportato");
}

async function buildWorkbook() {
  if (!window.ExcelJS) {
    throw new Error("La libreria di esportazione XLSX non e disponibile. Controlla la connessione e ricarica la pagina.");
  }
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Orario normalizzato");
  worksheet.columns = [
    { header: "Classe", key: "className", width: 18 },
    ...PERIODS.map((p, index) => ({
      header: p,
      key: p,
      width: 18,
      style: { alignment: { vertical: "middle", horizontal: "left", wrapText: true } },
      border: index % 6 === 5 && index < PERIODS.length - 1
        ? { right: { style: "thick", color: { argb: "FF444444" } } }
        : undefined,
    })),
  ];

  outputRows.forEach((row) => {
    const record = { className: row.className };
    PERIODS.forEach((period, index) => {
      record[period] = row.periods[index] || "";
    });
    worksheet.addRow(record);
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F6F2" } };
  worksheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber === 1) return;
      if (colNumber <= 31) {
        const value = cell.value ? String(cell.value).trim() : "";
        if (!value) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9C5F4" } };
        } else if (value.includes(" / ")) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2B2B2" } };
        }
      }
      if ((colNumber - 1) % 6 === 0 && colNumber > 1 && colNumber < 31) {
        cell.border = {
          ...(cell.border || {}),
          right: { style: "thick", color: { argb: "FF444444" } },
        };
      }
    });
  });

  return workbook;
}

async function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleGenerate() {
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus("Carica prima un file CSV o XLSX.");
    return;
  }
  setStatus("Sto leggendo il file...");
  const rows = await parseFile(file);
  if (!rows.length) throw new Error("Il file non contiene righe leggibili.");
  sourceRows = normalizeGrid(firstSourceTable(rows));
  supportRows = [];
  buildOutput();
  renderPreview();
  outputWorkbook = await buildWorkbook();
  previewPanel.hidden = false;
  appTabs.hidden = false;
  downloadXlsxBtn.disabled = false;
  downloadCsvBtn.disabled = false;
  setStatus("Anteprima aggiornata. Per l’output è stata usata solo la prima tabella.");
  heroEl.classList.add("is-collapsed");
  toggleSourceBtn.setAttribute("aria-expanded", "false");
}

async function handleDownloadXlsx() {
  if (!outputWorkbook) return;
  const buffer = await outputWorkbook.xlsx.writeBuffer();
  await downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${sourceName}-normalizzato.xlsx`,
  );
}

async function handleDownloadCsv() {
  const rows = [
    ["Classe", ...PERIODS],
    ...outputRows.map((row) => [
      row.className,
      ...row.periods,
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  await downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${sourceName}-normalizzato.csv`);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  downloadXlsxBtn.disabled = true;
  downloadCsvBtn.disabled = true;
  outputWorkbook = null;
  tableEl.replaceChildren();
  previewPanel.hidden = true;
  supportTableEl.replaceChildren();
  supportPanel.hidden = true;
  supportToggleEl.checked = false;
  supportToggleEl.disabled = true;
  supportRows = [];
  supportOutputRows = [];
  calendarPanel.hidden = true;
  hiddenClassNames.clear();
  classListEl.replaceChildren();
  classListPanel.hidden = true;
  teacherListEl.replaceChildren();
  teacherListPanel.hidden = true;
  appTabs.hidden = true;
  teacherDetailsEl.replaceChildren();
  teacherDetailsEl.hidden = true;
  teacherSelectEl.replaceChildren();
  teacherSelectEl.hidden = true;
  summaryEl.textContent = "";
  if (!file) {
    setStatus("Seleziona un file per iniziare.");
    return;
  }
  heroEl.classList.remove("is-collapsed");
  toggleSourceBtn.setAttribute("aria-expanded", "true");
  handleGenerate().catch((error) => {
    console.error(error);
    appTabs.hidden = true;
    setStatus(error.message || "Errore durante la generazione.");
  });
});
downloadXlsxBtn.addEventListener("click", () => {
  handleDownloadXlsx().catch((error) => {
    console.error(error);
    setStatus(error.message || "Errore durante il download XLSX.");
  });
});
downloadCsvBtn.addEventListener("click", () => {
  handleDownloadCsv().catch((error) => {
    console.error(error);
    setStatus(error.message || "Errore durante il download CSV.");
  });
});

teacherSelectEl.addEventListener("change", () => {
  const teacherName = teacherSelectEl.value;
  highlightTeachers(teacherName ? [teacherName] : []);
  renderTeacherDetails(teacherName ? [teacherName] : []);
});
toggleSourceBtn.addEventListener("click", () => {
  const collapsed = heroEl.classList.toggle("is-collapsed");
  toggleSourceBtn.setAttribute("aria-expanded", String(!collapsed));
});

classCalendarTab.addEventListener("click", () => { calendarMode = "class"; renderCalendar(); });
teacherCalendarTab.addEventListener("click", () => { calendarMode = "teacher"; renderCalendar(); });
calendarSubjectSelect.addEventListener("change", renderCalendar);
calendarAllToggle.addEventListener("change", () => { calendarAll = calendarAllToggle.checked; renderCalendar(); });
calendarImageBtn.addEventListener("click", () => exportCalendarImage().catch((error) => setStatus(error.message || "Errore durante l'esportazione immagine.")));
calendarXlsxBtn.addEventListener("click", () => exportCalendarXlsx().catch((error) => setStatus(error.message || "Errore durante l'esportazione Excel.")));
calendarPdfBtn.addEventListener("click", () => exportCalendarPdf().catch((error) => setStatus(error.message || "Errore durante l'esportazione PDF.")));

supportToggleEl.addEventListener("change", () => {
  supportTableEl.closest(".support-table-wrap").hidden = !supportToggleEl.checked;
});

subjectsTabBtn.addEventListener("click", () => {
  subjectsPanel.hidden = false;
  [calendarPanel, previewPanel, supportPanel, classListPanel, teacherListPanel].forEach((panel) => { if (panel) panel.hidden = true; });
  subjectsTabBtn.classList.add("is-active"); scheduleTabBtn.classList.remove("is-active"); renderSubjectsTable();
});
scheduleTabBtn.addEventListener("click", () => {
  subjectsPanel.hidden = true;
  subjectsTabBtn.classList.remove("is-active"); scheduleTabBtn.classList.add("is-active");
  [calendarPanel, previewPanel, supportPanel, classListPanel, teacherListPanel].forEach((panel) => { if (panel) panel.hidden = false; });
  if (!outputRows.length) { calendarPanel.hidden = true; previewPanel.hidden = true; supportPanel.hidden = true; classListPanel.hidden = true; teacherListPanel.hidden = true; }
});
subjectFileInput.addEventListener("change", () => {
  const file = subjectFileInput.files?.[0]; if (!file) return;
  handleSubjectFile(file).catch((error) => { subjectsStatus.textContent = error.message || "Errore nel caricamento del file materie."; });
});
