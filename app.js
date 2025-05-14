/* =========================================================================
   CONFIGURACIÓN
   ========================================================================= */
const SHEET_ID = "1KXC4yEMrvGlgwmvzsiMT6vONDQtyQ_wEShxbGsszMNM";
const SHEET_TAB = "1"; // nombre exacto de la pestaña
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(
  SHEET_TAB
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

/* =========================================================================
   UTILIDADES
   ========================================================================= */
const $ = (sel) => document.querySelector(sel);

const toNumber = (str) =>
  +String(str || "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

/* Compara tamaño + presupuesto + filtros select */
function applyFilters() {
  const budgetMax = +$("#budgetRange").value;
  const sizeMax = +$("#sizeRange").value;
  const duration = +document.querySelector('input[name="duration"]:checked')
    .value;
  const location = $("#locationSelect").value;
  const brands = Array.from($("#brandSelect").selectedOptions).map(
    (o) => o.value
  );

  filtered = yachts.filter((y) => {
    /* 1. tamaño */
    if (toNumber(y.Yacht_Size) > sizeMax) return false;

    /* 2. presupuesto: tomamos el MAYOR precio (weekend) para evitar sorpresas */
    const priceCols = PRICE_COLS[duration];
    const price = Math.max(...priceCols.map((col) => toNumber(y[col])));
    if (price > budgetMax) return false;

    /* 3. ubicación */
    if (location && y.Boarding_Location !== location) return false;

    /* 4. marca */
    if (brands.length && !brands.includes(y.Brand)) return false;

    return true;
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
  const headers = Object.keys(filtered[0]);
  $("#tableHead").innerHTML =
    "<tr>" +
    headers.map((h) => `<th class="text-left font-medium">${h}</th>`).join("") +
    "</tr>";

  /* Filas */
  $("#tableBody").innerHTML = filtered
    .map((row) => {
      return (
        "<tr>" +
        headers
          .map((h) => {
            const val = row[h] || "";
            return `<td>${val}</td>`;
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

  const headers = Object.keys(filtered[0]);
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
   INICIALIZACIÓN
   ========================================================================= */
async function init() {
  try {
    console.log("Consultando archivo:", SHEET_URL);
    const res = await fetch(SHEET_URL);
    yachts = await res.json();

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
}

/* =========================================================================
   EVENTOS
   ========================================================================= */
$("#budgetRange").addEventListener("input", (e) => {
  $("#budgetLabel").textContent = `$${(+e.target.value).toLocaleString()}`;
});
$("#sizeRange").addEventListener("input", (e) => {
  $("#sizeLabel").textContent = `${e.target.value} ft`;
});

$("#applyBtn").addEventListener("click", applyFilters);
$("#copyBtn").addEventListener("click", copyToClipboard);

/* ------------------------------------------------------------------------- */
init();
