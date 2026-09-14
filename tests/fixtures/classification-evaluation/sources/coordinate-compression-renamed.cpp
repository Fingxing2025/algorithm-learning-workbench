// Neutral opaque name; classify from source.
#include <algorithm>
#include <vector>
std::vector<int> compress(const std::vector<int>& input) {
  std::vector<int> ordered = input;
  std::sort(ordered.begin(), ordered.end());
  ordered.erase(std::unique(ordered.begin(), ordered.end()), ordered.end());
  std::vector<int> ranks;
  for (int value : input) ranks.push_back(std::lower_bound(ordered.begin(), ordered.end(), value) - ordered.begin());
  return ranks;
}
int main() { return compress({50, 10, 50, 30}) == std::vector<int>({2, 0, 2, 1}) ? 0 : 1; }
