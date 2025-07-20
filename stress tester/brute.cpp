#include <bits/stdc++.h>
#include "utils/json.hpp"
using namespace std;
using json = nlohmann::json;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        for (int i = 0; i < nums.size(); i++) {
            for (int j = i + 1; j < nums.size(); j++) {
                if (nums.at(j) == target - nums.at(i)) {
                    return {i, j};
                }
            }
        }
        // Return an empty vector if no solution is found
        return {};
    }
};

int main() {
    cin.tie(0)->sync_with_stdio(0);cin.exceptions(ios::badbit | ios::failbit);
    string line;
    getline(cin, line);
    vector<int> nums = json::parse(line);
    getline(cin, line);
    int target = json::parse(line);

    Solution sol;
    auto result = sol.twoSum(nums, target);

    // For int or string:
    // cout << result << endl;

    // For vector<int>:
    cout << "[";
    for (int i = 0; i < result.size(); ++i) {
        cout << result[i];
        if (i + 1 < result.size()) cout << ",";
    }
    cout << "]" << endl;

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