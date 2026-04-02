/**
 * state.js — Persistent bot state (survives restarts)
 */

const fs   = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(process.env.DATA_DIR || ".", "bot_state.json");

const DEFAULTS = {
  postChannels:     [],
  learnChannels:    [],
  manualChannels:   [],
  allowedUsers:     [],
  channelSettings:  {},  // per-channel overrides: { channelName: { intervalMs, cooldownMessages } }
  intervalMs:       300_000,  // global default interval
  cooldownMessages: 0,        // global default cooldown
  minCorpus:        50,
  active:           true,
  greeterEnabled:   false,
  notifyEnabled:    {},   // { channelName: true/false } (legacy, kept for compat)
  notifyEvents:     {},   // { channelName: { live: bool, offline: bool, category: bool } }
  notifyUsers:      {},   // { channelName: ["user1", "user2", ...] }
  forsenAlertUsers: [],   // usernames subscribed to forsen MC speedrun alerts
};

function load() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      console.warn("⚠️  Could not parse bot_state.json, using defaults.");
    }
  }
  return { ...DEFAULTS };
}

function save(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

module.exports = { load, save, DEFAULTS };
