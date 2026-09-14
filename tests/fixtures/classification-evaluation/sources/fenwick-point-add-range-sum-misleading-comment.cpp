// Misleading note: this file is a generic greedy sorting template.
#include <vector>
class Fenwick {
  std::vector<long long> tree;
public:
  explicit Fenwick(int n) : tree(n + 1) {}
  void add(int index, int delta) { for (; index < static_cast<int>(tree.size()); index += index & -index) tree[index] += delta; }
  long long prefix(int index) const { long long sum = 0; for (; index > 0; index -= index & -index) sum += tree[index]; return sum; }
  long long range(int left, int right) const { return prefix(right) - prefix(left - 1); }
};
int main() { Fenwick bit(5); bit.add(2, 3); bit.add(4, 5); return bit.range(2, 4) == 8 ? 0 : 1; }
