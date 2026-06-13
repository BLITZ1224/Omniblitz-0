"use client";

import { useEffect, useState } from "react";

// Fallback URL ကို ဒုက္ခပေးနေတဲ့ localhost အစား Render Live URL သို့ ကွက်တိ ပြောင်းလဲထားပါသည်
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://omniblitz-api.onrender.com";

// TODO: Replace with real auth context
const DEMO_TENANT_ID = "tenant_demo";

interface Conversation {
  id: string;
  unreadCount: number;
  lastMessageAt: string | null;
  messengerUser: {
    firstName: string | null;
    lastName: string | null;
    profilePicUrl: string | null;
  };
  facebookPage: { pageName: string };
  messages: Array<{ text: string | null; contentType: string }>;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/conversations?tenantId=${DEMO_TENANT_ID}`)
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations ?? []))
      .catch(console.error);
  }, []);

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `${API_URL}/api/conversations/${selected.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply, tenantId: DEMO_TENANT_ID }),
        }
      );
      if (res.ok) {
        setReply("");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 320, borderRight: "1px solid #ddd", overflow: "auto" }}>
        <h2 style={{ padding: "1rem" }}>Inbox</h2>
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "0.75rem 1rem",
              border: "none",
              borderBottom: "1px solid #eee",
              background: selected?.id === c.id ? "#f0f4ff" : "white",
              cursor: "pointer",
            }}
          >
            <strong>
              {c.messengerUser.firstName ?? "Unknown"}{" "}
              {c.messengerUser.lastName ?? ""}
            </strong>
            <div style={{ fontSize: 12, color: "#666" }}>
              via {c.facebookPage.pageName}
            </div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
              {c.messages[0]?.text ?? `[${c.messages[0]?.contentType}]`}
            </div>
            {c.unreadCount > 0 && (
              <span
                style={{
                  background: "#3b82f6",
                  color: "white",
                  borderRadius: 10,
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                {c.unreadCount}
              </span>
            )}
          </button>
        ))}
      </aside>

      <section style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {selected ? (
          <>
            <header style={{ padding: "1rem", borderBottom: "1px solid #ddd" }}>
              <h3>
                {selected.messengerUser.firstName}{" "}
                {selected.messengerUser.lastName}
              </h3>
            </header>
            <div style={{ flex: 1, padding: "1rem" }}>
              <p style={{ color: "#888" }}>
                Message thread loads here. Connect to real-time updates next.
              </p>
            </div>
            <footer
              style={{
                padding: "1rem",
                borderTop: "1px solid #ddd",
                display: "flex",
                gap: "0.5rem",
              }}
            >
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type a reply..."
                style={{ flex: 1, padding: "0.5rem" }}
                onKeyDown={(e) => e.key === "Enter" && sendReply()}
              />
              <button onClick={sendReply} disabled={sending}>
                {sending ? "Sending..." : "Send"}
              </button>
            </footer>
          </>
        ) : (
          <p style={{ padding: "2rem", color: "#888" }}>
            Select a conversation
          </p>
        )}
      </section>
    </div>
  );
}