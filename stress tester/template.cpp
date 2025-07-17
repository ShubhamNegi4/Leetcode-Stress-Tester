#include <bits/stdc++.h>
using namespace std;

// $SOLUTION_PLACEHOLDER

// Utility: Parse a vector from a string like "[1,2,3,4]"
vector<int> parseVector(const string& s) {
    vector<int> res;
    int num = 0, sign = 1;
    bool inNum = false;
    for (char c : s) {
        if (c == '-') sign = -1;
        if (isdigit(c)) {
            num = num * 10 + (c - '0');
            inNum = true;
        } else if (inNum) {
            res.push_back(num * sign);
            num = 0; sign = 1; inNum = false;
        }
    }
    if (inNum) res.push_back(num * sign);
    return res;
}

vector<int> readVectorFromStdin() {
    string line;
    while (getline(cin, line)) {
        if (line.find('[') != string::npos) {
            return parseVector(line);
        }
    }
    return {};
}

int readIntFromStdin() {
    string line;
    int value;
    while (getline(cin, line)) {
        stringstream ss(line);
        if (ss >> value) return value;
    }
    return 0; // Default if not found
}

int main() {
    vector<int> nums = readVectorFromStdin();
    int target = readIntFromStdin();

    // --- Your solution code here ---
    Solution sol;
    vector<int> result = sol.twoSum(nums, target);
    
    // Format output
    cout << "[";
    for (int i = 0; i < result.size(); i++) {
        cout << result[i];
        if (i < result.size() - 1) cout << ",";
    }
    cout << "]" << endl;
    
    return 0;
}