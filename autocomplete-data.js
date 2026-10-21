// The college file is a JavaScript-style array, but its entries are JSON strings.
// Parse its data without evaluating the assignment or running arbitrary code.
export function parseColleges(text) {
  const match = text.trim().match(/^collegeList\s*=\s*(\[[\s\S]*\])\s*;?$/);
  if (!match) throw new Error('The college list has an unexpected format.');
  return normalizeCatalog(JSON.parse(match[1].replace(/,\s*]/g, ']')));
}

export function normalizeCatalog(values) {
  if (!Array.isArray(values)) throw new Error('Suggestions must be an array.');
  const seen = new Set();
  return values.filter(value => typeof value === 'string').map(value => value.trim()).filter(value => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function flattenLocations(states) {
  if (!states || Array.isArray(states) || typeof states !== 'object') throw new Error('The location list has an unexpected format.');
  return normalizeCatalog(Object.entries(states).flatMap(([state, cities]) => {
    if (!Array.isArray(cities)) return [];
    return cities.filter(city => typeof city === 'string').map(city => `${city.trim()}, ${state.trim()}`);
  }));
}

export function matchSuggestions(values, input, limit = 50) {
  const query = input.trim().toLocaleLowerCase();
  if (!query) return { matches: [], total: 0 };
  const matches = values.filter(value => value.toLocaleLowerCase().includes(query));
  matches.sort((a, b) => {
    const aStarts = a.toLocaleLowerCase().startsWith(query);
    const bStarts = b.toLocaleLowerCase().startsWith(query);
    return Number(bStarts) - Number(aStarts) || a.length - b.length || a.localeCompare(b);
  });
  return { matches: matches.slice(0, limit), total: matches.length };
}
