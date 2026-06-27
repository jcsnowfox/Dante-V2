"use strict";

class RuntimeEventStore {
  constructor({ maxEvents = 500 } = {}) {
    this.maxEvents = maxEvents;
    this.events = [];
  }
  async init() { return true; }
  async append(event) {
    this.events.push(Object.freeze({ ...event }));
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return event;
  }
  async listRecent({ companionId = null, customerId = null, limit = 50 } = {}) {
    return this.events
      .filter(e => (!companionId || e.companion_id === companionId) && (!customerId || e.customer_id === customerId))
      .slice(-limit)
      .reverse();
  }
  async count() { return this.events.length; }
}

function createRuntimeEventStore(opts = {}) { return new RuntimeEventStore(opts); }

module.exports = { RuntimeEventStore, createRuntimeEventStore };
