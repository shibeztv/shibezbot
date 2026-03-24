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
  manualChannels:    [],
  allowedUsers:      [],  // users granted full command access via $adduser
  intervalMs:        300_000,
  minCorpus:         50,
  active:            true,
  cooldownMessages:  0,
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
