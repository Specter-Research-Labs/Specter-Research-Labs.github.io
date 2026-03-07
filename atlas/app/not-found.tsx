import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="empty-state">
      <span className="detail-kicker">Atlas</span>
      <h1>Specimen not found</h1>
      <p>The scaffold only ships a small mock catalog right now. The route exists so the future publish pipeline can slot in.</p>
      <Link href="/" className="atlas-pill atlas-pill-strong">
        Return to collection
      </Link>
    </div>
  );
}
