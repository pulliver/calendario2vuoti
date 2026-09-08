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

let sourceRows = [];
let supportRows = [];
let supportOutputRows = [];
let outputRows = [];
let outputWorkbook = null;
let sourceName = "orario";
let selectedRow = null;
let selectedColumn = null;
const hiddenClassNames = new Set();

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
      td.textContent = value;
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

async function parseFile(file) {
  sourceName = file.name.replace(/\.[^.]+$/, "");
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
  downloadXlsxBtn.disabled = false;
  downloadCsvBtn.disabled = false;
  setStatus("Anteprima aggiornata. Per l'output è stata usata solo la prima tabella.");
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
  supportTableEl.replaceChildren();
  supportPanel.hidden = true;
  supportToggleEl.checked = false;
  supportToggleEl.disabled = true;
  supportRows = [];
  supportOutputRows = [];
  hiddenClassNames.clear();
  classListEl.replaceChildren();
  classListPanel.hidden = true;
  teacherListEl.replaceChildren();
  teacherListPanel.hidden = true;
  teacherDetailsEl.replaceChildren();
  teacherDetailsEl.hidden = true;
  teacherSelectEl.replaceChildren();
  teacherSelectEl.hidden = true;
  summaryEl.textContent = "";
  if (!file) {
    setStatus("Seleziona un file per iniziare.");
    return;
  }
  handleGenerate().catch((error) => {
    console.error(error);
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

supportToggleEl.addEventListener("change", () => {
  supportTableEl.closest(".support-table-wrap").hidden = !supportToggleEl.checked;
});
