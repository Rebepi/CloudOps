export function printElement(elementId: string) {
  const docElement = document.getElementById(elementId);
  if (!docElement) {
    window.print();
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('\n');

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Seguridad - CloudOps</title>
${styleTags}
<style>
@page {
  size: A4 portrait;
  margin: 10mm 12mm 10mm 12mm !important;
}
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  box-sizing: border-box;
}
html, body {
  background: #ffffff !important;
  color: #0f172a !important;
  margin: 0 !important;
  padding: 0 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
#${elementId} {
  width: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 auto !important;
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
  background: #ffffff !important;
}
section {
  break-inside: auto !important;
  page-break-inside: auto !important;
}
.print-avoid-break {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
thead {
  display: table-header-group !important;
}
tbody {
  break-inside: auto !important;
  page-break-inside: auto !important;
}
tr {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
table {
  width: 100% !important;
  border-collapse: collapse !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}
</style>
</head>
<body style="background:#ffffff; margin:0; padding:0;">
  <div style="width:100%; margin:0 auto;">
    ${docElement.outerHTML}
  </div>
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* noop */ } }, 3000);
  }, 350);
}

