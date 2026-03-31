import { queryAll } from "@/lib/db";

interface TableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export default function SchemaPage() {
  const tables = queryAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  const schema = tables.map((t) => ({
    table: t.name,
    columns: queryAll<TableInfo>(`PRAGMA table_info("${t.name}")`),
  }));

  return (
    <div>
      <h1>Database Schema</h1>
      <p className="text-muted mb-1">
        {tables.length} tables in shop.db
      </p>

      {schema.map((s) => (
        <div className="card" key={s.table}>
          <h2>{s.table}</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Column</th>
                <th>Type</th>
                <th>Not Null</th>
                <th>Default</th>
                <th>PK</th>
              </tr>
            </thead>
            <tbody>
              {s.columns.map((col) => (
                <tr key={col.cid}>
                  <td>{col.cid}</td>
                  <td><strong>{col.name}</strong></td>
                  <td>{col.type || "—"}</td>
                  <td>{col.notnull ? "Yes" : "No"}</td>
                  <td>{col.dflt_value ?? "—"}</td>
                  <td>{col.pk ? "Yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
