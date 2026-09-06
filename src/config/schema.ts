export type AutomationMode = 'safe' | 'assisted' | 'autopilot';
export type ReviewerBrowserProvider = 'builtin' | 'local';

export interface AutopilotConsent {
  granted: boolean;
  statement: string;
  grantedAt: string;
}

export interface CqbConfig {
  reviewer: {
    provider: 'chatgpt_plus';
    browserProvider: ReviewerBrowserProvider;
    preferredModel: string;
    conversationUrl: string;
    expectedWindowTitle: string;
    allowedProcesses: string[];
  };
  routing: {
    confidenceThreshold: number;
    maxLocalFailures: number;
    maxReviewsPerTask: number;
    requireNewEvidence: boolean;
  };
  automation: {
    mode: AutomationMode;
    autoOpen: boolean;
    autoFocus: boolean;
    autoPaste: boolean;
    autoSend: boolean;
    consent?: AutopilotConsent;
  };
  verification: {
    tests: boolean;
    typecheck: boolean;
    lint: boolean;
    build: boolean;
    diffReview: boolean;
    commands: { tests: string; typecheck: string; lint: string; build: string };
  };
  limits: {
    maxExecutorRounds: number;
    maxAutoReviewsPerTask: number;
  };
  storage: {
    stateDirectory: string;
  };
}

export const defaultConfig: CqbConfig = {
  reviewer: {
    provider: 'chatgpt_plus',
    browserProvider: 'builtin',
    preferredModel: 'sol',
    conversationUrl: 'https://chatgpt.com/',
    expectedWindowTitle: 'CQB Reviewer',
    allowedProcesses: ['chrome', 'msedge'],
  },
  routing: {
    confidenceThreshold: 0.65,
    maxLocalFailures: 2,
    maxReviewsPerTask: 2,
    requireNewEvidence: true,
  },
  automation: {
    mode: 'safe',
    autoOpen: true,
    autoFocus: false,
    autoPaste: false,
    autoSend: false,
  },
  verification: {
    tests: true,
    typecheck: true,
    lint: true,
    build: true,
    diffReview: true,
    commands: { tests: 'pnpm test', typecheck: 'pnpm typecheck', lint: 'pnpm lint', build: 'pnpm build' },
  },
  limits: {
    maxExecutorRounds: 12,
    maxAutoReviewsPerTask: 2,
  },
  storage: {
    stateDirectory: 'cqb',
  },
};
