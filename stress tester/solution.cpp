#include <bits/stdc++.h>
#include "utils/json.hpp"
using namespace std;
using json = nlohmann::json;

class Solution {
public:
    string longestPalindrome(string s) {
        return "bab";
    }
};

int main() {
    cin.tie(0)->sync_with_stdio(0);cin.exceptions(ios::badbit | ios::failbit);
    string line;
    getline(cin, line); string s = json::parse(line);

    Solution sol;
    auto result = sol.longestPalindrome(s);

    // For int or string:
    // cout << result << endl;

    // For vector<int>:
    cout << std::quoted(result) << endl;
    // cout << "[";
    // for (int i = 0; i < result.size(); ++i) {
    //     cout << result[i];
    //     if (i + 1 < result.size()) cout << ",";
    // }
    // cout << "]" << endl;

    // For vector<vector<int>>:
    // cout << "[";
    // for (int i = 0; i < result.size(); ++i) {
    //     cout << "[";
    //     for (int j = 0; j < result[i].size(); ++j) {
    //         cout << result[i][j];
    //         if (j + 1 < result[i].size()) cout << ",";
    //     }
    //     cout << "]";
    //     if (i + 1 < result.size()) cout << ",";
    // }
    // cout << "]" << endl;

    return 0;
}
// Example usage (use as needed):
// getline(cin, line); int n = json::parse(line);
// getline(cin, line); string s = json::parse(line);
// getline(cin, line); vector<int> nums = json::parse(line);
// getline(cin, line); vector<vector<int>> matrix = json::parse(line);