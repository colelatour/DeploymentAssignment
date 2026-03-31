import ScoringPanel from "./ScoringPanel";

export default function ScoringPage() {
  return (
    <div>
      <h1>Run Scoring</h1>
      <p className="text-muted mb-1">
        Run the late-delivery prediction model against all orders in shop.db.
        Results are written to the <code>order_predictions</code> table and
        used by the <strong>Warehouse Priority Queue</strong>.
      </p>
      <ScoringPanel />
    </div>
  );
}
