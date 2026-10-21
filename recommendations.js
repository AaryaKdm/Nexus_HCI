// Rank members by real, explainable ties; an empty profile still gets discoverable people.
export function recommendPeople(viewer, profiles, connections) {
  // ponytail: scan the small demo graph in memory; use a database query if membership grows substantially.
  const accepted = connections.filter(row => row.status === 'accepted');
  const neighbours = id => new Set(accepted.flatMap(row => row.requester_id === id ? [row.addressee_id] : row.addressee_id === id ? [row.requester_id] : []));
  const mine = neighbours(viewer.id);
  const requests = new Map(connections.filter(row => row.requester_id === viewer.id || row.addressee_id === viewer.id)
    .map(row => [row.requester_id === viewer.id ? row.addressee_id : row.requester_id, row]));
  const same = (field, person) => Boolean(viewer[field] && person[field] && viewer[field].trim().toLocaleLowerCase() === person[field].trim().toLocaleLowerCase());

  return profiles.filter(person => person.id !== viewer.id).map(person => {
    const mutualCount = [...neighbours(person.id)].filter(id => mine.has(id)).length;
    const reasons = [];
    if (mutualCount) reasons.push(`${mutualCount} mutual connection${mutualCount === 1 ? '' : 's'}`);
    if (same('college', person)) reasons.push(`Same college: ${person.college}`);
    else if (same('university', person)) reasons.push(`Same university: ${person.university}`);
    if (same('school', person)) reasons.push(`Same school: ${person.school}`);
    const request = requests.get(person.id);
    return {
      ...person,
      mutualCount,
      reason: reasons.join(' · ') || 'Discover this member',
      score: mutualCount * 5 + (same('college', person) ? 4 : same('university', person) ? 3 : 0) + (same('school', person) ? 2 : 0),
      connectionStatus: request?.status || null,
      requestId: request?.id || null,
      incoming: request?.addressee_id === viewer.id
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
