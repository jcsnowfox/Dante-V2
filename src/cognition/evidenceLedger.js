const { CLAIM_SOURCES, classifyClaim } = require('./claimClassifier');

class EvidenceLedger {
  constructor() {
    this.records = [];
  }

  add(claim) {
    const classified = classifyClaim(claim);
    this.records.push(classified);
    return classified;
  }

  addMany(claims) {
    return claims.map((claim) => this.add(claim));
  }

  findByText(text) {
    return this.records.find((record) => record.text === text) || null;
  }

  hasEvidenceFor(text, allowedSources = Object.values(CLAIM_SOURCES)) {
    const record = this.findByText(text);
    return Boolean(record && allowedSources.includes(record.source) && record.mayStateAsFact);
  }

  all() {
    return [...this.records];
  }
}

module.exports = { EvidenceLedger };
