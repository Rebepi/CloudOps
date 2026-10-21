import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './securityReport.css';

// Measure the same fixed-width document used for printing. Table rows remain
// together and each continuation receives its own table heading.
export function PaginatedSecurityReport({ children }: { children: ReactNode }) {
  const source = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);

  useLayoutEffect(() => {
    let cancelled = false;
    const paginate = () => {
      if (cancelled || !source.current || !output.current) return;
      const document = source.current.firstElementChild;
      if (!document) return;
      const target = output.current;
      target.replaceChildren();
      let content: HTMLElement;
      const pages: HTMLElement[] = [];
      const newPage = () => {
        const page = window.document.createElement('article');
        page.className = 'security-report-page';
        content = window.document.createElement('div');
        content.className = 'security-report-page-content';
        page.append(content);
        target.append(page);
        pages.push(page);
      };
      const overflows = () => content.scrollHeight > content.clientHeight + 1;
      newPage();
      for (const block of Array.from(document.children)) {
        const table = block.querySelector('table');
        if (!table) {
          const clone = block.cloneNode(true) as HTMLElement;
          content!.append(clone);
          if (overflows() && content!.children.length > 1) {
            clone.remove();
            newPage();
            content!.append(clone);
          }
          continue;
        }
        let shell: HTMLElement;
        let body: HTMLTableSectionElement;
        const newTable = () => {
          shell = block.cloneNode(true) as HTMLElement;
          body = shell.querySelector('tbody')!;
          body.replaceChildren();
          content!.append(shell);
        };
        newTable();
        for (const row of Array.from(table.querySelectorAll('tbody > tr'))) {
          const clone = row.cloneNode(true) as HTMLElement;
          body!.append(clone);
          if (overflows()) {
            clone.remove();
            if (!body!.children.length) shell!.remove();
            newPage();
            newTable();
            body!.append(clone);
          }
        }
      }
      pages.forEach((page, index) => {
        const footer = window.document.createElement('div');
        footer.className = 'security-report-page-number';
        footer.textContent = `CloudOps · Informe confidencial — Página ${index + 1} de ${pages.length}`;
        page.append(footer);
      });
      setPageCount(pages.length);
    };
    paginate();
    void window.document.fonts.ready.then(paginate);
    return () => { cancelled = true; };
  }, [children]);

  return <>
    <p className="security-report-preview-caption">Vista previa A4 · {pageCount} páginas · márgenes de 16 mm</p>
    <div ref={source} className="security-report-measure" aria-hidden="true">{children}</div>
    <div id="security-report-pages" ref={output} className="security-report-pages" aria-label="Informe paginado en A4" />
  </>;
}
