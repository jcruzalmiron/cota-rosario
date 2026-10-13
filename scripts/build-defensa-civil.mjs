import { mkdir, writeFile } from "node:fs/promises";

const PORTAL = "https://datosabiertos.rosario.gob.ar/sites/default/files";
const ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive";
const ROSARIO = { lat: -32.9468, lon: -60.6393 };
const TIMEZONE = "America/Argentina/Cordoba";
const OUT_DIR = "public/data";
const FLOODING_PATTERN = /anegamiento/i;

const YEARLY_FILES = [
  { anio: 2021, url: `${PORTAL}/uploaded_resources/intervenciones_acumuladas_defensa_civil._ano_2021.csv`, separador: ";", codificacion: "latin1" },
  { anio: 2022, url: `${PORTAL}/uploaded_resources/intervenciones_defensa_civil_ano_2022.csv`, separador: ",", codificacion: "utf8" },
  { anio: 2023, url: `${PORTAL}/uploaded_resources/Intervenciones%20Defensa%20Civil%20-%20A%C3%B1o%202023.csv`, separador: ",", codificacion: "utf8" },
  { anio: 2024, url: `${PORTAL}/uploaded_resources/Intervenciones%20Defensa%20Civil%20-%20A%C3%B1o%202024.csv`, separador: ",", codificacion: "utf8" },
];

const POLYGON_FILES = [
  { salida: "distritos.json", url: `${PORTAL}/uploaded_resources/distritos_descentralizados_json.csv`, nombre: "DISTRITO", propiedad: "distrito" },
  { salida: "barrios.json", url: `${PORTAL}/resources/barrios_json.csv`, nombre: "BARRIO", propiedad: "barrio" },
];

