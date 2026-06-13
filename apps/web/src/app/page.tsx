import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Omniblitz</h1>
      <p>Multi-tenant Facebook Messenger SaaS dashboard.</p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <Link href="/inbox">Inbox</Link>
        <Link href="/settings/pages">Connect Pages</Link>
      </nav>
    </main>
  );
}
