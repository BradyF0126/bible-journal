function json(res, status, data) {
  res.status(status).json(data);
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferTheme(question) {
  const q = question.toLowerCase();
  if (q.includes("apply") || q.includes("live")) return "application";
  if (q.includes("mean") || q.includes("meaning")) return "meaning";
  if (q.includes("context")) return "context";
  if (q.includes("anx") || q.includes("fear") || q.includes("worry")) return "anxiety";
  if (q.includes("sin") || q.includes("tempt")) return "repentance";
  if (q.includes("forgiv")) return "forgiveness";
  if (q.includes("pray") || q.includes("prayer")) return "prayer";
  return "growth";
}

function topicSuggestionsFromContext(context) {
  const base = [
    "How to trust God in anxiety",
    "How to hear God through Scripture",
    "What true repentance looks like",
    "How to forgive biblically",
    "How to stay consistent in prayer",
    "How to walk in grace instead of guilt",
    "How to build faith during hard seasons",
    "How to love others like Jesus",
  ];

  const c = context.toLowerCase();
  const bonus = [];
  if (c.includes("anx") || c.includes("fear")) bonus.push("What God says about fear and peace");
  if (c.includes("relationship") || c.includes("marriage") || c.includes("friend")) {
    bonus.push("Godly communication and healthy boundaries");
  }
  if (c.includes("purpose") || c.includes("calling")) bonus.push("Discovering calling through faithfulness");
  if (c.includes("identity") || c.includes("worth")) bonus.push("Identity in Christ vs. worldly labels");
  if (c.includes("discipline") || c.includes("habit")) bonus.push("Building spiritual habits that last");

  const merged = [...bonus, ...base];
  return Array.from(new Set(merged)).slice(0, 10);
}

function verseGuidance(verseRef, question) {
  const cleanVerse = verseRef.trim() || "this verse";
  const cleanQuestion = question.trim();
  const theme = inferTheme(cleanQuestion);

  const blocks = {
    application: [
      `Meaning: ${cleanVerse} invites you to receive God's truth personally, not just understand it intellectually.`,
      "How to apply today:",
      "- Identify one thought or habit that this verse challenges.",
      "- Choose one practical action for today that aligns with this verse.",
      "- Share the verse with one person or pray it back to God.",
    ],
    meaning: [
      `Meaning: Start by reading ${cleanVerse} in context (the surrounding verses) so the message stays grounded in Scripture.`,
      "Study steps:",
      "- Ask: what does this reveal about God?",
      "- Ask: what does this reveal about people and our need for grace?",
      "- Ask: what response does this call for?",
    ],
    context: [
      `Context: To understand ${cleanVerse}, read the full paragraph or chapter section around it.`,
      "Context checklist:",
      "- Who is speaking?",
      "- Who is being addressed?",
      "- What issue is being corrected, taught, or encouraged?",
    ],
    anxiety: [
      `Encouragement: ${cleanVerse} reminds you that God's presence is stronger than fear.`,
      "When anxiety rises:",
      "- Slow down and breathe while praying this verse out loud.",
      "- Replace one anxious thought with one truth from Scripture.",
      "- Take one faithful next step instead of waiting for perfect peace.",
    ],
    repentance: [
      `Direction: ${cleanVerse} calls you to honest surrender, not hidden struggle.`,
      "Repentance path:",
      "- Confess specifically.",
      "- Ask for cleansing and strength.",
      "- Replace temptation patterns with a practical boundary today.",
    ],
    forgiveness: [
      `Direction: ${cleanVerse} points you toward mercy that reflects Jesus.`,
      "Forgiveness steps:",
      "- Name the wound honestly before God.",
      "- Release revenge to God in prayer.",
      "- Practice one concrete act of grace or boundary with wisdom.",
    ],
    prayer: [
      `Prayer focus: Use ${cleanVerse} as a prayer framework.`,
      "Try this pattern:",
      "- Thank God for one truth in the verse.",
      "- Confess where you resist that truth.",
      "- Ask for strength to live it today.",
    ],
    growth: [
      `Growth focus: ${cleanVerse} can shape your mindset, habits, and relationships.`,
      "Next steps:",
      "- Write one sentence: 'Because of this verse, today I will...'",
      "- Pick one action and one prayer.",
      "- Revisit this verse tonight and reflect on progress.",
    ],
  };

  const selected = blocks[theme] || blocks.growth;
  return [
    `Verse: ${cleanVerse}`,
    `Question: ${cleanQuestion}`,
    "",
    ...selected,
    "",
    "Reflection questions:",
    "- What is God showing me about His character here?",
    "- What needs to change in my heart today?",
    "- What one faithful step will I take before the day ends?",
    "",
    "Prayer:",
    `"Lord, help me live the truth of ${cleanVerse} with faith, humility, and obedience today. Amen."`,
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const mode = body.mode;

    if (mode === "topics") {
      const context = (body.context || "daily Christian growth").toString().slice(0, 300);
      return json(res, 200, { topics: topicSuggestionsFromContext(context) });
    }

    if (mode === "verse_qa") {
      const verseRef = (body.verseRef || "").toString().slice(0, 120);
      const question = (body.question || "").toString().slice(0, 1200);
      if (!verseRef || !question) {
        return json(res, 400, { error: "verseRef and question are required." });
      }

      const answer = verseGuidance(titleCase(verseRef), question);
      return json(res, 200, { answer });
    }

    return json(res, 400, { error: "Invalid mode." });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error." });
  }
}
