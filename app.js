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

const toNumber = (str) =>
  +String(str || "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

const parseDate = (str) => {
  if (!str) return null;
  let s = String(str)
    .trim()
    .replace(/[‚Äô’]/g, "'");
  // Remove trailing commas
  s = s.replace(/,\s*$/, "");
  // Handle "5/14/2025, 12:00:00 AM" by removing the comma
  s = s.replace(/(\d{4})\s*,\s*/, "$1 ");
  const d = new Date(s);
  if (isNaN(d)) {
    console.warn("[parseDate] Invalid:", str);
    return null;
  }
  return d;
};

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
  const budgetMax = +$("#budgetRange").value;
  const sizeMin = +$("#sizeMinRange").value;
  const sizeMax = +$("#sizeRange").value;
  const duration = +document.querySelector('input[name="duration"]:checked')
    .value;
  const location = $("#locationSelect").value;
  const brands = Array.from($("#brandSelect").selectedOptions).map(
    (o) => o.value
  );
  // const hasStaterooms = $("#hasStaterooms").checked;

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

    /* 2. presupuesto (máximo valor weekend / weekday) */
    const priceCols = PRICE_COLS[duration];
    const price = Math.max(...priceCols.map((col) => toNumber(y[col])));
    if (price > budgetMax) return false;

    /* 3. ubicación */
    if (location && y.Boarding_Location !== location) return false;

    /* 4. marca */
    if (brands.length && !brands.includes(y.Brand)) return false;

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
    let resStartStr = "";
    let resEndStr = "";

    if (selectedDate) {
      // Caso 1: el usuario seleccionó una fecha
      const overlapping = bookings.find((b) => {
        const selectedDay = selectedDate.toDateString();
        const startDay = b.start.toDateString();
        const endDay = b.end.toDateString();
        return selectedDay >= startDay && selectedDay <= endDay;
      });
      if (overlapping) {
        isBooked = true;
        statusLabel = "Booked";
        resStartStr = fmtDateTime(overlapping.start);
        resEndStr = fmtDateTime(overlapping.end);
      } else {
        statusLabel = "Available";
        resStartStr = "";
        resEndStr = "";
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

    console.log(
      "[map] Yacht",
      y.Yacht_ID,
      "| status:",
      statusLabel,
      "| start:",
      resStartStr,
      "| end:",
      resEndStr
    );

    return {
      ...y,
      "Reservation Start Date and time": resStartStr,
      "Reservation End Date and time": resEndStr,
      Status: statusLabel,
      __booked: isBooked,
    };
  });

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
      const rowClass = row.__booked ? ' class="booked"' : "";
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
      const start = parseDate(r["Reservation Start Date and time"]);
      const end = parseDate(r["Reservation End Date and time"]);
      if (!start || !end) {
        console.warn("[skip booking] invalid date", r);
        return;
      }
      if (!availabilityMap[id]) availabilityMap[id] = [];
      console.log(
        "[init] push booking",
        id,
        "⮕",
        start?.toLocaleString(),
        "→",
        end?.toLocaleString()
      );
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

  /* Marcas únicas */
  const brands = _.uniq(yachts.map((y) => y.Brand).filter(Boolean)).sort();
  $("#brandSelect").innerHTML = brands
    .map((b) => `<option value="${b}">${b}</option>`)
    .join("");

  // Futuro: agregar filtro por capacidad (requiere campo nuevo en CSV)
  // Futuro: agregar checkbox "con camarotes", "con fotos", "con video"
  // Futuro: Filtro por media (tiene fotos/video), popularidad, o tags personalizados
}

/* =========================================================================
   EVENTOS
   ========================================================================= */
$("#budgetRange").addEventListener("input", (e) => {
  $("#budgetLabel").textContent = `$${(+e.target.value).toLocaleString()}`;
  document
    .querySelectorAll(".quick-budget")
    .forEach((b) => b.classList.remove("quick-budget-active"));
});
$("#sizeRange").addEventListener("input", (e) => {
  $("#sizeLabel").textContent = `${e.target.value} ft`;
});
$("#sizeMinRange").addEventListener("input", (e) => {
  $("#sizeMinLabel").textContent = `${e.target.value} ft`;
});

$("#applyBtn").addEventListener("click", applyFilters);
$("#copyBtn").addEventListener("click", copyToClipboard);
$("#draftBtn").addEventListener("click", draftMessage);

document.querySelectorAll(".quick-budget").forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = btn.getAttribute("data-value");
    $("#budgetRange").value = val;
    $("#budgetLabel").textContent = `$${(+val).toLocaleString()}`;
    applyFilters();

    document
      .querySelectorAll(".quick-budget")
      .forEach((b) => b.classList.remove("quick-budget-active"));
    btn.classList.add("quick-budget-active");
  });
});

$("#dateInput").addEventListener("change", applyFilters);

$("#resetBtn").addEventListener("click", () => {
  $("#budgetRange").value = 30000;
  $("#budgetLabel").textContent = "$30,000";
  $("#sizeRange").value = 200;
  $("#sizeLabel").textContent = "200 ft";
  $("#sizeMinRange").value = 20;
  $("#sizeMinLabel").textContent = "20 ft";
  document.querySelector('input[name="duration"][value="4"]').checked = true;
  $("#locationSelect").value = "";
  $("#brandSelect").selectedIndex = -1;
  $("#dateInput").value = "";
  document
    .querySelectorAll(".quick-budget")
    .forEach((b) => b.classList.remove("quick-budget-active"));
  applyFilters();
});

/* ------------------------------------------------------------------------- */
init();
