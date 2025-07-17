#include <bits/stdc++.h>
using namespace std;


vector<long long> readJsonArray() {
    string s;
    getline(cin, s);
    s.erase(remove(s.begin(), s.end(), '['), s.end());
    s.erase(remove(s.begin(), s.end(), ']'), s.end());
    stringstream ss(s);
    vector<long long> v;
    long long x;
    char comma;

    while (ss >> x) {
        v.push_back(x);
        if (ss >> comma && comma == ',') {
            // continue
        }
    }
    return v;
}

int main() {

    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // The user should implement the logic to read input,
    // call the solution method, and print the result.

    // Example for a problem that takes one array as input:
    // auto nums = readJsonArray();
    // Solution sol;
    // auto result = sol.someMethod(nums);
    // for(int i = 0; i < result.size(); ++i) {
    //     cout << result[i] << (i == result.size() - 1 ? "" : ",");
    // }
    // cout << endl;

    return 0;
}
