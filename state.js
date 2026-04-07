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
  forsenAlertUsers:    [],  // LEGACY — migrated to forsenAlertChannels on first load
  forsenAlertChannels: {   // { channelName: ["user1", "user2", ...] }
    shlbez: ["bolsogoat"], // bolsogoat pre-subscribed to #shlbez alerts
    jaskuz: ["koljake"],   // koljake pre-subscribed to #jaskuz alerts
    nymn: [                // nymn subscribers — whispered on alert, except @nymn who gets chat mention
      "nymn",
      "aztronat", "healonthesofa", "paktzu", "krappa", "4cdee", "tabbbik",
      "onska01", "brunix126", "aw0led_", "toriwoo", "targaryenforsen",
      "pgl_audio_guy_tf", "thinkicy", "thekomu", "andyleroi", "korespa",
      "dkaspersky", "joggan", "patixxll", "cluyk", "mr_costa", "commusk",
      "sasekiller", "dropkick52",
    ],
  },
};

function load() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      const loaded = { ...DEFAULTS, ...JSON.parse(raw) };

      // ── Migrate legacy forsenAlertUsers (flat array) → forsenAlertChannels ──
      // If the saved file still has the old flat array and no channel map yet,
      // move those users into the home channel so nobody loses their sub.
      if (
        Array.isArray(loaded.forsenAlertUsers) &&
        loaded.forsenAlertUsers.length > 0 &&
        (!loaded.forsenAlertChannels || Object.keys(loaded.forsenAlertChannels).length === 0)
      ) {
        const homeChannel = (process.env.CHANNEL || "shlbez").toLowerCase();
        loaded.forsenAlertChannels = { [homeChannel]: [...loaded.forsenAlertUsers] };
        console.log(`🔄  Migrated ${loaded.forsenAlertUsers.length} forsenAlertUsers → forsenAlertChannels[${homeChannel}]`);
      }
      // Ensure bolsogoat is always in shlbez (even after a wipe)
      if (!loaded.forsenAlertChannels) loaded.forsenAlertChannels = {};
      if (!loaded.forsenAlertChannels.shlbez) loaded.forsenAlertChannels.shlbez = [];
      if (!loaded.forsenAlertChannels.shlbez.includes("bolsogoat")) {
        loaded.forsenAlertChannels.shlbez.push("bolsogoat");
      }
      if (!loaded.forsenAlertChannels.jaskuz) loaded.forsenAlertChannels.jaskuz = [];
      if (!loaded.forsenAlertChannels.jaskuz.includes("koljake")) {
        loaded.forsenAlertChannels.jaskuz.push("koljake");
      }
      if (!loaded.forsenAlertChannels.nymn) loaded.forsenAlertChannels.nymn = [];

      return loaded;
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
