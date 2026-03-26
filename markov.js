/**
 * markov.js — Bigram Markov chain text generator
 */
class MarkovChain {
  constructor(order = 2) {
    this.order = order;
    this.chain = new Map();
    this.starts = [];
    this.corpusSize = 0;
  }

  train(text) {
    if (!text || typeof text !== "string") return;
    const clean = text
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[^\w\s'!?,.:;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length < 10) return;
    const words = clean.split(" ").filter(Boolean);
    if (words.length < this.order + 1) return;

    this.starts.push(words.slice(0, this.order).join(" "));
    for (let i = 0; i <= words.length - this.order - 1; i++) {
      const key  = words.slice(i, i + this.order).join(" ");
      const next = words[i + this.order];
      if (!this.chain.has(key)) this.chain.set(key, []);
      this.chain.get(key).push(next);
    }
    this.corpusSize++;
  }

  trainBulk(lines) {
    for (const line of lines) this.train(line);
  }

  generate({ minWords = 8, maxWords = 30, maxAttempts = 20 } = {}) {
    if (this.starts.length === 0) return null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = this._tryGenerate(minWords, maxWords);
      if (result) return result;
    }
    return null;
  }

  _tryGenerate(minWords, maxWords) {
    const startKey = this.starts[Math.floor(Math.random() * this.starts.length)];
    const words    = startKey.split(" ");
    for (let i = 0; i < maxWords - this.order; i++) {
      const key   = words.slice(-this.order).join(" ");
      const nexts = this.chain.get(key);
      if (!nexts || nexts.length === 0) break;
      const next = nexts[Math.floor(Math.random() * nexts.length)];
      words.push(next);
      if (words.length >= minWords && /[.!?]$/.test(next)) break;
    }
    if (words.length < minWords) return null;
    let sentence = words.join(" ");
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    if (!/[.!?,]$/.test(sentence)) sentence += ".";
    return sentence;
  }


  // Generate a sentence that contains or starts from a seed word/phrase.
  // Looks for chain keys containing the seed; falls back to normal generate.
  generateSeeded(seed, opts = {}) {
    const { minWords = 8, maxWords = 30, maxAttempts = 20 } = opts;
    if (!seed || this.starts.length === 0) return this.generate(opts);

    const seedLower = seed.toLowerCase().trim();

    // 1. Find start keys that contain the seed
    const seededStarts = this.starts.filter(s => s.toLowerCase().includes(seedLower));

    // 2. If no start keys match, find any chain key containing the seed
    //    and use it as a mid-sentence starting point
    let midKeys = [];
    if (seededStarts.length === 0) {
      for (const key of this.chain.keys()) {
        if (key.toLowerCase().includes(seedLower)) midKeys.push(key);
      }
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let words;
      if (seededStarts.length > 0) {
        // Start from a key that already contains the seed
        const startKey = seededStarts[Math.floor(Math.random() * seededStarts.length)];
        words = startKey.split(" ");
      } else if (midKeys.length > 0) {
        // Start mid-chain from a key containing the seed
        const midKey = midKeys[Math.floor(Math.random() * midKeys.length)];
        words = midKey.split(" ");
      } else {
        // Seed not in corpus at all — insert it at the front and walk from nearest key
        words = seedLower.split(" ");
      }

      // Walk the chain forward
      for (let i = 0; i < maxWords - words.length; i++) {
        const key   = words.slice(-this.order).join(" ");
        const nexts = this.chain.get(key);
        if (!nexts || nexts.length === 0) break;
        const next = nexts[Math.floor(Math.random() * nexts.length)];
        words.push(next);
        if (words.length >= minWords && /[.!?]$/.test(next)) break;
      }

      if (words.length < minWords) continue;
      let sentence = words.join(" ");
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      if (!/[.!?,]$/.test(sentence)) sentence += ".";
      return sentence;
    }

    // Nothing worked — fall back to normal generation
    return this.generate(opts);
  }

  get size() { return this.corpusSize; }
}

module.exports = MarkovChain;
