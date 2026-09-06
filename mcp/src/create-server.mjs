import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  resolveRoot,
  textResult,
  errorResult,
  workspaceInfo,
  listDirectory,
  readFilePaged,
  searchWorkspace,
  gitStatus,
  gitDiff,
} from "./workspace.mjs";

export function createServer(root = resolveRoot()) {
  const server = new McpServer({
    name: "lob-workspace",
    version: "0.1.0",
    instructions: "Paginated read-only git/file tools; no vault writes.",
  });

  server.registerTool(
    "workspace_info",
    {
      title: "Workspace info",
      description: "Git root, branch, and dirty state.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return textResult(workspaceInfo(root));
      } catch (e) {
        return errorResult(e);
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
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path: rel, page, page_size }) => {
      try {
        return textResult(listDirectory(root, rel || ".", page || 0, page_size || 50));
      } catch (e) {
        return errorResult(e);
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
        offset: z.number().int().min(0).optional().describe("Line offset"),
        limit: z.number().int().min(1).max(500).optional().describe("Max lines"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path: rel, offset, limit }) => {
      try {
        return textResult(readFilePaged(root, rel, offset || 0, limit || 200));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "search_workspace",
    {
      title: "Search workspace",
      description: "ripgrep (or Node fallback). Same secret paths as read_file are denied.",
      inputSchema: {
        query: z.string().min(2),
        page: z.number().int().min(0).optional(),
        page_size: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, page, page_size }) => {
      try {
        return textResult(searchWorkspace(root, query, page || 0, page_size || 30));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "git_status",
    {
      title: "Git status",
      description: "Branch plus staged, unstaged, and untracked files.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return textResult(gitStatus(root));
      } catch (e) {
        return errorResult(e);
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
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return textResult(gitDiff(root, args || {}));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  return server;
}
