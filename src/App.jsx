import React, { useEffect, useMemo, useRef, useState } from "react";
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

function fromAiRow(row) {
  return {
    id: row.id,
    createdAt: Date.parse(row.created_at),
    verseRef: row.verse_ref || "",
    question: row.question || "",
    answer: row.answer || "",
    topic: row.topic || "",
  };
}

function toAiInsert(note, userId) {
  return {
    id: note.id || uid(),
    user_id: userId,
    verse_ref: note.verseRef || "",
    question: note.question || "",
    answer: note.answer || "",
    topic: note.topic || "",
    created_at: note.createdAt ? new Date(note.createdAt).toISOString() : new Date().toISOString(),
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [entries, setEntries] = useState([]);
  const [aiNotes, setAiNotes] = useState([]);
  const [screen, setScreen] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [loadingAiNotes, setLoadingAiNotes] = useState(true);
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
  const contentRef = useRef(null);

  const [topicSuggestions, setTopicSuggestions] = useState([
    "How to trust God in anxiety",
    "How to hear God through Scripture",
    "What true repentance looks like",
    "How to forgive biblically",
    "How to stay consistent in prayer",
  ]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [aiTopicQuery, setAiTopicQuery] = useState("");
  const [aiVerseRef, setAiVerseRef] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNotesQuery, setAiNotesQuery] = useState("");
  const [savingAiNote, setSavingAiNote] = useState(false);

  const localEntries = useMemo(() => loadLocalEntries(), []);
  const hasLocalEntries = localEntries.length > 0;
  const isConfigured = Boolean(supabase);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) {
      setLoadingEntries(false);
      setLoadingAiNotes(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) {
        setLoadingEntries(false);
        setLoadingAiNotes(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setEntries([]);
        setAiNotes([]);
        setActiveId(null);
        setScreen("home");
        setLoadingEntries(false);
        setLoadingAiNotes(false);
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

    async function fetchAiNotes() {
      setLoadingAiNotes(true);

      const { data, error } = await supabase
        .from("ai_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setAiNotes([]);
        setSyncMessage((prev) => prev || error.message);
      } else {
        setAiNotes((data || []).map(fromAiRow));
      }

      setLoadingAiNotes(false);
    }

    fetchEntries();
    fetchAiNotes();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [screen]);

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

  const filteredEntries = useMemo(() => {
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

  const filteredAiNotes = useMemo(() => {
    if (!aiNotesQuery.trim()) return aiNotes;
    return aiNotes.filter((note) => {
      return (
        contains(note.verseRef, aiNotesQuery) ||
        contains(note.question, aiNotesQuery) ||
        contains(note.answer, aiNotesQuery) ||
        contains(note.topic, aiNotesQuery)
      );
    });
  }, [aiNotes, aiNotesQuery]);

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

    const result =
      authMode === "sign-up"
        ? await supabase.auth.signUp({ email: cleanEmail, password: cleanPassword })
        : await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword,
          });

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

    const { data, error } = await supabase.from("entries").insert(payload).select().single();

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
    if (Object.prototype.hasOwnProperty.call(patch, "entryDate")) dbPatch.entry_date = patch.entryDate || null;
    if (Object.prototype.hasOwnProperty.call(patch, "verseRef")) dbPatch.verse_ref = patch.verseRef;
    if (Object.prototype.hasOwnProperty.call(patch, "verseText")) dbPatch.verse_text = patch.verseText;
    if (Object.prototype.hasOwnProperty.call(patch, "notes")) dbPatch.notes = patch.notes;

    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );

    const { error } = await supabase.from("entries").update(dbPatch).eq("id", id);
    if (error) setSyncMessage(`Sync error: ${error.message}`);
  }

  async function importLocalData() {
    if (!supabase || !user || !hasLocalEntries) return;

    const payload = localEntries.map((entry) =>
      toInsert(
        {
          id: entry.id || uid(),
          createdAt: entry.createdAt || Date.now(),
          entryDate: entry.entryDate || "",
          verseRef: entry.verseRef || "",
          verseText: entry.verseText || "",
          notes: entry.notes || "",
        },
        user.id
      )
    );

    const { data, error } = await supabase.from("entries").insert(payload).select("*");
    if (error) {
      alert(error.message);
      return;
    }

    clearLocalEntries();
    setEntries((data || []).map(fromRow).concat(entries));
    setSyncMessage("Imported your entries from this device.");
  }

  async function askAiForTopics() {
    setTopicsLoading(true);
    setAiError("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "topics",
          context: aiTopicQuery.trim() || "daily Christian growth for teens and adults",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed.");
      }

      setTopicSuggestions(data.topics || []);
    } catch (error) {
      setAiError(error.message || "Could not load topic suggestions.");
    } finally {
      setTopicsLoading(false);
    }
  }

  async function askAiAboutVerse() {
    const cleanVerse = aiVerseRef.trim();
    const cleanQuestion = aiQuestion.trim();

    if (!cleanVerse || !cleanQuestion) {
      setAiError("Enter both a verse reference and your question.");
      return;
    }

    setAiLoading(true);
    setAiError("");
    setAiAnswer("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "verse_qa",
          verseRef: cleanVerse,
          question: cleanQuestion,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed.");
      }

      setAiAnswer(data.answer || "");
    } catch (error) {
      setAiError(error.message || "Could not get an AI response.");
    } finally {
      setAiLoading(false);
    }
  }

  async function saveCurrentAiNote() {
    if (!supabase || !user || !aiAnswer.trim()) return;

    setSavingAiNote(true);
    const payload = toAiInsert(
      {
        id: uid(),
        createdAt: Date.now(),
        verseRef: aiVerseRef.trim(),
        question: aiQuestion.trim(),
        answer: aiAnswer.trim(),
        topic: "",
      },
      user.id
    );

    const { data, error } = await supabase.from("ai_notes").insert(payload).select().single();

    setSavingAiNote(false);

    if (error) {
      setAiError(error.message);
      return;
    }

    setAiNotes((prev) => [fromAiRow(data), ...prev]);
    setSyncMessage("Saved to AI Notes.");
    setScreen("ai-notes");
  }

  if (!isConfigured) return <SetupScreen />;

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
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />
      <div style={styles.crossPattern} />
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
              : screen === "ai"
              ? "Explore AI"
              : screen === "ai-notes"
              ? "AI Notes"
              : "Entry"
          }
          subtitle={user.email}
          onHome={goHome}
          onSignOut={handleSignOut}
        />

        <div style={styles.content} ref={contentRef}>
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
                  onAi={() => setScreen("ai")}
                  onAiNotes={() => setScreen("ai-notes")}
                  count={entries.length}
                  aiNoteCount={aiNotes.length}
                  latest={sortedEntries[0]}
                  latestAiNote={aiNotes[0]}
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
                <Search query={query} setQuery={setQuery} results={filteredEntries} onOpen={openEntry} />
              )}

              {screen === "all" && <AllEntries entries={sortedEntries} onOpen={openEntry} />}

              {screen === "ai" && (
                <ExploreAi
                  topicSuggestions={topicSuggestions}
                  topicsLoading={topicsLoading}
                  aiTopicQuery={aiTopicQuery}
                  setAiTopicQuery={setAiTopicQuery}
                  onAskTopics={askAiForTopics}
                  aiVerseRef={aiVerseRef}
                  setAiVerseRef={setAiVerseRef}
                  aiQuestion={aiQuestion}
                  setAiQuestion={setAiQuestion}
                  aiAnswer={aiAnswer}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  onAskVerse={askAiAboutVerse}
                  onSaveAiNote={saveCurrentAiNote}
                  savingAiNote={savingAiNote}
                  onOpenAiNotes={() => setScreen("ai-notes")}
                />
              )}

              {screen === "ai-notes" && (
                <AiNotes
                  notes={filteredAiNotes}
                  query={aiNotesQuery}
                  setQuery={setAiNotesQuery}
                  loading={loadingAiNotes}
                />
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
          Add your project values to local <code>.env</code> first.
        </div>
        <div style={styles.codeBlock}>
          VITE_SUPABASE_URL=your-project-url{"\n"}
          VITE_SUPABASE_ANON_KEY=your-anon-public-key
        </div>
        <div style={styles.small}>
          For AI, also set <code>OPENAI_API_KEY</code> in Vercel project environment variables.
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
          <div style={styles.h1}>{authMode === "sign-up" ? "Create your account" : "Sign in"}</div>
          <div style={styles.p}>Save your journal across phones, tablets, and computers.</div>

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
              {authLoading ? "Working..." : authMode === "sign-up" ? "Create Account" : "Sign In"}
            </button>
          </form>

          {authMessage ? <div style={styles.notice}>{authMessage}</div> : null}

          <button style={styles.linkBtn} onClick={() => setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up")}>
            {authMode === "sign-up" ? "Already have an account? Sign in" : "Need an account? Create one"}
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

function Home({ onNew, onSearch, onAll, onAi, onAiNotes, count, aiNoteCount, latest, latestAiNote }) {
  return (
    <div style={styles.homeWrap}>
      <div style={styles.hero}>
        <div style={styles.heroEyebrow}>Faith + Focus</div>
        <div style={styles.heroTitle}>Grow closer to God every day</div>
        <div style={styles.heroText}>
          Write, reflect, ask questions, and keep everything in one place across all your devices.
        </div>
      </div>

      <div style={styles.homeGrid}>
        <BigButton label="New Entry" sub="Write today's reflection" onClick={onNew} />
        <BigButton label="Search Journal" sub="Find by verse and notes" onClick={onSearch} />
        <BigButton label="All Entries" sub={`Browse all (${count})`} onClick={onAll} />
        <BigButton label="Explore AI" sub="Get guided Bible help" onClick={onAi} />
        <BigButton label="AI Notes" sub={`Saved AI answers (${aiNoteCount})`} onClick={onAiNotes} />
      </div>

      <div style={styles.homeMetaGrid}>
        <div style={styles.card}>
          <div style={styles.h2}>Latest Journal Entry</div>
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

        <div style={styles.card}>
          <div style={styles.h2}>Latest AI Note</div>
          {latestAiNote ? (
            <>
              <div style={styles.p}>
                <b>{latestAiNote.verseRef || latestAiNote.topic || "AI insight"}</b>
              </div>
              <div style={styles.small}>Saved: {formatDateTime(latestAiNote.createdAt)}</div>
              <div style={styles.pClamp}>{latestAiNote.answer || "-"}</div>
            </>
          ) : (
            <div style={styles.p}>No AI notes yet. Open Explore AI and ask your first question.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExploreAi({
  topicSuggestions,
  topicsLoading,
  aiTopicQuery,
  setAiTopicQuery,
  onAskTopics,
  aiVerseRef,
  setAiVerseRef,
  aiQuestion,
  setAiQuestion,
  aiAnswer,
  aiLoading,
  aiError,
  onAskVerse,
  onSaveAiNote,
  savingAiNote,
  onOpenAiNotes,
}) {
  return (
    <div style={styles.stack}>
      <div style={styles.card}>
        <div style={styles.h2}>Topic Explorer</div>
        <div style={styles.p}>
          Ask AI for Bible-learning topics so you always have a next study direction.
        </div>
        <label style={styles.label}>Focus area (optional)</label>
        <input
          style={styles.input}
          value={aiTopicQuery}
          onChange={(e) => setAiTopicQuery(e.target.value)}
          placeholder="Example: identity in Christ, spiritual warfare, prayer consistency..."
        />
        <div style={styles.rowInline}>
          <button style={styles.secondary} onClick={onAskTopics} disabled={topicsLoading}>
            {topicsLoading ? "Loading..." : "Suggest Topics"}
          </button>
          <button style={styles.linkBtnInline} onClick={onOpenAiNotes}>
            View AI Notes
          </button>
        </div>
        <div style={styles.topicGrid}>
          {topicSuggestions.map((topic) => (
            <div key={topic} style={styles.topicChip}>
              {topic}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.h2}>Ask About a Verse</div>
        <div style={styles.p}>
          Enter a verse reference and question. AI will help explain context, meaning, and application.
        </div>

        <label style={styles.label}>Verse reference</label>
        <input
          style={styles.input}
          value={aiVerseRef}
          onChange={(e) => setAiVerseRef(e.target.value)}
          placeholder="Example: Romans 8:1"
        />

        <label style={styles.label}>Your question</label>
        <textarea
          style={{ ...styles.textarea, minHeight: 120 }}
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          placeholder="What does this verse mean? How do I apply it today?"
        />

        <button style={styles.primary} onClick={onAskVerse} disabled={aiLoading}>
          {aiLoading ? "Asking AI..." : "Ask AI"}
        </button>

        {aiError ? <div style={styles.noticeDanger}>{aiError}</div> : null}

        {aiAnswer ? (
          <div style={styles.aiAnswerCard}>
            <div style={styles.h2}>AI Response</div>
            <div style={styles.pPreserve}>{aiAnswer}</div>
            <button style={styles.secondary} onClick={onSaveAiNote} disabled={savingAiNote}>
              {savingAiNote ? "Saving..." : "Save to AI Notes"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AiNotes({ notes, query, setQuery, loading }) {
  return (
    <div style={styles.card}>
      <div style={styles.h2}>AI Notes</div>
      <input
        style={styles.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search verse, question, or answer..."
      />

      {loading ? (
        <div style={styles.small}>Loading AI notes...</div>
      ) : (
        <div style={styles.list}>
          {notes.length === 0 ? (
            <div style={styles.p}>No AI notes yet.</div>
          ) : (
            notes.map((note) => (
              <div key={note.id} style={styles.aiNoteCard}>
                <div style={styles.rowTop}>
                  <div style={styles.rowTitle}>
                    {note.verseRef || note.topic || "AI Note"}
                  </div>
                  <div style={styles.rowDate}>{formatDateTime(note.createdAt)}</div>
                </div>
                {note.question ? <div style={styles.p}><b>Q:</b> {note.question}</div> : null}
                <div style={styles.pPreserve}><b>A:</b> {note.answer || "-"}</div>
              </div>
            ))
          )}
        </div>
      )}
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
        style={{ ...styles.textarea, minHeight: 160 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What stood out? What does it mean to you? How will you apply it?"
      />

      <button style={styles.primary} onClick={onSave}>
        Save Entry
      </button>
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
        {results.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onOpen={() => onOpen(entry.id)} />
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
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} onOpen={() => onOpen(entry.id)} />)
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
        style={{ ...styles.textarea, minHeight: 160 }}
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
    { key: "ai", label: "Explore AI" },
  ];

  return (
    <div style={styles.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTab(tab.key)}
          style={{
            ...styles.tabBtn,
            ...(active === tab.key ? styles.tabActive : {}),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    position: "relative",
    display: "block",
    background:
      "radial-gradient(circle at 20% 0%, rgba(196, 146, 70, 0.28), transparent 40%), radial-gradient(circle at 85% 100%, rgba(44, 98, 195, 0.22), transparent 42%), #071021",
    padding:
      "max(0px, env(safe-area-inset-top)) max(0px, env(safe-area-inset-right)) max(0px, env(safe-area-inset-bottom)) max(0px, env(safe-area-inset-left))",
    overflow: "hidden",
    fontFamily: '"Nunito Sans", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  },
  bgGlowA: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,208,120,0.16), rgba(255,208,120,0))",
    top: -140,
    left: -110,
    filter: "blur(2px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(61,131,255,0.18), rgba(61,131,255,0))",
    right: -120,
    bottom: -120,
    filter: "blur(4px)",
    pointerEvents: "none",
  },
  crossPattern: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
    backgroundSize: "72px 72px",
    maskImage: "radial-gradient(circle at center, black, transparent 74%)",
    pointerEvents: "none",
  },
  app: {
    position: "relative",
    zIndex: 1,
    width: "min(1050px, 100vw)",
    minHeight: "100dvh",
    height: "100dvh",
    margin: "0 auto",
    background: "rgba(12,22,40,0.88)",
    backdropFilter: "blur(4px)",
    borderRadius: 0,
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
    boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
    display: "flex",
    flexDirection: "column",
  },
  authShell: {
    width: "min(500px, calc(100vw - 24px))",
    margin: "24px auto",
    display: "grid",
    gap: 18,
    padding: 12,
    boxSizing: "border-box",
  },
  authBrand: {
    color: "#fff",
    fontSize: 32,
    fontWeight: 900,
    textAlign: "center",
    letterSpacing: 0.4,
  },
  authCard: {
    background: "rgba(13,23,42,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 24,
    color: "#e5e7eb",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  setupCard: {
    width: "min(680px, calc(100vw - 24px))",
    margin: "24px auto",
    background: "rgba(13,23,42,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
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
    background: "rgba(7,16,33,0.64)",
  },
  headerStack: { flex: 1, minWidth: 0 },
  headerTitle: { color: "#fff", fontWeight: 800, fontSize: 17 },
  headerSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerAction: {
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    padding: "9px 12px",
    fontWeight: 700,
  },
  homeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  content: {
    padding: 16,
    display: "grid",
    gap: 12,
    flex: 1,
    overflowY: "scroll",
    overflowX: "hidden",
    alignContent: "start",
    scrollbarGutter: "stable",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  },
  stack: { display: "grid", gap: 12 },
  hero: {
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(255,208,120,0.28)",
    background:
      "linear-gradient(120deg, rgba(255,208,120,0.18), rgba(255,208,120,0.03) 35%, rgba(49,95,176,0.22))",
    color: "#f8fafc",
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "rgba(255,236,192,0.92)",
  },
  heroTitle: {
    marginTop: 8,
    fontSize: "clamp(22px, 3.2vw, 30px)",
    fontWeight: 900,
    lineHeight: 1.2,
  },
  heroText: {
    marginTop: 8,
    fontSize: 14,
    color: "rgba(241,245,249,0.9)",
  },
  homeWrap: { display: "grid", gap: 12 },
  homeGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  },
  homeMetaGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  card: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 16,
    color: "#e5e7eb",
  },
  aiNoteCard: {
    background: "rgba(4,12,24,0.42)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    padding: 12,
    color: "#e5e7eb",
  },
  aiAnswerCard: {
    marginTop: 14,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    padding: 14,
    display: "grid",
    gap: 10,
  },
  banner: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#e5e7eb",
  },
  bannerTitle: { fontSize: 15, fontWeight: 800, color: "#fff" },
  h1: { fontSize: 30, fontWeight: 900, marginBottom: 10, color: "#fff" },
  h2: { fontSize: 22, fontWeight: 900, marginBottom: 10, color: "#fff" },
  p: { marginTop: 6, opacity: 0.95, lineHeight: 1.45 },
  pPreserve: { whiteSpace: "pre-wrap", lineHeight: 1.55, opacity: 0.95 },
  small: { fontSize: 12, opacity: 0.82, marginTop: 8 },
  smallHint: { fontSize: 12, opacity: 0.76, marginTop: 10 },
  notice: {
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
  },
  noticeDanger: {
    marginTop: 12,
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,120,120,0.28)",
    background: "rgba(180,54,54,0.16)",
    color: "#ffe3e3",
  },
  label: { display: "block", fontSize: 12, opacity: 0.9, marginTop: 12, fontWeight: 700 },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.28)",
    color: "#fff",
    outline: "none",
  },
  textarea: {
    width: "100%",
    marginTop: 6,
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.28)",
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
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.1))",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  secondary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  linkBtn: {
    marginTop: 12,
    border: "none",
    background: "transparent",
    color: "#d4e4ff",
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
  },
  linkBtnInline: {
    border: "none",
    background: "transparent",
    color: "#d4e4ff",
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
    fontWeight: 700,
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
  rowInline: {
    marginTop: 12,
    display: "flex",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap",
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
  rowTop: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  rowTitle: { fontWeight: 800 },
  rowDate: { fontSize: 12, opacity: 0.72 },
  rowPreview: {
    marginTop: 6,
    opacity: 0.9,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  topicGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 10,
  },
  topicChip: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,208,120,0.28)",
    background: "rgba(255,208,120,0.08)",
    color: "#f8f3dc",
    fontWeight: 700,
    fontSize: 13,
  },
  bigBtn: {
    width: "100%",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
    color: "#fff",
    cursor: "pointer",
    padding: 16,
    textAlign: "left",
    minHeight: 112,
  },
  bigBtnLabel: { fontSize: 20, fontWeight: 900, marginBottom: 6 },
  bigBtnSub: { opacity: 0.88, fontSize: 13 },
  pClamp: {
    marginTop: 8,
    opacity: 0.9,
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(6,14,30,0.88)",
    position: "sticky",
    bottom: 0,
  },
  tabBtn: {
    padding: "14px 8px calc(14px + env(safe-area-inset-bottom))",
    border: "none",
    background: "transparent",
    color: "rgba(255,255,255,0.76)",
    cursor: "pointer",
    fontWeight: 800,
    minHeight: 58,
    fontSize: 13,
  },
  tabActive: { color: "#fff", background: "rgba(255,255,255,0.08)" },
};
