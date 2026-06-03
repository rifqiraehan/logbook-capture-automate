(async () => {
  "use strict";

  const CONFIG = {
    startWeek: 1, // Minggu Pertama Kegiatan
    endWeek: 20, // Minggu Terakhir Kegiatan

    delayAfterChangeMs: 4000,
    scale: 2,

    selectorDropdown: "#tdData > table:nth-child(8) #minggu",
    selectorDropdownTable: "#tdData > table:nth-child(8)",
    selectorLogbookTable: "#tdData > table:nth-child(9)",

    html2canvasUrl: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    debug: false
  };

  const log = (...args) => console.log("[Logbook]", ...args);
  const warn = (...args) => console.warn("[Logbook]", ...args);
  const error = (...args) => console.error("[Logbook]", ...args);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function ensureHtml2Canvas() {
    if (typeof window.html2canvas === "function") return;

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CONFIG.html2canvasUrl;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Gagal memuat html2canvas."));
      document.head.appendChild(script);
    });

    if (typeof window.html2canvas !== "function") {
      throw new Error("html2canvas tidak tersedia.");
    }
  }

  function qs(selector, label = selector) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Element tidak ditemukan: ${label}`);
    return el;
  }

  function px(value) {
    return `${Math.ceil(value)}px`;
  }

  function getUserSlug() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return node.nodeValue && node.nodeValue.includes("USER :")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const node = walker.nextNode();

    const name = (node?.nodeValue || "")
      .replace(/\s+/g, " ")
      .replace(/.*USER\s*:\s*/i, "")
      .replace(/\([^)]*\)/g, "")
      .trim();

    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join("_")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "") || "unknown_user"
    );
  }

  function downloadCanvas(canvas, filename) {
    const a = document.createElement("a");
    a.download = filename;
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function copyImportantComputedStyles(sourceRoot, cloneRoot) {
    const props = [
      "font",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "color",
      "backgroundColor",
      "borderCollapse",
      "borderSpacing",
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "textAlign",
      "verticalAlign",
      "whiteSpace",
      "wordBreak",
      "overflowWrap",
      "boxSizing"
    ];

    const sources = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
    const clones = [cloneRoot, ...cloneRoot.querySelectorAll("*")];

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const clone = clones[i];
      if (!source || !clone) continue;

      const cs = getComputedStyle(source);

      for (const prop of props) {
        try {
          clone.style[prop] = cs[prop];
        } catch (_) { }
      }
    }
  }

  function mirrorRenderedSize(source, clone) {
    const rect = source.getBoundingClientRect();

    clone.removeAttribute("width");

    clone.style.width = px(rect.width);
    clone.style.height = px(rect.height);
    clone.style.margin = "0";
    clone.style.display = "table";
  }

  function mirrorCellSizes(sourceTable, cloneTable) {
    const sourceRows = Array.from(sourceTable.rows);
    const cloneRows = Array.from(cloneTable.rows);

    for (let r = 0; r < sourceRows.length; r++) {
      const sourceCells = Array.from(sourceRows[r].cells);
      const cloneCells = Array.from(cloneRows[r]?.cells || []);

      for (let c = 0; c < sourceCells.length; c++) {
        const sourceCell = sourceCells[c];
        const cloneCell = cloneCells[c];
        if (!sourceCell || !cloneCell) continue;

        const rect = sourceCell.getBoundingClientRect();

        cloneCell.style.width = px(rect.width);
        cloneCell.style.height = px(rect.height);
      }
    }
  }

  function protectKegiatanColumn(sourceTable, cloneTable) {
    const sourceRows = Array.from(sourceTable.rows);
    const cloneRows = Array.from(cloneTable.rows);

    for (let r = 0; r < sourceRows.length; r++) {
      const sourceCell = sourceRows[r].cells[4];
      const cloneCell = cloneRows[r]?.cells?.[4];

      if (!sourceCell || !cloneCell) continue;

      if ((sourceCell.colSpan || 1) > 1) continue;

      const rect = sourceCell.getBoundingClientRect();

      cloneCell.style.width = px(rect.width);
      cloneCell.style.minWidth = px(rect.width);
      cloneCell.style.maxWidth = px(rect.width);

      cloneCell.style.whiteSpace = "normal";
      cloneCell.style.wordBreak = "normal";
      cloneCell.style.overflowWrap = "break-word";
    }
  }

  function createCaptureRoot(dropdownTable, logbookTable) {
    const dropdownClone = dropdownTable.cloneNode(true);
    const logbookClone = logbookTable.cloneNode(true);

    copyImportantComputedStyles(dropdownTable, dropdownClone);
    copyImportantComputedStyles(logbookTable, logbookClone);

    mirrorRenderedSize(dropdownTable, dropdownClone);
    mirrorRenderedSize(logbookTable, logbookClone);

    mirrorCellSizes(dropdownTable, dropdownClone);
    mirrorCellSizes(logbookTable, logbookClone);

    protectKegiatanColumn(logbookTable, logbookClone);

    const dropdownRect = dropdownTable.getBoundingClientRect();
    const logbookRect = logbookTable.getBoundingClientRect();

    const width = Math.ceil(Math.max(dropdownRect.width, logbookRect.width));
    const height = Math.ceil(dropdownRect.height + logbookRect.height);

    const root = document.createElement("div");
    root.dataset.logbookCaptureRoot = "true";

    Object.assign(root.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      width: px(width),
      height: px(height),
      margin: "0",
      padding: "0",
      border: "0",
      background: "#ffffff",
      overflow: "hidden",
      pointerEvents: "none"
    });

    root.appendChild(dropdownClone);
    root.appendChild(logbookClone);

    document.body.appendChild(root);

    return root;
  }

  async function waitForImages(root) {
    const images = [...root.querySelectorAll("img")];

    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();

        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  }

  async function screenshotCurrentWeek(week, userSlug) {
    const dropdownTable = qs(
      CONFIG.selectorDropdownTable,
      "Tabel dropdown minggu"
    );

    const logbookTable = qs(
      CONFIG.selectorLogbookTable,
      "Tabel data logbook"
    );

    let root = null;

    try {
      root = createCaptureRoot(dropdownTable, logbookTable);

      await new Promise((resolve) => requestAnimationFrame(resolve));
      await waitForImages(root);

      const rect = root.getBoundingClientRect();

      const canvas = await html2canvas(root, {
        backgroundColor: "#ffffff",
        scale: CONFIG.scale,
        useCORS: true,
        allowTaint: false,
        logging: CONFIG.debug,

        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),

        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(rect.width)),
        windowHeight: Math.max(document.documentElement.clientHeight, Math.ceil(rect.height)),

        onclone: (clonedDocument) => {
          const clonedRoot = clonedDocument.querySelector(
            '[data-logbook-capture-root="true"]'
          );

          if (!clonedRoot) return;

          clonedRoot.style.left = "0";
          clonedRoot.style.top = "0";
          clonedRoot.style.transform = "none";
        }
      });

      downloadCanvas(canvas, `minggu_${week}_${userSlug}.png`);
    } finally {
      if (root?.isConnected) root.remove();
    }
  }

  async function changeWeek(week) {
    const dropdown = qs(CONFIG.selectorDropdown, "Dropdown minggu");
    const value = String(week);

    if (![...dropdown.options].some((option) => option.value === value)) {
      throw new Error(`Option minggu ${week} tidak tersedia.`);
    }

    dropdown.value = value;

    dropdown.dispatchEvent(
      new Event("change", {
        bubbles: true,
        cancelable: true
      })
    );

    await sleep(CONFIG.delayAfterChangeMs);
  }

  async function main() {
    await ensureHtml2Canvas();

    const userSlug = getUserSlug();

    log(`User slug: ${userSlug}`);
    log(`Mulai dari minggu ${CONFIG.startWeek} sampai ${CONFIG.endWeek}`);

    for (let week = CONFIG.startWeek; week <= CONFIG.endWeek; week++) {
      try {
        log(`Minggu ${week}: memuat data...`);
        await changeWeek(week);

        log(`Minggu ${week}: mengambil screenshot...`);
        await screenshotCurrentWeek(week, userSlug);

        log(`Berhasil screenshot minggu ${week}`);
      } catch (err) {
        error(`Gagal screenshot minggu ${week}:`, err);
      }

      await sleep(500);
    }

    log("Selesai.");
  }

  await main();
})();
