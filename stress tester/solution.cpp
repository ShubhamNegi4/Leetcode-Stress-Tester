#include <bits/stdc++.h>
using namespace std;
vector<int> twoSum(const vector<long long>& nums, long long target) {
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
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // int n;
    // cin >> n;                      
    auto nums = readJsonArray();

    long long target;
    cin >> target;   

    auto ans = twoSum(nums, target);
    cout << ans[0] << " " << ans[1] << "\n";
    return 0;
}
