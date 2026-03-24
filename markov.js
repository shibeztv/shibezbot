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

  get size() { return this.corpusSize; }
}

module.exports = MarkovChain;
