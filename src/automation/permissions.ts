import type { CqbConfig } from '../config/schema.js';

export const AUTOPILOT_CONSENT_STATEMENT = 'I understand CQB may focus ChatGPT, paste repository context, and submit a message.';

export function resolveAutomationPermissions(config: CqbConfig['automation']) {
  const consentValid = config.consent?.granted === true && config.consent.statement === AUTOPILOT_CONSENT_STATEMENT;
  return {
    autoOpen: config.autoOpen,
    autoFocus: config.mode !== 'safe' && config.autoFocus,
    autoPaste: config.mode !== 'safe' && config.autoFocus && config.autoPaste,
    autoSend: config.mode === 'autopilot' && config.autoFocus && config.autoPaste && config.autoSend && consentValid,
  };
}
