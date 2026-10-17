/**
 * app.js — Preciador GE · Chapur 2.0
 * Depende de data.js (window.CATALOG_DATA: catalog, articles, categories).
 *
 * Navegación:
 *   Inicio  -> "Por artículo" (búsqueda dinámica; al tocar una opción se entra a cotizar)
 *              y "Por categoría" (lista desplegable; al elegir se entra a cotizar)
 *   Cotizar -> precio -> opciones de garantía (todas a la vez) -> total con código de barras
 */
(function () {
  "use strict";

  const DATA = window.CATALOG_DATA;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  const normalize = (s) =>
    (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const money = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const anios = (n) => `${n} año${n > 1 ? "s" : ""}`;

  const LABELS = {
    "LINEA BLANCA": "Línea blanca",
    "ELECTRONICA": "Electrónica",
    "HOGAR ELECTRODOMESTICOS": "Hogar · electrodomésticos",
    "PC COMPUTERS": "Computadoras de escritorio",
    "NOTEBOOK / LAPTOPS": "Notebooks / laptops",
    "CAMARAS Y VIDEOCAM": "Cámaras y videocámaras",
    "CONSOLA DE VJ": "Consolas de videojuegos",
    "IPODS": "iPods",
    "REEMPLAZO": "Otros artículos (solo Reemplazo)",
    "TABLET": "Tablets",
    "TELÉFONO CELULAR": "Teléfonos celulares",
    "MUEBLES": "Muebles",
  };
  const labelOf = (c) => LABELS[c] || c;

  // Una "opción" de cotización = programa + vigencia. Reemplazo aplica a cualquier categoría.
  const optionKey = (c) => (c.category === "REEMPLAZO" ? "Reemplazo" : "GE") + "|" + c.term;
  const yearsOf = (c) => Math.round((parseInt(c.term.split("+")[1], 10) || 12) / 12);
  const isReemplazo = (c) => c.category === "REEMPLAZO";
  const optionName = (key) => key.replace("|", " · ");

  const rangesFor = (category, key) =>
    DATA.catalog
      .filter((c) => (c.category === category || isReemplazo(c)) && (!key || optionKey(c) === key))
      .sort((a, b) => a.min - b.min || a.max - b.max);

  const sortOptions = (list) =>
    [...list].sort((a, b) => yearsOf(b) - yearsOf(a) || isReemplazo(a) - isReemplazo(b) || b.price - a.price);

  function rangeReason(category, price, key) {
    const rows = rangesFor(category, key);
    if (!rows.length) return "No hay tarifas disponibles.";
    const min = Math.min(...rows.map((c) => c.min));
    const max = Math.max(...rows.map((c) => c.max));
    if (price < min) return `El precio ${money(price)} está por debajo del mínimo de ${money(min)}. Máximo: ${money(max)}.`;
    if (price > max) return `El precio ${money(price)} supera el máximo de ${money(max)}. Mínimo: ${money(min)}.`;
    const lower = rows.filter((c) => c.max < price);
    const upper = rows.filter((c) => c.min > price);
    return `El precio ${money(price)} cae en un tramo sin tarifa en el catálogo: el tramo anterior termina en ${money(Math.max(...lower.map((c) => c.max)))} y el siguiente empieza en ${money(Math.min(...upper.map((c) => c.min)))}. No se ajusta el precio automáticamente.`;
  }

  // ------------------------------------------------------------------
  // Código de barras EAN-13 (SVG, altura reducida)
  // ------------------------------------------------------------------
  function barcodeSVG(ean) {
    if (!/^\d{13}$/.test(ean)) throw new Error("EAN inválido");
    const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
    const R = L.map((s) => [...s].map((v) => (v === "0" ? "1" : "0")).join(""));
    const G = R.map((s) => [...s].reverse().join(""));
    const parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"][+ean[0]];
    let bits = "101";
    [...ean.slice(1, 7)].forEach((v, i) => (bits += (parity[i] === "L" ? L : G)[+v]));
    bits += "01010";
    [...ean.slice(7)].forEach((v) => (bits += R[+v]));
    bits += "101";
    let bars = "";
    [...bits].forEach((v, i) => {
      if (v === "1") {
        const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
        bars += `<rect x="${16 + i}" y="4" width="1" height="${guard ? 40 : 34}"/>`;
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 123 56" role="img" aria-label="Código EAN-13 ${ean}"><rect width="123" height="56" fill="white"/><g fill="black">${bars}</g><g fill="black" font-family="Arial,sans-serif" font-size="8" text-anchor="middle"><text x="9" y="50">${ean[0]}</text><text x="40" y="50">${ean.slice(1, 7)}</text><text x="87" y="50">${ean.slice(7)}</text></g></svg>`;
  }

  // ------------------------------------------------------------------
  // Índice de búsqueda
  // ------------------------------------------------------------------
  const ALIASES = {
    ventilador: ["abanico"],
    televisor: ["tv", "pantalla", "television"],
    laptop: ["portatil", "notebook"],
    refrigerador: ["refri"],
    celular: ["telefono", "smartphone"],
    consola: ["xbox", "playstation", "nintendo"],
    aire: ["minisplit", "acondicionado"],
  };
  const SEARCH_INDEX = DATA.articles.map((a) => ({
    name: a.name,
    category: a.category,
    hay: normalize(a.name + " " + (a.references || []).join(" ")),
    nameN: normalize(a.name),
  }));

  function searchArticles(query) {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const hits = SEARCH_INDEX.filter((e) =>
      terms.every(
        (t) =>
          e.hay.includes(t) ||
          Object.entries(ALIASES).some(
            ([key, vals]) => (key === t || vals.includes(t)) && [key, ...vals].some((v) => e.hay.includes(v))
          )
      )
    );
    // Primero los que coinciden con el nombre, luego los que solo coinciden por referencias
    const first = normalize(query);
    hits.sort((a, b) => (b.nameN.includes(first) ? 1 : 0) - (a.nameN.includes(first) ? 1 : 0) || a.name.localeCompare(b.name, "es"));
    return hits.slice(0, 8);
  }

  // ------------------------------------------------------------------
  // Estado y elementos
  // ------------------------------------------------------------------
  let state = { category: null, article: null, selectedKey: null, available: [], inQuote: false };

  const STORES = [
    { id: "1", key: "1.Sur", name: "Tienda Sur" },
    { id: "2", key: "2.Centro", name: "Tienda Centro" },
    { id: "5", key: "5.Norte", name: "Tienda Norte" },
    { id: "6", key: "6.Cancún", name: "Tienda Cancún" },
    { id: "8", key: "8.Montejo", name: "Tienda Montejo" },
  ];
  const SESSION_KEY = "chapur.store.v1";

  const loginScreen = $("loginScreen"), appScreen = $("appScreen"), loginForm = $("loginForm");
  const storeKeyInput = $("storeKey"), loginError = $("loginError"), storeName = $("storeName");
  const backBtn = $("backBtn"), logoutBtn = $("logoutBtn");
  const homeView = $("homeView"), quoteView = $("quoteView");
  const searchInput = $("searchInput"), searchResults = $("searchResults"), searchEmpty = $("searchEmpty");
  const categorySelect = $("categorySelect");
  const catTitle = $("catTitle"), catSub = $("catSub"), crumbHome = $("crumbHome"), crumbCat = $("crumbCat");
  const selectedRow = $("selectedRow"), selectedName = $("selectedName");
  const priceInput = $("priceInput"), priceClear = $("priceClear"), priceBounds = $("priceBounds");
  const msgCard = $("msgCard"), resultWrap = $("resultWrap"), resOptions = $("resOptions"), resAhorro = $("resAhorro");
  const resTotal = $("resTotal"), barcodeBtn = $("barcodeBtn"), resNotes = $("resNotes"), resetBtn = $("resetBtn");
  const barcodeModal = $("barcodeModal"), barcodeClose = $("barcodeClose"), bcTitle = $("bcTitle"), bcSub = $("bcSub"), bcTerm = $("bcTerm"), bcSku = $("bcSku"), bcBig = $("bcBig");

  // ------------------------------------------------------------------
  // Acceso por sucursal
  // ------------------------------------------------------------------
  function enterStore(store) {
    storeName.textContent = store.name;
    try { sessionStorage.setItem(SESSION_KEY, store.id); } catch (e) { /* sin almacenamiento */ }
    loginScreen.hidden = true;
    appScreen.hidden = false;
    loginError.hidden = true;
    storeKeyInput.value = "";
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = storeKeyInput.value.trim().normalize("NFC");
    const store = STORES.find((s) => s.key === entered);
    if (store) {
      enterStore(store);
    } else {
      loginError.textContent = "La clave no corresponde a una sucursal. Revisa el número y el nombre.";
      loginError.hidden = false;
      storeKeyInput.value = "";
      storeKeyInput.focus();
    }
  });

  logoutBtn.addEventListener("click", () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* sin almacenamiento */ }
    location.reload();
  });

  function tryAutoLogin() {
    try {
      const id = sessionStorage.getItem(SESSION_KEY);
      const store = STORES.find((s) => s.id === id);
      if (store) enterStore(store);
    } catch (e) { /* sin almacenamiento */ }
  }

  // ------------------------------------------------------------------
  // Inicio: búsqueda por artículo y por categoría
  // ------------------------------------------------------------------
  DATA.categories.forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = labelOf(c);
    categorySelect.appendChild(o);
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    searchResults.innerHTML = "";
    if (q.length < 2) {
      searchResults.hidden = true;
      searchEmpty.hidden = true;
      return;
    }
    const hits = searchArticles(q);
    if (!hits.length) {
      searchResults.hidden = true;
      searchEmpty.hidden = false;
      return;
    }
    searchEmpty.hidden = true;
    searchResults.hidden = false;
    hits.forEach((h) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "result-item";
      b.innerHTML = `<span class="name">${esc(h.name)}</span><span class="cat">${esc(labelOf(h.category))}</span>`;
      b.addEventListener("click", () => abrirCotizacion(h.category, h.name));
      searchResults.appendChild(b);
    });
  });

  categorySelect.addEventListener("change", () => {
    if (categorySelect.value) abrirCotizacion(categorySelect.value, null);
  });

  // ------------------------------------------------------------------
  // Navegación (compatible con el botón/gesto "atrás" del celular)
  // ------------------------------------------------------------------
  function abrirCotizacion(category, article) {
    state = { category, article, selectedKey: null, available: [], inQuote: true };
    const keys = [...new Set(rangesFor(category).map(optionKey))];
    const maxY = Math.max(...rangesFor(category).map(yearsOf));

    catTitle.textContent = labelOf(category);
    catSub.textContent = `Hasta ${anios(maxY)} de protección adicional`;
    crumbCat.textContent = labelOf(category);
    selectedRow.hidden = !article;
    selectedName.textContent = article || "";

    const rows = rangesFor(category);
    const min = Math.min(...rows.map((c) => c.min)), max = Math.max(...rows.map((c) => c.max));
    priceBounds.textContent = keys.length ? `Rango de precios: mínimo ${money(min)} · máximo ${money(max)}.` : "";

    priceInput.value = "";
    priceClear.hidden = true;
    msgCard.hidden = true;
    resultWrap.hidden = true;

    homeView.hidden = true;
    quoteView.hidden = false;
    backBtn.hidden = false;
    try { history.pushState({ quote: true }, ""); } catch (e) { /* sin historial */ }
    window.scrollTo(0, 0);
    priceInput.focus();
  }

  function mostrarInicio() {
    state = { category: null, article: null, selectedKey: null, available: [], inQuote: false };
    quoteView.hidden = true;
    homeView.hidden = false;
    backBtn.hidden = true;
    priceInput.value = "";
    searchInput.value = "";
    searchResults.hidden = true;
    searchEmpty.hidden = true;
    categorySelect.value = "";
    barcodeModal.hidden = true;
    window.scrollTo(0, 0);
  }

  // Desde la cotización se regresa con el historial, para que el botón "atrás" del celular haga lo mismo.
  function volverInicio() {
    if (history.state && history.state.quote) history.back();
    else mostrarInicio();
  }
  window.addEventListener("popstate", mostrarInicio);
  backBtn.addEventListener("click", volverInicio);
  resetBtn.addEventListener("click", volverInicio);
  crumbHome.addEventListener("click", (e) => { e.preventDefault(); volverInicio(); });

  // ------------------------------------------------------------------
  // Cotización
  // ------------------------------------------------------------------
  priceInput.addEventListener("input", () => {
    let v = priceInput.value.replace(/[^0-9.]/g, "");
    const dot = v.indexOf(".");
    if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    priceInput.value = v;
    priceClear.hidden = v === "";
    calcular();
  });

  priceClear.addEventListener("click", () => {
    priceInput.value = "";
    priceClear.hidden = true;
    state.selectedKey = null;
    calcular();
    priceInput.focus();
  });

  function calcular() {
    const price = parseFloat(priceInput.value);
    msgCard.hidden = true;
    resultWrap.hidden = true;
    if (!state.category || !(price > 0)) return;

    const cents = Math.round(price * 100);
    const notes = [], available = [];
    const keys = [...new Set(rangesFor(state.category).map(optionKey))];
    keys.forEach((key) => {
      const group = rangesFor(state.category, key).filter((c) => cents >= c.min * 100 && cents <= c.max * 100);
      if (!group.length) notes.push(`${optionName(key)}: ${rangeReason(state.category, price, key)}`);
      else if (group.length > 1) notes.push(`${optionName(key)}: rangos superpuestos en el catálogo (SKUs ${group.map((c) => c.sku).join(", ")}). Solicita revisión.`);
      else available.push(group[0]);
    });

    if (!available.length) {
      msgCard.innerHTML = `<p>No hay garantía disponible para este precio.</p>` + notes.map((n) => `<p>${esc(n)}</p>`).join("");
      msgCard.hidden = false;
      state.available = [];
      return;
    }

    state.available = sortOptions(available);
    if (!state.available.some((c) => optionKey(c) === state.selectedKey)) state.selectedKey = optionKey(state.available[0]);
    pintarResultado(price, notes);
  }

  function pintarAhorro(sel, price) {
    resAhorro.hidden = true;
    resAhorro.innerHTML = "";
    resAhorro.onclick = null;
    resAhorro.className = "ahorro";
    if (isReemplazo(sel)) return;
    const ge = state.available.filter((c) => !isReemplazo(c));
    const base = ge.find((c) => yearsOf(c) === 1);
    const largo = ge.find((c) => yearsOf(c) === 2);
    if (!base || !largo) return;
    const n = yearsOf(largo);
    const veces = base.price * n;
    const ahorro = veces - largo.price;
    if (ahorro < 0.005) return;
    const invita = sel === base;
    resAhorro.className = "ahorro" + (invita ? " ahorro-invita" : "");
    resAhorro.innerHTML = `
      <span class="ahorro-tag">${invita ? "Recomendación" : "Tu ahorro"}</span>
      <span class="ahorro-monto">${invita ? `Con +${n} años ahorrarías ${money(ahorro)}` : `Ahorras ${money(ahorro)}`}</span>
      <span class="ahorro-det">${n} garantías de 1 año costarían <s>${money(veces)}</s></span>
      ${invita ? `<span class="ahorro-cta">Ver opción de +${n} años →</span>` : ""}`;
    if (invita) {
      resAhorro.setAttribute("role", "button");
      resAhorro.tabIndex = 0;
      resAhorro.onclick = () => seleccionar(largo);
    } else {
      resAhorro.removeAttribute("role");
      resAhorro.removeAttribute("tabindex");
    }
    resAhorro.hidden = false;
  }

  function seleccionar(c) {
    state.selectedKey = optionKey(c);
    pintarResultado(parseFloat(priceInput.value), state.notes || []);
  }

  function pintarResultado(price, notes) {
    state.notes = notes;
    const sel = state.available.find((c) => optionKey(c) === state.selectedKey);

    resOptions.innerHTML = "";
    state.available.forEach((c) => {
      const on = c === sel;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "res-row" + (on ? " selected" : "") + (isReemplazo(c) ? " reemplazo" : "");
      row.setAttribute("role", "radio");
      row.setAttribute("aria-checked", on ? "true" : "false");
      const txt = isReemplazo(c) ? `Reemplazo · ${anios(yearsOf(c))}, por:` : "Años adicionales, por:";
      row.innerHTML = `<span class="res-shield">+${yearsOf(c)}</span><span class="res-txt">${txt}</span><span class="res-price">${money(c.price)}</span>`;
      row.addEventListener("click", () => seleccionar(c));
      resOptions.appendChild(row);
    });

    pintarAhorro(sel, price);
    resTotal.textContent = money(sel.price);
    barcodeBtn.innerHTML = barcodeSVG(sel.ean);
    barcodeBtn.onclick = () => ampliarCodigo(sel);

    resNotes.hidden = !notes.length;
    resNotes.innerHTML = notes.length ? `<summary>Opciones no disponibles</summary>${notes.map((n) => `<p>${esc(n)}</p>`).join("")}` : "";
    resNotes.open = false;
    resultWrap.hidden = false;
  }

  function ampliarCodigo(c) {
    bcTitle.textContent = `${isReemplazo(c) ? "Reemplazo" : "Garantía"} +${anios(yearsOf(c))}`;
    bcSub.textContent = money(c.price);
    bcTerm.textContent = c.term;
    bcSku.textContent = c.sku;
    bcBig.innerHTML = barcodeSVG(c.ean);
    barcodeModal.hidden = false;
  }
  barcodeClose.addEventListener("click", () => (barcodeModal.hidden = true));
  barcodeModal.addEventListener("click", (e) => { if (e.target === barcodeModal) barcodeModal.hidden = true; });

  // ------------------------------------------------------------------
  // Compartir app (QR con la URL actual)
  // ------------------------------------------------------------------
  const shareBtn = $("shareBtn"), shareModal = $("shareModal"), shareClose = $("shareClose");
  const qrHolder = $("qrHolder"), qrUrl = $("qrUrl");
  shareBtn.addEventListener("click", () => {
    const url = location.href.split("#")[0];
    shareModal.hidden = false;
    qrHolder.innerHTML = "";
    qrUrl.textContent = url;
    try {
      new QRCode(qrHolder, { text: url, width: 180, height: 180, colorDark: "#0e3a7a", colorLight: "#ffffff" });
    } catch (err) {
      qrHolder.textContent = "No se pudo generar el QR en este dispositivo.";
    }
  });
  shareClose.addEventListener("click", () => (shareModal.hidden = true));
  shareModal.addEventListener("click", (e) => { if (e.target === shareModal) shareModal.hidden = true; });

  // ------------------------------------------------------------------
  tryAutoLogin();
})();
