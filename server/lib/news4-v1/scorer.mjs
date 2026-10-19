import {createHash} from 'node:crypto';
import {classify, ruleKeys} from './rules.mjs';
import {parameters, rulesSha256, weightsSha256} from './parameters.mjs';

export const scorerVersion = parameters.version;
export const scorerIdentity = Object.freeze({scorerVersion, rulesSha256, weightsSha256});
const settings = Object.freeze(Object.fromEntries(Object.entries(parameters.rules).map(([key, value]) => [key, Object.freeze({...value})])));
for (const key of ruleKeys) {
  const value = settings[key];
  if (!value || !Number.isFinite(value.weight) || value.weight <= 0 || value.enabled && value.recall < 0.7) throw new Error('Invalid frozen parameters');
}

export function combine(ruleMatches) {
  if (ruleKeys.some(key => ![true, false, null].includes(ruleMatches[key]))) throw new TypeError('Each frozen rule must be true, false or null');
  if (ruleMatches['C:间接（国家竞争、产业前景）'] && ruleMatches['C:无'] || ruleMatches['F:焦虑'] && ruleMatches['F:中性']) throw new Error('Mutually exclusive rules both matched');
  const matched = ruleKeys.filter(key => settings[key].enabled && ruleMatches[key] === true);
  const applied = matched.includes('H1') ? matched.filter(key => !['A1:海外','E:与中国无关'].includes(key)) : matched;
  const multiplier = applied.length ? Math.exp(applied.reduce((sum, key) => sum + Math.log(settings[key].weight), 0) / applied.length) : 1;
  return {score: 50 * multiplier, multiplier, matchedRules: matched, appliedRules: applied};
}

export function scoreNews(input) {
  const prediction = classify(input);
  const score = combine(prediction.rules);
  const inputSha256 = createHash('sha256').update(JSON.stringify({title: input.title ?? null, summary: input.summary ?? null})).digest('hex');
  return {...score, displayScore: Number(score.score.toFixed(2)), ...scorerIdentity, inputSha256, prediction};
}

export function rankNews(items) {
  const compareText = (a,b) => a < b ? -1 : a > b ? 1 : 0;
  return items.map(item => ({...item,...scoreNews({title:item.title,summary:item.summary})})).sort((a,b) => b.score-a.score || (b.pubDate ?? 0)-(a.pubDate ?? 0) || compareText(a.sourceId ?? '',b.sourceId ?? '') || compareText(a.url ?? '',b.url ?? '') || compareText(a.title ?? '',b.title ?? ''));
}
