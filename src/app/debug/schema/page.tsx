import { supabase } from "@/lib/db";

interface ColumnInfo {
  ordinal_position: number;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

const APP_TABLES = [
  "customers",
  "products",
  "orders",
  "order_items",
  "shipments",
  "product_reviews",
  "order_predictions",
];

export default async function SchemaPage() {
  const schema: { table: string; columns: ColumnInfo[] }[] = [];

  for (const table of APP_TABLES) {
    const { data } = await supabase
      .from("information_schema.columns" as string)
      .select(
        "ordinal_position, column_name, data_type, is_nullable, column_default"
      )
      .eq("table_schema", "public")
      .eq("table_name", table)
      .order("ordinal_position")
      .returns<ColumnInfo[]>();

    schema.push({ table, columns: data ?? [] });
  }

  return (
    <div>
      <h1>Database Schema</h1>
      <p className="text-muted mb-1">
        {APP_TABLES.length} tables in Supabase
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
                <th>Nullable</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {s.columns.map((col) => (
                <tr key={col.ordinal_position}>
                  <td>{col.ordinal_position}</td>
                  <td>
                    <strong>{col.column_name}</strong>
                  </td>
                  <td>{col.data_type}</td>
                  <td>{col.is_nullable === "YES" ? "Yes" : "No"}</td>
                  <td>{col.column_default ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
