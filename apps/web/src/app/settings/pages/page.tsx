"use client";

import { useState } from "react";

// Fallback URL ကို ဒုက္ခပေးနေတဲ့ localhost အစား Render Live URL သို့ ကွက်တိ ပြောင်းလဲထားပါသည်
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://omniblitz-api.onrender.com";

// TODO: Replace with real auth context
const DEMO_TENANT_ID = "tenant_demo";
const DEMO_USER_ID = "user_demo";

export default function ConnectPagesPage() {
  const [loading, setLoading] = useState(false);

  async function connectFacebook() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/auth/facebook/login-url?tenantId=${DEMO_TENANT_ID}&userId=${DEMO_USER_ID}`
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
      <h1>Connect Facebook Pages</h1>
      <p>
        Link your Facebook Pages to receive Messenger messages in your
        Omniblitz inbox. You can connect multiple pages.
      </p>
      <button
        onClick={connectFacebook}
        disabled={loading}
        style={{
          marginTop: "1.5rem",
          padding: "0.75rem 1.5rem",
          background: "#1877f2",
          color: "white",
          border: "none",
          borderRadius: 6,
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        {loading ? "Redirecting..." : "Connect with Facebook"}
      </button>
    </main>
  );
}