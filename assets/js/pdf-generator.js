function print() {
  const printWindow = window.open("/print", "_blank");
  printWindow.onload = function () {
    printWindow.print();
    // Close the print window after a delay
    setTimeout(() => printWindow.close(), 500);
  };
}

// Browsers cap canvas size (Chrome: 32767px per side, Safari/iOS: ~16.7M px
// area). html2pdf renders the whole document into ONE canvas, so a long CV at
// a fixed scale silently gets truncated. Pick the largest safe scale instead.
const MAX_CANVAS_SIDE = 32000;
// Safari and every iOS browser (all WebKit) have the low area limit.
const IS_WEBKIT =
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg|Android/.test(navigator.userAgent);
const MAX_CANVAS_AREA = IS_WEBKIT ? 16000000 : 200000000;

function safeScale(width, height, preferred) {
  // Small safety margin: the measured height is only an estimate.
  const h = height * 1.1;
  return Math.max(
    0.75,
    Math.min(
      preferred,
      MAX_CANVAS_SIDE / h,
      Math.sqrt(MAX_CANVAS_AREA / (width * h))
    )
  );
}

// Elements that must not be split across two PDF pages, in document order.
// Larger blocks come first; if one is taller than a page, its smaller
// children (paragraphs, list entries) are kept together instead.
const KEEP_TOGETHER = [
  ".section-title",
  ".container-block-title",
  ".item",
  ".container-block",
  ".intro p",
  ".summary p",
  "p",
  "li",
  "h3",
  "h4",
].join(",");

function waitForAssets(root) {
  const images = Array.from(root.querySelectorAll("img"))
    .filter((img) => !img.complete)
    .map((img) => new Promise((resolve) => {
      img.onload = img.onerror = resolve;
    }));
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  return Promise.all([fonts, ...images]);
}

// Insert spacers so that no KEEP_TOGETHER element crosses a page boundary.
// `pageHeight` must be the exact CSS-pixel height of one PDF page slice.
function insertPageBreaks(container, pageHeight) {
  const origin = () => container.getBoundingClientRect().top;
  const kept = [];
  const minGap = 6; // breathing room at the top of a new page

  container.querySelectorAll(KEEP_TOGETHER).forEach((el) => {
    if (kept.some((k) => k.contains(el))) return;
    if (!el.offsetParent && el.getClientRects().length === 0) return;

    let rect = el.getBoundingClientRect();
    const height = rect.height;
    if (height === 0 || height > pageHeight * 0.8) return; // let children handle it

    // Headings should stay with the first lines of what follows them.
    const isHeading = el.matches(".section-title, .container-block-title, h3, h4");
    const keepWith = isHeading ? 60 : 0;

    let top = rect.top - origin();
    const page = Math.floor(top / pageHeight);
    const bottom = top + height + keepWith;
    if (bottom > (page + 1) * pageHeight - 1) {
      const target = (page + 1) * pageHeight + minGap;
      const spacer = document.createElement("div");
      spacer.className = "html2pdf__spacer";
      spacer.style.cssText = "display:block;width:100%;margin:0;padding:0;border:0;";
      spacer.style.height = `${target - top}px`;
      el.parentNode.insertBefore(spacer, el);
      // Margin collapsing may change the effective shift; correct it.
      top = el.getBoundingClientRect().top - origin();
      const fix = target - top;
      if (Math.abs(fix) > 0.5) {
        spacer.style.height = `${Math.max(0, parseFloat(spacer.style.height) + fix)}px`;
      }
    }
    kept.push(el);
  });
}

function generatePDF() {
  const button = document.getElementById("pdfButton");
  if (button) button.disabled = true;

  // Get the print layout URL
  const printURL = new URL("print", window.location.href).href;

  // html2canvas offsets the capture by the current scroll position, which
  // produced blank leading pages and a cut-off end. Render from the top.
  const prevScroll = { x: window.scrollX, y: window.scrollY };

  // Fetch the print layout content
  fetch(printURL)
    .then((response) => response.text())
    .then((html) => {
      // Create a temporary container
      const container = document.createElement("div");
      container.innerHTML = html;

      // Get name from the DOM (as defined in data.yml)
      const name = document.querySelector(".name").textContent.trim();
      // Format filename: replace spaces with underscores and append _resume.pdf
      const filename = `${name.replace(/\s+/g, "_")}_Resume.pdf`;

      // Measure the rendered height at the PDF content width (A4 - margins)
      // (same value html2pdf uses: floor(190mm in px) = 718)
      const contentWidthPx = Math.floor(((210 - 2 * 10) / 25.4) * 96);
      const probe = document.createElement("div");
      probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${contentWidthPx}px;`;
      probe.appendChild(container);
      document.body.appendChild(probe);
      const height = container.scrollHeight;
      document.body.removeChild(probe);

      // Snap the scale so that width * scale is a whole number of pixels.
      const scale =
        Math.floor(safeScale(contentWidthPx, height, 2) * contentWidthPx) /
        contentWidthPx;

      // Configure pdf options
      const opt = {
        margin: 10,
        filename: filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: scale,
          useCORS: true,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        },
      };

      window.scrollTo(0, 0);

      // Generate PDF
      return html2pdf()
        .set(opt)
        .from(container)
        .toContainer()
        .then(function () {
          // Give the container an integer pixel width at an integer offset,
          // so html2canvas produces exactly width * scale pixels and our
          // page-height computation matches how html2pdf slices the canvas.
          const box = this.prop.container;
          const width = this.prop.pageSize.inner.px.width;
          box.style.width = `${width}px`;
          box.style.margin = "0";
          const canvasWidth = Math.round(width * scale);
          const pageHeight =
            Math.floor(canvasWidth * this.prop.pageSize.inner.ratio) / scale;
          return waitForAssets(box).then(() =>
            insertPageBreaks(box, pageHeight)
          );
        })
        .save();
    })
    .catch((err) => console.error("Error generating PDF:", err))
    .finally(() => {
      window.scrollTo(prevScroll.x, prevScroll.y);
      if (button) button.disabled = false;
    });
}
