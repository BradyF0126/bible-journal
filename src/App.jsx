import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const STORAGE_KEY = "bible_journal_entries_v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadLocalEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clearLocalEntries() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function contains(hay, needle) {
  return (hay || "").toLowerCase().includes((needle || "").toLowerCase());
}

function sortKey(entry) {
  if (entry?.entryDate) {
    const t = Date.parse(entry.entryDate);
    if (!Number.isNaN(t)) return t;
  }
  return entry?.createdAt ?? 0;
}

function fromRow(row) {
  return {
    id: row.id,
    createdAt: Date.parse(row.created_at),
    entryDate: row.entry_date || "",
    verseRef: row.verse_ref || "",
    verseText: row.verse_text || "",
    notes: row.notes || "",
  };
}

function toInsert(entry, userId) {
  return {
    id: entry.id || uid(),
    user_id: userId,
    entry_date: entry.entryDate || null,
    verse_ref: entry.verseRef || "",
    verse_text: entry.verseText || "",
    notes: entry.notes || "",
    created_at: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [entries, setEntries] = useState([]);
  const [screen, setScreen] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [authMode, setAuthMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const [entryDate, setEntryDate] = useState(todayYMD());
  const [verseRef, setVerseRef] = useState("");
  const [verseText, setVerseText] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");

  const localEntries = useMemo(() => loadLocalEntries(), []);
  const hasLocalEntries = localEntries.length > 0;
  const isConfigured = Boolean(supabase);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) {
      setLoadingEntries(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) {
        setLoadingEntries(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setEntries([]);
        setActiveId(null);
        setScreen("home");
        setLoadingEntries(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;

    let cancelled = false;

    async function fetchEntries() {
      setLoadingEntries(true);
      setSyncMessage("");

      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .order("entry_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setEntries([]);
        setSyncMessage(error.message);
      } else {
        setEntries((data || []).map(fromRow));
      }

      setLoadingEntries(false);
    }

    fetchEntries();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const kb = sortKey(b);
      const ka = sortKey(a);
      if (kb !== ka) return kb - ka;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [entries]);

  const activeEntry = useMemo(() => {
    return sortedEntries.find((e) => e.id === activeId) || null;
  }, [sortedEntries, activeId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sortedEntries;
    return sortedEntries.filter((e) => {
      return (
        contains(e.entryDate, query) ||
        contains(e.verseRef, query) ||
        contains(e.verseText, query) ||
        contains(e.notes, query)
      );
    });
  }, [sortedEntries, query]);

  function goHome() {
    setScreen("home");
    setActiveId(null);
  }

  function resetNewForm() {
    setEntryDate(todayYMD());
    setVerseRef("");
    setVerseText("");
    setNotes("");
  }

  function startNew() {
    resetNewForm();
    setScreen("new");
  }

  function openEntry(id) {
    setActiveId(id);
    setScreen("view");
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    if (!supabase) return;

    setAuthLoading(true);
    setAuthMessage("");

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setAuthLoading(false);
      setAuthMessage("Enter both email and password.");
      return;
    }

    let result;

    if (authMode === "sign-up") {
      result = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
      });
    } else {
      result = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
    }

    setAuthLoading(false);

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }

    setPassword("");

    if (authMode === "sign-up" && !result.data.session) {
      setAuthMessage("Account created. Check your email to confirm your account.");
      return;
    }

    setAuthMessage("");
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function createEntry() {
    if (!supabase || !user) return;

    if (!verseRef.trim() && !verseText.trim() && !notes.trim()) {
      alert("Add at least something (verse reference, verse text, or notes).");
      return;
    }

    const payload = toInsert(
      {
        id: uid(),
        createdAt: Date.now(),
        entryDate,
        verseRef: verseRef.trim(),
        verseText: verseText.trim(),
        notes: notes.trim(),
      },
      user.id
    );

    const { data, error } = await supabase
      .from("entries")
      .insert(payload)
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    const next = fromRow(data);
    setEntries((prev) => [next, ...prev]);
    setActiveId(next.id);
    setScreen("view");
    resetNewForm();
  }

  async function deleteEntry(id) {
    if (!supabase) return;

    const ok = confirm("Delete this entry? This cannot be undone.");
    if (!ok) return;

    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setEntries((prev) => prev.filter((e) => e.id !== id));
    goHome();
  }

  async function updateEntry(id, patch) {
    if (!supabase) return;

    const dbPatch = {};

    if (Object.prototype.hasOwnProperty.call(patch, "entryDate")) {
      dbPatch.entry_date = patch.entryDate || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "verseRef")) {
      dbPatch.verse_ref = patch.verseRef;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "verseText")) {
      dbPatch.verse_text = patch.verseText;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
      dbPatch.notes = patch.notes;
    }

    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );

    const { error } = await supabase.from("entries").update(dbPatch).eq("id", id);

    if (error) {
      setSyncMessage(`Sync error: ${error.message}`);
    } else {
      setSyncMessage("");
    }
  }

  async function importLocalData() {
    if (!supabase || !user || !hasLocalEntries) return;

    const payload = localEntries.map((entry) => {
      const imported = {
        id: entry.id || uid(),
        createdAt: entry.createdAt || Date.now(),
        entryDate: entry.entryDate || "",
        verseRef: entry.verseRef || "",
        verseText: entry.verseText || "",
        notes: entry.notes || "",
      };
      return toInsert(imported, user.id);
    });

    const { data, error } = await supabase.from("entries").insert(payload).select("*");

    if (error) {
      alert(error.message);
      return;
    }

    clearLocalEntries();
    setEntries((data || []).map(fromRow).concat(entries));
    setSyncMessage("Imported your entries from this device.");
  }

  if (!isConfigured) {
    return (
      <SetupScreen />
    );
  }

  if (!session) {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        authMessage={authMessage}
        authLoading={authLoading}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.app}>
        <Header
          title={
            screen === "home"
              ? "By the Blood"
              : screen === "new"
              ? "New Entry"
              : screen === "search"
              ? "Search"
              : screen === "all"
              ? "All Entries"
              : "Entry"
          }
          subtitle={user.email}
          onHome={goHome}
          onSignOut={handleSignOut}
        />

        <div style={styles.content}>
          {syncMessage ? <div style={styles.notice}>{syncMessage}</div> : null}

          {hasLocalEntries ? (
            <div style={styles.banner}>
              <div>
                <div style={styles.bannerTitle}>Entries found on this device</div>
                <div style={styles.small}>
                  Import your old local entries into your account so they show up on every device.
                </div>
              </div>
              <button style={styles.secondary} onClick={importLocalData}>
                Import {localEntries.length} entr{localEntries.length === 1 ? "y" : "ies"}
              </button>
            </div>
          ) : null}

          {loadingEntries ? (
            <div style={styles.card}>
              <div style={styles.h2}>Loading entries...</div>
              <div style={styles.p}>Pulling your journal from Supabase.</div>
            </div>
          ) : (
            <>
              {screen === "home" && (
                <Home
                  onNew={startNew}
                  onSearch={() => setScreen("search")}
                  onAll={() => setScreen("all")}
                  count={entries.length}
                  latest={sortedEntries[0]}
                />
              )}

              {screen === "new" && (
                <NewEntry
                  entryDate={entryDate}
                  setEntryDate={setEntryDate}
                  verseRef={verseRef}
                  verseText={verseText}
                  notes={notes}
                  setVerseRef={setVerseRef}
                  setVerseText={setVerseText}
                  setNotes={setNotes}
                  onSave={createEntry}
                />
              )}

              {screen === "search" && (
                <Search
                  query={query}
                  setQuery={setQuery}
                  results={filtered}
                  onOpen={openEntry}
                />
              )}

              {screen === "all" && (
                <AllEntries entries={sortedEntries} onOpen={openEntry} />
              )}

              {screen === "view" && activeEntry && (
                <EntryView
                  entry={activeEntry}
                  onDelete={() => deleteEntry(activeEntry.id)}
                  onUpdate={(patch) => updateEntry(activeEntry.id, patch)}
                />
              )}

              {screen === "view" && !activeEntry && (
                <div style={styles.card}>
                  <div style={styles.h2}>Entry not found</div>
                  <div style={styles.p}>It may have been deleted.</div>
                </div>
              )}
            </>
          )}
        </div>

        <BottomTabs
          active={screen}
          onTab={(t) => {
            if (t === "new") startNew();
            else setScreen(t);
          }}
        />
      </div>
    </div>
  );
}

