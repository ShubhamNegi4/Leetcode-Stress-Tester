// gen.cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // seed RNG with high‐resolution clock
    mt19937 rng(chrono::steady_clock::now().time_since_epoch().count());

    // 1 ≤ n ≤ 100000
    uniform_int_distribution<int> Dn(1, 1000);
    int n = Dn(rng);

    // 1 ≤ k ≤ n
    uniform_int_distribution<int> Dk(1, n);
    int k = Dk(rng);

    cout << n << " " << k << "\n";

    // −100000 ≤ A[i] ≤ 100000
    uniform_int_distribution<int> Da(-100000, 1000000);
    for (int i = 0; i < n; i++) {
        cout << Da(rng) << (i+1 == n ? '\n' : ' ');
    }
    return 0;
}
