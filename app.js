/* =========================================================================
   CONFIGURACIÓN
   ========================================================================= */
const SHEET_ID = "1KXC4yEMrvGlgwmvzsiMT6vONDQtyQ_wEShxbGsszMNM";
const SHEET_TAB = "1"; // nombre exacto de la pestaña
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(
  SHEET_TAB
)}`;

const AVAIL_TAB = "Availability";
const AVAIL_URL = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(
  AVAIL_TAB
)}`;

const PRICE_COLS = {
  4: ["Broker_Weekday_4hr", "Broker_Weekend_4hr"],
  6: ["Broker_Weekday_6hr", "Broker_Weekend_6hr"],
  8: ["Broker_Weekday_8hr", "Broker_Weekend_8hr"],
};

/* =========================================================================
   VARIABLES GLOBALES
   ========================================================================= */
let yachts = []; // datos completos
let filtered = []; // datos tras aplicar filtros
let availabilityMap = {}; // { Yacht_ID: [ {start, end}, ... ] }

/* =========================================================================
   UTILIDADES
   ========================================================================= */
const $ = (sel) => document.querySelector(sel);

/* Simple toast utility */
function showToast(message) {
  const toast = $("#resultsToast");
  if (!toast) return;
  $("#toastMsg").textContent = message;
  toast.classList.remove("opacity-0", "pointer-events-none");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add("opacity-0", "pointer-events-none");
  }, 2500);
}

