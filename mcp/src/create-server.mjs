import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  resolveRoot,
  textResult,
  errorResult,
  workspaceInfo,
  projectBrief,
  listDirectory,
  readFilePaged,
  searchWorkspace,
  gitStatus,
  gitDiff,
  writeC2cReply,
  resolveLimits,
} from "./workspace.mjs";

export const MCP_SERVER_NAME = "tagteam-workspace";

export function createServer(root = resolveRoot(), limits = resolveLimits()) {
  const errorBudget = Math.min(...Object.values(limits.delivery));
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: "0.1.0",
    instructions: `TagTeamGPT control plane (keyboard, not mouse hunting):

• One pinned Chat thread per goal — never New chat mid-loop; never use Work as planner.
• Before planning, call project_brief with the relevant project paths. Confirm its root matches the requested repo. Read partial sources separately.
• Local folder projects do not support Chat — keep Chat as a cloud thread (no local folder); mount the repo only in Codex.
• Modes (macOS): Control+1 Chat, Control+2 Work (avoid), Control+3 Codex. Win/Linux: Alt+1/2/3.
• Loop: Chat receives [C2C] INIT → reply PLAN → human/driver Control+3 pastes PLAN into Codex → Codex works → Control+1 pastes [C2C] EXECUTED back into the same Chat → you reply DONE, PLAN, or BLOCKED.
• Always reply with structured [C2C] STATE headers only for state changes. Keep messages tiny (~1KB). No full file dumps.
• After every PLAN, DONE, BLOCKED, or READY, call submit_c2c with the full [C2C] message so the auto-loop can read .tagteam/last-reply.json. Do not wait for a human to copy.
• After EXECUTED: prefer these tools (git_diff, read_file, git_status, workspace_info) over asking Codex to paste. Keep pulls small and paginated.
• A truncated result includes reason and cursor. Pass that cursor to resume. reason stale_cursor means the source changed. Start that read again.
• Trust keystroke send (clipboard+Enter); do not require screenshots/CUA for the happy path.`,

  });

  server.registerTool(
    "workspace_info",
    {
      title: "Workspace info",
      description: "Project type, languages, git branch, dirty state. Call this first.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return textResult(workspaceInfo(root, { limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "project_brief",
    {
      title: "Project brief",
      description: "Read the workspace rules, declared test commands, and saved revision before planning. Confirm the root matches the requested project.",
      inputSchema: {
        paths: z.array(z.string().min(1).max(512)).max(8).optional().describe("Relevant files or folders. Includes their ancestor instructions and package scripts."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paths } = {}) => {
      try {
        return textResult(projectBrief(root, paths || [], { limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "list_directory",
    {
      title: "List directory",
      description: "Paginated directory listing. Skips node_modules and .git.",
      inputSchema: {
        path: z.string().optional().describe("Relative path inside the workspace"),
        page: z.number().int().min(0).optional(),
        page_size: z.number().int().min(1).max(200).optional(),
        cursor: z.string().optional().describe("Continuation cursor from a truncated listing"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path: rel, page, page_size, cursor }) => {
      try {
        return textResult(listDirectory(root, rel || ".", page || 0, page_size || 50, { cursor, limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: "Paginated file read. Sensitive files (.env, keys) are denied.",
      inputSchema: {
        path: z.string().describe("Relative file path"),
        offset: z.number().int().min(0).optional().describe("Line offset. A cursor resumes inside a long line."),
        limit: z.number().int().min(1).max(500).optional().describe("Max lines"),
        cursor: z.string().optional().describe("Continuation cursor from a truncated read"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path: rel, offset, limit, cursor }) => {
      try {
        return textResult(readFilePaged(root, rel, offset || 0, limit || 200, { cursor, limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "search_workspace",
    {
      title: "Search workspace",
      description: "ripgrep (or Node fallback) across the workspace.",
      inputSchema: {
        query: z.string().min(2),
        page: z.number().int().min(0).optional(),
        page_size: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional().describe("Continuation cursor from a truncated search"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, page, page_size, cursor }) => {
      try {
        return textResult(searchWorkspace(root, query, page || 0, page_size || 30, { cursor, limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "git_status",
    {
      title: "Git status",
      description: "Branch plus staged, unstaged, and untracked files.",
      inputSchema: {
        cursor: z.string().optional().describe("Continuation cursor from a truncated status"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ cursor } = {}) => {
      try {
        return textResult(gitStatus(root, { cursor, limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "git_diff",
    {
      title: "Git diff",
      description: "Paginated diff. The independent review tool after EXECUTED.",
      inputSchema: {
        staged: z.boolean().optional(),
        path: z.string().optional().describe("Limit diff to one relative path"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z.string().optional().describe("Continuation cursor from a truncated diff"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return textResult(gitDiff(root, { ...(args || {}), limits }));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  server.registerTool(
    "submit_c2c",
    {
      title: "Submit C2C state",
      description:
        "Write a [C2C] PLAN, DONE, BLOCKED, or READY message to .tagteam/last-reply.json so the auto-loop can hop without copying the Chat thread.",
      inputSchema: {
        message: z.string().min(12).describe("Full [C2C] message including STATE header"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ message }) => {
      try {
        return textResult(writeC2cReply(root, message));
      } catch (e) {
        return errorResult(e, errorBudget);
      }
    }
  );

  return server;
}
