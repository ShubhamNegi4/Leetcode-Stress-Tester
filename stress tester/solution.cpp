#include <bits/stdc++.h>
using namespace std;
class Solution{
    public:
    vector<int> twoSum(vector<int>& nums, int target) {
    int n = (int)nums.size();
    unordered_map<long long,int> mp;
    mp.reserve(nums.size());
    for (int i = 0; i < (int)nums.size(); ++i) {
        long long need = target - nums[i];
        auto it = mp.find(need);
        if (it != mp.end()) {
            return { it->second, i };
        }
        mp[nums[i]] = i;
    }
    return {-1, -1};
}
};
vector<long long> readJsonArray() {
    string s;
    getline(cin, s);
    // remove brackets
    s.erase(remove(s.begin(), s.end(), '['), s.end());
    s.erase(remove(s.begin(), s.end(), ']'), s.end());
    stringstream ss(s);
    vector<long long> v;
    long long x;
    while (ss >> x) {
        v.push_back(x);
        if (ss.peek() == ',') ss.ignore();
    }
    return v;
}
int main() {
    // Fast I/O
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // 1. Read the input using the helpers
    auto nums_long = readJsonArray();
    long long target_long;
    cin >> target_long;

    // 2. Convert to the types LeetCode expects (vector<int>, int)
    vector<int> nums(nums_long.begin(), nums_long.end());
    int target = target_long;

    // 3. Create an instance of the Solution class and call the method
    Solution sol;
    vector<int> ans = sol.twoSum(nums, target);

    // 4. Print the result in the standard JSON array format
    cout << "[" << ans[0] << "," << ans[1] << "]" << endl;

    return 0;
}