/** Decides what fits on the home page without scrolling, given the height of the page area. */

export interface HomePlan {
  /** Tighter spacing and a smaller title for short windows. */
  compact: boolean;
  widgets: boolean;
  newsCount: number;
  tiles: boolean;
  cards: boolean;
  quick: boolean;
}

export interface PlanOptions {
  weather: boolean;
  news: boolean;
  tiles: boolean;
  cards: boolean;
}

// Heights in px, measured from the rendered page. `gap` is the space between sections.
const H = { header: 24, heroFull: 115, heroCompact: 36, search: 56, tiles: 98, cards: 82, quick: 31, weather: 150, newsHead: 76, newsItem: 68 };
export const MAX_NEWS = 5;

function planFor(height: number, o: PlanOptions, compact: boolean): HomePlan {
  const gap = compact ? 12 : 20;
  const padding = compact ? 24 : 40;
  const hasWidgets = o.weather || o.news;
  // header, title and search box are always there, with a gap between each
  let left = height - padding - (H.header + (compact ? H.heroCompact : H.heroFull) + H.search) - 2 * gap;

  const plan: HomePlan = { compact, widgets: hasWidgets, newsCount: 0, tiles: false, cards: false, quick: false };
  // Priority order: the cards the person asked for, then shortcuts, then feature cards, then the hint.
  const minItems = compact ? 1 : 2;
  const newsMin = o.news ? H.newsHead + minItems * H.newsItem : 0;
  const widgetsMin = hasWidgets ? Math.max(o.weather ? H.weather : 0, newsMin) : 0;
  if (hasWidgets) left -= widgetsMin + gap;
  if (o.tiles && left >= H.tiles + gap) (plan.tiles = true), (left -= H.tiles + gap);
  if (o.cards && left >= H.cards + gap) (plan.cards = true), (left -= H.cards + gap);
  if (left >= H.quick + gap) (plan.quick = true), (left -= H.quick + gap);
  if (o.news) {
    // Spend whatever is left on more headlines, never fewer than one.
    plan.newsCount = Math.min(MAX_NEWS, minItems + Math.max(0, Math.floor(left / H.newsItem)));
  }
  return plan;
}

const score = (p: HomePlan) => ((p.tiles ? 1 : 0) + (p.cards ? 1 : 0) + (p.quick ? 1 : 0)) * 10 + p.newsCount;

/** The roomy layout when it shows as much as the tight one, otherwise the tight one. Never loses a section as the window grows. */
export function planHome(height: number, o: PlanOptions): HomePlan {
  const roomy = planFor(height, o, false);
  const tight = planFor(height, o, true);
  return score(roomy) >= score(tight) ? roomy : tight;
}
