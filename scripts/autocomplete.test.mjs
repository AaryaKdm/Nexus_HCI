import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flattenLocations, matchSuggestions, normalizeCatalog, parseColleges } from '../autocomplete-data.js';

test('autocomplete parses existing files and finds prefix and substring matches', () => {
  const colleges = parseColleges(readFileSync('college_list.txt', 'utf8'));
  const schools = normalizeCatalog(JSON.parse(readFileSync('schools_list.json', 'utf8')));
  const locations = flattenLocations(JSON.parse(readFileSync('locations.json', 'utf8')));
  assert.ok(colleges.length > 1000);
  assert.ok(schools.length > 50);
  const result = matchSuggestions(locations, 'mu');
  assert.ok(result.matches.includes('Mumbai, Maharashtra'));
  assert.ok(result.matches.every(value => value.toLowerCase().includes('mu')));
  assert.ok(matchSuggestions(colleges, 'engineering').total > 0);
  assert.ok(matchSuggestions(schools, 'school').total > 0);
  assert.deepEqual(normalizeCatalog(['Mumbai', 'mumbai', ' Pune ']), ['Mumbai', 'Pune']);
  assert.deepEqual(matchSuggestions(['Khamum', 'Mumbai', 'Mundi'], 'mu', 2), { matches: ['Mundi', 'Mumbai'], total: 3 });
  assert.throws(() => parseColleges('collegeList = ["Safe"]; runCode()'));
});
