# Private ChatGPT connector

OpenAI Secure MCP Tunnel connects ChatGPT to a local MCP server through an outbound connection.
The server keeps its Bearer access key.
The tunnel client supplies that key locally.

Official instructions: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

## First setup on another computer

Use a clone of TagTeamGPT for the commands below.
Set the intended workspace before starting the server.
The server defaults to the TagTeamGPT clone that contains `mcp/`.
To serve another project, set `TAGTEAM_ROOT` to that project's absolute path.
Create the access key and header file in that target project's `.tagteam` directory.
Use the target project's absolute header path in the tunnel command.
Exclude `.tagteam/` from that project's Git history before creating secrets.

1. Install Node.js 20 or later and the MCP dependencies:

   ```sh
   npm --prefix mcp install
   ```

2. Install the official `tunnel-client` from the download linked in the OpenAI instructions above.
   Run `tunnel-client help quickstart` to check the installed version's setup commands.

3. Create or reuse a tunnel at https://platform.openai.com/settings/organization/tunnels.
   Associate it with the intended ChatGPT workspace.
   The runtime key and plugin operator need **Tunnels Read + Use**.
   An operator who creates tunnels needs **Tunnels Read + Manage**.
   Ask the user to enter credentials locally when account access requires them.

4. Create a profile with a reference to the runtime key:

   ```sh
   tunnel-client init --sample sample_mcp_remote_no_auth \
     --profile tagteam --tunnel-id YOUR_TUNNEL_ID \
     --mcp-server-url http://127.0.0.1:8743/mcp \
     --control-plane-api-key-ref env:CONTROL_PLANE_API_KEY
   ```

   Replace `YOUR_TUNNEL_ID` with the tunnel ID from Platform.
   Supply `CONTROL_PLANE_API_KEY` locally before running the tunnel.
   A protected `file:/absolute/path` reference also works.
   Reuse an existing suitable profile without `--force`.

5. Create the local server key without displaying it:

   ```sh
   node --input-type=module <<'JS'
   import fs from 'node:fs';
   import crypto from 'node:crypto';
   fs.mkdirSync('.tagteam', { recursive: true });
   const file = '.tagteam/mcp.token';
   try {
     fs.writeFileSync(file, crypto.randomBytes(24).toString('hex'), { flag: 'wx', mode: 0o600 });
   } catch (error) {
     if (error.code !== 'EEXIST') throw error;
   }
   fs.chmodSync(file, 0o600);
   JS
   ```

Continue with the restart procedure below, then create the ChatGPT plugin.
Port 8080 hosts the private tunnel dashboard.
Port 8743 hosts the local MCP server.
Keep both listeners on `127.0.0.1`.

## Existing setup on this Mac

The verified workspace is `/Users/dtc/Documents/ChatGPT/TagTeamGPT`.
The installed ChatGPT plugin is **TagTeamGPT Private**.
The saved tunnel profile is `tagteam` under `~/.config/tunnel-client/`.
Machine-specific tunnel details are in `.tagteam/private-setup.md`.
That file is ignored by Git.

The profile stores a reference to the runtime key.
Keep that key outside the repository.
The server access key is `.tagteam/mcp.token`.
The local header file is `.tagteam/mcp.private-authheader`.
Never paste either key into a chat or commit either key.

## Restart the existing setup

Use these commands from the workspace root.
Keep both terminal commands running while Chat uses the plugin.

1. Start the local server in one terminal:

   ```sh
   node mcp/src/http.mjs
   ```

   If port 8743 is occupied, check the existing server before starting another server:

   ```sh
   curl --fail --silent http://127.0.0.1:8743/health
   ```

   Confirm that `root` is the intended workspace.

2. Rebuild the local header file without printing the key:

   ```sh
   node --input-type=module <<'JS'
   import fs from 'node:fs';
   const token = fs.readFileSync('.tagteam/mcp.token', 'utf8').trim();
   if (!token) throw new Error('The server access key is empty.');
   fs.writeFileSync('.tagteam/mcp.private-authheader', 'Bearer ' + token, { mode: 0o600 });
   fs.chmodSync('.tagteam/mcp.private-authheader', 0o600);
   JS
   ```

3. Start the private tunnel in a second terminal:

   ```sh
   tunnel-client run --profile tagteam \
     --mcp.extra-headers "Authorization: file:$(pwd)/.tagteam/mcp.private-authheader" \
     --mcp.discovery-extra-headers "Authorization: file:$(pwd)/.tagteam/mcp.private-authheader"
   ```

4. Check readiness:

   ```sh
   curl --fail --silent http://127.0.0.1:8080/readyz
   ```

   Expect `ready`.
   The local tunnel dashboard is `http://127.0.0.1:8080/ui`.

5. Select **TagTeamGPT Private** with `@` in ChatGPT.
   Ask it to call `workspace_info` and read the first eight lines of `README.md`.
   Confirm that the reported folder matches the intended workspace.

## Create the plugin again if necessary

1. Open https://chatgpt.com/plugins in a browser.
2. Select **+**, then **Add custom MCP server**.
3. Enter **TagTeamGPT Private** as the name.
4. Under **Connection**, select **Tunnel** beside **Server URL**.
5. Select the existing tunnel from the profile.
6. Select **No authentication** for the plugin.
7. Review the warning and create the plugin.
8. Select the plugin in the chat and verify `workspace_info`.

The tunnel controls remote access through OpenAI permissions.
The local MCP server still requires its access key.
Do not set `TAGTEAM_MCP_ALLOW_NO_AUTH`.

## Verification recorded on October 17, 2026

The installed private plugin reported the correct workspace root.
It read `README.md` and reported the unsaved changes.
It read a 500-line range across two responses of 16384 and 1453 bytes.
The local comparison confirmed that the requested range matched the file.
The earlier Cloudflare plugin still used an obsolete address.
Use **TagTeamGPT Private** for this connection.

The saved keys and profile live outside the Git history.
A new Mac needs its own tunnel client configuration and authorized runtime key.

## Copy this request to an agent

Replace the workspace placeholder before sending this request.

```text
Connect ChatGPT to this workspace through OpenAI Secure MCP Tunnel:
<ABSOLUTE_WORKSPACE_PATH>

Read AGENTS.md and docs/private-connector.md in the TagTeamGPT clone.
Check current official OpenAI tunnel instructions and tunnel-client help quickstart.
Reuse suitable tunnel profiles and credentials. Preserve existing local changes.
Keep credentials outside Git and chat. Ask me to enter missing secrets locally.
Keep the local server on 127.0.0.1 with Bearer authentication enabled.
Configure tunnel-client to supply the saved local access key through a protected header file.
Confirm the server health endpoint reports the exact workspace above.
Confirm the private tunnel is ready and associated with my ChatGPT workspace.
Help me create or select TagTeamGPT Private using Connection: Tunnel.
Select No authentication only for the private plugin. Keep the local server authenticated.
Ask me to select the plugin with @ if its tools are unavailable in this chat.
Use that plugin to call workspace_info and read README.md.
Verify a read across multiple response sections when the file is large enough.
Report success only after the ChatGPT tool calls succeed against the exact folder.
Save restart instructions without credentials. Report any remaining blocker precisely.
Keep Chat responsible for planning and review. Keep Codex responsible for execution.
```
