import { reviewedCriteria } from "../../../shared/review.js";
import { artifactsFrom } from "../../../shared/trace-artifacts.js";
import { buildSlyData, findLeaks } from "./ledger.js";
import { SLOT } from "./binding.js";

export function createReviewedHandoff({ draft, handoff, read, bind, allowed, localOrigin, consent, onTrace, onStart = () => {} }) {
  let running = false;
  let reviewSnapshot = null;
  let draftArtifact = null;
  let stale = false;
  let last = null;
  const snapshot = () => {
    const input = read();
    return { values: structuredClone(input.values), unticked: new Set(input.unticked), reviewedText: input.reviewedText };
  };
  const intakeKey = (input) => JSON.stringify(input.values);
  const sharingKey = (input) => [...input.unticked].sort().join(',');
  return {
    get state() { return { running, reviewReady: reviewSnapshot !== null }; },
    invalidate() {
      stale = true;
      if (intakeKey(snapshot()) !== reviewSnapshot) reviewSnapshot = null;
    },
    exportData() { return { ...last, criteria: draftArtifact, stale }; },
    async run(approved = false) {
      if (running) return null;
      const input = snapshot();
      if (approved && (!reviewSnapshot || intakeKey(input) !== reviewSnapshot)) return null;
      const approvedRows = approved ? reviewedCriteria(input.reviewedText, draftArtifact?.requirements) : null;
      running = true;
      const { engine, trace } = approved ? handoff : draft;
      const consentLog = [];
      let since = trace.events.at(-1)?.seq ?? -1;
      let failure = null;
      let binding;
      let slyData;
      let listening = false;
      try {
        binding = bind();
        if (approved) {
          engine.top.network.setLink(SLOT, binding.target);
          engine.runtimeAllowedPeers.add(new URL(binding.target).origin);
        }
        engine.resetHistory();
        since = trace.events.at(-1)?.seq ?? -1;
        slyData = approved ? { acceptance_criteria: approvedRows } : buildSlyData(input.values, input.unticked);
        if (approved) for (const key of ["feature_title", "platform"]) {
          if (!input.unticked.has(key)) slyData[key] = input.values[key];
        }
        const crossing = allowed.filter((key) => key === "acceptance_criteria" || key in slyData);
        const staying = Object.keys(input.values).filter((key) => !crossing.includes(key));
        const withheld = Object.fromEntries(staying.filter((key) => key !== "feature_request").map((key) => [key, input.values[key]]));
        const peerConsent = async (info) => {
          const { criteria } = artifactsFrom(trace.events, { since, localOrigin });
          const request = {
            ...info, target: binding.target, payload: approved ? slyData : null,
            crossing: criteria ? crossing : crossing.filter((key) => key !== "acceptance_criteria"),
            staying: staying.filter((key) => key !== "feature_request"), withheld,
          };
          const leaks = findLeaks(info.requestText + (request.payload ? JSON.stringify(request.payload) : ""), withheld);
          const decision = await consent(request);
          const allowed = decision === "allow" && leaks.length === 0;
          consentLog.push({ origin: info.peerOrigin, decision: allowed ? "allowed" : "declined", time: new Date().toLocaleTimeString() });
          return allowed ? "allow" : "decline";
        };
        onStart();
        trace.addEventListener("event", onTrace);
        listening = true;
        await engine.runTurn(approved ? "Write a test plan for the approved acceptance criteria." : input.values.feature_request || "Draft acceptance criteria.", { slyData, peerConsent });
      } catch (error) {
        failure = error.message;
      } finally {
        if (listening) trace.removeEventListener("event", onTrace);
        running = false;
      }
      const events = trace.events.filter((event) => event.seq > since);
      const artifacts = artifactsFrom(trace.events, { since, localOrigin });
      const current = snapshot();
      stale = intakeKey(current) !== intakeKey(input) || sharingKey(current) !== sharingKey(input)
        || (approved && current.reviewedText !== input.reviewedText);
      if (artifacts.criteria) {
        draftArtifact = artifacts.criteria;
        reviewSnapshot = intakeKey(current) === intakeKey(input) ? intakeKey(input) : null;
      }
      last = { ...artifacts, criteria: artifacts.criteria || draftArtifact, consentLog,
        approvedCriteria: approvedRows, failure, stale };
      return { ...last, events };
    },
  };
}
