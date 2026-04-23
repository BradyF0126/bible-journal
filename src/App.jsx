import React, { useEffect, useMemo, useState } from "react";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const STORAGE_KEY = "bible_journal_entries_v1";

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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

// Sort primarily by entryDate (if present), otherwise by createdAt.
// Tie-breaker: createdAt
function sortKey(entry) {
  if (entry?.entryDate) {
    const t = Date.parse(entry.entryDate);
    if (!Number.isNaN(t)) return t;
  }
  return entry?.createdAt ?? 0;
}

export default function App() {
  const [entries, setEntries] = useState(() => loadEntries());
  const [screen, setScreen] = useState("home"); // home | new | search | all | view
  const [activeId, setActiveId] = useState(null);

  // New entry form state
  const [entryDate, setEntryDate] = useState(todayYMD()); // ✅ NEW
  const [verseRef, setVerseRef] = useState("");
  const [verseText, setVerseText] = useState("");
  const [notes, setNotes] = useState("");

  // Search state
  const [query, setQuery] = useState("");

  // Persist entries
  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

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
        contains(e.entryDate, query) || // ✅ searchable by date too
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
    setEntryDate(todayYMD()); // ✅ NEW
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

  function createEntry() {
    if (!verseRef.trim() && !verseText.trim() && !notes.trim()) {
      alert("Add at least something (verse reference, verse text, or notes).");
      return;
    }
    const entry = {
      id: uid(),
      createdAt: Date.now(),
      entryDate, // ✅ NEW
      verseRef: verseRef.trim(),
      verseText: verseText.trim(),
      notes: notes.trim(),
    };
    setEntries((prev) => [entry, ...prev]);
    setActiveId(entry.id);
    setScreen("view");
    resetNewForm();
  }

  function deleteEntry(id) {
    const ok = confirm("Delete this entry? This can’t be undone.");
    if (!ok) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    goHome();
  }

  function updateEntry(id, patch) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.app}>
        <Header
          title={
            screen === "home"
              ? "BY THE BLOOD"
              : screen === "new"
              ? "New Entry"
              : screen === "search"
              ? "Search"
              : screen === "all"
              ? "All Entries"
              : "Entry"
          }
          onHome={goHome}
        />

        <div style={styles.content}>
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

function Header({ title, onHome }) {
  return (
    <div style={styles.header}>
      <button style={styles.homeBtn} onClick={onHome} title="Home">
        ⌂
      </button>
      <div style={styles.headerTitle}>{title}</div>
      <div style={{ width: 34 }} />
    </div>
  );
}

function Home({ onNew, onSearch, onAll, count, latest }) {
  return (
    <div style={styles.homeWrap}>
      <div style={styles.crossBox}>
        <div style={styles.vLine} />
        <div style={styles.hLine} />
        <div style={styles.crossCenter}>✝</div>

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
                  {latest.entryDate ? `Entry date: ${latest.entryDate} • ` : ""}
                  Saved: {formatDateTime(latest.createdAt)}
                </div>
                <div style={styles.pClamp}>{latest.notes || latest.verseText || "—"}</div>
              </>
            ) : (
              <div style={styles.p}>No entries yet. Hit “New Entry.”</div>
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
        placeholder="Paste or type the verse…"
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

      <div style={styles.smallHint}>
        Saved locally on this device (we can add login/cloud sync later).
      </div>
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
        placeholder="Search date (YYYY-MM-DD), verse reference, verse text, or notes…"
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
          {entry.entryDate || "—"} • {formatDateTime(entry.createdAt)}
        </div>
      </div>
      <div style={styles.rowPreview}>{entry.notes || entry.verseText || "—"}</div>
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
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.15)",
  },
  homeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 16,
  },
  headerTitle: { color: "#fff", fontWeight: 700, fontSize: 16, flex: 1 },
  content: { padding: 16 },
  card: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 16,
    color: "#e5e7eb",
  },
  h2: { fontSize: 18, fontWeight: 800, marginBottom: 10, color: "#fff" },
  p: { marginTop: 6, opacity: 0.95 },
  small: { fontSize: 12, opacity: 0.8, marginTop: 8 },
  smallHint: { fontSize: 12, opacity: 0.75, marginTop: 10 },
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
  danger: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.12)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
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
