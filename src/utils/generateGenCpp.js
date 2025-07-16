// src/utils/generateGenCpp.js

/**
 * Build a C++ generator based on parsed constraints.
 * @param {Object<string, [number, number]>} constraints
 * @returns {string} full gen.cpp source
 */
function generateGenCpp(constraints) {
  // 1) Determine `nKey` (size variable)
  const nKey = 'n' in constraints
    ? 'n'
    : Object.keys(constraints).find(k => k.toLowerCase().endsWith('.length'));

  const [nLow, nHigh] = constraints[nKey] || [1, 10];

  // 2) Determine `arrKey` (array variable)
  let arrKey;
  if (nKey && nKey.endsWith('.length')) {
    // strip the '.length'
    arrKey = nKey.replace(/\.length$/, '');
  } else {
    // fallback: any other key
    arrKey = Object.keys(constraints).find(k => k !== nKey) || 'arr';
  }

  const [aLow, aHigh] = constraints[arrKey] || [0, 10];

  // 3) Emit C++ source
  return `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    mt19937 rng(chrono::steady_clock::now().time_since_epoch().count());
    uniform_int_distribution<int> dist_n(${nLow}, ${nHigh});
    int n = dist_n(rng);
    cout << n << "\\n";

    uniform_int_distribution<int> dist_a(${aLow}, ${aHigh});
    vector<int> ${arrKey}(n);
    for (int i = 0; i < n; ++i) {
        ${arrKey}[i] = dist_a(rng);
    }
    for (int i = 0; i < n; ++i) {
        cout << ${arrKey}[i] << (i + 1 < n ? " " : "\\n");
    }
    return 0;
}
`;
}

module.exports = { generateGenCpp };
