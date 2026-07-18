/**
 * @param {string} id
 * @param {{ key: string, label: string, align?: string }[]} columns
 * @param {Record<string, unknown>[]} rows
 * @param {(row: Record<string, unknown>) => Record<string, string>} [cellFn]
 */
export function renderTable(id, columns, rows, cellFn) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.id = id;

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.align === "right") th.className = "text-right";
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.textContent = "No data";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const row of rows) {
      const cells = cellFn ? cellFn(row) : row;
      const tr = document.createElement("tr");
      for (const col of columns) {
        const td = document.createElement("td");
        td.textContent = String(cells[col.key] ?? "");
        if (col.align === "right") td.className = "text-right";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function pageHeader(title, subtitle, actionEl) {
  const header = document.createElement("div");
  header.className = "page-header";
  const left = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = title;
  left.appendChild(h2);
  if (subtitle) {
    const p = document.createElement("p");
    p.textContent = subtitle;
    left.appendChild(p);
  }
  header.appendChild(left);
  if (actionEl) header.appendChild(actionEl);
  return header;
}