function SetupScreen() {
  return (
    <div style={styles.page}>
      <div style={styles.setupCard}>
        <div style={styles.h1}>Supabase setup needed</div>
        <div style={styles.p}>
          Add your project values to a local <code>.env</code> file before running the app.
        </div>
        <div style={styles.codeBlock}>
          VITE_SUPABASE_URL=your-project-url{"\n"}
          VITE_SUPABASE_ANON_KEY=your-anon-public-key
        </div>
        <div style={styles.small}>
          I already wired the app. Once those two values are in place and the SQL is run, accounts and cross-device sync will work.
        </div>
      </div>
    </div>
  );
}

function AuthScreen({
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  authMessage,
  authLoading,
  onSubmit,
}) {
  return (
    <div style={styles.page}>
      <div style={styles.authShell}>
        <div style={styles.authBrand}>By the Blood</div>
        <div style={styles.authCard}>
          <div style={styles.h1}>
            {authMode === "sign-up" ? "Create your account" : "Sign in"}
          </div>
          <div style={styles.p}>
            Save your journal across phones, tablets, and computers.
          </div>

          <form onSubmit={onSubmit}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />

            <button style={styles.primary} type="submit" disabled={authLoading}>
              {authLoading
                ? "Working..."
                : authMode === "sign-up"
                ? "Create Account"
                : "Sign In"}
            </button>
          </form>

          {authMessage ? <div style={styles.notice}>{authMessage}</div> : null}

          <button
            style={styles.linkBtn}
            onClick={() =>
              setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up")
            }
          >
            {authMode === "sign-up"
              ? "Already have an account? Sign in"
              : "Need an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ title, subtitle, onHome, onSignOut }) {
  return (
    <div style={styles.header}>
      <button style={styles.homeBtn} onClick={onHome} title="Home">
        H
      </button>
      <div style={styles.headerStack}>
        <div style={styles.headerTitle}>{title}</div>
        <div style={styles.headerSubtitle}>{subtitle}</div>
      </div>
      <button style={styles.headerAction} onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}

function Home({ onNew, onSearch, onAll, count, latest }) {
  return (
    <div style={styles.homeWrap}>
      <div style={styles.crossBox}>
        <div style={styles.vLine} />
        <div style={styles.hLine} />
        <div style={styles.crossCenter}>+</div>

        <div style={{ ...styles.quad, ...styles.q1 }}>
          <BigButton label="New Entry" sub="Write a new verse + notes" onClick={onNew} />
        </div>

        <div style={{ ...styles.quad, ...styles.q2 }}>
          <BigButton label="Search" sub="Find by verse, notes, or date" onClick={onSearch} />
        </div>

        <div style={{ ...styles.quad, ...styles.q3 }}>
          <BigButton label="All Entries" sub={`Browse all (${count})`} onClick={onAll} />
        </div>

        <div style={{ ...styles.quad, ...styles.q4 }}>
          <div style={styles.card}>
            <div style={styles.h2}>Latest</div>
            {latest ? (
              <>
                <div style={styles.p}>
                  <b>{latest.verseRef || "Untitled Verse"}</b>
                </div>
                <div style={styles.small}>
                  {latest.entryDate ? `Entry date: ${latest.entryDate} | ` : ""}
                  Saved: {formatDateTime(latest.createdAt)}
                </div>
                <div style={styles.pClamp}>{latest.notes || latest.verseText || "-"}</div>
              </>
            ) : (
              <div style={styles.p}>No entries yet. Start with New Entry.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigButton({ label, sub, onClick }) {
  return (
    <button style={styles.bigBtn} onClick={onClick}>
      <div style={styles.bigBtnLabel}>{label}</div>
      <div style={styles.bigBtnSub}>{sub}</div>
    </button>
  );
}

function NewEntry({
  entryDate,
  setEntryDate,
  verseRef,
  verseText,
  notes,
  setVerseRef,
  setVerseText,
  setNotes,
  onSave,
}) {
  return (
    <div style={styles.card}>
      <div style={styles.h2}>Create an entry</div>

      <label style={styles.label}>Date</label>
      <input
        type="date"
        style={styles.input}
        value={entryDate}
        onChange={(e) => setEntryDate(e.target.value)}
      />

      <label style={styles.label}>Verse reference (ex: John 3:16)</label>
      <input
        style={styles.input}
        value={verseRef}
        onChange={(e) => setVerseRef(e.target.value)}
        placeholder="Book Chapter:Verse"
      />

      <label style={styles.label}>Verse text (optional)</label>
      <textarea
        style={styles.textarea}
        value={verseText}
        onChange={(e) => setVerseText(e.target.value)}
        placeholder="Paste or type the verse..."
      />

      <label style={styles.label}>Your notes</label>
      <textarea
        style={{ ...styles.textarea, minHeight: 140 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What stood out? What does it mean to you? How will you apply it?"
      />

      <button style={styles.primary} onClick={onSave}>
        Save Entry
      </button>

      <div style={styles.smallHint}>Saved to your account and synced across devices.</div>
    </div>
  );
}

function Search({ query, setQuery, results, onOpen }) {
  return (
    <div style={styles.card}>
      <div style={styles.h2}>Search entries</div>
      <input
        style={styles.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search date (YYYY-MM-DD), verse reference, verse text, or notes..."
      />
      <div style={styles.small}>{results.length} result(s)</div>

      <div style={styles.list}>
        {results.map((e) => (
          <EntryRow key={e.id} entry={e} onOpen={() => onOpen(e.id)} />
        ))}
      </div>
    </div>
  );
}

function AllEntries({ entries, onOpen }) {
  return (
    <div style={styles.card}>
      <div style={styles.h2}>All entries</div>
      <div style={styles.list}>
        {entries.length === 0 ? (
          <div style={styles.p}>No entries yet.</div>
        ) : (
          entries.map((e) => (
            <EntryRow key={e.id} entry={e} onOpen={() => onOpen(e.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function EntryRow({ entry, onOpen }) {
  return (
    <button style={styles.rowBtn} onClick={onOpen}>
      <div style={styles.rowTop}>
        <div style={styles.rowTitle}>{entry.verseRef || "Untitled Verse"}</div>
        <div style={styles.rowDate}>
          {entry.entryDate || "-"} | {formatDateTime(entry.createdAt)}
        </div>
      </div>
      <div style={styles.rowPreview}>{entry.notes || entry.verseText || "-"}</div>
    </button>
  );
}

function EntryView({ entry, onDelete, onUpdate }) {
  return (
    <div style={styles.card}>
      <div style={styles.h2}>View / Edit</div>

      <label style={styles.label}>Date</label>
      <input
        type="date"
        style={styles.input}
        value={entry.entryDate || ""}
        onChange={(e) => onUpdate({ entryDate: e.target.value })}
      />

      <label style={styles.label}>Verse reference</label>
      <input
        style={styles.input}
        value={entry.verseRef}
        onChange={(e) => onUpdate({ verseRef: e.target.value })}
      />

      <label style={styles.label}>Verse text</label>
      <textarea
        style={styles.textarea}
        value={entry.verseText}
        onChange={(e) => onUpdate({ verseText: e.target.value })}
      />

      <label style={styles.label}>Your notes</label>
      <textarea
        style={{ ...styles.textarea, minHeight: 140 }}
        value={entry.notes}
        onChange={(e) => onUpdate({ notes: e.target.value })}
      />

      <div style={styles.rowActions}>
        <button style={styles.danger} onClick={onDelete}>
          Delete
        </button>
        <div style={styles.smallHint}>Auto-saves as you type.</div>
      </div>
    </div>
  );
}

function BottomTabs({ active, onTab }) {
  const tabs = [
    { key: "home", label: "Home" },
    { key: "new", label: "New" },
    { key: "search", label: "Search" },
    { key: "all", label: "Entries" },
  ];
  return (
    <div style={styles.tabs}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onTab(t.key)}
          style={{
            ...styles.tabBtn,
            ...(active === t.key ? styles.tabActive : {}),
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#0b0f19",
    padding: 16,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  },
  app: {
    width: "min(980px, 96vw)",
    background: "#111827",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  authShell: {
    width: "min(480px, 96vw)",
    display: "grid",
    gap: 18,
  },
  authBrand: {
    color: "#fff",
    fontSize: 28,
    fontWeight: 900,
    textAlign: "center",
  },
  authCard: {
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 24,
    color: "#e5e7eb",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  setupCard: {
    width: "min(640px, 96vw)",
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 24,
    color: "#e5e7eb",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.15)",
  },
  headerStack: { flex: 1, minWidth: 0 },
  headerTitle: { color: "#fff", fontWeight: 700, fontSize: 16 },
  headerSubtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerAction: {
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    padding: "9px 12px",
  },
  homeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  content: { padding: 16, display: "grid", gap: 12 },
  card: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 16,
    color: "#e5e7eb",
  },
  banner: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#e5e7eb",
  },
  bannerTitle: { fontSize: 15, fontWeight: 800, color: "#fff" },
  h1: { fontSize: 28, fontWeight: 900, marginBottom: 10, color: "#fff" },
  h2: { fontSize: 18, fontWeight: 800, marginBottom: 10, color: "#fff" },
  p: { marginTop: 6, opacity: 0.95 },
  small: { fontSize: 12, opacity: 0.8, marginTop: 8 },
  smallHint: { fontSize: 12, opacity: 0.75, marginTop: 10 },
  notice: {
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
  },
  label: { display: "block", fontSize: 12, opacity: 0.9, marginTop: 12 },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    outline: "none",
  },
  textarea: {
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    outline: "none",
    minHeight: 90,
    resize: "vertical",
  },
  primary: {
    marginTop: 14,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  secondary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  linkBtn: {
    marginTop: 12,
    border: "none",
    background: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
    padding: 0,
  },
  danger: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.12)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  codeBlock: {
    whiteSpace: "pre-wrap",
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff",
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
  },
  rowActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  list: { marginTop: 12, display: "grid", gap: 10 },
  rowBtn: {
    textAlign: "left",
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.20)",
    color: "#fff",
    cursor: "pointer",
  },
  rowTop: { display: "flex", justifyContent: "space-between", gap: 12 },
  rowTitle: { fontWeight: 800 },
  rowDate: { fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" },
  rowPreview: {
    marginTop: 6,
    opacity: 0.85,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  homeWrap: { display: "grid", gap: 12 },
  crossBox: {
    position: "relative",
    height: 520,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    overflow: "hidden",
  },
  vLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 2,
    background: "rgba(255,255,255,0.10)",
    transform: "translateX(-1px)",
  },
  hLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 2,
    background: "rgba(255,255,255,0.10)",
    transform: "translateY(-1px)",
  },
  crossCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 26,
    opacity: 0.9,
    color: "#fff",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
  },
  quad: {
    position: "absolute",
    padding: 14,
    display: "grid",
    placeItems: "stretch",
  },
  q1: { left: 0, top: 0, right: "50%", bottom: "50%" },
  q2: { left: "50%", top: 0, right: 0, bottom: "50%" },
  q3: { left: 0, top: "50%", right: "50%", bottom: 0 },
  q4: { left: "50%", top: "50%", right: 0, bottom: 0 },
  bigBtn: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.07)",
    color: "#fff",
    cursor: "pointer",
    padding: 18,
    textAlign: "left",
  },
  bigBtnLabel: { fontSize: 20, fontWeight: 900, marginBottom: 6 },
  bigBtnSub: { opacity: 0.85, fontSize: 13 },
  pClamp: {
    marginTop: 8,
    opacity: 0.85,
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.18)",
  },
  tabBtn: {
    padding: "12px 10px",
    border: "none",
    background: "transparent",
    color: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    fontWeight: 800,
  },
  tabActive: { color: "#fff", background: "rgba(255,255,255,0.06)" },
};
