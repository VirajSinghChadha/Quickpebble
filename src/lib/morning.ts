/** Countries offered for the morning news (Google News has an English edition for each). */
export const COUNTRIES: [string, string][] = [
  ["AE", "United Arab Emirates"], ["AU", "Australia"], ["BR", "Brazil"], ["CA", "Canada"], ["CN", "China"], ["EG", "Egypt"],
  ["FR", "France"], ["DE", "Germany"], ["HK", "Hong Kong"], ["IN", "India"], ["ID", "Indonesia"], ["IE", "Ireland"],
  ["IL", "Israel"], ["IT", "Italy"], ["JP", "Japan"], ["KE", "Kenya"], ["KR", "South Korea"], ["MY", "Malaysia"],
  ["MX", "Mexico"], ["NL", "Netherlands"], ["NZ", "New Zealand"], ["NG", "Nigeria"], ["PK", "Pakistan"], ["PH", "Philippines"],
  ["QA", "Qatar"], ["SA", "Saudi Arabia"], ["SG", "Singapore"], ["ZA", "South Africa"], ["ES", "Spain"], ["SE", "Sweden"],
  ["CH", "Switzerland"], ["TH", "Thailand"], ["TR", "Turkey"], ["GB", "United Kingdom"], ["US", "United States"],
];
export const countryName = (cc: string): string => COUNTRIES.find(([c]) => c === cc)?.[1] ?? cc;

export function parseCountries(json: string | undefined): string[] {
  try {
    const a = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(a) ? [...new Set(a.filter((c): c is string => typeof c === "string" && COUNTRIES.some(([k]) => k === c)))].slice(0, 3) : [];
  } catch {
    return [];
  }
}

/** A greeting for the hour. */
export const greeting = (hour: number): string => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
