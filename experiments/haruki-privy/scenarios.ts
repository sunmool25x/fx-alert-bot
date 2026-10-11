import {normalTiming, OfflineExperiment, type Outcome, type Timing} from './harness.js';
export const scenarios: {name: string; timing: Timing; outcome: Outcome}[] = [
  {name: 'FAST', timing: {...normalTiming, quoteMs: 300, humanMs: 2000, intentMs: 150, permitMs: 150, verificationMs: 50, preflightMs: 300, acknowledgmentMs: 500}, outcome: 'accepted'},
  {name: 'NORMAL', timing: normalTiming, outcome: 'accepted'},
  {name: 'SLOW', timing: {...normalTiming, humanMs: 23000}, outcome: 'accepted'},
  {name: 'NETWORK_DELAY', timing: {...normalTiming, quoteMs: 4000, preflightMs: 5000, acknowledgmentMs: 15000}, outcome: 'accepted'},
  {name: 'PRIVY_SIGNING_DELAY', timing: {...normalTiming, intentMs: 11000, permitMs: 11000}, outcome: 'accepted'},
  {name: 'QUOTE_EXPIRED_BEFORE_CONFIRMATION', timing: {...normalTiming, humanMs: 31000}, outcome: 'accepted'},
  {name: 'QUOTE_EXPIRED_DURING_SIGNING', timing: {...normalTiming, permitMs: 23000}, outcome: 'accepted'},
  {name: 'RELAYER_TIMEOUT', timing: {...normalTiming, acknowledgmentMs: 20000}, outcome: 'timeout'},
  {name: 'UNKNOWN_SUBMISSION', timing: normalTiming, outcome: 'unknown'},
];
export async function runScenarios() {
  const results = [];
  for (const scenario of scenarios) results.push({name: scenario.name, assumptions: scenario.timing,
    result: await new OfflineExperiment(scenario.timing, scenario.outcome).run()});
  return results;
}
