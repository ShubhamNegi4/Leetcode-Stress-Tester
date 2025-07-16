const fetch = require('node-fetch');

async function fetchProblemInfo(slug) {
  const body = {
    query: `
      query getProblem($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          content
          sampleTestCase
        }
      }`,
    variables: { titleSlug: slug }
  };

  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
  const json = await res.json();
  if (!json.data || !json.data.question)
    throw new Error('Problem not found or API changed');
  return json.data.question;
}

module.exports = { fetchProblemInfo };
