import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card card-pad" style={{ margin: "2rem", textAlign: "center" }}>
      <h2>404 - Page Not Found</h2>
      <p style={{ color: "#64748b", margin: "1rem 0" }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/dashboard" className="btn btn-primary btn-sm">
        Return to Dashboard
      </Link>
    </div>
  );
}
