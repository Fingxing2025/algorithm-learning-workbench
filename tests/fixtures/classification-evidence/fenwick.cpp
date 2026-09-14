// Synthetic regression source, authored for this test; no user template data.
// Misleading title: Kruskal and minimum spanning tree. Inspect the code.
#include <vector>
struct Accumulator {
    std::vector<int> a;
    explicit Accumulator(int n) : a(n + 1) {}
    void add(int i, int delta) {
        for (; i < (int)a.size(); i += i & -i) a[i] += delta;
    }
    int prefix(int i) const {
        int sum = 0;
        for (; i > 0; i -= i & -i) sum += a[i];
        return sum;
    }
};