const MONTH_NUMBER = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function splitCsvLine(line, separator) {
  const cells = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote && line[index + 1] === quote) {
        current += char;
        index += 1;
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === separator) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function fetchText(url, encoding) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} devolvió ${response.status}`);
  }
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}

function monthOf(cell) {
  const numeric = Number(cell);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }
  return MONTH_NUMBER[cell.toLowerCase()] ?? null;
}

function parseYear(text, { anio, separador }) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = splitCsvLine(lines[0], separador).map((cell) => cell.toLowerCase());
  const typeIndex = header.findIndex((cell) => cell.includes("tipo"));
  const districtIndex = header.findIndex((cell) => cell.includes("distrito"));
  const countIndex = header.findIndex((cell) => cell.startsWith("cant"));
  const monthIndex = header.findIndex((cell) => cell === "mes");
  if (typeIndex < 0 || districtIndex < 0 || countIndex < 0 || monthIndex < 0) {
    throw new Error(`Columnas inesperadas en ${anio}: ${header.join(" | ")}`);
  }
  return lines.slice(1).flatMap((line) => {
    const cells = splitCsvLine(line, separador);
    if (!FLOODING_PATTERN.test(cells[typeIndex] ?? "")) {
      return [];
    }
    const month = monthOf(cells[monthIndex]);
    if (month === null) {
      throw new Error(`Mes ilegible en ${anio}: ${line}`);
    }
    return [{ mes: `${anio}-${String(month).padStart(2, "0")}`, distrito: cells[districtIndex].toUpperCase(), casos: Number(cells[countIndex]) || 0 }];
  });
}

async function fetchMonthlyRain(desde, hasta) {
  const params = new URLSearchParams({
    latitude: String(ROSARIO.lat),
    longitude: String(ROSARIO.lon),
    start_date: `${desde}-01`,
    end_date: hasta,
    daily: "precipitation_sum",
    models: "era5",
    timezone: TIMEZONE,
  });
  const response = await fetch(`${ARCHIVE_API}?${params}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo archive devolvió ${response.status}`);
  }
  const { daily } = await response.json();
  if (!Array.isArray(daily?.time) || daily.time.length === 0 || daily.time.length !== daily.precipitation_sum?.length || daily.precipitation_sum.some((mm) => typeof mm !== "number" || !Number.isFinite(mm) || mm < 0)) throw new Error("El archivo de lluvia tiene valores faltantes o inválidos; no se reconstruye con ceros.");
  return daily.time.reduce((acc, day, index) => {
    const mes = day.slice(0, 7);
    return { ...acc, [mes]: (acc[mes] ?? 0) + (daily.precipitation_sum[index] ?? 0) };
  }, {});
}

function lastDayOfMonth(mes) {
  const [anio, month] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(anio, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

function sumBy(rows, key) {
  return rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] ?? 0) + row.casos }), {});
}

function peakOf(months) {
  return months.reduce((best, month) => (best === null || month.casos > best.casos ? month : best), null);
}

async function buildPolygons({ salida, url, nombre, propiedad }) {
  const text = await fetchText(url, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = splitCsvLine(lines[0], ",");
  const nameIndex = header.indexOf(nombre);
  const geoIndex = header.indexOf("GEOJSON");
  const features = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, ",");
    const feature = JSON.parse(cells[geoIndex]);
    return { type: "Feature", properties: { [propiedad]: cells[nameIndex].trim() }, geometry: feature.geometry };
  });
  await writeFile(`${OUT_DIR}/${salida}`, JSON.stringify({ type: "FeatureCollection", features }));
  return features.length;
}

await mkdir(OUT_DIR, { recursive: true });

const rows = (
  await Promise.all(YEARLY_FILES.map(async (file) => parseYear(await fetchText(file.url, file.codificacion), file)))
).flat();
const meses = [...new Set(rows.map((row) => row.mes))].sort();
const distritos = [...new Set(rows.map((row) => row.distrito))].sort();
const lluviaPorMes = await fetchMonthlyRain(meses[0], lastDayOfMonth(meses[meses.length - 1]));

const serie = meses.map((mes) => {
  const delMes = rows.filter((row) => row.mes === mes);
  return { mes, lluviaMm: Number((lluviaPorMes[mes] ?? 0).toFixed(1)), casos: delMes.reduce((sum, row) => sum + row.casos, 0), porDistrito: sumBy(delMes, "distrito") };
});

const mesesPorAnio = meses.reduce((acc, mes) => {
  const anio = mes.slice(0, 4);
  return { ...acc, [anio]: (acc[anio] ?? 0) + 1 };
}, {});

const resumenDistrito = Object.fromEntries(
  distritos.map((distrito) => {
    const propios = serie.map((mes) => ({ mes: mes.mes, casos: mes.porDistrito[distrito] ?? 0, lluviaMm: mes.lluviaMm }));
    const total = propios.reduce((sum, mes) => sum + mes.casos, 0);
    const porAnio = propios.reduce((acc, mes) => ({ ...acc, [mes.mes.slice(0, 4)]: (acc[mes.mes.slice(0, 4)] ?? 0) + mes.casos }), {});
    return [distrito, { total, porAnio, mesPico: peakOf(propios) }];
  }),
);

const totalCiudad = serie.reduce((sum, mes) => sum + mes.casos, 0);
const ciudad = {
  total: totalCiudad,
  porAnio: serie.reduce((acc, mes) => ({ ...acc, [mes.mes.slice(0, 4)]: (acc[mes.mes.slice(0, 4)] ?? 0) + mes.casos }), {}),
  mesPico: peakOf(serie.map(({ mes, casos, lluviaMm }) => ({ mes, casos, lluviaMm }))),
};

const salida = {
  nombre: "Anegamientos transitorios atendidos por Defensa Civil, por distrito y mes",
  fuente: "Municipalidad de Rosario · Intervenciones Defensa Civil",
  endpoints: YEARLY_FILES.map((file) => file.url),
  lluvia: { fuente: "Open-Meteo archivo histórico (ERA5)", endpoint: ARCHIVE_API, punto: ROSARIO },
  periodo: { desde: meses[0], hasta: meses[meses.length - 1] },
  mesesPorAnio,
  distritos: resumenDistrito,
  ciudad,
  serie,
  calculado: new Date().toISOString(),
};
await writeFile(`${OUT_DIR}/defensa-civil.json`, JSON.stringify(salida, null, 2));

const poligonos = await Promise.all(POLYGON_FILES.map(buildPolygons));

console.log(`anegamientos ${meses[0]} → ${meses[meses.length - 1]} · ${totalCiudad} casos · meses por año ${JSON.stringify(mesesPorAnio)}`);
for (const distrito of distritos) {
  const { total, porAnio, mesPico } = resumenDistrito[distrito];
  console.log(`${distrito.padEnd(9)} ${String(total).padStart(5)} · ${JSON.stringify(porAnio)} · pico ${mesPico.mes} ${mesPico.casos} casos / ${mesPico.lluviaMm} mm`);
}
console.log(`pico ciudad ${ciudad.mesPico.mes}: ${ciudad.mesPico.casos} casos con ${ciudad.mesPico.lluviaMm} mm`);
console.log(`polígonos: ${POLYGON_FILES.map((file, index) => `${file.salida} ${poligonos[index]}`).join(" · ")}`);
