// The filename is an adversarial distractor.
#include <string>
#include <vector>
std::vector<int> prefix_function(const std::string& pattern) {
  std::vector<int> pi(pattern.size());
  for (std::size_t i = 1; i < pattern.size(); ++i) {
    int j = pi[i - 1];
    while (j > 0 && pattern[i] != pattern[j]) j = pi[j - 1];
    if (pattern[i] == pattern[j]) ++j;
    pi[i] = j;
  }
  return pi;
}
int find_pattern(const std::string& text, const std::string& pattern) {
  std::vector<int> pi = prefix_function(pattern); int matched = 0;
  for (std::size_t i = 0; i < text.size(); ++i) { while (matched && text[i] != pattern[matched]) matched = pi[matched - 1]; if (text[i] == pattern[matched]) ++matched; if (matched == static_cast<int>(pattern.size())) return static_cast<int>(i) - matched + 1; }
  return -1;
}
int main(){return find_pattern("abacaba","aca")==2?0:1;}
