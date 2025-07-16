// gen.cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // seed RNG with high‐resolution clock
    mt19937 rng(chrono::steady_clock::now().time_since_epoch().count());

    // 2 ≤ n ≤ 10000  (you can bump this up if you like)
    uniform_int_distribution<int> Dn(2, 10);
    int n = Dn(rng);

    // −1e9 ≤ A[i] ≤ 1e9
    uniform_int_distribution<long long> Da(1, 100);

    // print as: [a0,a1,...,a(n-1)]
    cout << '[';
    for (int i = 0; i < n; i++) {
        cout << Da(rng);
        if (i + 1 < n) 
            cout << ',';
    }
    cout << ']' << '\n';

    // −1e9 ≤ k ≤ 1e9
    uniform_int_distribution<long long> Dk(1, 100);
    long long k = Dk(rng);
    cout << k << "\n";

    return 0;
}
