import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseC2C } from "../../tools/lib/lob-driver-helpers.mjs";

const DENY_NAME = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
  "secrets.json",
  "mcp.token",
  ".npmrc",
]);

const DENY_PART = [
  "/.git/",
  "/node_modules/",
  "/.ssh/",
  "/.gnupg/",
  "/.aws/",
  "/.cursor/hooks/state/",
  "/.lob/",
  "/.codexgpt/",
];

export function resolveRoot(cwd = process.env.LOB_ROOT || process.cwd()) {
  return path.resolve(cwd);
}

export function assertSafeRel(root, rel = ".") {
  const cleaned = String(rel || ".").replace(/\\/g, "/");
  if (cleaned.includes("\0")) throw new Error("invalid path");
  const abs = path.resolve(root, cleaned);
  const rootN = path.resolve(root) + path.sep;
  if (abs !== path.resolve(root) && !abs.startsWith(rootN)) {
    throw new Error("path escapes workspace");
  }
  const base = path.basename(abs);
  if (DENY_NAME.has(base) || base.startsWith(".env")) {
    throw new Error("sensitive file denied");
  }
  const norm = abs.replace(/\\/g, "/");
  for (const part of DENY_PART) {
    if (norm.includes(part)) throw new Error("path denied");
  }
  return abs;
}

export function textResult(obj) {
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
  };
}

export function errorResult(err) {
  return {
    isError: true,
    content: [{ type: "text", text: String(err?.message || err) }],
  };
}

export function workspaceInfo(root) {
  let branch = null;
  let dirty = null;
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    dirty =
      execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()
        .length > 0;
  } catch {
    /* not a git repo */
  }
  return {
    root,
    languages: ["TypeScript", "JavaScript", "Markdown"],
    project_type: "TagTeamGPT (Next.js explainer + Codex skill + desktop driver)",
    git_branch: branch,
    dirty,
  };
}

export function listDirectory(root, rel = ".", page = 0, pageSize = 50) {
  const abs = assertSafeRel(root, rel);
  const entries = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.name !== "node_modules" && e.name !== ".git")
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const start = Math.max(0, page) * pageSize;
  return {
    path: rel,
    total: entries.length,
    page,
    page_size: pageSize,
    entries: entries.slice(start, start + pageSize),
  };
}

export function readFilePaged(root, rel, offset = 0, limit = 200) {
  const abs = assertSafeRel(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error("not a file");
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const start = Math.max(0, offset);
  const end = Math.min(lines.length, start + Math.max(1, limit));
  return {
    path: rel,
    total_lines: lines.length,
    offset: start,
    limit,
    content: lines.slice(start, end).join("\n"),
  };
}

export function searchWorkspace(root, query, page = 0, pageSize = 30) {
  if (!query || query.length < 2) throw new Error("query too short");
  let out = "";
  try {
    out = execFileSync(
      "rg",
      ["-n", "--hidden", "--glob", "!node_modules", "--glob", "!.git", "-m", "200", query, "."],
      { cwd: root, encoding: "utf8", maxBuffer: 2_000_000 }
    );
  } catch (e) {
    if (e.status === 1) out = "";
    else {
      // ripgrep missing — naive fallback
      out = naiveSearch(root, query).join("\n");
    }
  }
  const lines = out.split("\n").filter(Boolean);
  const start = Math.max(0, page) * pageSize;
  return {
    query,
    total: lines.length,
    page,
    page_size: pageSize,
    hits: lines.slice(start, start + pageSize),
  };
}

function naiveSearch(root, query) {
  const hits = [];
  const walk = (dir) => {
    if (hits.length >= 200) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) {
        try {
          const text = fs.readFileSync(p, "utf8");
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              hits.push(`${path.relative(root, p)}:${i + 1}:${lines[i].slice(0, 200)}`);
              if (hits.length >= 200) return;
            }
          }
        } catch {
          /* binary / denied */
        }
      }
    }
  };
  walk(root);
  return hits;
}

export function gitStatus(root) {
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const porcelain = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  const staged = [];
  const unstaged = [];
  const untracked = [];
  for (const line of porcelain.split("\n").filter(Boolean)) {
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);
    if (x === "?" && y === "?") untracked.push(file);
    else {
      if (x !== " " && x !== "?") staged.push(file);
      if (y !== " " && y !== "?") unstaged.push(file);
    }
  }
  return { branch, staged, unstaged, untracked };
}

function listUntrackedFiles(root) {
  const out = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 4_000_000 }
  );
  return out.split("\0").filter(Boolean);
}

function syntheticNewFileDiff(root, rel) {
  const abs = assertSafeRel(root, rel);
  let body = "";
  try {
    body = fs.readFileSync(abs, "utf8");
  } catch {
    return "";
  }
  // Cap huge untracked files so review stays bounded.
  const maxChars = 40_000;
  const truncated = body.length > maxChars;
  const shown = truncated ? body.slice(0, maxChars) + "\n… [truncated]\n" : body;
  const contentLines = shown.split(/\r?\n/);
  const plus = contentLines.map((l) => `+${l}`).join("\n");
  return [
    `diff --git a/${rel} b/${rel}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${rel}`,
    `@@ -0,0 +1,${contentLines.length} @@`,
    plus,
  ].join("\n");
}

export function gitDiff(root, { staged = false, path: rel, offset = 0, limit = 200 } = {}) {
  const args = ["diff", "--no-color"];
  if (staged) args.push("--cached");
  if (rel) {
    assertSafeRel(root, rel);
    args.push("--", rel);
  }
  let diff = execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4_000_000,
  });

  // Untracked files are invisible to `git diff`; Chat still needs them after EXECUTED.
  if (!staged) {
    let extras = listUntrackedFiles(root);
    if (rel) {
      const norm = rel.replace(/^\.\//, "").replace(/\/$/, "");
      extras = extras.filter(
        (f) => f === norm || f.startsWith(norm.endsWith("/") ? norm : norm + "/")
      );
    } else {
      extras = extras.slice(0, 40);
    }
    const blocks = extras
      .map((f) => syntheticNewFileDiff(root, f))
      .filter(Boolean);
    if (blocks.length) {
      diff = [diff, ...blocks].filter(Boolean).join("\n");
    }
  }

  const lines = diff.length ? diff.split(/\r?\n/) : [""];
  const start = Math.max(0, offset);
  const end = Math.min(lines.length, start + Math.max(1, limit));
  return {
    staged: !!staged,
    path: rel || null,
    total_lines: lines.length,
    offset: start,
    limit,
    includes_untracked: !staged,
    diff: lines.slice(start, end).join("\n"),
  };
}

/** Chat posts [C2C] PLAN/DONE/BLOCKED/READY here so the auto-loop can proceed without Select All. */
export function writeC2cReply(root, message) {
  const parsed = parseC2C(message);
  if (!parsed.ok) throw new Error(parsed.detail || "No C2C STATE found");
  const dir = path.join(root, ".lob");
  fs.mkdirSync(dir, { recursive: true });
  const reply = {
    ok: true,
    state: parsed.state,
    task_id: parsed.task_id,
    snippet: parsed.snippet,
  };
  fs.writeFileSync(path.join(dir, "last-reply.json"), JSON.stringify(reply, null, 2) + "\n");
  if (parsed.state === "PLAN") {
    fs.writeFileSync(path.join(dir, "last-plan.md"), `${String(message).trim()}\n`);
  }
  return reply;
}
