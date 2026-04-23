const OPENAI_URL = "https://api.openai.com/v1/responses";

function json(res, status, data) {
  res.status(status).json(data);
}

async function askOpenAI({ systemPrompt, userPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in Vercel environment variables.");
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_output_tokens: 700,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  const text = data.output_text || "";
  return text.trim();
}

function parseTopics(text) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean);
  return lines.slice(0, 10);
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
      const text = await askOpenAI({
        systemPrompt:
          "You are a Christian discipleship assistant. Provide practical, biblical study topics. Keep each topic short, specific, and uplifting.",
        userPrompt: `Give 8 Christian Bible study topics based on: ${context}. Return each on its own line.`,
      });
      return json(res, 200, { topics: parseTopics(text) });
    }

    if (mode === "verse_qa") {
      const verseRef = (body.verseRef || "").toString().slice(0, 120);
      const question = (body.question || "").toString().slice(0, 1200);
      if (!verseRef || !question) {
        return json(res, 400, { error: "verseRef and question are required." });
      }

      const answer = await askOpenAI({
        systemPrompt:
          "You are a helpful Christian Bible study assistant. Be faithful to Scripture, clear, practical, and non-denominational. Keep answers concise and actionable.",
        userPrompt: `Verse reference: ${verseRef}\nQuestion: ${question}\n\nPlease include:\n1) Short meaning\n2) Context note\n3) Practical application`,
      });
      return json(res, 200, { answer });
    }

    return json(res, 400, { error: "Invalid mode." });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error." });
  }
}
