// The filename is an adversarial distractor.
#include <vector>
int lower_bound_index(const std::vector<int>& a, int target) {
  int left = 0, right = static_cast<int>(a.size());
  while (left < right) {
    int middle = left + (right - left) / 2;
    if (a[middle] < target) left = middle + 1;
    else right = middle;
  }
  return left;
}
int main() { return lower_bound_index({1, 3, 5, 8}, 5) == 2 ? 0 : 1; }