const toNumber = (str) =>
  +String(str || "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

const parseDate = (str) => {
  if (!str || typeof str !== "string") return null;

  let s = str
    .trim()
    .replace(/[‚Äô’]/g, "'") // caracteres de comillas especiales
    .replace(/["']/g, "") // comillas dobles o simples
    .replace(/,\s*$/, "") // comas finales
    .replace(/\s+/g, " ") // espacios dobles
    .replace(/(\d{4})\s*,\s*/, "$1 "); // "2025, " -> "2025 "

  const d = new Date(s);
  if (isNaN(d)) {
    console.warn("[parseDate] Invalid:", str);
    return null;
  }
  return d;
};

/* ── helpers de fecha: trabajar siempre a nivel de día ───────────── */
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a.getTime() === b.getTime();
const isInside = (sel, start, end) =>
  sel.getTime() >= start.getTime() && sel.getTime() <= end.getTime();

/* Formatea como "Mar 10, 2025 7:00 PM" (sin coma entre fecha y hora) */
const fmtDateTime = (d) =>
  d
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
        .format(d)
        .replace(",", "") // quita la coma que Intl pone tras la fecha
    : "";

/* Compara tamaño + presupuesto + filtros select */
function applyFilters() {
  /* Presupuesto min–max (si los sliders existen) */
  const budgetMin = +($("#budgetMinRange")?.value || 0);
  const budgetMax = +($("#budgetMaxRange")?.value || Infinity);

  const sizeMin = +($("#sizeMinRange")?.value || 0);
  const sizeMax = +($("#sizeRange")?.value || Infinity);
  const duration = +document.querySelector('input[name="duration"]:checked')
    .value;
  const location = $("#locationSelect").value;

  const dateStr = $("#dateInput").value;
  const selectedDate = dateStr ? new Date(dateStr + "T00:00:00") : null;

  console.log(
    "[applyFilters] budgetMax:",
    budgetMax,
    "sizeMin:",
    sizeMin,
    "sizeMax:",
    sizeMax,
    "date:",
    selectedDate?.toDateString() || "—"
  );

  /* -----------------------------------------------------------
     Paso 1 — filtros básicos (tamaño, precio, ubicación, marca)
     ----------------------------------------------------------- */
  filtered = yachts.filter((y) => {
    /* 0. tamaño mínimo */
    if (toNumber(y.Yacht_Size) < sizeMin) return false;

    /* 1. tamaño */
    if (toNumber(y.Yacht_Size) > sizeMax) return false;

    /* 2. presupuesto (mínimo y máximo valor weekend / weekday) */
    const priceCols = PRICE_COLS[duration];
    const price = Math.max(...priceCols.map((col) => toNumber(y[col])));
    if (price < budgetMin || price > budgetMax) return false;

    /* 3. ubicación */
    if (location && y.Boarding_Location !== location) return false;

    return true;
  });

  /* -----------------------------------------------------------
     Paso 2 — evaluar disponibilidad y crear campo Status + reservas
     ----------------------------------------------------------- */
  filtered = filtered.map((y) => {
    /* ------------------------------------------------------------------
       Determinar estado de disponibilidad + reservas vinculadas
       ------------------------------------------------------------------ */
    const bookings = availabilityMap[y.Yacht_ID] || [];
    let isBooked = false;
    let statusLabel = "—"; // sin fecha
    let isPartiallyBooked = false;
    let resStartStr = "";
    let resEndStr = "";

    if (selectedDate) {
      // ======================= filtro por fecha =======================
      const selMid = midnight(selectedDate);

      // Reserva que cubre completamente el día
      const overlapping = bookings.find((b) =>
        isInside(selMid, midnight(b.start), midnight(b.end))
      );

      if (overlapping) {
        isBooked = true;
        statusLabel = "Booked";
        resStartStr = fmtDateTime(overlapping.start);
        resEndStr = fmtDateTime(overlapping.end);
      } else {
        // Reserva que empieza o termina justo ese día
        const partial = bookings.find(
          (b) =>
            sameDay(selMid, midnight(b.start)) ||
            sameDay(selMid, midnight(b.end))
        );
        if (partial) {
          statusLabel = "Partially Booked";
          isPartiallyBooked = true;
          resStartStr = fmtDateTime(partial.start);
          resEndStr = fmtDateTime(partial.end);
        } else {
          statusLabel = "Available";
        }
      }
    } else if (bookings.length) {
      // Caso 2: sin fecha ➜ mostrar próxima reserva futura
      const today = new Date();
      const future = bookings
        .filter((b) => b.start >= today)
        .sort((a, b) => a.start - b.start)[0];
      if (future) {
        resStartStr = fmtDateTime(future.start);
        resEndStr = fmtDateTime(future.end);
      }
    }

    if (statusLabel !== "Available") {
      console.info(
        `[status] ${y.Yacht_Name} (${y.Yacht_ID}) – ${statusLabel}: ${resStartStr} → ${resEndStr}`
      );
    }

    return {
      ...y,
      "Reservation Start Date and time": resStartStr,
      "Reservation End Date and time": resEndStr,
      Status: statusLabel,
      __booked: isBooked,
      __partiallyBooked: isPartiallyBooked,
    };
  });

  console.log(`[summary] ${filtered.length} yachts after applying filters.`);

  /* UI feedback */
  const countEl = $("#resultCount");
  if (countEl)
    countEl.textContent = `${filtered.length} result${
      filtered.length !== 1 ? "s" : ""
    }`;
  showToast(`${filtered.length} result${filtered.length !== 1 ? "s" : ""}`);

  renderTable();
}

/* Render dinámico de la tabla */
function renderTable() {
  if (!filtered.length) {
    $("#tableHead").innerHTML = "";
    $("#tableBody").innerHTML =
      '<tr><td class="p-4">Sin resultados 🛟</td></tr>';
    return;
  }

  /* Cabeceras basadas en claves del objeto */
  const headers = Object.keys(filtered[0]).filter((h) => !h.startsWith("__"));
  $("#tableHead").innerHTML =
    "<tr>" +
    headers.map((h) => `<th class="text-left font-medium">${h}</th>`).join("") +
    "</tr>";

  /* Filas */
  $("#tableBody").innerHTML = filtered
    .map((row) => {
      const rowClass = row.__booked
        ? ' class="booked"'
        : row.__partiallyBooked
        ? ' class="partially-booked"'
        : "";
      return (
        "<tr" +
        rowClass +
        ">" +
        headers
          .map((h) => {
            const val = row[h] || "";
            const isNameCol = h === "Yacht_Name";
            const isStatusCol = h === "Status";
            const extraClass = isNameCol
              ? "font-semibold text-[#0050B3]"
              : isStatusCol
              ? row.__booked
                ? "booked-badge"
                : row.__partiallyBooked
                ? "partially-badge"
                : "available-badge"
              : "";
            return `<td${
              extraClass ? ` class="${extraClass}"` : ""
            }>${val}</td>`;
          })
          .join("") +
        "</tr>"
      );
    })
    .join("");
}

/* Copia la tabla filtrada en formato Markdown */
function copyToClipboard() {
  if (!filtered.length) {
    alert("No hay datos para copiar.");
    return;
  }

  const headers = Object.keys(filtered[0]).filter((h) => !h.startsWith("__"));
  let md = "| " + headers.join(" | ") + " |\n";
  md += "| " + headers.map(() => "---").join(" | ") + " |\n";

  filtered.forEach((row) => {
    md += "| " + headers.map((h) => row[h] || "").join(" | ") + " |\n";
  });

  navigator.clipboard
    .writeText(md)
    .then(() => alert("Tabla copiada al portapapeles."))
    .catch((err) => alert("Error al copiar: " + err));
}

/* =========================================================================
   REDACTAR MENSAJE
   ========================================================================= */
function draftMessage() {
  if (!filtered.length) {
    alert("No hay yates para redactar.");
    return;
  }

  const duration = +document.querySelector('input[name="duration"]:checked')
    .value;

  const priceCols = PRICE_COLS[duration];

  const lines = filtered.map((y) => {
    const priceVal = toNumber(y[priceCols[0]]) || toNumber(y[priceCols[1]]);
    const priceStr = priceVal ? `$${priceVal.toLocaleString("en-US")}` : "N/A";
    return `• ${y.Yacht_Size}' ${y.Yacht_Name} – ${priceStr} (${duration} h) – Marina: ${y.Boarding_Location}`;
  });

  const message =
    "Hola 👋\n\nEstos son los yates disponibles que cumplen tus criterios:\n\n" +
    lines.join("\n") +
    "\n\nAvísame cuál te llama la atención para enviarte más detalles.";

  navigator.clipboard
    .writeText(message)
    .then(() =>
      alert(
        "Mensaje redactado y copiado al portapapeles. ¡Pégalo donde lo necesites!"
      )
    )
    .catch((err) => alert("No se pudo copiar el mensaje: " + err));
}

/* =========================================================================
   INICIALIZACIÓN
   ========================================================================= */
async function init() {
  try {
    console.log("Consultando archivo:", SHEET_URL);
    const [resYachts, resAvail] = await Promise.all([
      fetch(SHEET_URL),
      fetch(AVAIL_URL),
    ]);
    yachts = await resYachts.json();
    const availRows = await resAvail.json();

    // Build availability map
    availabilityMap = {};
    availRows.forEach((r) => {
      const id = r.Yacht_ID;
      if (!id) return;
      const startRaw = r["Reservation Start Date and time"];
      const endRaw = r["Reservation End Date and time"];
      if (!startRaw || !endRaw) {
        if (r.Yacht_ID || r.ID || r.Description) {
          console.warn(
            `[skip booking] missing start/end – Yacht_ID: ${
              r.Yacht_ID || "?"
            }, ID: ${r.ID || "?"}, Desc: ${r.Description || "?"}`
          );
        }
        return;
      }
      const start = parseDate(startRaw);
      const end = parseDate(endRaw);
      if (!start || !end) {
        console.warn(
          `[skip booking] invalid date – Yacht_ID: ${
            r.Yacht_ID || "?"
          }, Start: ${startRaw}, End: ${endRaw}`
        );
        return;
      }
      if (!availabilityMap[id]) availabilityMap[id] = [];
      availabilityMap[id].push({ start, end });
    });

    /* Limpia números y normaliza miles una vez */
    yachts.forEach((y) => {
      Object.keys(y).forEach((k) => {
        if (k.startsWith("Broker_")) {
          const num = toNumber(y[k]);
          /* Re‑formateamos para mostrar $#,### */
          y[k] = num ? `$${num.toLocaleString("en-US")}` : "";
        }
      });
    });

    populateFilters();
    applyFilters();
  } catch (err) {
    console.error(err);
    alert("No se pudo cargar la hoja de cálculo.");
  }
}

/* Desplegar contenido de selects dinámicos */
function populateFilters() {
  /* Ubicaciones únicas */
  const locations = _.uniq(
    yachts.map((y) => y.Boarding_Location).filter(Boolean)
  ).sort();
  $("#locationSelect").insertAdjacentHTML(
    "beforeend",
    locations.map((l) => `<option value="${l}">${l}</option>`).join("")
  );

  // Futuro: agregar filtro por capacidad (requiere campo nuevo en CSV)
  // Futuro: agregar checkbox "con camarotes", "con fotos", "con video"
}

/* =========================================================================
   EVENTOS
   ========================================================================= */
/* ───────────────────────── drawer (mobile filters) ───────────────────────── */
const menuBtn = document.getElementById("menuBtn");
const drawer = document.getElementById("filterPanel");
const closeBtn = document.getElementById("closeFilters");

const toggleDrawer = (show) => {
  if (!drawer) return;
  drawer.classList.toggle("-translate-x-full", !show);
};

menuBtn?.addEventListener("click", () => toggleDrawer(true));
closeBtn?.addEventListener("click", () => toggleDrawer(false));

drawer?.addEventListener("click", (e) => {
  if (e.target === drawer) toggleDrawer(false);
});

/* Rango de presupuesto (min‑max) */
const minRangeEl = $("#budgetMinRange");
const maxRangeEl = $("#budgetMaxRange");

if (minRangeEl)
  minRangeEl.addEventListener("input", _.debounce(applyFilters, 150));
if (maxRangeEl)
  maxRangeEl.addEventListener("input", _.debounce(applyFilters, 150));
$("#sizeRange")?.addEventListener("input", _.debounce(applyFilters, 150));
$("#sizeMinRange")?.addEventListener("input", _.debounce(applyFilters, 150));

/* Duration chip styling */
document.querySelectorAll(".chip input[name='duration']").forEach((radio) => {
  radio.addEventListener("change", () => {
    document
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.remove("chip-active"));
    radio.parentElement.classList.add("chip-active");
    applyFilters();
  });
});
/* Activate default on load */
document
  .querySelector(".chip input:checked")
  ?.parentElement.classList.add("chip-active");

$("#copyBtn")?.addEventListener("click", copyToClipboard);
$("#draftBtn")?.addEventListener("click", draftMessage);

$("#dateInput").addEventListener("change", applyFilters);

$("#resetBtn").addEventListener("click", () => {
  if (minRangeEl) minRangeEl.value = "";
  if (maxRangeEl) maxRangeEl.value = "";
  $("#sizeRange").value = 200;
  $("#sizeMinRange").value = 20;
  document.querySelector(".chip input[value='4']").checked = true;
  document
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.remove("chip-active"));
  document
    .querySelector(".chip input[value='4']")
    .parentElement.classList.add("chip-active");
  $("#locationSelect").value = "";
  $("#dateInput").value = "";
  applyFilters();
});

/* ------------------------------------------------------------------------- */
init();
