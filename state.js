/**
 * state.js — Persistent bot state (survives restarts)
 * Saves/loads a JSON file so settings like interval, channels, etc. are remembered.
 */

const fs   = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(process.env.DATA_DIR || ".", "bot_state.json");

const DEFAULTS = {
  postChannels:      [],
  learnChannels:     [],
  manualChannels:    [],  // joined + commands work, but never auto-posts — only posts via $say
  intervalMs:        300_000,
  minCorpus:         50,
  active:            true,
  cooldownMessages:  0,   // 0 = off; N = require N other-user messages before bot posts again
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
