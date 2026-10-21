export interface NewsInput { title?: string | null, summary?: string | null }
export interface ScoringResult {
  score: number; displayScore: number; multiplier: number;
  matchedRules: string[]; appliedRules: string[];
  scorerVersion: string; rulesSha256: string; weightsSha256: string; inputSha256: string;
  prediction: { ruleVersion: string, labels: Record<string,string|null>, rules: Record<string,boolean|null>, evidence: Record<string,unknown> };
}
export const scorerVersion: string;
export const scorerIdentity: Readonly<{scorerVersion:string,rulesSha256:string,weightsSha256:string}>;
export function scoreNews(input: NewsInput): ScoringResult;
export function combine(matches: Record<string,boolean|null>): Pick<ScoringResult,"score"|"multiplier"|"matchedRules"|"appliedRules">;
export function rankNews<T extends NewsInput>(items: T[]): (T & ScoringResult)[];
