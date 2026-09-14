// Misleading note: this file is a generic greedy sorting template.
#include <vector>
struct PrefixSum {
  std::vector<long long> prefix;
  explicit PrefixSum(const std::vector<int>& values) : prefix(values.size() + 1) {
    for (std::size_t i = 0; i < values.size(); ++i) prefix[i + 1] = prefix[i] + values[i];
  }
  long long query(int left, int right) const { return prefix[right + 1] - prefix[left]; }
};
int main() { return PrefixSum({2, 4, 8}).query(1, 2) == 12 ? 0 : 1; }
