#!/usr/bin/env node
/**
 * Lazy mailbox nudge — no cron. Call after a loop writes mail.
 *
 * Triggers when EITHER:
 *   unreviewed notes >= mailbox_nudge_count (default 10), OR
 *   days since last skim >= mailbox_nudge_days (default 14)
 *
 *   node tools/codexgpt-mailbox-nudge.mjs [--ack]
 *   --ack  record that you skimmed (resets the clock / count baseline)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, STATE_DIR, ROOT } from "./lib/codexgpt-config.mjs";

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function vaultRoot() {
  return (
    process.env.CODEXGPT_RHIZOME_VAULT ||
    path.join(os.homedir(), "Documents", "Rhizome Vault")
  );
}

const ACK = path.join(STATE_DIR, "mailbox-triage.json");

function listMail() {
  const dir = path.join(vaultRoot(), "projects", "codexgpt", "mailbox");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { name: f, path: p, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function readAck() {
  try {
    return JSON.parse(fs.readFileSync(ACK, "utf8"));
  } catch {
    return { last_ack_ms: 0, last_ack_count: 0 };
  }
}

function main() {
  if (process.argv.includes("--ack")) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const mail = listMail();
    const payload = {
      last_ack_ms: Date.now(),
      last_ack_count: mail.length,
      last_ack_at: new Date().toISOString(),
    };
    fs.writeFileSync(ACK, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify({ ok: true, ack: true, ...payload }));
    return;
  }

  const cfg = loadConfig();
  const needCount = Number(cfg.mailbox_nudge_count ?? 10);
  const needDays = Number(cfg.mailbox_nudge_days ?? 14);
  const mail = listMail();
  const ack = readAck();
  const newSinceAck = Math.max(0, mail.length - (ack.last_ack_count || 0));
  const daysSince =
    ack.last_ack_ms > 0 ? (Date.now() - ack.last_ack_ms) / (86400 * 1000) : Infinity;

  const byCount = newSinceAck >= needCount;
  const byDays = daysSince >= needDays && mail.length > 0;
  const nudge = byCount || byDays;

  const out = {
    ok: true,
    nudge,
    unreviewed_since_ack: newSinceAck,
    total_mail: mail.length,
    days_since_ack: Number.isFinite(daysSince) ? Math.floor(daysSince) : null,
    thresholds: { count: needCount, days: needDays },
    reason: nudge ? (byCount ? "count" : "days") : null,
    latest: mail.slice(0, 5).map((m) => m.name),
    hint: nudge
      ? `Mailbox nudge: ${newSinceAck} new / ${mail.length} total, ${Number.isFinite(daysSince) ? Math.floor(daysSince) + "d" : "never"} since skim. Review vault projects/codexgpt/mailbox — then: node tools/codexgpt-mailbox-nudge.mjs --ack`
      : null,
    root: ROOT,
  };
  console.log(JSON.stringify(out));
  if (nudge) process.exitCode = 0;
}

main();
